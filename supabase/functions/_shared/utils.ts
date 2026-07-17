// CityPulse — közös segédfüggvények a beküldő Edge Function-ökhöz (Deno)

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const CATEGORIES = [
  'konnyuzene',
  'szinhaz',
  'kiallitas',
  'fesztival',
  'standup',
  'csaladi',
  'sport',
  'buli',
  'hangverseny',
] as const;
export type Category = (typeof CATEGORIES)[number];
export const MAX_CATEGORIES = 3; // egyezik a DB events_categories_count CHECK-jével

/** 1–3 érvényes, egyedi kategória — különben null. */
export function sanitizeCategories(input: unknown): Category[] | null {
  const raw = Array.isArray(input) ? input : typeof input === 'string' ? [input] : [];
  const out: Category[] = [];
  for (const item of raw) {
    const c = String(item) as Category;
    if (CATEGORIES.includes(c) && !out.includes(c)) out.push(c);
  }
  return out.length >= 1 && out.length <= MAX_CATEGORIES ? out : null;
}

// Fókuszkörzet: Szeged és ~70 km-es környéke — ezen kívüli beküldést nem fogadunk
export const FOCUS_CENTER = { latitude: 46.253, longitude: 20.1414 };
export const FOCUS_RADIUS_KM = 70;

export function inFocusArea(lat: number, lon: number): boolean {
  const rad = (x: number) => (x * Math.PI) / 180;
  const a =
    Math.sin(rad(lat - FOCUS_CENTER.latitude) / 2) ** 2 +
    Math.cos(rad(FOCUS_CENTER.latitude)) *
      Math.cos(rad(lat)) *
      Math.sin(rad(lon - FOCUS_CENTER.longitude) / 2) ** 2;
  const km = 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(a)));
  return km <= FOCUS_RADIUS_KM;
}

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, apikey, content-type, x-client-info, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/** Service role kliens — kizárólag szerveroldalon létezik. */
export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

/** HTML/JS eltávolítása + whitespace normalizálás + hosszkorlát. */
export function sanitizeText(input: unknown, maxLen: number): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<[^>]*>/g, ' ') // HTML tagek ki
    .replace(/[\u0000-\u001F\u007F]/g, ' ') // vezérlőkarakterek ki
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

export function sanitizeUrl(input: unknown, httpsOnly = false): string | null {
  if (typeof input !== 'string') return null;
  const url = input.trim();
  if (url.length === 0 || url.length > 2048) return null;
  if (!/^https?:\/\//i.test(url)) return null;
  if (httpsOnly && !/^https:\/\//i.test(url)) return null;
  try {
    new URL(url);
  } catch {
    return null;
  }
  return url;
}

/**
 * Cloudflare Turnstile ellenőrzés. Ha nincs TURNSTILE_SECRET_KEY beállítva
 * (helyi fejlesztés), az ellenőrzés kihagyásra kerül.
 */
export async function verifyTurnstile(token: unknown, ip: string | null): Promise<boolean> {
  const secret = Deno.env.get('TURNSTILE_SECRET_KEY');
  if (!secret) return true;
  if (typeof token !== 'string' || !token) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
    });
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

/**
 * Település geokódolása: először a cities törzstáblából, ennek híján az
 * OpenStreetMap Nominatim-ból (ingyenes, alacsony volumenű beküldésekhez elég).
 */
export async function geocodeCity(
  supabase: SupabaseClient,
  city: string,
): Promise<GeoPoint | null> {
  const { data } = await supabase
    .from('cities')
    .select('latitude, longitude')
    .ilike('name', city)
    .maybeSingle();
  if (data) return data as GeoPoint;

  try {
    const url =
      'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=hu&q=' +
      encodeURIComponent(city);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'CityPulse/1.0 (esemeny-aggregator)' },
    });
    const results = await res.json();
    if (Array.isArray(results) && results.length > 0) {
      const lat = Number(results[0].lat);
      const lon = Number(results[0].lon);
      // A DB CHECK-jeivel azonos Magyarország-határok
      if (lat >= 45.5 && lat <= 48.8 && lon >= 16.0 && lon <= 23.2) {
        return { latitude: lat, longitude: lon };
      }
    }
  } catch {
    // geokódolási hiba → null, a hívó ad hibaüzenetet
  }
  return null;
}

export interface PendingEvent {
  title: string;
  categories: Category[];
  city: string;
  venue: string;
  latitude: number;
  longitude: number;
  start_time: string;
  end_time: string | null;
  description: string | null;
  source_url: string;
  image_url: string | null;
}

/** Validált esemény mentése pending státusszal (origin='user'). */
export async function insertPending(
  supabase: SupabaseClient,
  event: PendingEvent,
): Promise<{ ok: boolean; message: string }> {
  const { error } = await supabase.from('events').insert({
    ...event,
    status: 'pending',
    origin: 'user',
  });
  if (error) {
    console.error('insertPending error:', error.message);
    return {
      ok: false,
      message: 'A beküldést nem sikerült elmenteni. Ellenőrizd a megadott adatokat.',
    };
  }
  return {
    ok: true,
    message: 'Köszönjük! A beküldést automatikus moderálás után tesszük közzé.',
  };
}

/** Közös beléptető: OPTIONS, method, honeypot, Turnstile. */
export async function gateRequest(
  req: Request,
): Promise<{ pass: false; response: Response } | { pass: true; body: Record<string, unknown> }> {
  if (req.method === 'OPTIONS') {
    return { pass: false, response: new Response('ok', { headers: corsHeaders }) };
  }
  if (req.method !== 'POST') {
    return { pass: false, response: json(405, { ok: false, message: 'POST kötelező.' }) };
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return { pass: false, response: json(400, { ok: false, message: 'Érvénytelen JSON.' }) };
  }

  // Honeypot: embernek láthatatlan mező — ha ki van töltve, bot küldte.
  // Csendben, "sikeres" válasszal dobjuk el, hogy a botot ne igazítsuk el.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    console.warn('Honeypot triggered — dropping request');
    return {
      pass: false,
      response: json(200, { ok: true, message: 'Köszönjük a beküldést!' }),
    };
  }

  const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for');
  if (!(await verifyTurnstile(body.turnstile_token, ip))) {
    return {
      pass: false,
      response: json(403, {
        ok: false,
        message: 'A robot-ellenőrzés sikertelen. Frissítsd az oldalt, és próbáld újra.',
      }),
    };
  }

  return { pass: true, body };
}
