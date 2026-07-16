// CityPulse — submit-link Edge Function („1-kattintásos link-drop")
// A felhasználó csak egy URL-t ad meg; a végpont letölti az oldalt,
// JSON-LD (Schema.org/Event) blokkból — ennek híján LLM-mel (Gemini) —
// kinyeri az esemény adatait, geokódolja a várost, és 'pending'
// státusszal menti az AI moderátornak.
//
// Telepítés:  supabase functions deploy submit-link
// Szükséges env: TURNSTILE_SECRET_KEY, GEMINI_API_KEY
// Opcionális:    GEMINI_MODEL (alapértelmezés: gemini-2.5-flash)

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

const FETCH_TIMEOUT_MS = 12_000;
const MAX_TEXT_CHARS = 15_000;
const MAX_BODY_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;

interface Extracted {
  title: string;
  category: Category;
  city: string;
  venue: string;
  start_time: string;
  end_time: string | null;
  description: string | null;
  image_url: string | null;
}

Deno.serve(async (req) => {
  const gate = await gateRequest(req);
  if (!gate.pass) return gate.response;

  const url = sanitizeUrl(gate.body.url);
  if (!url) {
    return json(400, { ok: false, message: 'Érvényes http(s) linket adj meg.' });
  }

  // --- Oldal letöltése (SSRF-védett, átirányításonként újravalidálva) ---
  let html: string;
  try {
    html = await fetchPage(url);
  } catch {
    return json(400, {
      ok: false,
      message: 'A megadott oldalt nem sikerült letölteni. Próbáld a részletes űrlapot.',
    });
  }

  // --- 1. szint: JSON-LD (Schema.org/Event) ---
  let extracted = extractFromJsonLd(html);

  // --- 2. szint: LLM extrakció a szövegtörzsből ---
  if (!extracted) {
    const text = htmlToText(html);
    if (text.length < 80) {
      return json(400, {
        ok: false,
        message: 'Az oldalon nem található feldolgozható eseményleírás.',
      });
    }
    extracted = await extractWithGemini(text, url);
  }

  if (!extracted) {
    return json(400, {
      ok: false,
      message: 'Nem sikerült eseményadatokat kinyerni a linkről. Próbáld a részletes űrlapot.',
    });
  }

  // --- Validálás + mentés (ugyanaz a szigor, mint az űrlapnál) ---
  const start = new Date(extracted.start_time);
  if (isNaN(start.getTime())) {
    return json(400, { ok: false, message: 'Az esemény időpontját nem sikerült felismerni. Próbáld a részletes űrlapot.' });
  }
  let end: Date | null = extracted.end_time ? new Date(extracted.end_time) : null;
  if (end && (isNaN(end.getTime()) || end < start)) end = null;

  const supabase = adminClient();
  const geo = await geocodeCity(supabase, extracted.city);
  if (!geo) {
    return json(400, {
      ok: false,
      message: `A település („${extracted.city}") nem azonosítható — próbáld a részletes űrlapot.`,
    });
  }

  const result = await insertPending(supabase, {
    title: extracted.title,
    category: extracted.category,
    city: extracted.city,
    venue: extracted.venue,
    latitude: geo.latitude,
    longitude: geo.longitude,
    start_time: start.toISOString(),
    end_time: end ? end.toISOString() : null,
    description: extracted.description,
    source_url: url,
    image_url: extracted.image_url,
  });

  return json(result.ok ? 200 : 400, result);
});

// ---------------------------------------------------------------
// SSRF-védett letöltés
//
// A felhasználó által megadott URL szerveroldali letöltése támadási
// felület: (1) az átirányítások belső címre mutathatnak, ezért manuális
// redirect-kezeléssel minden ugrást újravalidálunk; (2) egy publikus
// hosztnév belső IP-re resolválhat (pl. nip.io), ezért DNS-feloldással
// is ellenőrzünk; (3) a választörzs méretét kupakoljuk. A DNS-rebinding
// (check és fetch közti rekordcsere) ellen ez nem teljes védelem, de a
// gyakorlati támadások túlnyomó részét kizárja.
// ---------------------------------------------------------------

const PRIVATE_V4 = [
  /^0\./, /^10\./, /^127\./, /^169\.254\./, /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];

function isPrivateIp(ip: string): boolean {
  if (ip.includes(':')) {
    const low = ip.toLowerCase();
    return low === '::1' || low === '::' || low.startsWith('fc') ||
      low.startsWith('fd') || low.startsWith('fe80');
  }
  return PRIVATE_V4.some((re) => re.test(ip));
}

async function isForbiddenTarget(target: URL): Promise<boolean> {
  const host = target.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
    return true;
  }
  // IP-literál (a WHATWG parser a decimális/hex alakot is pontozottra normalizálja)
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':') || host.startsWith('[')) {
    return true;
  }
  try {
    const recs = await Deno.resolveDns(host, 'A');
    if (recs.some(isPrivateIp)) return true;
  } catch {
    // feloldási hiba → a fetch úgyis elhasal; nem blokkolunk itt
  }
  try {
    const recs6 = await Deno.resolveDns(host, 'AAAA');
    if (recs6.some(isPrivateIp)) return true;
  } catch {
    // nincs AAAA rekord — rendben
  }
  return false;
}

async function readCapped(res: Response, cap: number): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < cap) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  if (total >= cap) await reader.cancel().catch(() => {});
  const merged = new Uint8Array(Math.min(total, cap));
  let offset = 0;
  for (const chunk of chunks) {
    const slice = chunk.subarray(0, Math.min(chunk.byteLength, merged.length - offset));
    merged.set(slice, offset);
    offset += slice.byteLength;
    if (offset >= merged.length) break;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(merged);
}

async function fetchPage(startUrl: string): Promise<string> {
  let current = new URL(startUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (await isForbiddenTarget(current)) throw new Error('forbidden target');
    const res = await fetch(current.href, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': 'CityPulseBot/1.0 (+esemeny-aggregator)' },
      redirect: 'manual',
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      await res.body?.cancel().catch(() => {});
      if (!loc) throw new Error('redirect without location');
      const next = new URL(loc, current);
      if (next.protocol !== 'http:' && next.protocol !== 'https:') {
        throw new Error('bad redirect scheme');
      }
      current = next;
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      throw new Error(`HTTP ${res.status}`);
    }
    const declared = Number(res.headers.get('content-length') ?? '0');
    if (declared > MAX_BODY_BYTES) {
      await res.body?.cancel().catch(() => {});
      throw new Error('response too large');
    }
    return await readCapped(res, MAX_BODY_BYTES);
  }
  throw new Error('too many redirects');
}

// ---------------------------------------------------------------
// JSON-LD feldolgozás
// ---------------------------------------------------------------

function extractFromJsonLd(html: string): Extracted | null {
  const blocks = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const m of blocks) {
    try {
      const parsed = JSON.parse(m[1]);
      const nodes: unknown[] = Array.isArray(parsed)
        ? parsed
        : parsed['@graph']
          ? parsed['@graph']
          : [parsed];
      for (const node of nodes) {
        const ev = node as Record<string, unknown>;
        const type = ev['@type'];
        const isEvent =
          type === 'Event' ||
          (typeof type === 'string' && type.endsWith('Event')) ||
          (Array.isArray(type) && type.some((t) => String(t).endsWith('Event')));
        if (!isEvent || !ev.name || !ev.startDate) continue;

        const location = (ev.location ?? {}) as Record<string, unknown>;
        const address = (location.address ?? {}) as Record<string, unknown>;
        const image = Array.isArray(ev.image) ? ev.image[0] : ev.image;

        const city = sanitizeText(address.addressLocality ?? '', 100);
        if (!city) continue; // város nélkül nem tudunk geokódolni

        return {
          title: sanitizeText(ev.name, 100),
          category: guessCategory(`${ev.name} ${ev.description ?? ''}`),
          city,
          venue: sanitizeText(location.name ?? city, 200) || city,
          start_time: String(ev.startDate),
          end_time: ev.endDate ? String(ev.endDate) : null,
          description: sanitizeText(ev.description ?? '', 1000) || null,
          image_url: sanitizeUrl(image, true),
        };
      }
    } catch {
      // hibás JSON-LD blokk — megyünk tovább
    }
  }
  return null;
}

/** Egyszerű kulcsszavas kategória-tipp a JSON-LD ágra (az LLM-ág maga kategorizál). */
function guessCategory(text: string): Category {
  const t = text.toLowerCase();
  if (/(fesztivál|festival)/.test(t)) return 'fesztival';
  if (/(színház|szinhaz|előadás|dráma|musical)/.test(t)) return 'szinhaz';
  if (/(kiállítás|kiallitas|múzeum|muzeum|galéria)/.test(t)) return 'kiallitas';
  if (/(stand.?up|humor|dumaszínház|dumaszinhaz)/.test(t)) return 'standup';
  if (/(családi|csaladi|gyerek|gyermek)/.test(t)) return 'csaladi';
  if (/(futás|futas|verseny|sport|túra|tura|maraton)/.test(t)) return 'sport';
  return 'konnyuzene';
}

// ---------------------------------------------------------------
// LLM (Gemini) extrakció
// ---------------------------------------------------------------

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}

async function extractWithGemini(text: string, url: string): Promise<Extracted | null> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    console.error('GEMINI_API_KEY hiányzik — a link-drop LLM-ág nem elérhető');
    return null;
  }
  const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash';

  const prompt = `A következő weboldal-szöveg egy magyarországi eseményt ír le (forrás: ${url}).
Nyerd ki az esemény adatait. Ha több esemény van, a legkorábbi jövőbelit vedd.
Válaszolj KIZÁRÓLAG a megadott JSON sémának megfelelően.
- category: pontosan egy a következők közül: ${CATEGORIES.join(', ')}
- start_time / end_time: ISO 8601 (Europe/Budapest, pl. 2026-08-15T19:00:00+02:00); end_time lehet null
- city: a település neve (pl. "Szeged"); venue: a helyszín neve
- description: max 1000 karakteres magyar összefoglaló
Ha az oldalon nem esemény van, a title mező legyen üres string.

Weboldal szövege:
${text}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0,
            response_mime_type: 'application/json',
            response_schema: {
              type: 'OBJECT',
              properties: {
                title: { type: 'STRING' },
                category: { type: 'STRING', enum: [...CATEGORIES] },
                city: { type: 'STRING' },
                venue: { type: 'STRING' },
                start_time: { type: 'STRING' },
                end_time: { type: 'STRING', nullable: true },
                description: { type: 'STRING', nullable: true },
                image_url: { type: 'STRING', nullable: true },
              },
              required: ['title', 'category', 'city', 'venue', 'start_time'],
            },
          },
        }),
      },
    );
    if (!res.ok) {
      console.error('Gemini hiba:', res.status, await res.text());
      return null;
    }
    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) return null;
    const parsed = JSON.parse(raw);

    const title = sanitizeText(parsed.title, 100);
    const city = sanitizeText(parsed.city, 100);
    if (title.length < 3 || city.length < 2) return null;
    const category = CATEGORIES.includes(parsed.category) ? (parsed.category as Category) : 'konnyuzene';

    return {
      title,
      category,
      city,
      venue: sanitizeText(parsed.venue, 200) || city,
      start_time: String(parsed.start_time ?? ''),
      end_time: parsed.end_time ? String(parsed.end_time) : null,
      description: sanitizeText(parsed.description ?? '', 1000) || null,
      image_url: sanitizeUrl(parsed.image_url, true),
    };
  } catch (err) {
    console.error('Gemini extrakció hiba:', err);
    return null;
  }
}
