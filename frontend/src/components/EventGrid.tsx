import type { EventItem } from '../lib/types';
import EventCard from './EventCard';

interface Props {
  events: EventItem[];
  total: number;
  loading: boolean;
  error: string | null;
  scopeLabel: string;
  onLoadMore: () => void;
}

export default function EventGrid({
  events,
  total,
  loading,
  error,
  scopeLabel,
  onLoadMore,
}: Props) {
  return (
    <main className="px-5 pb-14 pt-2 lg:px-12">
      <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <div className="flex flex-wrap items-baseline gap-3.5">
          <h2 className="text-xl font-extrabold tracking-[-0.02em] lg:text-2xl">
            Aktuális események
          </h2>
          <span className="text-sm font-semibold text-subtle">
            {total} találat · {scopeLabel}
          </span>
        </div>
      </div>

      {error && (
        <div className="rounded-card border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700">
          Hiba történt a betöltés közben: {error}
        </div>
      )}

      {!error && events.length === 0 && !loading && (
        <div className="rounded-card border border-line bg-foot p-10 text-center">
          <p className="text-lg font-extrabold">Nincs találat</p>
          <p className="mt-1 text-sm font-medium text-muted">
            Próbáld tágítani a szűrőket — nagyobb távolság, több kategória vagy hosszabb
            időszak.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {events.map((e) => (
          <EventCard key={e.id} event={e} />
        ))}
      </div>

      {loading && (
        <p className="mt-8 text-center text-sm font-bold text-subtle">Betöltés…</p>
      )}

      {!loading && events.length < total && (
        <div className="mt-9 flex justify-center">
          <button
            onClick={onLoadMore}
            className="rounded-[10px] border-[1.5px] border-primary-border bg-white px-8 py-[13px] text-[15px] font-extrabold text-primary-dark hover:bg-primary-soft"
          >
            További események betöltése
          </button>
        </div>
      )}
    </main>
  );
}
