import { useState } from 'react';
import type { DateQuick, Filters } from '../lib/types';

const QUICKS: { key: DateQuick; label: string }[] = [
  { key: 'today', label: 'Ma' },
  { key: 'tomorrow', label: 'Holnap' },
  { key: 'weekend', label: 'Hétvégén' },
  { key: 'week', label: 'Köv. 7 nap' },
];

interface Props {
  filters: Filters;
  onChange: (f: Filters) => void;
}

export default function DatePicks({ filters, onChange }: Props) {
  const [customOpen, setCustomOpen] = useState(
    Boolean(filters.customFrom || filters.customTo),
  );

  const pickQuick = (key: DateQuick) =>
    onChange({
      ...filters,
      quick: filters.quick === key ? null : key,
      customFrom: null,
      customTo: null,
    });

  const btnCls = (on: boolean) =>
    `rounded-[10px] border-[1.5px] px-3.5 py-3 text-sm font-bold transition-colors ${
      on
        ? 'border-primary bg-primary text-white'
        : 'border-line-strong bg-white text-steel hover:border-primary'
    }`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {QUICKS.map((q) => (
          <button
            key={q.key}
            onClick={() => pickQuick(q.key)}
            aria-pressed={filters.quick === q.key}
            className={btnCls(filters.quick === q.key)}
          >
            {q.label}
          </button>
        ))}
        <button
          onClick={() => {
            const next = !customOpen;
            setCustomOpen(next);
            if (!next) onChange({ ...filters, customFrom: null, customTo: null });
            else onChange({ ...filters, quick: null });
          }}
          aria-pressed={customOpen}
          className={btnCls(customOpen)}
        >
          Dátum…
        </button>
      </div>
      {customOpen && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={filters.customFrom ?? ''}
            onChange={(e) =>
              onChange({ ...filters, quick: null, customFrom: e.target.value || null })
            }
            aria-label="Dátum ettől"
            className="rounded-[10px] border-[1.5px] border-line-strong px-3 py-2.5 text-sm font-semibold text-ink outline-none focus:border-primary"
          />
          <span className="text-sm font-bold text-subtle">–</span>
          <input
            type="date"
            value={filters.customTo ?? ''}
            min={filters.customFrom ?? undefined}
            onChange={(e) =>
              onChange({ ...filters, quick: null, customTo: e.target.value || null })
            }
            aria-label="Dátum eddig"
            className="rounded-[10px] border-[1.5px] border-line-strong px-3 py-2.5 text-sm font-semibold text-ink outline-none focus:border-primary"
          />
        </div>
      )}
    </div>
  );
}
