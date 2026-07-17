import { useCallback, useEffect, useState } from 'react';
import EventGrid from '../components/EventGrid';
import FilterBar from '../components/FilterBar';
import Hero from '../components/Hero';
import { fetchCities, fetchEvents } from '../lib/api';
import { resolveDateRange } from '../lib/date';
import { DEFAULT_FILTERS, type City, type EventItem, type Filters } from '../lib/types';

const PAGE_SIZE = 24;

export default function HomePage() {
  const [cities, setCities] = useState<City[]>([]);
  // A szűrők minden változása automatikusan (debounce-szal) újratölti a listát
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCities()
      .then(setCities)
      .catch(() => setCities([]));
  }, []);

  const load = useCallback(
    async (offset: number, append: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const { fromISO, toISO } = resolveDateRange(filters);
        const res = await fetchEvents({
          city: filters.city,
          radiusKm: filters.radiusKm,
          categories: filters.categories,
          fromISO,
          toISO,
          limit: PAGE_SIZE,
          offset,
        });
        setEvents((prev) => (append ? [...prev, ...res.events] : res.events));
        setTotal(res.total);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [filters],
  );

  // Automatikus frissítés minden szűrőváltozásra — rövid debounce, hogy a
  // csúszkahúzás / gyors kattintgatás ne indítson kérésözönt
  useEffect(() => {
    const timer = setTimeout(() => void load(0, false), 250);
    return () => clearTimeout(timer);
  }, [load]);

  const scopeLabel = filters.city
    ? filters.radiusKm > 0
      ? `${filters.city} és környéke`
      : filters.city
    : 'Szeged és környéke';

  return (
    <>
      <Hero>
        <FilterBar cities={cities} filters={filters} onChange={setFilters} />
      </Hero>
      <EventGrid
        events={events}
        total={total}
        loading={loading}
        error={error}
        scopeLabel={scopeLabel}
        onLoadMore={() => void load(events.length, true)}
      />
    </>
  );
}
