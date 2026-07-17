import type { ReactNode } from 'react';

export default function Hero({ children }: { children?: ReactNode }) {
  return (
    <div className="bg-gradient-to-b from-[#E7F5F8] to-white px-5 pb-8 pt-8 lg:px-12 lg:pb-10 lg:pt-14">
      <div className="max-w-[820px]">
        <h1 className="mb-2.5 text-[27px] font-extrabold leading-[1.12] tracking-[-0.03em] lg:text-[44px]">
          Ahol a város <span className="text-primary">lüktet</span>.
        </h1>
        <p className="text-sm font-medium leading-relaxed text-muted lg:text-[17px]">
          Koncertek, kiállítások, színház és fesztiválok Szegedről és környékéről —
          naprakészen, egy helyen.
        </p>
      </div>
      {children}
    </div>
  );
}
