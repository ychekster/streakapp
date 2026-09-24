"""Справочник городов для выбора часового пояса: поиск города по названию и его зона.

Данные — `data/cities.tsv.gz`, его собирает `scripts/build_cities.py` из GeoNames
(https://www.geonames.org, лицензия CC BY 4.0): ~64 тыс. городов от 5000 жителей, у
каждого — зона IANA, страна, регион, население и названия на английском и русском.
Искать можно и по другим названиям города — вариантам написания, прежним названиям,
названиям на других языках латиницей и кириллицей («Питер», «Ленинград»,
«St. Petersburg»).

Справочник загружается один раз (около секунды) — при старте API (см. main.py).
"""

from __future__ import annotations

import gzip
import re
import unicodedata
from array import array
from bisect import bisect_right
from collections import Counter
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from babel import Locale

from tma.backend.constants import LANGUAGES

DATA_FILE = Path(__file__).resolve().parent / "data" / "cities.tsv.gz"

_SEPARATORS = re.compile(r"[\W_]+")

# Краткие названия стран, которыми их уточняют в поиске («портленд сша»), — в CLDR их нет.
COUNTRY_SHORT_NAMES: dict[str, str] = {
    "US": "США USA",
    "GB": "UK",
    "AE": "UAE",
}


def normalize(text: str) -> str:
    """Название для сравнения: без регистра, диакритики и знаков препинания
    («Санкт-Петербург» → «санкт петербург», «St. Pétersbourg» → «st petersbourg»,
    «Орёл» → «орел»)."""
    decomposed = unicodedata.normalize("NFKD", text.casefold())
    letters = "".join(char for char in decomposed if not unicodedata.combining(char))
    return " ".join(_SEPARATORS.split(letters)).strip()


@dataclass(frozen=True, slots=True)
class City:
    """Город справочника. `region` — ключ региона «страна.код» (см. CityIndex.region_name)."""

    id: int
    zone: str
    country: str
    region: str
    population: int
    name_en: str
    name_ru: str

    def name(self, language: str) -> str:
        """Название на языке интерфейса; русского нет — английское."""
        if language == "ru" and self.name_ru:
            return self.name_ru
        return self.name_en

    def has_name(self, language: str) -> bool:
        """Есть ли у города название на этом языке (английское есть у всех)."""
        return language != "ru" or bool(self.name_ru)


class CityIndex:
    """Города справочника и поиск по их названиям."""

    def __init__(self, path: Path = DATA_FILE) -> None:
        self.cities: list[City] = []
        self._positions: dict[int, int] = {}
        self._regions: dict[str, tuple[str, str]] = {}
        names: list[str] = []
        # Названия города идут подряд: у города i — с first[i] до first[i + 1].
        self._first = array("i")
        owners = array("i")
        with gzip.open(path, "rt", encoding="utf-8") as source:
            for line in source:
                fields = line.rstrip("\n").split("\t")
                if fields[0] == "R":
                    self._regions[fields[1]] = (fields[2], fields[3])
                elif fields[0] == "C":
                    city = City(
                        id=int(fields[1]),
                        zone=fields[2],
                        country=fields[3],
                        region=f"{fields[3]}.{fields[4]}",
                        population=int(fields[5]),
                        name_en=fields[6],
                        name_ru=fields[7],
                    )
                    position = len(self.cities)
                    self._positions[city.id] = position
                    self.cities.append(city)
                    self._first.append(len(names))
                    variants = {normalize(name) for name in (fields[6], fields[7], *fields[8].split("|"))}
                    variants.discard("")
                    names.extend(variants)
                    owners.extend([position] * len(variants))
        self._first.append(len(names))
        self._owners = owners
        # Все названия — одной строкой, каждое между переводами строки: искать в ней —
        # быстрый str.find, а номер строки (по её началу в `_starts`) даёт город.
        self._text = "\n" + "\n".join(names) + "\n"
        self._starts = array("i")
        position = 1
        for name in names:
            self._starts.append(position)
            position += len(name) + 1
        self._place_words: dict[str, tuple[str, ...]] = {}
        self._name_counts: dict[str, Counter[tuple[str, str]]] = {}

    def get(self, city_id: int) -> City | None:
        position = self._positions.get(city_id)
        return self.cities[position] if position is not None else None

    def names(self, city: City) -> set[str]:
        """Все названия города (в виде для сравнения, см. normalize)."""
        position = self._positions[city.id]
        lines = range(self._first[position], self._first[position + 1])
        return {self._text[self._starts[line] : self._text.index("\n", self._starts[line])] for line in lines}

    def region_name(self, city: City, language: str) -> str | None:
        """Регион города на языке интерфейса — если в стране есть другой город с тем же
        названием («Портленд, Орегон» и «Портленд, Мэн»), иначе None."""
        counts = self._name_counts.get(language)
        if counts is None:
            counts = Counter((item.name(language), item.country) for item in self.cities)
            self._name_counts[language] = counts
        if counts[(city.name(language), city.country)] < 2:
            return None
        english, russian = self._regions.get(city.region, ("", ""))
        return (russian if language == "ru" and russian else english) or None

    def search(self, query: str, limit: int) -> list[City]:
        """Города по запросу: сначала название целиком, потом начало названия, потом начало
        слова в нём («петербург» → «Санкт-Петербург»); при равенстве — крупнее выше.

        Последние слова запроса могут уточнять страну или регион: «портленд орегон»,
        «moscow russia», «springfield il».
        """
        words = normalize(query).split()
        best: dict[int, int] = {}
        for split in range(len(words), 0, -1):
            qualifiers = words[split:]
            for position, rank in self._find(" ".join(words[:split])).items():
                if rank < best.get(position, 3) and (
                    not qualifiers or self._matches_place(self.cities[position], qualifiers)
                ):
                    best[position] = rank
        ranked = sorted(best, key=lambda position: (best[position], -self.cities[position].population))
        return [self.cities[position] for position in ranked[:limit]]

    def _find(self, query: str) -> dict[int, int]:
        """Города с названием, где запрос стоит с начала слова: позиция города → качество
        совпадения (0 — всё название, 1 — его начало, 2 — начало другого слова)."""
        found: dict[int, int] = {}
        text = self._text
        for separator in ("\n", " "):
            needle = separator + query
            position = text.find(needle)
            while position >= 0:
                if separator == " ":
                    rank = 2
                else:
                    rank = 0 if text[position + len(needle)] == "\n" else 1
                owner = self._owners[bisect_right(self._starts, position + 1) - 1]
                if rank < found.get(owner, 3):
                    found[owner] = rank
                position = text.find(needle, position + 1)
        return found

    def _matches_place(self, city: City, qualifiers: list[str]) -> bool:
        """Каждое слово-уточнение — начало слова в названии страны или региона города."""
        words = self._place_words.get(city.region)
        if words is None:
            names = [city.country, *self._regions.get(city.region, ()), COUNTRY_SHORT_NAMES.get(city.country, "")]
            names += [_locale(language).territories.get(city.country, "") for language in LANGUAGES]
            words = tuple(set(normalize(" ".join(names)).split()))
            self._place_words[city.region] = words
        return all(any(word.startswith(qualifier) for word in words) for qualifier in qualifiers)


@lru_cache
def _locale(language: str) -> Locale:
    return Locale.parse(language)


@lru_cache(maxsize=1)
def city_index() -> CityIndex:
    """Справочник городов (загружается при первом обращении)."""
    return CityIndex()
