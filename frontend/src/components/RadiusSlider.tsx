import { RADIUS_STEPS } from '../lib/types';

interface Props {
  valueKm: number;
  disabled: boolean;
  onChange: (km: number) => void;
}

/**
 * Lépcsős távolságcsúszka a spec szerinti fokozatokkal (0 / 10 / 25 / 50 / 100 km).
 * A natív range 0..4 indexen fut, az érték a RADIUS_STEPS-ből jön.
 */
export default function RadiusSlider({ valueKm, disabled, onChange }: Props) {
  const idx = Math.max(0, RADIUS_STEPS.indexOf(valueKm as (typeof RADIUS_STEPS)[number]));
  return (
    <div
      className={`flex items-center rounded-[10px] border-[1.5px] border-line-strong px-3.5 py-3 ${
        disabled ? 'pointer-events-none opacity-40' : ''
      }`}
      title={disabled ? 'Válassz várost a távolság szűréséhez' : undefined}
    >
      <input
        type="range"
        min={0}
        max={RADIUS_STEPS.length - 1}
        step={1}
        value={idx}
        disabled={disabled}
        onChange={(e) => onChange(RADIUS_STEPS[Number(e.target.value)])}
        className="m-0 h-[19px] w-full cursor-pointer"
        style={{ accentColor: '#0D9DB5' }}
        aria-label="Távolság sugár"
      />
    </div>
  );
}
