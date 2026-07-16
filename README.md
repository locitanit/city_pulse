# CityPulse — „Ahol a város lüktet."

Magyarországi kulturális és szórakoztató programok aggregátora (MVP).
100% ingyenes, serverless stack: automatizált adatgyűjtés (scraping) +
AI-moderált felhasználói beküldés, tér- és időbeli szűréssel.

## Stack

| Réteg        | Technológia                                              |
|--------------|----------------------------------------------------------|
| Frontend     | React (Vite) + Tailwind CSS — a `design/ui-template` alapján |
| Adatbázis    | Supabase (PostgreSQL) — Haversine-alapú sugárszűréssel   |
| Beküldő API  | Supabase Edge Functions (Turnstile + honeypot + sanitizálás) |
| Scraper      | Python + Gemini LLM extrakció — GitHub Actions cron      |
| AI moderátor | Python + Claude/Gemini API — GitHub Actions cron         |
| Hosting      | Cloudflare Pages                                         |

## Könyvtárszerkezet

```
esemeny_naptar/
├─ design/ui-template/       # Kicsomagolt UI design sablon (referencia, nem kerül buildbe)
├─ supabase/
│  ├─ migrations/            # SQL: séma, RLS, távolságszámító függvény, városlista, RPC-k
│  ├─ functions/             # Edge Functions: submit-event, submit-link
│  └─ seed.sql               # Demó események — CSAK lokális fejlesztéshez (db reset)
├─ frontend/                 # React alkalmazás
├─ scripts/                  # Python scraper + Apify-ingest + AI moderátor
├─ docs/SPEC.md              # Teljes projektspecifikáció
└─ .github/workflows/        # Ütemezett cron jobok (scraper, moderátor)
```

---

## 🚀 Kipróbálás lokálban

### 1. Gyors út — demó mód (nem kell hozzá semmilyen fiók)

Csak Node.js (18+) kell. Supabase-beállítás nélkül az app **demó módban** indul:
beépített mintaadatokkal fut, minden szűrő (város, távolságcsúszka, dátum,
kategória) kipróbálható, a beküldő űrlap pedig szimulált választ ad.

```bash
cd frontend
npm install
npm run dev
```

Nyisd meg: **http://localhost:5173** — a fejléc tetején szalag jelzi, hogy demó
módban vagy. A beküldő oldal a http://localhost:5173/bekuldes címen érhető el.

### 2. Lokális futtatás ÉLES Supabase-adatbázissal

Ha már létrehoztad a Supabase-projektet (lásd élesítés, 2–3. lépés), a lokális
frontend ráköthető:

```bash
cd frontend
copy .env.example .env    # Linux/macOS: cp .env.example .env
```

Töltsd ki a `.env`-ben:

```
VITE_SUPABASE_URL=https://<projekt-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon public kulcs>
```

Majd indítsd újra a dev szervert (`npm run dev`). Innentől a valódi adatbázisból
jönnek az események. (A `VITE_TURNSTILE_SITE_KEY` üresen hagyható — ilyenkor a
robot-ellenőrzés lokálban kimarad.)

### 3. (Haladó) Teljes lokális stack Supabase CLI-vel

Futó Docker + [Supabase CLI](https://supabase.com/docs/guides/cli) szükséges:

```bash
supabase init            # egyszer, létrehozza a supabase/config.toml-t
supabase start           # lokális Postgres + API konténerek
supabase db reset        # lefuttatja a migrációkat ÉS a seed.sql demó adatokat
```

A `supabase start` kiírja a lokális URL-t és anon kulcsot — ezeket írd a
`frontend/.env`-be. Az Edge Functionök lokálisan a
`supabase functions serve` paranccsal futtathatók.

### 4. (Opcionális) Python szkriptek kézi futtatása

```bash
pip install -r scripts/requirements.txt
# PowerShell:
$env:SUPABASE_URL = "https://<projekt-ref>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "<service_role kulcs>"
$env:GEMINI_API_KEY = "<gemini kulcs>"
python scripts/scraper.py
python scripts/moderator.py
```

---

## 🌍 Élesítés lépésről lépésre

A teljes stack ingyenes szinteken fut: Supabase Free + Cloudflare Pages Free +
GitHub Actions (publikus repónál ingyenes) + Google AI Studio (Gemini free tier).

### 0. lépés — Git repó és GitHub

A GitHub Actions cronokhoz és a Cloudflare Pages buildhez a kódnak GitHubon
kell lennie:

```bash
git init
git add .
git commit -m "CityPulse MVP"
# hozz létre egy repót a github.com-on, majd:
git remote add origin https://github.com/<felhasznalo>/<repo>.git
git push -u origin main
```

### 1. lépés — Supabase projekt létrehozása

1. Regisztrálj / lépj be: **https://supabase.com** → *New project*.
2. Válassz régiót (ajánlott: `eu-central-1`, Frankfurt), adj meg egy erős
   adatbázis-jelszót (mentsd el).
3. Várd meg, míg a projekt elkészül (~2 perc).

### 2. lépés — Adatbázis-séma felvitele

A Dashboard **SQL Editor**-ában futtasd le **sorban, egyenként** a négy
migrációt (másold be a fájl tartalmát, Run):

1. `supabase/migrations/0001_init.sql` — séma, indexek, RLS, `filter_events`
2. `supabase/migrations/0002_cities.sql` — városlista törzsadat
3. `supabase/migrations/0003_scrape_state.sql` — scraper hash/diff állapot
4. `supabase/migrations/0004_scraper_rpc.sql` — kötegelt scraper-beszúrás

⚠️ A `supabase/seed.sql`-t **ne** futtasd élesben — az csak lokális demó adat.

Ellenőrzés: a *Table Editor*-ban látszik az `events`, `cities`, `scrape_state`
tábla, a `cities`-ben 28 sor van.

### 3. lépés — Kulcsok kimásolása

Dashboard → **Settings → API**:

| Kulcs | Hol lesz rá szükség |
|---|---|
| **Project URL** (`https://<ref>.supabase.co`) | frontend `.env`, GitHub Secrets, Pages env |
| **anon public** kulcs | frontend `.env`, Pages env |
| **service_role** kulcs 🔒 | CSAK GitHub Secrets — soha nem kerülhet a frontendbe! |

### 4. lépés — Cloudflare Turnstile (spam-védelem)

> 💡 Ha még nem tudod a domain nevét: előbb hozd létre a Cloudflare-projektet
> (7. lépés) — az adja a domaint (Workers-flow: `city-pulse.<fiók>.workers.dev`,
> Pages-flow: `<projekt>.pages.dev`) —, és utána gyere vissza ide. A widget
> domainlistája később bármikor bővíthető (pl. saját domainnel), nem kell
> új kulcs. Turnstile nélkül is minden működik (a robot-ellenőrzés kimarad,
> a honeypot-védelem él), fejlesztéshez pedig használhatók a Cloudflare
> tesztkulcsai: site key `1x00000000000000000000AA`,
> secret `1x0000000000000000000000000000000AA`.

1. **https://dash.cloudflare.com** → *Turnstile* → *Add site*.
2. Domainek: a saját Pages-aldomained (pl. `citypulse.pages.dev` — ez a
   preview-deployok aldomainjeit is lefedi) + lokális teszthez a `localhost`.
3. Jegyezd fel: **Site Key** (frontendbe) és **Secret Key** (Edge Functionbe).

### 5. lépés — Gemini API kulcs (ingyenes)

1. **https://aistudio.google.com** → *Get API key* → *Create API key*.
2. Ez kell a scrapernek (LLM-extrakció) és a link-drop beküldésnek; a moderátor
   is tudja használni, ha nem adsz meg Anthropic-kulcsot.

### 6. lépés — Edge Functionök telepítése

Telepítsd a [Supabase CLI](https://supabase.com/docs/guides/cli)-t, majd a repo
gyökeréből:

```bash
supabase login
supabase link --project-ref <projekt-ref>      # a Project URL-ben szereplő azonosító

# titkok beállítása a functionöknek:
supabase secrets set TURNSTILE_SECRET_KEY=<turnstile secret>
supabase secrets set GEMINI_API_KEY=<gemini kulcs>

# telepítés:
supabase functions deploy submit-event
supabase functions deploy submit-link
```

(A `SUPABASE_URL` és `SUPABASE_SERVICE_ROLE_KEY` env változókat a platform
automatikusan biztosítja a functionöknek.)

Gyors teszt: a Dashboard → *Edge Functions* alatt mindkét function *Active*.

### 7. lépés — Frontend élesítése (Cloudflare Workers)

A Cloudflare új felülete a git-alapú projekteket Workerként deployolja — ehhez
kell a repóban lévő `frontend/wrangler.jsonc` (már benne van; a
`single-page-application` beállítása kezeli a React Router útvonalakat, pl.
a `/bekuldes`-t).

1. **https://dash.cloudflare.com** → *Workers & Pages* → *Create* →
   *Import a repository* → válaszd ki a repót.
2. A űrlap kitöltése:
   - **Project name:** `city-pulse` (csak kisbetű, szám, kötőjel — aláhúzás nem
     jó; egyezzen a `wrangler.jsonc` `name` mezőjével!)
   - **Build command:** `npm run build`
   - **Deploy command:** `npx wrangler deploy`
   - **Builds for non-production branches:** maradhat bepipálva
     (deploy parancsa: `npx wrangler versions upload`)
   - **Advanced → Path:** `/frontend`
   - **API token:** *Create new token* (automatikus, nem kell hozzányúlni)
3. **Variables** — sima (NEM Encrypt) változóként, mert a Vite buildhez
   kellenek, és amúgy is a kliensbundle-be kerülnek:
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = anon public kulcs
   - `VITE_TURNSTILE_SITE_KEY` = Turnstile site key (kihagyható, később pótolható)
4. *Deploy* → az oldal a `https://city-pulse.<fiók-név>.workers.dev` címen él
   (a pontos URL a projekt áttekintőjében látszik) — a Turnstile-hoz ezt a
   domaint add meg. Env változó később: *Settings → Variables and Secrets*,
   utána *Retry deployment* / új push.

Alternatíva: Vercelen — root: `frontend`, framework preset: Vite, ugyanazokkal
az env változókkal; ott `<projekt>.vercel.app` lesz a domain.

### 8. lépés — GitHub Actions cronok élesítése

1. A GitHub repóban: **Settings → Secrets and variables → Actions → New
   repository secret** — vedd fel:

   | Secret | Érték | Kötelező? |
   |---|---|---|
   | `SUPABASE_URL` | Project URL | ✅ |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role kulcs | ✅ |
   | `GEMINI_API_KEY` | Gemini kulcs | ✅ (scraper + moderátor gemini mód) |
   | `ANTHROPIC_API_KEY` | Claude API kulcs | opcionális — ha megadod, a moderátor Claude-ot használ |
   | `APIFY_DATASET_URL` | Apify dataset items URL tokennel | opcionális — Facebook-események |

2. Az **Actions** fülön engedélyezd a workflow-kat, majd próbafuttatás:
   *Scraper* → *Run workflow*, utána *AI Moderator* → *Run workflow*.
3. Ellenőrzés: a Supabase *Table Editor*-ban megjelennek a scrapelt `approved`
   események; a weboldalon beküldött teszt-esemény `pending`-ből a következő
   moderátor-futás után `approved`/`rejected` lesz.

Innentől minden automatikus: a scraper naponta 4× fut (5 párhuzamos szálon),
a moderátor óránként.

### 9. lépés — (Opcionális) Facebook-események Apify-jal

1. **https://apify.com** (Free Tier) → keress egy *Facebook Events Scraper*
   actort, állítsd be a figyelt oldalakat/városokat, ütemezd.
2. A futás eredményének *Dataset* → *Export* → API URL (JSON formátum, tokennel):
   `https://api.apify.com/v2/datasets/<id>/items?format=json&token=<token>`
3. Ezt az URL-t tedd be `APIFY_DATASET_URL` néven a GitHub Secrets közé — a
   scraper workflow külön jobja innentől automatikusan integrálja a
   FB-eseményeket. (Ha az actor mezőnevei eltérnek, a
   `scripts/apify_ingest.py` `_pick()` hívásaiban bővítsd a kulcslistát.)

### Élesítési ellenőrzőlista

- [ ] 4 migráció lefuttatva (seed **nélkül**)
- [ ] Edge Functionök deployolva + `TURNSTILE_SECRET_KEY`, `GEMINI_API_KEY` secret beállítva
- [ ] Pages build zöld, env változók beállítva, az oldal betölt
- [ ] Beküldő űrlapon a Turnstile widget megjelenik
- [ ] GitHub Secrets felvéve, Scraper + AI Moderator próbafuttatás zöld
- [ ] A frontenden megjelennek a scrapelt események

---

## Kliens-oldali lekérdezési szabályok

- Listázás/szűrés: `supabase.rpc('filter_events', {...})` — város/sugár/kategória/dátum.
- Közvetlen olvasás (pl. részletoldal): `supabase.from('events_public').select('*')`.
- Az `events` **táblára** a `select('*')` szándékosan hibát dob anon kulccsal
  (a belső `moderation_reason` oszlop nincs grantolva) — ez védelem, ne kerüld meg.

## További dokumentáció

- Teljes specifikáció: [docs/SPEC.md](docs/SPEC.md)
- Háttérszkriptek és env változók: [scripts/README.md](scripts/README.md)
