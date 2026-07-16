# CityPulse — Projekt specifikáció

**Név:** CityPulse · **Szlogen:** „Ahol a város lüktet."
Magyarországi kulturális/szórakoztató programok aggregátora (MVP). 100% ingyenes,
serverless stack, automatizált scraping + AI-moderált felhasználói beküldés,
tér- és időbeli szűrés.

## 1. Stack
- Frontend: React (Vite) + Tailwind CSS — a `design/ui-template` sablon szerint.
- DB: Supabase (PostgreSQL), Haversine-alapú sugárszűrés SQL-ben.
- Scraping + moderáció: Python szkriptek GitHub Actions cronból; LLM extrakció.
- Hosting: Cloudflare Pages (vagy Vercel).

## 2. Adatmodell (`events`)
id (uuid PK), title (≤100), category (enum: konnyuzene, szinhaz, kiallitas,
fesztival, standup, csaladi, sport), city, venue, latitude/longitude (kötelező),
start_time, end_time (opc.), description (≤1000), source_url (kötelező),
image_url (opc.), status (pending/approved/rejected; user-beküldés default
pending; scraper approved), origin (scraper/user), moderation_reason (belső),
created_at. **A frontend kizárólag approved sorokat kérdezhet le** (RLS +
oszlopszintű grantok + `filter_events` RPC + `events_public` nézet).

## 3. Frontend követelmények
- Szűrők: város legördülő (+ „Egész Magyarország"), lépcsős távolságcsúszka
  (0 / +10 / +25 / +50 / +100 km; „Egész Magyarország"-nál rejtve/inaktív),
  dátum gyorsgombok (Ma, Holnap, Ezen a hétvégén, Következő 7 nap) + egyedi
  dátumválasztó, többes kategória-pillek.
- Eseménykártya: kötelező, jól látható „Tovább a jegyvásárlásra / Eredeti oldal"
  gomb → `source_url` új lapon (`target="_blank" rel="noopener noreferrer"`).
- „Esemény beküldése" űrlap: Cloudflare Turnstile + rejtett honeypot; szerveroldali
  sanitizálás után `pending` insert.

## 4. AI moderációs workflow
Óránkénti cron (GitHub Actions): max 50 `pending` sor lekérése → LLM értékelés
(szigorú magyar moderátor prompt, KIZÁRÓLAG JSON válasz:
`{"decision":"approved"|"rejected","reason":"..."}`) → státusz + moderation_reason
frissítés. Approved azonnal látható a frontenden.

## 5. Megvalósítási sorrend
1. Architektúra + DB init (séma, indexek, Haversine, RLS) ✅
2. Frontend MVP + szűrési logika
3. UGC beküldő űrlap + backend végpont
4. Scraper prototípus (cron)
5. AI moderátor szkript + `.github/workflows/ai-moderator.yml`

## 6. Kiegészítés: szubkultúra, Facebook, „okos scraper"
Cél: napi 100+ helyszín/szubkulturális forrás átnézése ingyenes keretekben.

### A. 3-szintű scraper-feldolgozás
1. **JSON-LD / iCal prioritás:** először `application/ld+json` (Schema.org/Event)
   blokk vagy `.ics` link — ha van, AI nélkül extrakál.
2. **Hash/diff:** normalizált szövegtörzs hash-e vs. `scrape_state.last_hash`
   az adatbázisban; egyezésnél az oldal kimarad.
3. **LLM hívás:** csak új, strukturálatlan tartalom megy a Google Gemini API-nak.

### B. Facebook + másodlagos források
- Közvetlen FB-scraping tilos (blokkolás) — külső API-ból (pl. Apify Free Tier
  JSON végpont) érkező strukturált FB-eseményeket kell tudni fogadni és
  integrálni az `events` táblába.
- Céllistába: alternatív jegyplatformok (Cooltix.hu, Tixa.hu).

### C. GitHub Actions Matrix
`.github/workflows/scraper.yml`: a céloldalak listáját (`targets.json`)
matrix stratégiával 4-5 párhuzamos szálon futtatja (gyorsaság + IP-tiltás
elkerülés).

### D. „1-kattintásos link-drop" beküldés
Az űrlap egyszerűsített módja: csak egy URL-t kell bemásolni; a serverless
backend letölti, LLM-mel extrakálja a részleteket, és `pending` státusszal menti
az AI moderátornak.

## Munkamódszer
A felhasználó kérése (2026-07-16): a lépéseken jóváhagyásra várás nélkül,
önállóan kell végighaladni; kérdezni csak akkor, ha muszáj.
