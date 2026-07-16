"""CityPulse — automatikus AI moderátor.

Óránkénti cron jobként fut (.github/workflows/ai-moderator.yml):
lekéri a 'pending' státuszú felhasználói beküldéseket (max 50/futás),
minden eseményt LLM-mel minősít, és approved/rejected státuszra frissít
a moderation_reason kitöltésével. Ha az LLM-hívás hibázik, az esemény
pending marad, és a következő futás újra próbálja.

LLM szolgáltató (MODERATOR_PROVIDER env, vagy automatikus):
  - anthropic  — Claude API (ANTHROPIC_API_KEY; modell: ANTHROPIC_MODEL,
                 alapértelmezés: claude-opus-4-8)
  - gemini     — Google Gemini API (GEMINI_API_KEY) — 100% ingyenes szint

Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY + a fenti kulcsok egyike.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime
from typing import Any

import common
from common import BUDAPEST

MAX_BATCH = 50

SYSTEM_PROMPT = """Te egy szigorú moderátor vagy egy magyar programajánló oldalon (CityPulse).
A feladatod a felhasználók által beküldött események ellenőrzése. Vizsgáld meg, hogy:
- az esemény valós, kulturális/szórakoztató MAGYARORSZÁGI program-e,
- a nyelvhelyesség elfogadható-e,
- nem tartalmaz-e spamet, trágárságot, adathalászatot, illegális tartalmat
  vagy tesztadatot (pl. "asdfgh"),
- a link és a leírás koherens-e egymással.

Válaszolj KIZÁRÓLAG érvényes JSON formátumban:
{"decision": "approved" | "rejected", "reason": "Rövid, magyar nyelvű indoklás a döntésről."}"""

DECISION_SCHEMA = {
    "type": "object",
    "properties": {
        "decision": {"type": "string", "enum": ["approved", "rejected"]},
        "reason": {"type": "string"},
    },
    "required": ["decision", "reason"],
    "additionalProperties": False,
}


def event_summary(event: dict[str, Any]) -> str:
    fields = {
        "cím": event.get("title"),
        "kategória": event.get("category"),
        "település": event.get("city"),
        "helyszín": event.get("venue"),
        "kezdés": event.get("start_time"),
        "vége": event.get("end_time"),
        "leírás": event.get("description"),
        "link": event.get("source_url"),
        "kép": event.get("image_url"),
    }
    today = datetime.now(BUDAPEST).date().isoformat()
    return (
        f"A mai dátum: {today}.\n"
        "Ellenőrizendő beküldés:\n"
        + json.dumps(fields, ensure_ascii=False, indent=2)
    )


# ---------------------------------------------------------------
# LLM szolgáltatók
# ---------------------------------------------------------------

def moderate_anthropic(event: dict[str, Any]) -> dict[str, str] | None:
    import anthropic

    model = os.environ.get("ANTHROPIC_MODEL", "claude-opus-4-8")
    try:
        client = anthropic.Anthropic()
        # max_tokens bőven: adaptív gondolkodásnál a thinking tokenek is
        # ebbe a keretbe számítanak — 1-2K keretnél a JSON csonkulhatna.
        response = client.messages.create(
            model=model,
            max_tokens=16000,
            thinking={"type": "adaptive"},
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": event_summary(event)}],
            output_config={"format": {"type": "json_schema", "schema": DECISION_SCHEMA}},
        )
        if response.stop_reason == "refusal":
            # Biztonsági elutasítás a modell részéről → az esemény biztosan gyanús
            return {"decision": "rejected", "reason": "A moderátor modell biztonsági okból elutasította a tartalom feldolgozását."}
        if response.stop_reason == "max_tokens":
            print("  ! Claude válasz csonkult (max_tokens) — az esemény pending marad")
            return None
        text = next(b.text for b in response.content if b.type == "text")
        return json.loads(text)
    except anthropic.RateLimitError:
        print("  ! Claude rate limit — az esemény pending marad")
        return None
    except anthropic.APIStatusError as exc:
        print(f"  ! Claude API hiba ({exc.status_code}): {exc.message}")
        return None
    except anthropic.APIConnectionError:
        print("  ! Claude kapcsolódási hiba")
        return None
    except (StopIteration, json.JSONDecodeError) as exc:
        print(f"  ! Claude válasz-feldolgozási hiba: {exc}")
        return None
    except Exception as exc:  # pl. hiányzó/hibás kulcs a kliens-konstruktorban
        print(f"  ! Váratlan moderálási hiba: {exc}")
        return None


def moderate_gemini(event: dict[str, Any]) -> dict[str, str] | None:
    schema = {
        "type": "OBJECT",
        "properties": {
            "decision": {"type": "STRING", "enum": ["approved", "rejected"]},
            "reason": {"type": "STRING"},
        },
        "required": ["decision", "reason"],
    }
    result = common.gemini_json(f"{SYSTEM_PROMPT}\n\n{event_summary(event)}", schema)
    return result if isinstance(result, dict) else None


def pick_provider() -> str:
    provider = os.environ.get("MODERATOR_PROVIDER", "").strip().lower()
    if provider == "anthropic" and not os.environ.get("ANTHROPIC_API_KEY"):
        print("HIBA: MODERATOR_PROVIDER=anthropic, de az ANTHROPIC_API_KEY hiányzik.")
        sys.exit(1)
    if provider == "gemini" and not os.environ.get("GEMINI_API_KEY"):
        print("HIBA: MODERATOR_PROVIDER=gemini, de a GEMINI_API_KEY hiányzik.")
        sys.exit(1)
    if provider in ("anthropic", "gemini"):
        return provider
    if os.environ.get("ANTHROPIC_API_KEY"):
        return "anthropic"
    if os.environ.get("GEMINI_API_KEY"):
        return "gemini"
    print("HIBA: ANTHROPIC_API_KEY vagy GEMINI_API_KEY szükséges a moderáláshoz.")
    sys.exit(1)


# ---------------------------------------------------------------
# Fő folyamat
# ---------------------------------------------------------------

def main() -> None:
    common.require_supabase_env()
    provider = pick_provider()
    moderate = moderate_anthropic if provider == "anthropic" else moderate_gemini
    print(f"CityPulse AI moderátor — szolgáltató: {provider}")

    pending = common.sb_get(
        "events",
        {
            "status": "eq.pending",
            "order": "created_at.asc",
            "limit": str(MAX_BATCH),
            "select": "id,title,category,city,venue,start_time,end_time,description,source_url,image_url",
        },
    )
    print(f"{len(pending)} várakozó beküldés\n")

    approved = rejected = failed = 0
    for event in pending:
        title = event.get("title", "?")
        verdict = moderate(event)
        if not verdict or verdict.get("decision") not in ("approved", "rejected"):
            print(f"✗ pending marad: {title!r} (LLM-hiba)")
            failed += 1
            continue
        decision = verdict["decision"]
        reason = str(verdict.get("reason") or "").strip()[:1000] or "Nincs indoklás."
        try:
            common.sb_patch(
                "events",
                {"id": f"eq.{event['id']}"},
                {"status": decision, "moderation_reason": reason},
            )
        except Exception as exc:
            print(f"✗ státuszfrissítési hiba: {title!r} — {exc}")
            failed += 1
            continue
        mark = "✓" if decision == "approved" else "✗"
        print(f"{mark} {decision}: {title!r} — {reason}")
        approved += decision == "approved"
        rejected += decision == "rejected"

    print(f"\nÖsszegzés: {approved} jóváhagyva, {rejected} elutasítva, {failed} hiba (pending maradt)")


if __name__ == "__main__":
    main()
