export const MAX_RADIUS_KM = 100;

interface Props {
  valueKm: number;
  disabled: boolean;
  onChange: (km: number) => void;
}

const clampKm = (value: number) =>
  Math.max(0, Math.min(MAX_RADIUS_KM, Math.round(value)));

/**
 * Folyamatos távolságcsúszka (0–100 km, 1 km-es lépés) km-beviteli mezővel.
 * A 0 jelentése: csak a kiválasztott város.
 */
export default function RadiusSlider({ valueKm, disabled, onChange }: Props) {
  return (
    <div
      className={`flex items-center gap-2.5 rounded-[10px] border-[1.5px] border-line-strong px-3.5 py-[7px] ${
        disabled ? 'pointer-events-none opacity-40' : ''
      }`}
      title={disabled ? 'Válassz várost a távolság szűréséhez' : undefined}
    >
      <input
        type="range"
        min={0}
        max={MAX_RADIUS_KM}
        step={1}
        value={valueKm}
        disabled={disabled}
        onChange={(e) => onChange(clampKm(Number(e.target.value)))}
        className="m-0 h-[19px] w-full cursor-pointer"
        style={{ accentColor: '#0D9DB5' }}
        aria-label="Távolság sugár"
      />
      <input
        type="number"
        min={0}
        max={MAX_RADIUS_KM}
        value={valueKm}
        disabled={disabled}
        onChange={(e) => {
          const parsed = Number(e.target.value);
          onChange(Number.isFinite(parsed) ? clampKm(parsed) : 0);
        }}
        className="w-[52px] shrink-0 rounded-md border border-line-strong bg-white px-1.5 py-1 text-right text-[14px] font-bold text-ink outline-none focus:border-primary"
        aria-label="Távolság km-ben"
      />
      <span className="shrink-0 text-xs font-bold text-subtle">km</span>
    </div>
  );
}
