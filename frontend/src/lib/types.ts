export const CATEGORIES = [
  'konnyuzene',
  'hangverseny',
  'buli',
  'szinhaz',
  'kiallitas',
  'fesztival',
  'standup',
  'csaladi',
  'sport',
] as const;

export type Category = (typeof CATEGORIES)[number];

// Egy esemény 1–3 kategóriába tartozhat (egyezik a DB CHECK-jével)
export const MAX_EVENT_CATEGORIES = 3;

// Teljes megnevezés (űrlap, kártya)
export const CATEGORY_LABELS: Record<Category, string> = {
  konnyuzene: 'Könnyűzene / Koncert',
  hangverseny: 'Hangverseny / Komolyzene',
  buli: 'Buli / Party',
  szinhaz: 'Színház',
  kiallitas: 'Kiállítás / Múzeum',
  fesztival: 'Fesztivál',
  standup: 'Stand-up / Humor',
  csaladi: 'Családi / Gyerekprogram',
  sport: 'Sport / Szabadidő',
};

// Rövid címke a szűrő-pillekhez és a kártya-chipekhez
export const CATEGORY_PILL_LABELS: Record<Category, string> = {
  konnyuzene: 'Könnyűzene',
  hangverseny: 'Hangverseny',
  buli: 'Buli',
  szinhaz: 'Színház',
  kiallitas: 'Kiállítás',
  fesztival: 'Fesztivál',
  standup: 'Stand-up',
  csaladi: 'Családi',
  sport: 'Sport',
};

export interface EventItem {
  id: string;
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
  distance_km?: number | null;
  total_count?: number;
}

export interface City {
  name: string;
  latitude: number;
  longitude: number;
}

export type DateQuick = 'today' | 'tomorrow' | 'weekend' | 'week';

export interface Filters {
  city: string | null; // null = Egész Magyarország
  radiusKm: number;
  categories: Category[];
  quick: DateQuick | null;
  customFrom: string | null; // YYYY-MM-DD
  customTo: string | null; // YYYY-MM-DD
}

export const DEFAULT_FILTERS: Filters = {
  city: null,
  radiusKm: 0,
  categories: [],
  quick: null,
  customFrom: null,
  customTo: null,
};
