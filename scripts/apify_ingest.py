"""CityPulse — Facebook-események fogadása külső API-ból (pl. Apify).

A közvetlen Facebook-scraping blokkoláshoz vezet, ezért a FB-eseményeket
egy külső szolgáltató (pl. Apify facebook-events scraper, Free Tier)
strukturált JSON-végpontjából vesszük át és integráljuk az events táblába.

Futás:  python scripts/apify_ingest.py
Env:    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (kötelező)
        APIFY_DATASET_URL  — az Apify dataset items végpontja, pl.
        https://api.apify.com/v2/datasets/<id>/items?format=json&token=<token>
        (ha nincs beállítva, a szkript csendben kilép — a workflow így
        akkor is zöld, ha az Apify-integráció még nincs bekötve)

Megjegyzés: az Apify actorok mezőnevei eltérhetnek — a _pick() több
jelölt kulcsot próbál; új actor esetén itt kell bővíteni a listákat.
"""

from __future__ import annotations

import os
import sys
from typing import Any

import requests

import common


def _pick(item: dict[str, Any], *keys: str) -> Any:
    """Az első nem üres érték a jelölt kulcsok közül (pont: beágyazott elérés)."""
    for key in keys:
        value: Any = item
        for part in key.split("."):
            if isinstance(value, dict):
                value = value.get(part)
            else:
                value = None
                break
        if value not in (None, "", []):
            return value
    return None


def map_item(item: dict[str, Any]) -> dict[str, Any] | None:
    title = _pick(item, "name", "title", "eventName")
    source_url = _pick(item, "url", "eventUrl", "link", "facebookUrl")
    start = _pick(item, "utcStartDate", "startDate", "startTimestamp", "dateTimeStart", "time")
    if not title or not source_url or start is None:
        return None
    city = _pick(
        item,
        "location.city", "place.location.city", "city",
        "location.name", "place.name", "locationName",
    )
    if not city:
        return None
    # ha a "city" valójában helyszín-string, próbáljunk ismert várost találni benne
    known = common.find_known_city(str(city))
    city_name = known or str(city)
    venue = _pick(item, "location.name", "place.name", "venue", "locationName") or city_name
    description = _pick(item, "description", "summary") or ""
    return {
        "title": title,
        "category": common.guess_category(f"{title} {description}"),
        "city": city_name,
        "venue": venue,
        "start_time": start,
        "end_time": _pick(item, "utcEndDate", "endDate", "endTimestamp", "dateTimeEnd"),
        "description": description,
        "source_url": source_url,
        "image_url": _pick(item, "imageUrl", "image", "photo", "coverPhotoUrl"),
    }


def main() -> None:
    dataset_url = os.environ.get("APIFY_DATASET_URL", "").strip()
    if not dataset_url:
        print("APIFY_DATASET_URL nincs beállítva — Apify-ingest kihagyva.")
        sys.exit(0)
    common.require_supabase_env()

    r = requests.get(dataset_url, timeout=60, headers={"User-Agent": common.USER_AGENT})
    r.raise_for_status()
    items = r.json()
    if not isinstance(items, list):
        print("HIBA: a dataset válasz nem JSON tömb.")
        sys.exit(1)
    print(f"Apify dataset: {len(items)} elem")

    prepared: list[dict[str, Any]] = []
    for item in items:
        raw = map_item(item)
        if raw is None:
            continue
        coords = common.geocode_city(raw["city"])
        if not coords:
            print(f"  ! kihagyva (ismeretlen település): {raw['title']!r} / {raw['city']!r}")
            continue
        event = common.build_event(raw, coords, fallback_source_url=raw["source_url"])
        if event:
            prepared.append(event)

    inserted, skipped = common.insert_events(prepared)
    print(f"✓ {len(prepared)} feldolgozott esemény → {inserted} új, {skipped} duplikátum")


if __name__ == "__main__":
    main()
