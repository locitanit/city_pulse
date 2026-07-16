export default function Footer() {
  return (
    <footer className="flex flex-col items-center justify-between gap-4 border-t border-line-soft bg-foot px-5 py-7 sm:flex-row lg:px-12">
      <div className="flex items-center gap-2.5">
        <div className="grid h-[26px] w-[26px] place-items-center rounded-lg bg-primary text-[13px] font-extrabold text-white">
          C
        </div>
        <span className="text-sm font-bold">CityPulse</span>
        <span className="text-[13px] font-medium text-subtle">
          · Ahol a város lüktet. © 2026
        </span>
      </div>
      <div className="flex gap-6">
        <a href="#" className="text-[13px] font-semibold text-muted hover:text-ink">
          Impresszum
        </a>
        <a href="#" className="text-[13px] font-semibold text-muted hover:text-ink">
          Adatvédelem
        </a>
        <a href="#" className="text-[13px] font-semibold text-muted hover:text-ink">
          Kapcsolat
        </a>
      </div>
    </footer>
  );
}
