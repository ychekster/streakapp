"""Похожие названия привычек — одной строкой: «Читать», «читать 📚», «Чтение» → «Читать».

Название приводится к простому виду (нижний регистр, без эмодзи и знаков, «ё» → «е»), а
затем к теме: если в нём есть корень из списка ниже — тема по корню (чтение, вода, спорт…),
иначе — само простое название. Подпись группы — самое частое исходное написание.
"""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from collections.abc import Iterable

_WORD = re.compile(r"[a-zа-я0-9]+")

# Тема → корни (по началу слова). Порядок важен: первая подходящая тема побеждает.
_TOPICS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("read", ("чита", "чтен", "книг", "прочит", "read", "book")),
    ("water", ("вод", "water", "пить вод", "drink")),
    ("meditation", ("медит", "meditat", "осознан", "mindful")),
    ("english", ("англ", "english", "инглиш")),
    ("language", ("испан", "немец", "француз", "китай", "язык", "spanish", "german", "french", "duolingo", "дуолинго")),
    ("run", ("бег", "пробеж", "run", "jog")),
    ("walk", ("прогул", "шаг", "ходьб", "гулять", "walk", "step")),
    ("stretch", ("растяж", "йог", "stretch", "yoga", "зарядк", "пилатес", "pilates")),
    ("workout", ("планк", "plank", "спорт", "трениров", "зал", "качал", "отжим", "присед", "пресс", "фитнес", "workout", "gym", "exercise", "fitness", "pushup", "push")),
    ("sleep", ("сон", "спать", "отбой", "лечь", "ложит", "sleep", "bed")),
    ("wake", ("подъ", "просып", "встава", "ранн", "wake", "early")),
    ("journal", ("дневник", "journal", "запис", "рефлекс", "гратит", "благодар", "gratitude")),
    ("sugar", ("сахар", "сладк", "sugar", "sweet")),
    ("vitamins", ("витамин", "таблет", "лекарств", "vitamin", "pill", "supplement")),
    ("study", ("учеб", "учить", "учи", "курс", "study", "learn", "lesson", "урок")),
    ("smoking", ("курен", "курит", "сигарет", "smok", "вейп", "vape")),
    ("alcohol", ("алког", "alcohol", "пив", "вин", "beer", "wine")),
    ("screen", ("телефон", "соцсет", "инстаграм", "тикток", "youtube", "ютуб", "phone", "screen", "social")),
    ("cleaning", ("уборк", "убрат", "чистот", "clean", "tidy")),
    ("shower", ("душ", "shower", "закалив")),
    ("skincare", ("уход", "кожа", "skincare", "skin")),
    ("food", ("питан", "завтрак", "еда", "овощ", "фрукт", "калор", "food", "meal", "breakfast", "diet", "диет")),
    ("prayer", ("молит", "намаз", "pray", "библ", "коран")),
    ("teeth", ("зуб", "флосс", "teeth", "floss")),
    ("music", ("гитар", "пианин", "музык", "guitar", "piano", "music")),
    ("draw", ("рисов", "рисун", "draw", "sketch")),
    ("work", ("работ", "проект", "work", "project", "код", "code", "coding", "программ")),
    ("money", ("деньг", "бюджет", "расход", "финанс", "money", "budget")),
    ("planning", ("план", "plan", "задач", "todo")),
)


def simplify(name: str) -> str:
    """Название в простом виде: слова из букв и цифр через пробел."""
    return " ".join(_WORD.findall(name.lower().replace("ё", "е")))


def topic(name: str) -> str:
    """Ключ группы: тема по корню или простое название."""
    simple = simplify(name)
    words = simple.split()
    for key, roots in _TOPICS:
        for root in roots:
            if " " in root:
                if root in simple:
                    return key
            elif any(word.startswith(root) for word in words):
                return key
    return simple or name.strip().lower()


def group_names(names: Iterable[tuple[str, int]]) -> dict[str, tuple[str, int, set[int]]]:
    """(название, владелец) → ключ группы: (подпись, привычек, владельцы).

    Подпись — самое частое написание в группе (с заглавной буквы)."""
    spellings: dict[str, Counter[str]] = defaultdict(Counter)
    owners: dict[str, set[int]] = defaultdict(set)
    counts: Counter[str] = Counter()
    for name, owner in names:
        key = topic(name)
        spellings[key][name.strip()] += 1
        owners[key].add(owner)
        counts[key] += 1
    result: dict[str, tuple[str, int, set[int]]] = {}
    for key, spelled in spellings.items():
        label = spelled.most_common(1)[0][0]
        result[key] = (label[:1].upper() + label[1:], counts[key], owners[key])
    return result
