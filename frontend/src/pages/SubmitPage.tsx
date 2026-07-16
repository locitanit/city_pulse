import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Turnstile from '../components/Turnstile';
import {
  fetchCities,
  submitEvent,
  submitLink,
  type SubmitResult,
} from '../lib/api';
import { CATEGORIES, CATEGORY_LABELS, type Category, type City } from '../lib/types';

type Mode = 'link' | 'form';
type Status =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'done'; ok: boolean; message: string };

const INPUT_CLS =
  'w-full rounded-[10px] border-[1.5px] border-line-strong bg-white px-3.5 py-3 text-[15px] font-semibold text-ink outline-none focus:border-primary';
const LABEL_CLS = 'text-[11px] font-extrabold uppercase tracking-[0.08em] text-subtle';

const EMPTY_FORM = {
  title: '',
  category: '' as Category | '',
  city: '',
  venue: '',
  start: '',
  end: '',
  description: '',
  source_url: '',
  image_url: '',
};

export default function SubmitPage() {
  const [mode, setMode] = useState<Mode>('link');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [token, setToken] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [cities, setCities] = useState<City[]>([]);

  const [linkUrl, setLinkUrl] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    fetchCities()
      .then(setCities)
      .catch(() => setCities([]));
  }, []);

  const onToken = useCallback((t: string) => setToken(t), []);

  const finish = (res: SubmitResult) => {
    setStatus({ kind: 'done', ok: res.ok, message: res.message });
    if (res.ok) {
      setLinkUrl('');
      setForm(EMPTY_FORM);
    }
  };

  const sendLink = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) {
      setStatus({ kind: 'done', ok: false, message: 'Kérjük, várd meg a robot-ellenőrzést.' });
      return;
    }
    setStatus({ kind: 'sending' });
    try {
      finish(await submitLink({ url: linkUrl.trim(), turnstile_token: token, website: honeypot }));
    } catch (err) {
      setStatus({ kind: 'done', ok: false, message: (err as Error).message });
    }
  };

  const sendForm = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) {
      setStatus({ kind: 'done', ok: false, message: 'Kérjük, várd meg a robot-ellenőrzést.' });
      return;
    }
    if (!form.category) {
      setStatus({ kind: 'done', ok: false, message: 'Válassz kategóriát.' });
      return;
    }
    setStatus({ kind: 'sending' });
    try {
      finish(
        await submitEvent({
          title: form.title.trim(),
          category: form.category,
          city: form.city.trim(),
          venue: form.venue.trim(),
          start_time: new Date(form.start).toISOString(),
          end_time: form.end ? new Date(form.end).toISOString() : null,
          description: form.description.trim(),
          source_url: form.source_url.trim(),
          image_url: form.image_url.trim(),
          turnstile_token: token,
          website: honeypot,
        }),
      );
    } catch (err) {
      setStatus({ kind: 'done', ok: false, message: (err as Error).message });
    }
  };

  const set = (field: keyof typeof EMPTY_FORM) => (value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const tabCls = (on: boolean) =>
    `flex-1 rounded-[10px] border-[1.5px] px-4 py-3 text-sm font-extrabold transition-colors ${
      on
        ? 'border-primary bg-primary text-white'
        : 'border-line-strong bg-white text-steel hover:border-primary'
    }`;

  return (
    <div className="mx-auto max-w-[760px] px-5 py-10 lg:py-14">
      <h1 className="text-[26px] font-extrabold tracking-[-0.03em] lg:text-[34px]">
        Esemény beküldése
      </h1>
      <p className="mt-2 text-[15px] font-medium leading-relaxed text-muted">
        Tudsz egy jó programról, ami hiányzik az oldalról? Küldd be! A beküldéseket
        automatikus moderálás után tesszük közzé.
      </p>

      <div className="mt-7 flex gap-3">
        <button className={tabCls(mode === 'link')} onClick={() => setMode('link')}>
          ⚡ Gyors beküldés linkkel
        </button>
        <button className={tabCls(mode === 'form')} onClick={() => setMode('form')}>
          Részletes űrlap
        </button>
      </div>

      <div className="mt-5 rounded-card border border-line bg-white p-5 shadow-panel lg:p-7">
        {mode === 'link' ? (
          <form onSubmit={sendLink} className="flex flex-col gap-5">
            <p className="text-sm font-medium leading-relaxed text-body">
              Csak másold be az esemény linkjét (pl. Facebook-esemény, jegyoldal vagy a
              szervező oldala) — a többit elintézzük: a részleteket automatikusan kinyerjük,
              és moderálás után közzétesszük.
            </p>
            <label className="flex flex-col gap-1.5">
              <span className={LABEL_CLS}>Esemény linkje *</span>
              <input
                type="url"
                required
                placeholder="https://…"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                className={INPUT_CLS}
              />
            </label>
            <HoneypotField value={honeypot} onChange={setHoneypot} />
            <Turnstile onToken={onToken} />
            <SubmitButton sending={status.kind === 'sending'} label="Link beküldése" />
          </form>
        ) : (
          <form onSubmit={sendForm} className="flex flex-col gap-5">
            <label className="flex flex-col gap-1.5">
              <span className={LABEL_CLS}>Esemény neve * (max 100 karakter)</span>
              <input
                required
                maxLength={100}
                value={form.title}
                onChange={(e) => set('title')(e.target.value)}
                className={INPUT_CLS}
              />
            </label>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className={LABEL_CLS}>Kategória *</span>
                <select
                  required
                  value={form.category}
                  onChange={(e) => set('category')(e.target.value)}
                  className={INPUT_CLS}
                >
                  <option value="">Válassz…</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="relative flex flex-col gap-1.5">
                <span className={LABEL_CLS}>Település *</span>
                <select
                  required
                  value={form.city}
                  onChange={(e) => set('city')(e.target.value)}
                  className={`${INPUT_CLS} cursor-pointer appearance-none pr-10`}
                >
                  <option value="">Válassz…</option>
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
            </div>

            <label className="flex flex-col gap-1.5">
              <span className={LABEL_CLS}>Helyszín * (pl. Szegedi Szabadtéri Játékok)</span>
              <input
                required
                maxLength={200}
                value={form.venue}
                onChange={(e) => set('venue')(e.target.value)}
                className={INPUT_CLS}
              />
            </label>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className={LABEL_CLS}>Kezdés *</span>
                <input
                  type="datetime-local"
                  required
                  value={form.start}
                  onChange={(e) => set('start')(e.target.value)}
                  className={INPUT_CLS}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={LABEL_CLS}>Vége (nem kötelező)</span>
                <input
                  type="datetime-local"
                  min={form.start || undefined}
                  value={form.end}
                  onChange={(e) => set('end')(e.target.value)}
                  className={INPUT_CLS}
                />
              </label>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className={LABEL_CLS}>
                Rövid leírás ({form.description.length}/1000)
              </span>
              <textarea
                rows={4}
                maxLength={1000}
                value={form.description}
                onChange={(e) => set('description')(e.target.value)}
                className={INPUT_CLS}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className={LABEL_CLS}>
                Jegyvásárlás / hivatalos oldal linkje *
              </span>
              <input
                type="url"
                required
                placeholder="https://…"
                value={form.source_url}
                onChange={(e) => set('source_url')(e.target.value)}
                className={INPUT_CLS}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className={LABEL_CLS}>Borítókép URL (nem kötelező, csak https)</span>
              <input
                type="url"
                placeholder="https://…"
                value={form.image_url}
                onChange={(e) => set('image_url')(e.target.value)}
                className={INPUT_CLS}
              />
            </label>

            <HoneypotField value={honeypot} onChange={setHoneypot} />
            <Turnstile onToken={onToken} />
            <SubmitButton sending={status.kind === 'sending'} label="Esemény beküldése" />
          </form>
        )}

        {status.kind === 'done' && (
          <div
            role="status"
            className={`mt-5 rounded-[10px] border p-4 text-sm font-bold ${
              status.ok
                ? 'border-primary-border bg-primary-soft text-primary-darker'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}
          >
            {status.message}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Láthatatlan honeypot mező: ember nem látja és nem tölti ki; ha a szerver
 * mégis értéket kap benne, a kérést spamként eldobja.
 */
function HoneypotField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] top-auto h-0 w-0 overflow-hidden">
      <label>
        Weboldal (hagyd üresen)
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    </div>
  );
}

function SubmitButton({ sending, label }: { sending: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={sending}
      className="rounded-[10px] bg-accent px-9 py-[13px] text-base font-extrabold text-white shadow-cta hover:brightness-95 disabled:opacity-60"
    >
      {sending ? 'Küldés…' : label}
    </button>
  );
}
