import type { DateQuick, Filters } from './types';

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Gyorsgomb → [tól, ig) intervallum a felhasználó helyi idejében. */
export function quickRange(kind: DateQuick): { from: Date; to: Date } {
  const today = startOfDay(new Date());
  switch (kind) {
    case 'today':
      return { from: today, to: addDays(today, 1) };
    case 'tomorrow':
      return { from: addDays(today, 1), to: addDays(today, 2) };
    case 'weekend': {
      // A következő (vagy épp zajló) szombat–vasárnap
      const day = today.getDay(); // 0 = vasárnap, 6 = szombat
      if (day === 6) return { from: today, to: addDays(today, 2) };
      if (day === 0) return { from: today, to: addDays(today, 1) };
      const sat = addDays(today, 6 - day);
      return { from: sat, to: addDays(sat, 2) };
    }
    case 'week':
      return { from: today, to: addDays(today, 7) };
  }
}

/** A szűrőállapotból ISO [tól, ig) pár; alapértelmezés: a mai naptól minden. */
export function resolveDateRange(f: Filters): { fromISO: string | null; toISO: string | null } {
  if (f.quick) {
    const { from, to } = quickRange(f.quick);
    return { fromISO: from.toISOString(), toISO: to.toISOString() };
  }
  if (f.customFrom || f.customTo) {
    const from = f.customFrom ? startOfDay(new Date(f.customFrom + 'T00:00:00')) : startOfDay(new Date());
    const to = f.customTo ? addDays(startOfDay(new Date(f.customTo + 'T00:00:00')), 1) : null;
    return { fromISO: from.toISOString(), toISO: to ? to.toISOString() : null };
  }
  return { fromISO: startOfDay(new Date()).toISOString(), toISO: null };
}

export const MONTH_ABBR = [
  'JAN', 'FEB', 'MÁR', 'ÁPR', 'MÁJ', 'JÚN', 'JÚL', 'AUG', 'SZEP', 'OKT', 'NOV', 'DEC',
];

export function fmtBadge(iso: string): { day: number; month: string } {
  const d = new Date(iso);
  return { day: d.getDate(), month: MONTH_ABBR[d.getMonth()] };
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
}

/** Kártya-időcímke: egynapos → "20:00"; többnapos → "júl. 18. – aug. 30." */
export function fmtWhen(startISO: string, endISO: string | null): string {
  const start = new Date(startISO);
  if (endISO) {
    const end = new Date(endISO);
    const sameDay = start.toDateString() === end.toDateString();
    if (!sameDay) {
      const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
      return `${start.toLocaleDateString('hu-HU', opts)} – ${end.toLocaleDateString('hu-HU', opts)}`;
    }
    return `${fmtTime(startISO)}–${fmtTime(endISO)}`;
  }
  return fmtTime(startISO);
}
