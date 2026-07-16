import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: { sitekey: string; callback: (token: string) => void; 'expired-callback'?: () => void },
      ) => string;
    };
  }
}

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

/** Site key hiányában (helyi fejlesztés) jelző tokennel engedjük át a beküldést. */
export const TURNSTILE_ENABLED = Boolean(SITE_KEY);
export const DEV_TOKEN = 'dev-no-turnstile';

export default function Turnstile({ onToken }: { onToken: (token: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const rendered = useRef(false);

  useEffect(() => {
    if (!SITE_KEY) {
      onToken(DEV_TOKEN);
      return;
    }
    const render = () => {
      if (ref.current && window.turnstile && !rendered.current) {
        rendered.current = true;
        window.turnstile.render(ref.current, {
          sitekey: SITE_KEY,
          callback: onToken,
          'expired-callback': () => onToken(''),
        });
      }
    };
    if (window.turnstile) {
      render();
    } else {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      script.async = true;
      script.onload = render;
      document.head.appendChild(script);
    }
  }, [onToken]);

  if (!SITE_KEY) {
    return (
      <p className="text-xs font-semibold text-subtle">
        Turnstile nincs konfigurálva — fejlesztői mód, a robot-ellenőrzés kihagyva.
      </p>
    );
  }
  return <div ref={ref} />;
}
