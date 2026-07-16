-- ============================================================
-- CityPulse — 0004_scraper_rpc.sql
-- Kötegelt scraper-beszúrás RPC.
--
-- Miért kell: a scraper-deduplikáció részleges unique indexen múlik
-- (events_scraper_dedup_idx ... WHERE origin = 'scraper'), és a
-- PostgREST ON CONFLICT-ja nem tud index-predikátumot megadni.
-- Ez a függvény a helyes ütköztetéssel szúr be, és visszaadja,
-- hány sor került be és hány volt duplikátum.
-- Kizárólag a service_role hívhatja (scraper / Apify ingest).
-- ============================================================

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
      category    public.event_category,
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
      (title, category, city, venue, latitude, longitude,
       start_time, end_time, description, source_url, image_url,
       status, origin, moderation_reason)
    select
      e.title, e.category, e.city, e.venue, e.latitude, e.longitude,
      e.start_time, e.end_time, e.description, e.source_url, e.image_url,
      'approved', 'scraper', 'Hivatalos scraper import.'
    from src e
    on conflict (source_url, start_time) where origin = 'scraper' do nothing
    returning 1
  )
  select count(*) into v_inserted from ins;

  return query select v_inserted, v_total - v_inserted;
end;
$$;

comment on function public.scraper_insert_events is 'Kötegelt approved/scraper esemény-beszúrás a részleges dedup indexszel ütköztetve. Csak service_role.';

-- Alapból minden függvény EXECUTE joga PUBLIC-é — itt szigorítunk:
revoke all on function public.scraper_insert_events(jsonb) from public, anon, authenticated;
grant execute on function public.scraper_insert_events(jsonb) to service_role;
