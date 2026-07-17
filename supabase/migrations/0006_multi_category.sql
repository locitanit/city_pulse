-- ============================================================
-- CityPulse — 0006_multi_category.sql
-- Többkategóriás események + két új kategória.
--
-- 1. Új enum-értékek: 'buli', 'hangverseny'.
-- 2. A category oszlopot a categories event_category[] tömb váltja
--    (1–3 elem) — egy esemény több típusba is tartozhat (pl. egy
--    Gryllus Vilmos koncert konnyuzene ÉS csaladi is).
-- 3. Minden függő objektum (view, RPC-k, index, grantok) frissítve.
--
-- Megjegyzés: az új enum-értékeket ez a migráció szándékosan NEM
-- használja adatban (a tranzakción belül még nem hivatkozhatók).
-- ============================================================

alter type public.event_category add value if not exists 'buli';
alter type public.event_category add value if not exists 'hangverseny';

-- ------------------------------------------------------------
-- categories tömb-oszlop + backfill a régi category-ból
-- ------------------------------------------------------------

alter table public.events add column categories public.event_category[];
update public.events set categories = array[category];
alter table public.events alter column categories set not null;
alter table public.events add constraint events_categories_count
  check (array_length(categories, 1) between 1 and 3);

-- Függő objektumok elengedik a régi oszlopot
drop view public.events_public;
drop function public.filter_events(
  text, double precision, double precision, double precision,
  public.event_category[], timestamptz, timestamptz, integer, integer
);
drop index public.events_approved_category_idx;

alter table public.events drop column category;

-- Tömb-átfedéses szűréshez GIN index
create index events_approved_categories_idx
  on public.events using gin (categories)
  where status = 'approved';

-- ------------------------------------------------------------
-- filter_events — p_categories mostantól átfedést vizsgál (&&)
-- ------------------------------------------------------------

create or replace function public.filter_events(
  p_city       text                    default null,
  p_radius_km  double precision        default null,
  p_lat        double precision        default null,
  p_lon        double precision        default null,
  p_categories public.event_category[] default null,
  p_from       timestamptz             default null,
  p_to         timestamptz             default null,
  p_limit      integer                 default 24,
  p_offset     integer                 default 0
)
returns table (
  id          uuid,
  title       varchar(100),
  categories  public.event_category[],
  city        text,
  venue       text,
  latitude    double precision,
  longitude   double precision,
  start_time  timestamptz,
  end_time    timestamptz,
  description text,
  source_url  text,
  image_url   text,
  distance_km double precision,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_lat double precision := p_lat;
  v_lon double precision := p_lon;
begin
  if (p_lat is null) <> (p_lon is null) then
    raise exception 'A p_lat és p_lon csak együtt adható meg'
      using errcode = '22023';
  end if;
  if p_radius_km is not null and (p_radius_km < 0 or p_radius_km > 1000) then
    raise exception 'Érvénytelen sugár: 0 és 1000 km közötti érték adható meg'
      using errcode = '22023';
  end if;

  if coalesce(p_radius_km, 0) > 0 and (v_lat is null or v_lon is null) then
    select c.latitude, c.longitude into v_lat, v_lon
    from public.cities c
    where lower(c.name) = lower(p_city);

    if v_lat is null or v_lon is null then
      raise exception 'Sugár szerinti szűréshez ismert város (p_city) vagy középpont (p_lat, p_lon) szükséges'
        using errcode = '22023';
    end if;
  end if;

  return query
  select
    e.id, e.title, e.categories, e.city, e.venue,
    e.latitude, e.longitude, e.start_time, e.end_time,
    e.description, e.source_url, e.image_url,
    case
      when v_lat is not null and v_lon is not null
      then public.haversine_km(v_lat, v_lon, e.latitude, e.longitude)
    end as distance_km,
    count(*) over () as total_count
  from public.events e
  where e.status = 'approved'
    and case
          when coalesce(p_radius_km, 0) > 0
            then public.haversine_km(v_lat, v_lon, e.latitude, e.longitude) <= p_radius_km
          when p_city is not null
            then lower(e.city) = lower(p_city)
          else true
        end
    and (p_categories is null or e.categories && p_categories)
    and (p_from is null or coalesce(e.end_time, e.start_time) >= p_from)
    and (p_to   is null or e.start_time <= p_to)
  order by e.start_time asc, e.id
  limit  least(greatest(coalesce(p_limit, 24), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

comment on function public.filter_events is 'Publikus eseménykereső: város/sugár/kategória(tömb-átfedés)/dátum szűrés, csak approved sorok, lapozással.';

-- ------------------------------------------------------------
-- events_public nézet újra, categories-szel
-- ------------------------------------------------------------

create view public.events_public
with (security_invoker = true)
as
  select id, title, categories, city, venue, latitude, longitude,
         start_time, end_time, description, source_url, image_url, created_at
  from public.events
  where status = 'approved';

comment on view public.events_public is 'Az events tábla publikus felülete: csak approved sorok, belső mezők nélkül.';

-- ------------------------------------------------------------
-- scraper_insert_events — categories tömböt fogad
-- (a 0005-ös forrásközi fuzzy dedup változatlanul benne van)
-- ------------------------------------------------------------

create or replace function public.scraper_insert_events(p_events jsonb)
returns table (inserted integer, skipped integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_inserted integer := 0;
  v_total    integer := 0;
begin
  select count(*) into v_total from jsonb_array_elements(p_events);

  with src as (
    select *
    from jsonb_to_recordset(p_events) as e(
      title       text,
      categories  public.event_category[],
      city        text,
      venue       text,
      latitude    double precision,
      longitude   double precision,
      start_time  timestamptz,
      end_time    timestamptz,
      description text,
      source_url  text,
      image_url   text
    )
  ),
  ins as (
    insert into public.events
      (title, categories, city, venue, latitude, longitude,
       start_time, end_time, description, source_url, image_url,
       status, origin, moderation_reason)
    select
      e.title, e.categories, e.city, e.venue, e.latitude, e.longitude,
      e.start_time, e.end_time, e.description, e.source_url, e.image_url,
      'approved', 'scraper', 'Hivatalos scraper import.'
    from src e
    where not exists (
      select 1
      from public.events ev
      where ev.status in ('pending', 'approved')
        and ev.start_time = e.start_time
        and lower(ev.city) = lower(e.city)
        and public.url_host(ev.source_url) is distinct from public.url_host(e.source_url)
        and public.similar_title(ev.title, e.title)
    )
    on conflict (source_url, start_time) where origin = 'scraper' do nothing
    returning 1
  )
  select count(*) into v_inserted from ins;

  return query select v_inserted, v_total - v_inserted;
end;
$$;

revoke all on function public.scraper_insert_events(jsonb) from public, anon, authenticated;
grant execute on function public.scraper_insert_events(jsonb) to service_role;

-- ------------------------------------------------------------
-- Grantok: a régi category-grant a DROP COLUMN-nal megszűnt,
-- az új oszlopra és az újraépített objektumokra újra kiadjuk
-- ------------------------------------------------------------

grant select (categories) on public.events to anon, authenticated;

revoke all on table public.events_public from anon, authenticated;
grant select on public.events_public to anon, authenticated;

grant execute on function public.filter_events(
  text, double precision, double precision, double precision,
  public.event_category[], timestamptz, timestamptz, integer, integer
) to anon, authenticated;
