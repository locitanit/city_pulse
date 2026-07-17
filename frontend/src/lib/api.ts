import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { DEMO_CITIES, DEMO_EVENTS } from './demoData';
import type { Category, City, EventItem } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Supabase env nélkül a felület beépített mintaadatokkal fut. */
export const DEMO_MODE = !SUPABASE_URL || !SUPABASE_ANON_KEY;

const supabase: SupabaseClient | null = DEMO_MODE
  ? null
  : createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);

export interface EventQuery {
  city: string | null;
  radiusKm: number;
  categories: Category[];
  fromISO: string | null;
  toISO: string | null;
  limit: number;
  offset: number;
}

export async function fetchCities(): Promise<City[]> {
  if (DEMO_MODE) return DEMO_CITIES;
  const { data, error } = await supabase!.from('cities').select('*').order('name');
  if (error) throw new Error(error.message);
  return (data ?? []) as City[];
}

export async function fetchEvents(q: EventQuery): Promise<{ events: EventItem[]; total: number }> {
  if (DEMO_MODE) return demoFilterEvents(q);
  const { data, error } = await supabase!.rpc('filter_events', {
    p_city: q.city,
    p_radius_km: q.city && q.radiusKm > 0 ? q.radiusKm : null,
    p_categories: q.categories.length ? q.categories : null,
    p_from: q.fromISO,
    p_to: q.toISO,
    p_limit: q.limit,
    p_offset: q.offset,
  });
  if (error) throw new Error(error.message);
  const events = (data ?? []) as EventItem[];
  return { events, total: events.length ? Number(events[0].total_count) : 0 };
}

// ---------- Beküldés (Edge Function végpontok) ----------

export interface SubmitEventPayload {
  title: string;
  categories: Category[];
  city: string;
  venue: string;
  start_time: string;
  end_time: string | null;
  description: string;
  source_url: string;
  image_url: string;
  turnstile_token: string;
  website: string; // honeypot — embernek üresen marad
}

export interface SubmitLinkPayload {
  url: string;
  turnstile_token: string;
  website: string; // honeypot
}

export interface SubmitResult {
  ok: boolean;
  message: string;
}

async function postFunction(name: string, body: unknown): Promise<SubmitResult> {
  if (DEMO_MODE) {
    await new Promise((r) => setTimeout(r, 600));
    return {
      ok: true,
      message: 'DEMÓ mód: a beküldés nem került elmentésre (nincs Supabase bekötve).',
    };
  }
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY!,
    },
    body: JSON.stringify(body),
  });
  let data: { ok?: boolean; message?: string } = {};
  try {
    data = await res.json();
  } catch {
    // nem JSON válasz — az alábbi fallback üzenet marad
  }
  return {
    ok: res.ok && data.ok !== false,
    message:
      data.message ??
      (res.ok ? 'Köszönjük! A beküldést moderálás után tesszük közzé.' : 'A beküldés nem sikerült.'),
  };
}

export function submitEvent(payload: SubmitEventPayload): Promise<SubmitResult> {
  return postFunction('submit-event', payload);
}

export function submitLink(payload: SubmitLinkPayload): Promise<SubmitResult> {
  return postFunction('submit-link', payload);
}

// ---------- Demó módú szűrés (a filter_events RPC tükre) ----------

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = (x: number) => (x * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(a)));
}

function demoFilterEvents(q: EventQuery): { events: EventItem[]; total: number } {
  let center: City | undefined;
  if (q.city && q.radiusKm > 0) {
    center = DEMO_CITIES.find((c) => c.name.toLowerCase() === q.city!.toLowerCase());
  }
  const filtered = DEMO_EVENTS.filter((e) => {
    if (q.city && q.radiusKm > 0 && center) {
      if (haversineKm(center.latitude, center.longitude, e.latitude, e.longitude) > q.radiusKm) {
        return false;
      }
    } else if (q.city) {
      if (e.city.toLowerCase() !== q.city.toLowerCase()) return false;
    }
    if (q.categories.length && !e.categories.some((c) => q.categories.includes(c))) return false;
    const effectiveEnd = e.end_time ?? e.start_time;
    if (q.fromISO && new Date(effectiveEnd) < new Date(q.fromISO)) return false;
    if (q.toISO && new Date(e.start_time) > new Date(q.toISO)) return false;
    return true;
  })
    .map((e) => ({
      ...e,
      distance_km: center
        ? haversineKm(center.latitude, center.longitude, e.latitude, e.longitude)
        : null,
    }))
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  return { events: filtered.slice(q.offset, q.offset + q.limit), total: filtered.length };
}
