import type { City, Filters } from '../lib/types';
import CategoryPills from './CategoryPills';
import DatePicks from './DatePicks';
import RadiusSlider from './RadiusSlider';

interface Props {
  cities: City[];
  filters: Filters;
  onChange: (f: Filters) => void;
  onSearch: () => void;
}

const LABEL_CLS =
  'text-[11px] font-extrabold uppercase tracking-[0.08em] text-subtle';

export default function FilterBar({ cities, filters, onChange, onSearch }: Props) {
  return (
    <div className="mt-7 flex flex-col gap-4 rounded-card border border-line bg-white p-4 shadow-panel lg:mt-8 lg:gap-[18px] lg:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-3.5">
        {/* Város */}
        <label className="relative flex flex-col gap-1.5 lg:flex-[1.1]">
          <span className={LABEL_CLS}>Város</span>
          <select
            value={filters.city ?? ''}
            onChange={(e) => onChange({ ...filters, city: e.target.value || null })}
            className="w-full cursor-pointer appearance-none rounded-[10px] border-[1.5px] border-line-strong bg-white px-3.5 py-3 pr-10 text-[15px] font-bold text-ink outline-none focus:border-primary"
          >
            <option value="">Egész Magyarország</option>
            {cities.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute bottom-[15px] right-3.5 text-xs text-subtle">
            ▾
          </span>
        </label>

        {/* Távolság */}
        <div className="flex flex-col gap-1.5 lg:flex-[0.9]">
          <span className={LABEL_CLS}>
            Távolság:{' '}
            <span className="text-primary-dark">
              {filters.city
                ? filters.radiusKm === 0
                  ? 'csak a város'
                  : `+${filters.radiusKm} km`
                : '—'}
            </span>
          </span>
          <RadiusSlider
            disabled={!filters.city}
            valueKm={filters.radiusKm}
            onChange={(km) => onChange({ ...filters, radiusKm: km })}
          />
        </div>

        {/* Dátum */}
        <div className="flex flex-col gap-1.5 lg:flex-[2]">
          <span className={LABEL_CLS}>Dátum</span>
          <DatePicks filters={filters} onChange={onChange} />
        </div>

        {/* Keresés */}
        <div className="flex items-end">
          <button
            onClick={onSearch}
            className="w-full rounded-[10px] bg-accent px-9 py-[13px] text-base font-extrabold text-white shadow-cta hover:brightness-95 lg:w-auto"
          >
            Keresés
          </button>
        </div>
      </div>

      {/* Kategória pillek */}
      <div className="flex flex-wrap items-center gap-2.5 border-t border-line-soft pt-4">
        <span className={`${LABEL_CLS} mr-1`}>Típus</span>
        <CategoryPills
          selected={filters.categories}
          onChange={(categories) => onChange({ ...filters, categories })}
        />
      </div>
    </div>
  );
}
