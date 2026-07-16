import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';

export default function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="border-b border-line-soft bg-white">
      <div className="flex items-center justify-between px-5 py-4 lg:px-12">
        <Link to="/" className="flex items-center gap-3" onClick={() => setOpen(false)}>
          <div className="grid h-9 w-9 place-items-center rounded-[10px] bg-primary text-lg font-extrabold text-white">
            C
          </div>
          <div>
            <div className="text-xl font-extrabold tracking-tight">
              City<span className="text-primary">Pulse</span>
            </div>
            <div className="hidden text-[11px] font-semibold text-subtle sm:block">
              Ahol a város lüktet.
            </div>
          </div>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          <NavLink
            to="/"
            className={({ isActive }) =>
              `text-[15px] font-bold hover:text-ink ${isActive ? 'text-ink' : 'text-muted'}`
            }
          >
            Események
          </NavLink>
          <Link
            to="/bekuldes"
            className="rounded-[10px] border-[1.5px] border-primary-border px-[18px] py-[9px] text-sm font-bold text-primary-dark hover:bg-primary-soft"
          >
            Esemény beküldése
          </Link>
        </nav>

        <button
          aria-label="Menü"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="flex h-11 w-11 flex-col items-center justify-center gap-[5px] md:hidden"
        >
          <span className="block h-[2.5px] w-[22px] rounded bg-ink" />
          <span className="block h-[2.5px] w-[22px] rounded bg-ink" />
          <span className="ml-2 block h-[2.5px] w-[14px] self-center rounded bg-ink" />
        </button>
      </div>

      {open && (
        <nav className="flex flex-col gap-1 border-t border-line-soft px-5 py-3 md:hidden">
          <NavLink
            to="/"
            onClick={() => setOpen(false)}
            className="rounded-lg px-3 py-2.5 text-[15px] font-bold text-ink hover:bg-primary-soft"
          >
            Események
          </NavLink>
          <Link
            to="/bekuldes"
            onClick={() => setOpen(false)}
            className="rounded-lg px-3 py-2.5 text-[15px] font-bold text-primary-dark hover:bg-primary-soft"
          >
            Esemény beküldése
          </Link>
        </nav>
      )}
    </header>
  );
}
