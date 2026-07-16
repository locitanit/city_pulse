// CityPulse — submit-event Edge Function
// A részletes beküldő űrlap végpontja: honeypot + Turnstile ellenőrzés,
// szerveroldali sanitizálás és validálás, majd 'pending' státuszú mentés.
//
// Telepítés:  supabase functions deploy submit-event
// Szükséges env (Dashboard > Edge Functions > Secrets):
//   TURNSTILE_SECRET_KEY  (nélküle az ellenőrzés kihagyva — csak dev!)
//   (SUPABASE_URL és SUPABASE_SERVICE_ROLE_KEY automatikusan elérhető)

import {
  adminClient,
  CATEGORIES,
  gateRequest,
  geocodeCity,
  insertPending,
  json,
  sanitizeText,
  sanitizeUrl,
  type Category,
} from '../_shared/utils.ts';

Deno.serve(async (req) => {
  const gate = await gateRequest(req);
  if (!gate.pass) return gate.response;
  const body = gate.body;

  // --- Validálás + sanitizálás ---
  const title = sanitizeText(body.title, 100);
  const venue = sanitizeText(body.venue, 200);
  const city = sanitizeText(body.city, 100);
  const description = sanitizeText(body.description, 1000);
  const category = String(body.category ?? '') as Category;
  const sourceUrl = sanitizeUrl(body.source_url);
  const imageUrl = sanitizeUrl(body.image_url, true);

  if (title.length < 3) return json(400, { ok: false, message: 'Az esemény neve túl rövid.' });
  if (venue.length < 2) return json(400, { ok: false, message: 'Add meg a helyszínt.' });
  if (city.length < 2) return json(400, { ok: false, message: 'Add meg a települést.' });
  if (!CATEGORIES.includes(category)) {
    return json(400, { ok: false, message: 'Érvénytelen kategória.' });
  }
  if (!sourceUrl) {
    return json(400, { ok: false, message: 'Érvényes http(s) linket adj meg az esemény oldalához.' });
  }

  const start = new Date(String(body.start_time ?? ''));
  if (isNaN(start.getTime())) {
    return json(400, { ok: false, message: 'Érvénytelen kezdési időpont.' });
  }
  let end: Date | null = null;
  if (body.end_time) {
    end = new Date(String(body.end_time));
    if (isNaN(end.getTime()) || end < start) {
      return json(400, { ok: false, message: 'A befejezés nem lehet a kezdés előtt.' });
    }
  }

  // --- Geokódolás (cities tábla → Nominatim fallback) ---
  const supabase = adminClient();
  const geo = await geocodeCity(supabase, city);
  if (!geo) {
    return json(400, {
      ok: false,
      message: `Nem sikerült beazonosítani a települést: „${city}". Ellenőrizd a nevét.`,
    });
  }

  const result = await insertPending(supabase, {
    title,
    category,
    city,
    venue,
    latitude: geo.latitude,
    longitude: geo.longitude,
    start_time: start.toISOString(),
    end_time: end ? end.toISOString() : null,
    description: description || null,
    source_url: sourceUrl,
    image_url: imageUrl,
  });

  return json(result.ok ? 200 : 400, result);
});
