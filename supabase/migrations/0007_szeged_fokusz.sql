-- ============================================================
-- CityPulse — 0007_szeged_fokusz.sql
-- Fókuszváltás: egész Magyarország → Szeged és ~70 km-es körzete.
--
-- 1. Környékbeli települések felvétele a cities táblába (szűrő
--    legördülő + geokódolás + a scraper find_known_city listája).
-- 2. A körzeten kívüli városok törlése a cities-ből — a legördülő
--    csak a körzetet mutatja, és a scraper városfelismerése is
--    automatikusan körzetre szűkül.
-- 3. A körzeten kívüli meglévő események törlése.
--
-- A körzethatárt a kód (scraper/Edge Function) is ellenőrzi:
-- Szeged (46.2530, 20.1414) középponttal 70 km.
-- ============================================================

insert into public.cities (name, latitude, longitude) values
  ('Makó',            46.2219, 20.4809),
  ('Szentes',         46.6540, 20.2648),
  ('Mórahalom',       46.2181, 19.8844),
  ('Ópusztaszer',     46.4889, 20.0817),
  ('Kistelek',        46.4736, 19.9800),
  ('Csongrád',        46.7084, 20.1434),
  ('Sándorfalva',     46.3619, 20.1044),
  ('Algyő',           46.3319, 20.2072),
  ('Mindszent',       46.5264, 20.1918),
  ('Kiskunmajsa',     46.4903, 19.7392),
  ('Kiskunfélegyháza',46.7113, 19.8528)
on conflict (name) do nothing;

delete from public.cities
where public.haversine_km(46.2530, 20.1414, latitude, longitude) > 70;

delete from public.events
where public.haversine_km(46.2530, 20.1414, latitude, longitude) > 70;
