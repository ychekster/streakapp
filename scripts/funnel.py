"""Print the web app funnel (landing → install → first launch → first habit …).

Run from the repository root:

    python scripts/funnel.py                         # last 30 days
    python scripts/funnel.py --since 2026-10-01 --until 2026-10-31

For each step: events in total, distinct devices/accounts, and the split by platform
(ios / android / desktop) and by install source (`src`: threads, bot, settings …).
The same numbers are in the admin panel (Analytics → «Веб-приложение»).
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.config import load_settings  # noqa: E402 — after sys.path setup
from backend.database import Database  # noqa: E402
from backend.funnel import funnel_report  # noqa: E402
from backend.repository import Repository, utc_now  # noqa: E402


def _split(counts: dict[str, int]) -> str:
    return ", ".join(f"{key} {value}" for key, value in sorted(counts.items(), key=lambda i: -i[1]))


async def main(since: date, until: date) -> None:
    database = Database(load_settings().database_url)
    try:
        async with database.session_factory() as session:
            report = await funnel_report(Repository(session), since, until)
    finally:
        await database.dispose()
    print(f"Web app funnel {report.since} … {report.until} (UTC)\n")
    width = max(len(step.event) for step in report.steps)
    print(f"{'step'.ljust(width)}  {'events':>7}  {'unique':>7}  by platform | by src")
    for step in report.steps:
        line = f"{step.event.ljust(width)}  {step.total:>7}  {step.unique:>7}"
        if step.total:
            line += f"  {_split(step.by_platform)} | {_split(step.by_src)}"
        print(line)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    today = utc_now().date()
    parser.add_argument("--since", type=date.fromisoformat, default=today - timedelta(days=29))
    parser.add_argument("--until", type=date.fromisoformat, default=today)
    arguments = parser.parse_args()
    asyncio.run(main(arguments.since, arguments.until))
