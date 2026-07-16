-- ============================================================
-- CityPulse — 0003_scrape_state.sql
-- Az „okos scraper" hash/diff állapota: célonként az utolsó letöltött,
-- normalizált tartalom ujjlenyomata. Ha a friss hash egyezik, a scraper
-- kihagyja az oldalt — LLM-hívás csak tényleges változásnál történik.
-- Kizárólag a service_role írja/olvassa (a céllista maga a repóban
-- verziózott targets.json-ban él, nem az adatbázisban).
-- ============================================================

create table public.scrape_state (
  target_url      text primary key,
  last_hash       text,
  last_scraped_at timestamptz,
  -- diagnosztika: az utolsó futás kimenete, pl.
  -- 'jsonld:3' | 'ical:5' | 'llm:2' | 'unchanged' | 'error:<ok>'
  last_result     text,
  updated_at      timestamptz not null default now()
);

comment on table public.scrape_state is 'Scraper hash/diff állapot célonként; LLM-extrakció csak változott tartalomra.';

alter table public.scrape_state enable row level security;
-- Nincs anon/authenticated policy és grant sem: kizárólag a service_role
-- (amely az RLS-t megkerüli) éri el.
revoke all on table public.scrape_state from anon, authenticated;
