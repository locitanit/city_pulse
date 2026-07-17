"""CityPulse — közös segédfüggvények a scraper / moderátor szkriptekhez.

Minden szkript a Supabase-t PostgREST-en át, a service_role kulccsal éri el
(az RLS-t megkerülve). A kulcs kizárólag CI secretből / env-ből jöhet.
"""

from __future__ import annotations

import hashlib
import html as html_lib
import json
import os
import re
import sys
import time
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import requests

BUDAPEST = ZoneInfo("Europe/Budapest")

CATEGORIES = {
    "konnyuzene",
    "szinhaz",
    "kiallitas",
    "fesztival",
    "standup",
    "csaladi",
    "sport",
}

# Magyarország befoglaló téglalapja (egyezik a DB CHECK-ekkel)
HU_LAT = (45.5, 48.8)
HU_LON = (16.0, 23.2)

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

USER_AGENT = "CityPulseBot/1.0 (+esemeny-aggregator; kapcsolat a repo README-ben)"


def require_supabase_env() -> None:
    if not SUPABASE_URL or not SERVICE_KEY:
        print("HIBA: SUPABASE_URL és SUPABASE_SERVICE_ROLE_KEY env változó kötelező.")
        sys.exit(1)


# ---------------------------------------------------------------
# Supabase (PostgREST) helperek
# ---------------------------------------------------------------

def _sb_headers() -> dict[str, str]:
    return {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
    }


def sb_get(path: str, params: dict[str, str]) -> list[dict[str, Any]]:
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/{path}", headers=_sb_headers(), params=params, timeout=30
    )
    r.raise_for_status()
    return r.json()


def sb_patch(path: str, params: dict[str, str], body: dict[str, Any]) -> None:
    r = requests.patch(
        f"{SUPABASE_URL}/rest/v1/{path}",
        headers=_sb_headers(),
        params=params,
        json=body,
        timeout=30,
    )
    r.raise_for_status()


def sb_upsert(path: str, body: dict[str, Any], on_conflict: str) -> None:
    headers = _sb_headers() | {"Prefer": "resolution=merge-duplicates"}
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/{path}",
        headers=headers,
        params={"on_conflict": on_conflict},
        json=body,
        timeout=30,
    )
    r.raise_for_status()


def sb_rpc(name: str, body: dict[str, Any]) -> Any:
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/{name}", headers=_sb_headers(), json=body, timeout=60
    )
    r.raise_for_status()
    return r.json()


# ---------------------------------------------------------------
# Geokódolás: cities tábla → Nominatim fallback
# ---------------------------------------------------------------

_cities_cache: dict[str, tuple[float, float]] | None = None
_nominatim_cache: dict[str, tuple[float, float] | None] = {}


def load_cities() -> dict[str, tuple[float, float]]:
    global _cities_cache
    if _cities_cache is None:
        rows = sb_get("cities", {"select": "name,latitude,longitude"})
        _cities_cache = {
            row["name"].lower(): (row["latitude"], row["longitude"]) for row in rows
        }
    return _cities_cache


def _in_hungary(lat: float, lon: float) -> bool:
    return HU_LAT[0] <= lat <= HU_LAT[1] and HU_LON[0] <= lon <= HU_LON[1]


def geocode_city(city: str) -> tuple[float, float] | None:
    """Település → (lat, lon). Először a cities táblából, aztán Nominatimból."""
    key = city.strip().lower()
    if not key:
        return None
    cities = load_cities()
    if key in cities:
        return cities[key]
    if key in _nominatim_cache:
        return _nominatim_cache[key]
    try:
        time.sleep(1.1)  # Nominatim etikett: max ~1 kérés/mp
        r = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={"format": "json", "limit": "1", "countrycodes": "hu", "q": city},
            headers={"User-Agent": USER_AGENT},
            timeout=20,
        )
        r.raise_for_status()
        results = r.json()
        if results:
            lat, lon = float(results[0]["lat"]), float(results[0]["lon"])
            if _in_hungary(lat, lon):
                _nominatim_cache[key] = (lat, lon)
                return (lat, lon)
    except Exception as exc:  # geokódolási hiba nem állíthatja meg a futást
        print(f"  ! Nominatim hiba ({city}): {exc}")
    _nominatim_cache[key] = None
    return None


def find_known_city(text: str) -> str | None:
    """Ismert városnév keresése egy szabad szövegben (pl. iCal LOCATION)."""
    lowered = text.lower()
    for name in load_cities():
        if name in lowered:
            return name.title()
    return None


# ---------------------------------------------------------------
# Szöveg- és dátumkezelés
# ---------------------------------------------------------------

def html_to_text(html: str, max_chars: int = 40000) -> str:
    text = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I)
    text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = html_lib.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_chars]


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def parse_dt(value: Any) -> datetime | None:
    """ISO 8601 (vagy unix timestamp) → timezone-aware datetime (Budapest default)."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(float(value), tz=BUDAPEST)
        except (OverflowError, OSError, ValueError):
            return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=BUDAPEST)
    if isinstance(value, date):
        # iCal egész napos esemény (DTSTART;VALUE=DATE) → 00:00 Budapest
        return datetime(value.year, value.month, value.day, tzinfo=BUDAPEST)
    if not isinstance(value, str):
        return None
    raw = value.strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(raw)
    except ValueError:
        # gyakori formátum: "2026. 08. 15. 19:00"
        m = re.match(r"(\d{4})\D+(\d{1,2})\D+(\d{1,2})\D+(\d{1,2}):(\d{2})", raw)
        if not m:
            return None
        dt = datetime(*(int(g) for g in m.groups()))
    return dt if dt.tzinfo else dt.replace(tzinfo=BUDAPEST)


CATEGORY_KEYWORDS = [
    ("fesztival", r"fesztivál|festival|feszt\b"),
    ("szinhaz", r"színház|szinhaz|előadás|dráma|musical|opera|balett"),
    ("kiallitas", r"kiállítás|kiallitas|múzeum|muzeum|galéria|tárlat"),
    ("standup", r"stand.?up|humor|dumaszínház|dumaszinhaz|comedy"),
    ("csaladi", r"családi|csaladi|gyerek|gyermek|báb|matiné"),
    ("sport", r"futás|futas|verseny|sport|túra|tura|maraton|kupa|meccs"),
]


def guess_category(text: str) -> str:
    lowered = text.lower()
    for cat, pattern in CATEGORY_KEYWORDS:
        if re.search(pattern, lowered):
            return cat
    return "konnyuzene"


# ---------------------------------------------------------------
# Esemény-normalizálás (a DB CHECK-jeivel összhangban)
# ---------------------------------------------------------------

def build_event(
    raw: dict[str, Any],
    coords: tuple[float, float],
    fallback_source_url: str,
) -> dict[str, Any] | None:
    """Nyers extrakcióból insert-kész, validált esemény — vagy None, ha menthetetlen."""
    title = re.sub(r"\s+", " ", str(raw.get("title") or "")).strip()[:100]
    city = re.sub(r"\s+", " ", str(raw.get("city") or "")).strip()[:100]
    venue = re.sub(r"\s+", " ", str(raw.get("venue") or "")).strip()[:200] or city

    start = parse_dt(raw.get("start_time"))
    end = parse_dt(raw.get("end_time"))
    if end and start and end < start:
        end = None

    source_url = str(raw.get("source_url") or "").strip() or fallback_source_url
    if not re.match(r"^https?://", source_url, re.I) or len(source_url) > 2048:
        source_url = fallback_source_url

    image_url = str(raw.get("image_url") or "").strip()
    if not re.match(r"^https://", image_url, re.I) or len(image_url) > 2048:
        image_url = None

    category = str(raw.get("category") or "").strip()
    if category not in CATEGORIES:
        category = guess_category(f"{title} {raw.get('description') or ''}")

    description = re.sub(r"\s+", " ", str(raw.get("description") or "")).strip()[:1000]
    lat, lon = coords

    if len(title) < 3 or len(city) < 2 or start is None or not _in_hungary(lat, lon):
        return None

    return {
        "title": title,
        "category": category,
        "city": city,
        "venue": venue,
        "latitude": lat,
        "longitude": lon,
        "start_time": start.isoformat(),
        "end_time": end.isoformat() if end else None,
        "description": description or None,
        "source_url": source_url,
        "image_url": image_url,
    }


def insert_events(events: list[dict[str, Any]]) -> tuple[int, int]:
    """Kötegelt beszúrás a scraper_insert_events RPC-n át. → (inserted, skipped)"""
    if not events:
        return (0, 0)
    rows = sb_rpc("scraper_insert_events", {"p_events": events})
    row = rows[0] if rows else {"inserted": 0, "skipped": 0}
    return (row.get("inserted", 0), row.get("skipped", 0))


# ---------------------------------------------------------------
# Gemini (Google Generative Language API) helper
# ---------------------------------------------------------------

# FIGYELEM: a gemini-2.5-flash "no longer available to new users" 404-et ad —
# ez okozta a 2026-07-16-i futás összes error:llm hibáját.
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash")


def gemini_json(prompt: str, response_schema: dict[str, Any]) -> Any:
    """Strukturált JSON-válasz a Gemini API-tól; None hibánál.

    Átmeneti hibáknál (429 kvóta / 5xx túlterhelés) exponenciális
    visszavárakozással újrapróbál.
    """
    if not GEMINI_API_KEY:
        return None
    attempts = 4
    for attempt in range(attempts):
        if attempt:
            time.sleep(20 * 2 ** (attempt - 1))  # 20 / 40 / 80 mp — a 429-es
            # percenkénti kvótának idő kell, hogy visszatöltődjön
        try:
            r = requests.post(
                "https://generativelanguage.googleapis.com/v1beta/models/"
                f"{GEMINI_MODEL}:generateContent",
                params={"key": GEMINI_API_KEY},
                json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {
                        "temperature": 0,
                        "response_mime_type": "application/json",
                        "response_schema": response_schema,
                    },
                },
                timeout=300,
            )
            if r.status_code == 429 or r.status_code >= 500:
                if attempt + 1 < attempts:
                    print(f"  ! Gemini {r.status_code} — újrapróbálás ({attempt + 1}/{attempts - 1})")
                else:
                    print(f"  ! Gemini {r.status_code} — feladva {attempts} próbálkozás után")
                continue
            r.raise_for_status()
            data = r.json()
            # A gondolkodó modellek "thought" részeket is adhatnak — csak a
            # válasz-szöveget fűzzük össze.
            parts = data["candidates"][0]["content"]["parts"]
            raw = "".join(p.get("text", "") for p in parts if not p.get("thought"))
            return json.loads(raw)
        except Exception as exc:
            print(f"  ! Gemini hiba: {exc}")
            return None
    return None
