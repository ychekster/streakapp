/**
 * Поиск города для часового пояса на сервере (GET /meta/timezones?q=…): запрос уходит,
 * когда ввод замер на TIMEZONE_SEARCH_DELAY_MS. Пока ответа на текущий запрос нет,
 * остаются результаты предыдущего — список не мигает на каждой букве. Полученные
 * результаты кешируются в api/meta: повтор запроса показывается сразу.
 */

import { useEffect, useState } from "react";

import { cachedTimezoneSearch, searchTimezones } from "../api/meta";
import { TIMEZONE_SEARCH_DELAY_MS } from "../constants";
import type { TimezoneEntry } from "../types/meta";
import type { Language } from "../types/settings";

interface UseTimezoneSearchResult {
  /** Результаты текущего запроса, а пока их нет — предыдущего; null — ещё ни одного. */
  results: TimezoneEntry[] | null;
  /** Результаты — не по текущему запросу (ответ на него ещё идёт). */
  stale: boolean;
  /** Ошибка поиска по текущему запросу. */
  error: unknown;
  retry: () => void;
}

/** Результат запроса с ключом «язык + запрос», к которому он относится. */
interface Keyed<T> {
  key: string;
  value: T;
}

export function useTimezoneSearch(language: Language, query: string): UseTimezoneSearchResult {
  const trimmed = query.trim();
  const key = `${language}\n${trimmed}`;
  const cached = trimmed ? cachedTimezoneSearch(language, trimmed) : null;
  const [received, setReceived] = useState<Keyed<TimezoneEntry[]> | null>(null);
  const [failed, setFailed] = useState<Keyed<unknown> | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!trimmed || cachedTimezoneSearch(language, trimmed)) {
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      searchTimezones(language, trimmed)
        .then((timezones) => {
          if (active) {
            setReceived({ key, value: timezones });
          }
        })
        .catch((caught: unknown) => {
          if (active) {
            setFailed({ key, value: caught });
          }
        });
    }, TIMEZONE_SEARCH_DELAY_MS);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [language, trimmed, key, attempt]);

  return {
    results: cached ?? received?.value ?? null,
    stale: cached === null && received?.key !== key,
    error: cached === null && failed?.key === key ? failed.value : null,
    retry: () => {
      setFailed(null);
      setAttempt((count) => count + 1);
    },
  };
}
