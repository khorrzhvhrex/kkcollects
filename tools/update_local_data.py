#!/usr/bin/env python3
"""
KKM local-data updater.

Maintenance-time dependencies only:
  - TCGdex API for set/card checklist metadata
  - PokéAPI for a canonical National Dex name -> number lookup

The deployed app does NOT call either service.
Generated files are committed into /data and served locally by GitHub Pages.
"""

from __future__ import annotations

import argparse
import json
import re
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SETS_DIR = DATA / "sets"

TCGDEX_BASE = "https://api.tcgdex.net/v2/en"
POKEAPI_SPECIES = "https://pokeapi.co/api/v2/pokemon-species?limit=2000"
USER_AGENT = "KKM-Local-Data-Updater/1.0"


def fetch_json(url: str, retries: int = 3):
    last_error = None

    for attempt in range(retries):
        try:
            request = urllib.request.Request(
                url,
                headers={
                    "User-Agent": USER_AGENT,
                    "Accept": "application/json",
                },
            )

            with urllib.request.urlopen(request, timeout=45) as response:
                return json.loads(response.read().decode("utf-8"))

        except Exception as exc:
            last_error = exc
            if attempt + 1 < retries:
                time.sleep(1.5 + attempt)

    raise RuntimeError(f"Failed to fetch {url}: {last_error}")


def compact_json(value):
    return json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=False,
    )


def write_js(path: Path, javascript_prefix: str, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        javascript_prefix + compact_json(value) + ";\n",
        encoding="utf-8",
    )


def safe_file_id(value: str):
    if not re.fullmatch(r"[A-Za-z0-9._-]+", value):
        raise ValueError(f"Unsafe set ID for local filename: {value!r}")
    return value


def build_pokedex():
    print("Refreshing local National Dex lookup...")

    payload = fetch_json(POKEAPI_SPECIES)
    pokedex = {}

    for row in payload.get("results", []):
        name = row.get("name")
        url = row.get("url", "")
        match = re.search(r"/pokemon-species/(\d+)/?$", url)

        if name and match:
            pokedex[name] = str(int(match.group(1))).zfill(3)

    write_js(
        DATA / "pokedex.js",
        "window.KKM_POKEDEX=",
        pokedex,
    )

    return len(pokedex)


def build_sets(include_pocket: bool = False, delay: float = 0.04):
    print("Refreshing local Pokémon TCG set/card indexes...")

    set_briefs = fetch_json(f"{TCGDEX_BASE}/sets")
    normalized_index = []
    valid_files = set()

    for position, brief in enumerate(set_briefs, start=1):
        set_id = safe_file_id(str(brief["id"]))

        detail = fetch_json(
            f"{TCGDEX_BASE}/sets/{urllib.parse.quote(set_id)}"
        )

        series = detail.get("serie") or {}
        series_name = series.get("name", "")
        series_id = series.get("id", "")

        if not include_pocket and (
            series_id == "tcgp"
            or "TCG Pocket" in series_name
        ):
            continue

        card_count = detail.get("cardCount") or {}
        official_count = card_count.get("official")
        total_count = card_count.get("total")

        cards = []

        for card in detail.get("cards", []):
            cards.append({
                "id": card.get("id"),
                "localId": str(card.get("localId", "")),
                "name": card.get("name", ""),
            })

        local_set = {
            "id": set_id,
            "name": detail.get("name", brief.get("name", set_id)),
            "seriesId": series_id,
            "seriesName": series_name,
            "releaseDate": detail.get("releaseDate"),
            "officialCount": official_count,
            "totalCount": total_count,
            "cards": cards,
        }

        # officialCount is metadata ONLY.
        # No validation assumes localId <= officialCount.
        prefix = (
            "window.KKM_SET_DATA=window.KKM_SET_DATA||{};"
            f"window.KKM_SET_DATA[{json.dumps(set_id)}]="
        )

        write_js(
            SETS_DIR / f"{set_id}.js",
            prefix,
            local_set,
        )

        normalized_index.append({
            "id": set_id,
            "name": local_set["name"],
            "seriesId": series_id,
            "seriesName": series_name,
            "releaseDate": local_set["releaseDate"],
            "officialCount": official_count,
            "totalCount": total_count,
        })

        valid_files.add(f"{set_id}.js")

        print(
            f"[{position}/{len(set_briefs)}] "
            f"{local_set['name']} ({set_id}) — {len(cards)} cards"
        )

        if delay:
            time.sleep(delay)

    SETS_DIR.mkdir(parents=True, exist_ok=True)

    for existing in SETS_DIR.glob("*.js"):
        if existing.name not in valid_files:
            existing.unlink()

    normalized_index.sort(
        key=lambda row: (
            row.get("releaseDate") or "",
            row.get("name") or "",
        ),
        reverse=True,
    )

    write_js(
        DATA / "sets-index.js",
        "window.KKM_SET_INDEX=",
        normalized_index,
    )

    return len(normalized_index)


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--include-pocket",
        action="store_true",
        help="Include Pokémon TCG Pocket sets.",
    )

    parser.add_argument(
        "--delay",
        type=float,
        default=0.04,
        help="Delay between TCGdex set-detail requests.",
    )

    args = parser.parse_args()

    DATA.mkdir(parents=True, exist_ok=True)
    SETS_DIR.mkdir(parents=True, exist_ok=True)

    dex_count = build_pokedex()
    set_count = build_sets(
        include_pocket=args.include_pocket,
        delay=max(0.0, args.delay),
    )

    source_info = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "runtimeExternalDependencies": [],
        "maintenanceSources": {
            "setsAndCards": "TCGdex",
            "nationalDex": "PokéAPI",
        },
        "setCount": set_count,
        "pokedexSpeciesCount": dex_count,
        "notes": [
            "The live tracker reads only committed repository files.",
            "officialCount is never treated as a maximum valid card number.",
            "Secret rares such as Dark Raichu 83/82 are valid.",
            "Card images are intentionally excluded.",
        ],
    }

    (DATA / "source-info.json").write_text(
        json.dumps(source_info, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    print()
    print(f"Done: {set_count} sets cached locally.")
    print(f"Done: {dex_count} National Dex entries cached locally.")


if __name__ == "__main__":
    main()
