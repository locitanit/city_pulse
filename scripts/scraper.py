"""CityPulse — „okos" scraper (3-szintű feldolgozás).

1. JSON-LD / iCal prioritás: ha az oldal ad strukturált adatot
   (Schema.org/Event blokk vagy .ics link), abból extrakálunk — AI nélkül.
2. Hash / diff: strukturált adat híján a normalizált szövegtörzs hash-ét
   összevetjük a scrape_state táblában tárolt utolsóval; egyezésnél az
   oldal kimarad (nincs LLM-hívás).
3. LLM: csak az új, strukturálatlan tartalom megy a Gemini API-nak.

Futás:  python scripts/scraper.py
Env:    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (kötelező)
        GEMINI_API_KEY                            (a 3. szinthez)
        SHARD_INDEX, SHARD_TOTAL                  (matrix párhuzamosítás, default 0/1)
        TARGETS_FILE                              (default: scripts/targets.json)
"""

from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

import requests
from icalendar import Calendar

import common
from common import BUDAPEST, CATEGORIES

FETCH_TIMEOUT = 25
MAX_EVENTS_PER_TARGET = 200

# Schema.org @type → CityPulse kategóriák
JSONLD_TYPE_MAP = {
    "MusicEvent": ["konnyuzene"],
    "TheaterEvent": ["szinhaz"],
    "DanceEvent": ["szinhaz"],
    "ExhibitionEvent": ["kiallitas"],
    "VisualArtsEvent": ["kiallitas"],
    "Festival": ["fesztival"],
    "ComedyEvent": ["standup"],
    "ChildrensEvent": ["csaladi"],
    "SportsEvent": ["sport"],
}


def fetch(url: str) -> str:
    r = requests.get(
        url,
        headers={"User-Agent": common.USER_AGENT, "Accept-Language": "hu"},
        timeout=FETCH_TIMEOUT,
    )
    r.raise_for_status()
    return r.text


# ---------------------------------------------------------------
# 1. szint — JSON-LD (Schema.org/Event)
# ---------------------------------------------------------------

def _jsonld_nodes(data: Any):
    if isinstance(data, list):
        for item in data:
            yield from _jsonld_nodes(item)
    elif isinstance(data, dict):
        if "@graph" in data:
            yield from _jsonld_nodes(data["@graph"])
        else:
            yield data


def _is_event_type(node_type: Any) -> str | None:
    types = node_type if isinstance(node_type, list) else [node_type]
    for t in types:
        t = str(t or "")
        if t == "Event" or t.endswith("Event") or t == "Festival":
            return t
    return None


def extract_jsonld(page_html: str, page_url: str) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    pattern = r"<script[^>]*type=[\"']application/ld\+json[\"'][^>]*>([\s\S]*?)</script>"
    for match in re.finditer(pattern, page_html, re.I):
        raw = match.group(1).strip()
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            try:
                data = json.loads(re.sub(r"[\x00-\x1f]", " ", raw))
            except json.JSONDecodeError:
                continue
        for node in _jsonld_nodes(data):
            node_type = _is_event_type(node.get("@type"))
            if not node_type or not node.get("name") or not node.get("startDate"):
                continue
            location = node.get("location") or {}
            if isinstance(location, list):
                location = location[0] if location else {}
            city, venue = "", ""
            if isinstance(location, str):
                # a Schema.org a location-t Text-ként is engedi
                city = common.find_known_city(location) or ""
                venue = location.split(",")[0].strip()
            elif isinstance(location, dict):
                venue = str(location.get("name") or "")
                address = location.get("address")
                if isinstance(address, str):
                    city = common.find_known_city(address) or ""
                elif isinstance(address, dict):
                    city = str(address.get("addressLocality") or "")
            if not city:
                continue  # város nélkül nem tudunk geokódolni
            image = node.get("image")
            if isinstance(image, list):
                image = image[0] if image else None
            if isinstance(image, dict):
                image = image.get("url")
            events.append(
                {
                    "title": node.get("name"),
                    "categories": JSONLD_TYPE_MAP.get(node_type, []),
                    "city": city,
                    "venue": venue or city,
                    "start_time": node.get("startDate"),
                    "end_time": node.get("endDate"),
                    "description": node.get("description"),
                    # KÖTELEZŐ: esemény-részletoldal, ha van (a dedup kulcs miatt)
                    "source_url": urljoin(page_url, str(node.get("url") or "")) or page_url,
                    "image_url": image,
                }
            )
    return events


# ---------------------------------------------------------------
# 1b. szint — iCal (.ics)
# ---------------------------------------------------------------

def find_ics_url(page_html: str, page_url: str) -> str | None:
    m = re.search(r"(?:href|src)=[\"']([^\"']+\.ics[^\"']*)[\"']", page_html, re.I)
    return urljoin(page_url, m.group(1)) if m else None


def extract_ical(ics_text: str, page_url: str) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    try:
        cal = Calendar.from_ical(ics_text)
    except Exception as exc:
        print(f"  ! iCal parse hiba: {exc}")
        return events
    for component in cal.walk("VEVENT"):
        title = str(component.get("SUMMARY") or "")
        dtstart = component.get("DTSTART")
        if not title or dtstart is None:
            continue
        location = str(component.get("LOCATION") or "")
        city = common.find_known_city(location) or (
            location.split(",")[-1].strip() if "," in location else ""
        )
        if not city:
            continue
        dtend = component.get("DTEND")
        events.append(
            {
                "title": title,
                "categories": [],
                "city": city,
                "venue": location.split(",")[0].strip() or city,
                "start_time": getattr(dtstart, "dt", None),
                "end_time": getattr(dtend, "dt", None) if dtend else None,
                "description": str(component.get("DESCRIPTION") or ""),
                "source_url": str(component.get("URL") or "") or page_url,
                "image_url": None,
            }
        )
    return events


# ---------------------------------------------------------------
# 3. szint — LLM (Gemini) extrakció
# ---------------------------------------------------------------

LLM_SCHEMA = {
    "type": "ARRAY",
    "items": {
        "type": "OBJECT",
        "properties": {
            "title": {"type": "STRING"},
            "categories": {
                "type": "ARRAY",
                "items": {"type": "STRING", "enum": sorted(CATEGORIES)},
            },
            "city": {"type": "STRING"},
            "venue": {"type": "STRING"},
            "start_time": {"type": "STRING"},
            "end_time": {"type": "STRING", "nullable": True},
            "description": {"type": "STRING", "nullable": True},
            "source_url": {"type": "STRING", "nullable": True},
            "image_url": {"type": "STRING", "nullable": True},
        },
        "required": ["title", "categories", "city", "venue", "start_time"],
    },
}


def extract_llm(text: str, page_url: str) -> list[dict[str, Any]] | None:
    """Gemini extrakció. None = a hívás maga hiúsult meg (≠ üres eredmény)."""
    if not common.GEMINI_API_KEY:
        return None
    today = datetime.now(BUDAPEST).date().isoformat()
    prompt = f"""A következő weboldal-szöveg magyarországi eseményeket sorol fel (forrás: {page_url}, mai dátum: {today}).
A szövegben a linkek a linkelt szöveg után szögletes zárójelben szerepelnek: pl. Esemény címe [https://pelda.hu/esemeny/123].
Nyerd ki az ÖSSZES jövőbeli eseményt (maximum {MAX_EVENTS_PER_TARGET} db). Szabályok:
- categories: 1-3 illő kategória a következők közül: {", ".join(sorted(CATEGORIES))}
  (pl. egy gyerekkoncert: ["konnyuzene", "csaladi"]; szimfonikus est: ["hangverseny"]; DJ-est: ["buli"])
- start_time / end_time: ISO 8601, Europe/Budapest (pl. 2026-08-15T19:00:00+02:00); end_time lehet null
- city: a település neve (pl. "Szeged"); venue: a helyszín neve
- description: max 1000 karakteres magyar összefoglaló (lehet null)
- source_url: az esemény RÉSZLETOLDALÁNAK teljes URL-je — a cím melletti [ ... ] linkből; ha nincs, null
- Ha nincs a szövegben esemény, adj vissza üres tömböt.

Weboldal szövege:
{text}"""
    result = common.gemini_json(prompt, LLM_SCHEMA)
    return result if isinstance(result, list) else None


# ---------------------------------------------------------------
# Fő feldolgozás
# ---------------------------------------------------------------

def process_target(target: dict[str, Any]) -> str:
    url = target["url"]
    name = target.get("name", url)
    print(f"→ {name} ({url})")

    try:
        page_html = fetch(url)
    except Exception as exc:
        print(f"  ! letöltési hiba: {exc}")
        _save_state(url, None, f"error:fetch")
        return "error"

    # A linkeket megőrizzük a szövegben, hogy az LLM a részletoldal-URL-t
    # is ki tudja nyerni. A hash ugyanerre a szövegre épül.
    text = common.html_to_text(page_html, base_url=url)
    page_hash = common.content_hash(text)

    # 1. szint: JSON-LD
    raw_events = extract_jsonld(page_html, url)
    method = "jsonld"

    # 1b. szint: iCal
    if not raw_events:
        ics_url = find_ics_url(page_html, url)
        if ics_url:
            try:
                raw_events = extract_ical(fetch(ics_url), url)
                method = "ical"
            except Exception as exc:
                print(f"  ! iCal letöltési hiba: {exc}")

    # 2. szint: hash/diff — csak az LLM-ág előtt (a strukturált út ingyen van)
    if not raw_events:
        state = common.sb_get(
            "scrape_state",
            {"target_url": f"eq.{url}", "select": "last_hash"},
        )
        if state and state[0].get("last_hash") == page_hash:
            print("  = változatlan tartalom, LLM-hívás kihagyva")
            _save_state(url, page_hash, "unchanged")
            return "unchanged"
        # 3. szint: LLM extrakció
        llm_events = extract_llm(text, url)
        if llm_events is None:
            # Sikertelen/elérhetetlen LLM: a hash-t NEM mentjük el, különben a
            # következő futás "változatlannak" látná az oldalt, és soha nem
            # extrakálna — így viszont újrapróbálkozik.
            print("  ! LLM-extrakció sikertelen — a hash nem kerül mentésre")
            _save_state(url, None, "error:llm")
            return "error"
        raw_events = llm_events
        method = "llm"

    # Normalizálás + geokódolás + körzet- és jövőbeliség-szűrés
    cutoff = datetime.now(BUDAPEST) - timedelta(hours=6)
    prepared: list[dict[str, Any]] = []
    outside = 0
    for raw in raw_events[:MAX_EVENTS_PER_TARGET]:
        coords = common.geocode_city(str(raw.get("city") or ""))
        if not coords:
            print(f"  ! kihagyva (ismeretlen település): {raw.get('title')!r} / {raw.get('city')!r}")
            continue
        if not common.in_focus_area(*coords):
            outside += 1  # várható a countrywide forrásoknál — csak összesítve logoljuk
            continue
        event = common.build_event(raw, coords, fallback_source_url=url)
        if event is None:
            print(f"  ! kihagyva (hiányos adat): {raw.get('title')!r}")
            continue
        if datetime.fromisoformat(event["start_time"]) < cutoff:
            continue  # múltbeli esemény
        prepared.append(event)
    if outside:
        print(f"  · {outside} esemény a fókuszkörzeten kívül — kihagyva")

    inserted, skipped = common.insert_events(prepared)
    print(f"  ✓ {method}: {len(prepared)} esemény → {inserted} új, {skipped} duplikátum")
    _save_state(url, page_hash, f"{method}:{inserted}")
    return method


def _save_state(url: str, page_hash: str | None, result: str) -> None:
    try:
        common.sb_upsert(
            "scrape_state",
            {
                "target_url": url,
                "last_hash": page_hash,
                "last_scraped_at": datetime.now(BUDAPEST).isoformat(),
                "last_result": result,
                "updated_at": datetime.now(BUDAPEST).isoformat(),
            },
            on_conflict="target_url",
        )
    except Exception as exc:
        print(f"  ! scrape_state mentési hiba: {exc}")


def main() -> None:
    common.require_supabase_env()
    if not common.GEMINI_API_KEY:
        print("FIGYELEM: GEMINI_API_KEY nincs beállítva — a 3. (LLM) szint kimarad.")

    targets_file = Path(os.environ.get("TARGETS_FILE", Path(__file__).parent / "targets.json"))
    targets = [t for t in json.loads(targets_file.read_text("utf-8"))["targets"] if t.get("enabled")]

    shard_index = int(os.environ.get("SHARD_INDEX", "0"))
    shard_total = max(1, int(os.environ.get("SHARD_TOTAL", "1")))
    my_targets = [t for i, t in enumerate(targets) if i % shard_total == shard_index]
    print(f"CityPulse scraper — shard {shard_index}/{shard_total}, {len(my_targets)} céloldal\n")

    stats: dict[str, int] = {}
    for target in my_targets:
        try:
            outcome = process_target(target)
        except Exception as exc:  # egyetlen hibás céloldal nem buktathatja a shardot
            print(f"  ! feldolgozási hiba ({target.get('url')}): {exc}")
            outcome = "error"
        stats[outcome] = stats.get(outcome, 0) + 1

    print(f"\nÖsszegzés: {stats}")
    # A hibás oldalak nem buktatják a jobot — a többi cél eredménye értékes.
    sys.exit(0)


if __name__ == "__main__":
    main()
