-- ============================================================
-- CityPulse — 0002_cities.sql
-- Városlista törzsadat: a szűrő legördülő listája + a sugár szerinti
-- kereséshez használt középpont-koordináták. Élesben is szükséges,
-- ezért migrációban van (a demó adatok NEM itt, hanem a csak lokálisan
-- futó supabase/seed.sql-ben vannak).
-- ============================================================

insert into public.cities (name, latitude, longitude) values
  ('Budapest',          47.4979, 19.0402),
  ('Debrecen',          47.5316, 21.6273),
  ('Szeged',            46.2530, 20.1414),
  ('Miskolc',           48.1035, 20.7784),
  ('Pécs',              46.0727, 18.2323),
  ('Győr',              47.6875, 17.6504),
  ('Nyíregyháza',       47.9554, 21.7167),
  ('Kecskemét',         46.8964, 19.6897),
  ('Székesfehérvár',    47.1860, 18.4221),
  ('Szombathely',       47.2307, 16.6218),
  ('Szolnok',           47.1743, 20.1932),
  ('Tatabánya',         47.5692, 18.3981),
  ('Kaposvár',          46.3594, 17.7968),
  ('Veszprém',          47.0933, 17.9115),
  ('Békéscsaba',        46.6753, 21.0877),
  ('Zalaegerszeg',      46.8417, 16.8416),
  ('Sopron',            47.6817, 16.5845),
  ('Eger',              47.9025, 20.3772),
  ('Nagykanizsa',       46.4590, 16.9897),
  ('Dunaújváros',       46.9619, 18.9355),
  ('Hódmezővásárhely',  46.4181, 20.3300),
  ('Salgótarján',       48.0935, 19.7999),
  ('Szekszárd',         46.3474, 18.7062),
  ('Esztergom',         47.7928, 18.7434),
  ('Gödöllő',           47.5962, 19.3540),
  ('Keszthely',         46.7681, 17.2475),
  ('Siófok',            46.9048, 18.0580),
  ('Balatonfüred',      46.9629, 17.8878)
on conflict (name) do nothing;
