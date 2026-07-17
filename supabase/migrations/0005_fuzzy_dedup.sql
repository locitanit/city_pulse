-- ============================================================
-- CityPulse — 0005_fuzzy_dedup.sql
-- Forrásközi (fuzzy) esemény-deduplikáció.
--
-- Probléma: ugyanaz az esemény több forrásból is bekerülhet kissé
-- eltérő címmel (pl. a REÖK-kiállítás a reok.hu-ról ÉS a
-- szegediszabadteri.hu-ról), mert a 0004-es dedup kulcsa
-- (source_url, start_time) forráson belüli.
--
-- Szabály (szándékosan szűk, a fals pozitívok ellen):
--   MÁSIK domainről érkező, AZONOS kezdésidejű, azonos városú,
--   hasonló című esemény = duplikátum.
-- Az azonos forrásból jövő ismétléseket továbbra is a unique index
-- kezeli — így az egy helyszínen aznap kétszer futó előadás
-- (azonos cím, más időpont) nem vész el.
-- ============================================================

create extension if not exists pg_trgm with schema extensions;

-- URL → normalizált host (www. nélkül), a forrás-összehasonlításhoz
create or replace function public.url_host(p_url text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select lower(regexp_replace(substring(p_url from '^[a-z]+://([^/]+)'), '^www\.', ''))
$$;

comment on function public.url_host is 'URL host-része kisbetűsítve, www. előtag nélkül (fuzzy dedup).';

-- Cím-hasonlóság: trigram VAGY rész-cím egyezés (az egyik cím a
-- másik bővebb változata, pl. "… nyílik a REÖK-ben" utótaggal)
create or replace function public.similar_title(a text, b text)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select extensions.similarity(lower(a), lower(b)) > 0.55
      or extensions.word_similarity(lower(a), lower(b)) > 0.85
      or extensions.word_similarity(lower(b), lower(a)) > 0.85
$$;

comment on function public.similar_title is 'Fuzzy címegyezés a forrásközi dedup-hoz (trigram + rész-cím).';

-- A beszúró RPC kiegészítése a forrásközi szűréssel
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
    where not exists (
      -- forrásközi duplikátum: más domain, azonos kezdés + város, hasonló cím
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
revoke all on function public.url_host(text) from public, anon, authenticated;
grant execute on function public.url_host(text) to service_role;
revoke all on function public.similar_title(text, text) from public, anon, authenticated;
grant execute on function public.similar_title(text, text) to service_role;

-- ------------------------------------------------------------
-- Egyszeri takarítás: a már bent lévő forrásközi duplikátumok
-- törlése — a korábban létrejött példány marad.
-- ------------------------------------------------------------
delete from public.events e
using public.events k
where e.id <> k.id
  and e.origin = 'scraper'
  and k.origin = 'scraper'
  and e.start_time = k.start_time
  and lower(e.city) = lower(k.city)
  and public.url_host(e.source_url) is distinct from public.url_host(k.source_url)
  and public.similar_title(e.title, k.title)
  and (k.created_at < e.created_at
       or (k.created_at = e.created_at and k.id < e.id));
