# CityPulse — háttérszkriptek

| Szkript | Feladat | Ütemezés |
|---|---|---|
| `scraper.py` | 3-szintű „okos" scraper: JSON-LD/iCal → hash/diff → Gemini LLM | `.github/workflows/scraper.yml` (matrix, 5 párhuzamos shard) |
| `apify_ingest.py` | Facebook-események átvétele külső API-ból (Apify dataset) | a scraper workflow külön jobja |
| `moderator.py` | Pending beküldések AI-minősítése (max 50/futás) | `.github/workflows/ai-moderator.yml` (óránként) |

## Környezeti változók (GitHub Secrets)

| Változó | Kell hozzá | Megjegyzés |
|---|---|---|
| `SUPABASE_URL` | mind | a projekt URL-je |
| `SUPABASE_SERVICE_ROLE_KEY` | mind | titok! sosem kerülhet kliensbe |
| `GEMINI_API_KEY` | scraper (LLM-szint), moderátor (gemini mód) | Google AI Studio, ingyenes szint |
| `GEMINI_MODEL` | opcionális | alapértelmezés: `gemini-2.5-flash` |
| `ANTHROPIC_API_KEY` | moderátor (anthropic mód) | ha be van állítva, a moderátor Claude-ot használ |
| `ANTHROPIC_MODEL` | opcionális | alapértelmezés: `claude-opus-4-8` |
| `MODERATOR_PROVIDER` | opcionális | `anthropic` \| `gemini` kényszerítése |
| `APIFY_DATASET_URL` | apify_ingest | dataset items végpont tokennel; ha üres, a job kihagyja |
| `SHARD_INDEX` / `SHARD_TOTAL` | scraper | a matrix tölti ki |
| `TARGETS_FILE` | opcionális | alapértelmezés: `scripts/targets.json` |

## Helyi futtatás

```bash
pip install -r scripts/requirements.txt
set SUPABASE_URL=... && set SUPABASE_SERVICE_ROLE_KEY=...   # PowerShellben: $env:SUPABASE_URL=...
python scripts/scraper.py
python scripts/moderator.py
```

## Céllista bővítése

A `scripts/targets.json` sorrendje határozza meg a shard-kiosztást
(`index % SHARD_TOTAL`). Új helyszín/jegyoldal felvételéhez csak egy
`{"name", "url", "enabled": true}` bejegyzés kell — a hash/diff réteg
miatt a változatlan oldalak nem fogyasztanak LLM-kvótát, így a lista
nyugodtan nőhet 100+ céloldalig.
