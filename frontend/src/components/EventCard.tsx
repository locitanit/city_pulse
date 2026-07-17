import { fmtBadge, fmtWhen } from '../lib/date';
import { CATEGORY_PILL_LABELS, type Category, type EventItem } from '../lib/types';

// Kép nélküli kártyákhoz a sablon csíkozott placeholder-mintái,
// kategóriánként váltakozó árnyalattal.
const PATTERNS: Record<'primary' | 'accent' | 'gray', string> = {
  primary: 'repeating-linear-gradient(135deg, #DBEFF3 0 14px, #C6E6EC 14px 28px)',
  accent: 'repeating-linear-gradient(135deg, #FCE4D5 0 14px, #FBD6BC 14px 28px)',
  gray: 'repeating-linear-gradient(135deg, #E4E9EB 0 14px, #D7DFE2 14px 28px)',
};

const CATEGORY_PATTERN: Record<Category, keyof typeof PATTERNS> = {
  konnyuzene: 'primary',
  szinhaz: 'gray',
  kiallitas: 'accent',
  fesztival: 'accent',
  standup: 'primary',
  csaladi: 'accent',
  sport: 'gray',
};

// Kategóriánkénti alapkép (public/images/categories, forrás: CREDITS.md) —
// akkor jelenik meg, ha az eseménynek nincs saját image_url-je.
const CATEGORY_IMAGES: Record<Category, string> = {
  konnyuzene: '/images/categories/konnyuzene.jpg',
  szinhaz: '/images/categories/szinhaz.jpg',
  kiallitas: '/images/categories/kiallitas.jpg',
  fesztival: '/images/categories/fesztival.jpg',
  standup: '/images/categories/standup.jpg',
  csaladi: '/images/categories/csaladi.jpg',
  sport: '/images/categories/sport.jpg',
};

function fmtKm(km: number): string {
  return `${km.toFixed(1).replace('.', ',')} km`;
}

export default function EventCard({ event }: { event: EventItem }) {
  const badge = fmtBadge(event.start_time);

  return (
    // Az egész kártya egyetlen link az esemény eredeti oldalára
    <a
      href={event.source_url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col overflow-hidden rounded-card border border-line bg-white text-inherit no-underline transition-all duration-200 hover:-translate-y-[3px] hover:shadow-card-hover"
    >
      <div
        className="relative grid h-[168px] place-items-center"
        style={{ background: PATTERNS[CATEGORY_PATTERN[event.category]] }}
      >
        {/* A minta + címke csak akkor látszik, ha a kép betöltése elbukik */}
        <span className="rounded-md bg-white/75 px-2.5 py-1 font-mono text-xs text-body">
          {CATEGORY_PILL_LABELS[event.category].toLowerCase()}
        </span>
        {/* Nincs loading="lazy": a 7 kategóriakép cache-ből ismétlődik, és a
            lazy ütemezés háttér-tabokban/előnézetekben megbízhatatlan. */}
        <img
          src={event.image_url ?? CATEGORY_IMAGES[event.category]}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
        <div className="absolute left-3 top-3 rounded-[10px] bg-white px-3 py-[7px] text-center shadow-badge">
          <div className="text-[19px] font-extrabold leading-none">{badge.day}</div>
          <div className="text-[10px] font-extrabold tracking-[0.1em] text-accent">
            {badge.month}
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-[9px] p-[18px] pb-5">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.07em] text-primary-dark">
            {CATEGORY_PILL_LABELS[event.category]}
          </span>
          <span className="text-[13px] font-bold text-subtle">
            {fmtWhen(event.start_time, event.end_time)}
          </span>
        </div>
        <h3 className="text-lg font-extrabold leading-tight tracking-[-0.01em]">
          {event.title}
        </h3>
        <div className="text-[13px] font-semibold text-muted">
          {event.venue} · {event.city}
          {event.distance_km != null && event.distance_km > 0.05 && (
            <span className="text-subtle"> · {fmtKm(event.distance_km)}</span>
          )}
        </div>
        {event.description && (
          <p className="line-clamp-2 text-sm leading-normal text-body">{event.description}</p>
        )}
        {/* Vizuális CTA — a kattintást a kártya-szintű link kezeli */}
        <span className="mt-auto block rounded-[10px] bg-accent px-4 py-3 text-center text-[15px] font-extrabold text-white hover:brightness-95">
          Jegyvásárlás / Eredeti oldal ↗
        </span>
      </div>
    </a>
  );
}
