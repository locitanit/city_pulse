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
  // A szűrőpanel piszkozata — a lista csak a Keresés gombra frissül
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  // Az éppen alkalmazott szűrők (ez hajtja a lekérdezést)
  const [applied, setApplied] = useState<Filters>(DEFAULT_FILTERS);
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
        const { fromISO, toISO } = resolveDateRange(applied);
        const res = await fetchEvents({
          city: applied.city,
          radiusKm: applied.radiusKm,
          categories: applied.categories,
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
    [applied],
  );

  // Betöltés induláskor és a Keresés gomb megnyomásakor (applied változására)
  useEffect(() => {
    void load(0, false);
  }, [load]);

  const scopeLabel = applied.city
    ? applied.radiusKm > 0
      ? `${applied.city} és környéke`
      : applied.city
    : 'egész Magyarország';

  return (
    <>
      <Hero>
        <FilterBar
          cities={cities}
          filters={filters}
          onChange={setFilters}
          // friss objektum, hogy változatlan piszkozatnál is újrafusson a lekérdezés
          onSearch={() => setApplied({ ...filters })}
        />
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
