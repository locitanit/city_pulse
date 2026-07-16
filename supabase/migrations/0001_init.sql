-- ============================================================
-- CityPulse — „Ahol a város lüktet."
-- 0001_init.sql — séma, indexek, távolságszámítás, RLS
--
-- Célplatform: Supabase (PostgreSQL 15+)
-- Futtatás:   Supabase Dashboard > SQL Editor (bemásolva),
--             vagy Supabase CLI: `supabase db push`
-- ============================================================

-- gen_random_uuid() a pgcrypto-ból; Supabase-en alapból elérhető,
-- a CREATE EXTENSION IF NOT EXISTS idempotens.
create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. Enum típusok
-- ------------------------------------------------------------

-- Ékezet nélküli slug-ok: URL-ben és query paramban is biztonságosak.
-- A magyar megjelenítési címkéket a frontend rendeli hozzá.
-- Bővítés később: ALTER TYPE public.event_category ADD VALUE 'uj_kategoria';
create type public.event_category as enum (
  'konnyuzene',   -- Könnyűzene / Koncert
  'szinhaz',      -- Színház
  'kiallitas',    -- Kiállítás / Múzeum
  'fesztival',    -- Fesztivál
  'standup',      -- Stand-up / Humor
  'csaladi',      -- Családi / Gyerekprogram
  'sport'         -- Sport / Szabadidő
);

create type public.event_status as enum ('pending', 'approved', 'rejected');

-- Az adat eredete: hivatalos scraper vagy felhasználói beküldés.
-- A deduplikáció CSAK a scraper-sorokra vonatkozik (lásd az indexeknél),
-- így egy felhasználói (spam) beküldés nem tudja "lefoglalni" egy valódi
-- esemény kulcsát a scraper elől.
create type public.event_origin as enum ('scraper', 'user');

-- ------------------------------------------------------------
-- 2. events tábla
-- ------------------------------------------------------------

create table public.events (
  id                uuid primary key default gen_random_uuid(),
  title             varchar(100) not null,
  category          public.event_category not null,
  city              text not null,
  venue             text not null,
  latitude          double precision not null,
  longitude         double precision not null,
  start_time        timestamptz not null,
  end_time          timestamptz,
  description       text,
  source_url        text not null,
  image_url         text,
  status            public.event_status not null default 'pending',
  origin            public.event_origin not null default 'user',
  moderation_reason text,
  created_at        timestamptz not null default now(),

  constraint events_title_len     check (char_length(btrim(title)) between 3 and 100),
  constraint events_city_len      check (char_length(btrim(city)) between 2 and 100),
  constraint events_venue_len     check (char_length(btrim(venue)) between 2 and 200),
  constraint events_desc_len      check (description is null or char_length(description) <= 1000),
  -- Magyarország befoglaló téglalapja kis ráhagyással (lat 45.74–48.58, lon 16.11–22.90).
  -- Durva védőháló a nyilvánvalóan rossz koordináták ellen — a téglalap
  -- szükségszerűen tartalmaz néhány határközeli külföldi várost is (pl. Bécs,
  -- Pozsony); a tényleges szűrést a cities-alapú geokódolás és az AI moderátor végzi.
  constraint events_lat_hu        check (latitude  between 45.5 and 48.8),
  constraint events_lng_hu        check (longitude between 16.0 and 23.2),
  constraint events_time_order    check (end_time is null or end_time >= start_time),
  -- source_url: kattintható link — http és https is elfogadott, más séma nem
  constraint events_source_http   check (source_url ~* '^https?://'),
  constraint events_source_len    check (char_length(source_url) <= 2048),
  -- image_url: a frontend betölti, ezért csak https (mixed content + adatszivárgás ellen)
  constraint events_image_https   check (image_url is null or image_url ~* '^https://'),
  constraint events_image_len     check (image_url is null or char_length(image_url) <= 2048)
);

comment on table  public.events is 'CityPulse események — scraper (approved) és felhasználói beküldés (pending) egy táblában.';
comment on column public.events.status is 'pending: AI moderációra vár | approved: publikus | rejected: elutasítva, rejtve marad';
comment on column public.events.origin is 'scraper: hivatalos import | user: felhasználói beküldés. A dedup index csak a scraper-sorokra érvényes.';
comment on column public.events.moderation_reason is 'Belső mező: az AI moderátor magyar nyelvű indoklása. Kliens felé NEM olvasható (oszlopszintű grant).';

-- ------------------------------------------------------------
-- 3. Indexek
-- ------------------------------------------------------------

-- A leggyakoribb publikus lekérdezés: approved + időrend
create index events_approved_start_idx on public.events (start_time) where status = 'approved';
-- Moderátor cron job: pending sorok érkezési sorrendben
create index events_pending_created_idx on public.events (created_at) where status = 'pending';
-- Kategória- és városszűrés a publikus találati listában
create index events_approved_category_idx on public.events (category) where status = 'approved';
create index events_approved_city_idx     on public.events (lower(city)) where status = 'approved';

-- Scraper-deduplikáció, CSAK az origin = 'scraper' sorokra:
--   * a scraper így ismételten futtatható:
--       INSERT ... ON CONFLICT (source_url, start_time) WHERE origin = 'scraper' DO NOTHING
--     (a kihagyott ütközéseket naplózza, ne némán dobja el!)
--   * a scraper KÖTELEZŐEN esemény-RÉSZLETOLDAL URL-t ad meg source_url-nek
--     (nem főoldalt), különben két különböző, azonos időpontú esemény ütközne
--   * a felhasználói beküldésekre szándékosan NEM vonatkozik: egy elutasított
--     (rejected) spam beküldés így nem tudja tartósan blokkolni ugyanazon
--     (source_url, start_time) kulcsú valódi esemény scraper-importját,
--     és két jóhiszemű, azonos eseményt beküldő felhasználó sem kap hibát —
--     a duplikátumokat közöttük az AI moderátor szűri ki
create unique index events_scraper_dedup_idx
  on public.events (source_url, start_time)
  where origin = 'scraper';

-- ------------------------------------------------------------
-- 4. Városok segédtábla (a szűrő legördülőhöz + sugár-középponthoz)
--    A távolságcsúszkának kell egy középpont: a kiválasztott város
--    koordinátája innen jön, külső geokódoló API nélkül.
-- ------------------------------------------------------------

create table public.cities (
  name      text primary key,
  latitude  double precision not null check (latitude  between 45.5 and 48.8),
  longitude double precision not null check (longitude between 16.0 and 23.2)
);

comment on table public.cities is 'Válaszható városok a szűrőhöz; a sugár szerinti kereséshez középpont-koordinátát ad.';

-- ------------------------------------------------------------
-- 5. Haversine-távolság (km) — tiszta SQL, PostGIS nélkül
-- ------------------------------------------------------------

-- Szándékosan nincs rajta SET search_path: csak beépített matematikai
-- függvényeket hív, így a planner sorszinten inline-olni tudja.
create or replace function public.haversine_km(
  lat1 double precision, lon1 double precision,
  lat2 double precision, lon2 double precision
) returns double precision
language sql
immutable
parallel safe
as $$
  select 2 * 6371.0088 * asin(
    least(1.0, sqrt(
        sin(radians(lat2 - lat1) / 2) ^ 2
      + cos(radians(lat1)) * cos(radians(lat2)) * sin(radians(lon2 - lon1) / 2) ^ 2
    ))
  );
$$;

comment on function public.haversine_km is 'Két WGS84 koordináta gömbi távolsága kilométerben (Haversine, R=6371.0088 km).';

-- ------------------------------------------------------------
-- 6. Publikus kereső RPC — a frontend EZT hívja
--    supabase.rpc('filter_events', { p_city: 'Szeged', p_radius_km: 25, ... })
--
--    Szűrési szemantika (a középpontot a függvény maga oldja fel,
--    a kliensnek nem kell koordinátát küldenie):
--      * „Egész Magyarország":  se p_city, se p_radius_km
--      * Város + 0 km:          p_city = 'Szeged' (radius nélkül vagy 0-val)
--                               → pontos városnév-egyezés
--      * Város + sugár:         p_city = 'Szeged', p_radius_km = 10/25/50/100
--                               → középpont a cities táblából, a környező
--                                 települések eseményei is találatok
--      * Saját pozíció + sugár: p_lat/p_lon + p_radius_km (p_city nélkül)
--      * Dátum:                 p_from/p_to — a kliens Europe/Budapest szerint
--                               számolja a „Ma/Holnap/Hétvégén" intervallumokat
--    Ha sugárszűrést kérnek középpont nélkül (ismeretlen város és nincs
--    koordináta), a függvény hibát dob — nem ad vissza csendben rossz találatot.
--    A total_count minden sorban ugyanaz: a lapozáshoz szükséges teljes találatszám.
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
  category    public.event_category,
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
security invoker            -- az RLS a hívó (anon) jogaival érvényesül
set search_path = ''        -- minden objektum teljes névvel hivatkozva
as $$
declare
  v_lat double precision := p_lat;
  v_lon double precision := p_lon;
begin
  -- Paraméter-validálás: fél koordináta vagy értelmetlen sugár ne torzítson csendben
  if (p_lat is null) <> (p_lon is null) then
    raise exception 'A p_lat és p_lon csak együtt adható meg'
      using errcode = '22023';
  end if;
  -- Postgresben a NaN minden számnál nagyobb, ezért a > 1000 ezt is elkapja
  if p_radius_km is not null and (p_radius_km < 0 or p_radius_km > 1000) then
    raise exception 'Érvénytelen sugár: 0 és 1000 km közötti érték adható meg'
      using errcode = '22023';
  end if;

  -- Sugárszűréshez középpont kell: explicit koordináta vagy a cities tábla
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
    e.id, e.title, e.category, e.city, e.venue,
    e.latitude, e.longitude, e.start_time, e.end_time,
    e.description, e.source_url, e.image_url,
    case
      when v_lat is not null and v_lon is not null
      then public.haversine_km(v_lat, v_lon, e.latitude, e.longitude)
    end as distance_km,
    count(*) over () as total_count
  from public.events e
  where e.status = 'approved'          -- kettős védelem: RLS + explicit szűrő
    and case
          when coalesce(p_radius_km, 0) > 0
            then public.haversine_km(v_lat, v_lon, e.latitude, e.longitude) <= p_radius_km
          when p_city is not null
            then lower(e.city) = lower(p_city)
          else true
        end
    and (p_categories is null or e.category = any (p_categories))
    and (p_from is null or coalesce(e.end_time, e.start_time) >= p_from)
    and (p_to   is null or e.start_time <= p_to)
  order by e.start_time asc, e.id
  limit  least(greatest(coalesce(p_limit, 24), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

comment on function public.filter_events is 'Publikus eseménykereső: város/sugár/kategória/dátum szűrés, csak approved sorok, lapozással.';

-- ------------------------------------------------------------
-- 7. Publikus nézet — közvetlen olvasáshoz (pl. esemény-részletoldal)
--    A supabase.from('events').select('*') SZÁNDÉKOSAN nem működik anon
--    kulccsal (a moderation_reason oszlop nincs grantolva, a * kibontása
--    permission denied hibát dob). Közvetlen olvasásra EZT a nézetet
--    használd: supabase.from('events_public').select('*')
-- ------------------------------------------------------------

create view public.events_public
with (security_invoker = true)   -- a hívó jogaival: RLS + oszlop-grantok érvényesek
as
  select id, title, category, city, venue, latitude, longitude,
         start_time, end_time, description, source_url, image_url, created_at
  from public.events
  where status = 'approved';

comment on view public.events_public is 'Az events tábla publikus felülete: csak approved sorok, belső mezők nélkül. Kliensből select(''*'')-gal is biztonságosan hívható.';

-- ------------------------------------------------------------
-- 8. Row Level Security + jogosultságok
-- ------------------------------------------------------------

alter table public.events enable row level security;
alter table public.cities enable row level security;

-- Publikus kliens (anon kulcs): KIZÁRÓLAG a jóváhagyott sorokat láthatja.
create policy "Publikus olvasas csak approved statuszra"
  on public.events
  for select
  to anon, authenticated
  using (status = 'approved');

-- INSERT/UPDATE/DELETE policy szándékosan NINCS az anon szerepkörre:
-- minden írás a service_role kulccsal történik (RLS-t megkerüli) —
--   * scraper:        origin='scraper', status='approved' beszúrás
--   * beküldő API:    Turnstile + honeypot + sanitizálás UTÁN
--                     origin='user', status='pending' beszúrás
--   * AI moderátor:   pending -> approved/rejected státuszfrissítés

create policy "Varosok mindenkinek olvashatok"
  on public.cities
  for select
  to anon, authenticated
  using (true);

-- Oszlopszintű védelem: a moderation_reason belső mező, a kliens a
-- jóváhagyott sorokon se olvashassa. Ezért a tábla-szintű grantokat
-- visszavonjuk, és csak a publikus oszlopokra adunk SELECT-et.
-- (A status oszlop grantja kell: a filter_events és az events_public
-- WHERE feltétele hivatkozik rá — approved sorokon az értéke úgyis ismert.)
revoke all on table public.events from anon, authenticated;
grant select (
  id, title, category, city, venue, latitude, longitude,
  start_time, end_time, description, source_url, image_url,
  status, created_at
) on public.events to anon, authenticated;

-- Grant-higiénia: a Supabase default privilege-ek a nézetre és a cities
-- táblára is teljes (írási) grantot adnának — csak a SELECT maradhat.
revoke all on table public.events_public from anon, authenticated;
grant select on public.events_public to anon, authenticated;

revoke all on table public.cities from anon, authenticated;
grant select on public.cities to anon, authenticated;

grant execute on function public.haversine_km(
  double precision, double precision, double precision, double precision
) to anon, authenticated;

grant execute on function public.filter_events(
  text, double precision, double precision, double precision,
  public.event_category[], timestamptz, timestamptz, integer, integer
) to anon, authenticated;
