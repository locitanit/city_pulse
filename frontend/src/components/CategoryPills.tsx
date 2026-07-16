import { CATEGORIES, CATEGORY_PILL_LABELS, type Category } from '../lib/types';

interface Props {
  selected: Category[];
  onChange: (categories: Category[]) => void;
}

export default function CategoryPills({ selected, onChange }: Props) {
  const toggle = (c: Category) =>
    onChange(selected.includes(c) ? selected.filter((x) => x !== c) : [...selected, c]);

  return (
    <>
      {CATEGORIES.map((c) => {
        const on = selected.includes(c);
        return (
          <button
            key={c}
            onClick={() => toggle(c)}
            aria-pressed={on}
            className={`rounded-full border-[1.5px] px-4 py-2 text-[13px] font-bold transition-colors ${
              on
                ? 'border-primary bg-primary text-white'
                : 'border-line-strong bg-white text-steel hover:border-primary'
            }`}
          >
            {CATEGORY_PILL_LABELS[c]}
          </button>
        );
      })}
    </>
  );
}
