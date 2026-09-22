"""Собрать справочник городов для выбора часового пояса: tma/backend/data/cities.tsv.gz.

Источник — GeoNames (https://www.geonames.org), лицензия CC BY 4.0:
  - cities5000.zip — города от 5000 жителей (и столицы); у каждого есть зона IANA;
  - alternateNamesV2.zip — названия на разных языках: берём русские и английские;
  - admin1CodesASCII.txt — регионы, чтобы различать одноимённые города страны.

Запуск из корня репозитория (скачивает ~220 МБ во временную папку):

    python scripts/build_cities.py

Если файлы уже скачаны: `--source <папка>` (в ней cities5000.zip, alternateNamesV2.zip
и admin1CodesASCII.txt).

Формат результата — UTF-8 TSV в gzip, строки `#` — комментарии:

    R  <страна.регион>  <название en>  <название ru>
    C  <geonameid>  <зона>  <страна>  <регион>  <население>  <en>  <ru>  <другие названия через |>

Русского названия у города может не быть — тогда поле пустое (показывается английское).
Другие названия (варианты написания, прежние названия, названия на других языках
латиницей и кириллицей) нужны только поиску: так находятся «Питер», «Ленинград»,
«St. Petersburg», «Sankt-Peterburg».
"""

from __future__ import annotations

import argparse
import gzip
import io
import sys
import tempfile
import unicodedata
import urllib.request
import zipfile
from datetime import date
from pathlib import Path

import pytz

BASE_URL = "https://download.geonames.org/export/dump/"
CITIES_FILE = "cities5000.zip"
NAMES_FILE = "alternateNamesV2.zip"
REGIONS_FILE = "admin1CodesASCII.txt"
OUTPUT = Path(__file__).resolve().parent.parent / "tma" / "backend" / "data" / "cities.tsv.gz"

# Не города: районы внутри городов, исторические, заброшенные и разрушенные поселения.
SKIPPED_FEATURES = {"PPLX", "PPLH", "PPLQ", "PPLW", "PPLCH"}
LANGUAGES = ("en", "ru")
ALIAS_MAX_LENGTH = 40


def download(name: str, folder: Path) -> Path:
    target = folder / name
    if not target.exists():
        print(f"downloading {name}…", file=sys.stderr)
        urllib.request.urlretrieve(BASE_URL + name, target)
    return target


def is_latin_or_cyrillic(text: str) -> bool:
    """Все буквы — латиница или кириллица (на этих алфавитах набирают в поиске)."""
    for char in text:
        if char.isalpha():
            script = unicodedata.name(char, "")
            if not (script.startswith("LATIN") or script.startswith("CYRILLIC")):
                return False
    return True


def keep_alias(alias: str) -> bool:
    """Вариант названия, по которому имеет смысл искать."""
    if not alias or len(alias) > ALIAS_MAX_LENGTH or any(char.isdigit() for char in alias):
        return False
    # Коды аэропортов (LED, MOW, SVX) — не названия.
    if alias.isascii() and alias.isupper() and len(alias) <= 4:
        return False
    return is_latin_or_cyrillic(alias)


def read_cities(path: Path) -> dict[int, list[str]]:
    zones = set(pytz.all_timezones)
    cities: dict[int, list[str]] = {}
    with zipfile.ZipFile(path) as archive:
        with archive.open(path.stem + ".txt") as raw:
            for line in io.TextIOWrapper(raw, encoding="utf-8"):
                row = line.rstrip("\n").split("\t")
                # Население 0 — центры приходов и районов без данных (71 место, в основном
                # на островах), с ошибками в названиях: у прихода на Монтсеррате —
                # «Санкт-Петербург».
                if row[7] in SKIPPED_FEATURES or row[17] not in zones or row[14] in ("", "0"):
                    continue
                cities[int(row[0])] = row
    return cities


def read_regions(path: Path, wanted: set[str]) -> dict[str, tuple[int, str]]:
    """Регионы городов справочника: ключ «страна.код» → (geonameid, название)."""
    regions: dict[str, tuple[int, str]] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        key, name, _ascii, geoname_id = line.split("\t")
        if key in wanted:
            regions[key] = (int(geoname_id), name)
    return regions


def is_cyrillic(text: str) -> bool:
    return all(
        unicodedata.name(char, "").startswith("CYRILLIC") for char in text if char.isalpha()
    )


def read_names(
    path: Path, ids: set[int], russian_places: set[int]
) -> dict[tuple[int, str], str]:
    """Название на каждом из LANGUAGES: сначала «предпочтительное», потом полное, потом
    первое по порядку. Исторические не берутся, разговорные — только если других нет
    (GeoNames помечает разговорным и «Мурманск»). «Русские» названия не кириллицей —
    ошибки данных (у Уральска есть русское «Ural’sk»), они не берутся. У мест России без
    русского названия — название кириллицей без указанного языка."""
    candidates: dict[tuple[int, str], list[tuple[tuple[bool, bool, bool, bool, int], str]]] = {}
    with zipfile.ZipFile(path) as archive:
        with archive.open("alternateNamesV2.txt") as raw:
            for order, line in enumerate(io.TextIOWrapper(raw, encoding="utf-8")):
                row = line.rstrip("\n").split("\t")
                language = row[2]
                untagged = False
                if language not in LANGUAGES:
                    if language or int(row[1]) not in russian_places or not is_cyrillic(row[3]):
                        continue
                    language, untagged = "ru", True
                geoname_id = int(row[1])
                if geoname_id not in ids:
                    continue
                preferred, short, colloquial, historic = (value == "1" for value in row[4:8])
                if historic or row[9]:  # row[9] — «действовало до»
                    continue
                if language == "ru" and not is_cyrillic(row[3]):
                    continue
                rank = (untagged, colloquial, not preferred, short, order)
                candidates.setdefault((geoname_id, language), []).append((rank, row[3]))
    return {key: min(options)[1] for key, options in candidates.items()}


def clean(text: str) -> str:
    return " ".join(text.replace("\t", " ").replace("|", " ").split())


def build(source: Path) -> None:
    cities = read_cities(download(CITIES_FILE, source))
    region_keys = {f"{row[8]}.{row[10]}" for row in cities.values()}
    regions = read_regions(download(REGIONS_FILE, source), region_keys)
    russian_places = {geoname_id for geoname_id, row in cities.items() if row[8] == "RU"}
    russian_places |= {geoname_id for key, (geoname_id, _) in regions.items() if key.startswith("RU.")}
    names = read_names(
        download(NAMES_FILE, source),
        set(cities) | {geoname_id for geoname_id, _ in regions.values()},
        russian_places,
    )

    lines = [
        "# Города для выбора часового пояса. Сгенерировано scripts/build_cities.py "
        f"{date.today().isoformat()}.",
        "# Данные: GeoNames (https://www.geonames.org), лицензия CC BY 4.0.",
    ]
    for key in sorted(regions):
        geoname_id, name = regions[key]
        english = names.get((geoname_id, "en"), name)
        lines.append(f"R\t{key}\t{clean(english)}\t{clean(names.get((geoname_id, 'ru'), ''))}")

    for geoname_id in sorted(cities):
        row = cities[geoname_id]
        english = clean(names.get((geoname_id, "en"), row[1]))
        russian = clean(names.get((geoname_id, "ru"), ""))
        seen = {english.casefold(), russian.casefold()}
        aliases = []
        for alias in [row[1], row[2], *row[3].split(",")]:
            alias = clean(alias)
            if keep_alias(alias) and alias.casefold() not in seen:
                seen.add(alias.casefold())
                aliases.append(alias)
        lines.append(
            "\t".join(
                [
                    "C",
                    str(geoname_id),
                    row[17],
                    row[8],
                    row[10],
                    row[14],
                    english,
                    russian,
                    "|".join(aliases),
                ]
            )
        )

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(OUTPUT, "wt", encoding="utf-8", compresslevel=9) as output:
        output.write("\n".join(lines) + "\n")
    with_russian = sum(1 for geoname_id in cities if (geoname_id, "ru") in names)
    print(
        f"{OUTPUT}: {len(cities)} cities ({with_russian} with Russian names), "
        f"{len(regions)} regions, {OUTPUT.stat().st_size / 1e6:.1f} MB",
        file=sys.stderr,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--source", type=Path, help="папка с уже скачанными файлами GeoNames")
    args = parser.parse_args()
    if args.source:
        build(args.source)
    else:
        with tempfile.TemporaryDirectory() as folder:
            build(Path(folder))


if __name__ == "__main__":
    main()
