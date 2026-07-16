-- ============================================================
-- CityPulse — seed.sql (CSAK LOKÁLIS FEJLESZTÉSHEZ)
--
-- A Supabase CLI ezt a fájlt kizárólag `supabase db reset`-nél futtatja,
-- a `supabase db push` (éles migráció) NEM. Élesbe így nem kerülhet
-- fiktív esemény. NE mozgasd a migrations/ mappába!
--
-- A demó események fiktívek; a source_url a helyszín/szervező
-- főoldalára mutat (éles scraper-adatnál mindig részletoldal kell).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Demó események (approved, origin='scraper') — a mockup kártyáit tükrözik
-- ------------------------------------------------------------

insert into public.events
  (title, category, city, venue, latitude, longitude,
   start_time, end_time, description, source_url, image_url,
   status, origin, moderation_reason)
values
  ('Azahriah — Nyáresti Koncert', 'konnyuzene', 'Szeged',
   'Szegedi Szabadtéri Játékok', 46.2489, 20.1492,
   '2026-07-24 20:00:00+02', '2026-07-24 23:00:00+02',
   'A magyar pop üstököse hatalmas nyáresti show-val érkezik a Dóm térre — vendégekkel és új dalokkal.',
   'https://www.szegediszabadteri.hu/', null, 'approved', 'scraper', 'Hivatalos scraper import.'),

  ('Fény és Forma — Modern Art Kiállítás', 'kiallitas', 'Szeged',
   'REÖK Palota', 46.2521, 20.1441,
   '2026-07-18 10:00:00+02', '2026-08-30 18:00:00+02',
   'Kortárs magyar képzőművészek fényinstallációi és szoborkísérletei a szecessziós palota termeiben.',
   'https://www.reok.hu/', null, 'approved', 'scraper', 'Hivatalos scraper import.'),

  ('Rómeó és Júlia', 'szinhaz', 'Veszprém',
   'Hangvilla', 47.0921, 17.9096,
   '2026-07-26 19:00:00+02', null,
   'Shakespeare klasszikusa friss, mai rendezésben — a veszprémi társulat nagy sikerű nyári előadása.',
   'https://www.hangvilla.com/', null, 'approved', 'scraper', 'Hivatalos scraper import.'),

  ('VeszprémFest — Jazz a Várban', 'fesztival', 'Veszprém',
   'Történelmi Várnegyed', 47.0972, 17.9036,
   '2026-07-31 21:00:00+02', null,
   'Nemzetközi jazzcsillagok a várnegyed szabadtéri színpadán, borteraszokkal és éjszakai ráadással.',
   'https://www.veszpremfest.hu/', null, 'approved', 'scraper', 'Hivatalos scraper import.'),

  ('Dumaszínház: Nyári Best Of', 'standup', 'Budapest',
   'Akvárium Klub', 47.4977, 19.0547,
   '2026-08-05 19:30:00+02', null,
   'A Dumaszínház kedvenc előadói egy színpadon: válogatás az évad legütősebb poénjaiból.',
   'https://dumaszinhaz.hu/', null, 'approved', 'scraper', 'Hivatalos scraper import.'),

  ('Családi Nap az Állatkertben', 'csaladi', 'Debrecen',
   'Debreceni Állatkert', 47.5560, 21.6180,
   '2026-07-19 10:00:00+02', '2026-07-19 18:00:00+02',
   'Kézműves foglalkozások, állatsimogató és látványetetések egész nap a Nagyerdőben.',
   'https://www.zoodebrecen.hu/', null, 'approved', 'scraper', 'Hivatalos scraper import.'),

  ('Pécsi Éjszakai Futás', 'sport', 'Pécs',
   'Széchenyi tér', 46.0763, 18.2281,
   '2026-08-08 20:00:00+02', null,
   'Öt és tíz kilométeres éjszakai futam a belváros fényei között — rajtcsomaggal és éremmel.',
   'https://www.pecsiprogramok.hu/', null, 'approved', 'scraper', 'Hivatalos scraper import.'),

  ('Akusztik Est a Várban', 'konnyuzene', 'Veszprém',
   'Veszprémi Vár', 47.0975, 17.9020,
   '2026-08-02 19:30:00+02', null,
   'Meghitt akusztikus koncertsorozat a várfal tövében — hozz plédet, a naplemente ingyen jár hozzá.',
   'https://www.veszpreminfo.hu/', null, 'approved', 'scraper', 'Hivatalos scraper import.')
on conflict (source_url, start_time) where origin = 'scraper' do nothing;

-- ------------------------------------------------------------
-- 2. Moderációs tesztsorok: pending + rejected, origin='user'
--    (a frontenden NEM jelenhetnek meg — ezzel tesztelhető az RLS)
-- ------------------------------------------------------------

-- A user-sorokra nincs unique constraint (a dedup index csak a scraperre
-- vonatkozik), ezért kézi újrafuttatásnál előbb takarítunk, hogy a fájl
-- idempotens maradjon.
delete from public.events
 where origin = 'user'
   and source_url in ('https://www.margitsziget.hu/', 'https://example.com/spam-ora-akcio');

insert into public.events
  (title, category, city, venue, latitude, longitude,
   start_time, end_time, description, source_url, image_url,
   status, origin, moderation_reason)
values
  ('Kerti Jazz Piknik', 'konnyuzene', 'Budapest',
   'Margitsziget, Nagyrét', 47.5270, 19.0450,
   '2026-08-15 17:00:00+02', null,
   'Hozd a plédet és a kosarad: naplementés jazz a sziget szívében, ingyenes belépéssel.',
   'https://www.margitsziget.hu/', null, 'pending', 'user', null),

  ('OLCSÓ ÓRÁK AKCIÓ!!!', 'sport', 'Budapest',
   'Ismeretlen helyszín', 47.4979, 19.0402,
   '2026-08-01 10:00:00+02', null,
   'Replika órák hihetetlen áron, kattints ide!!!',
   'https://example.com/spam-ora-akcio', null, 'rejected', 'user',
   'Elutasítva: nem kulturális/szórakoztató esemény, hanem kereskedelmi spam; a leírás adathalászat-gyanús linket reklámoz.');
