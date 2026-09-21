/** Каталог часовых поясов на языке интерфейса (кешируется в api/meta на уровне модуля). */

import { useEffect, useState } from "react";

import { cachedTimezones, loadTimezones } from "../api/meta";
import type { TimezoneEntry } from "../types/meta";
import type { Language } from "../types/settings";

export type TimezonesStatus = "loading" | "ready" | "error";

interface UseTimezonesResult {
  timezones: TimezoneEntry[];
  status: TimezonesStatus;
  error: unknown;
  reload: () => void;
}

export function useTimezones(language: Language): UseTimezonesResult {
  // Уже загруженный каталог показывается сразу, без кадра загрузки.
  const [timezones, setTimezones] = useState(() => cachedTimezones(language) ?? []);
  const [status, setStatus] = useState<TimezonesStatus>(() =>
    cachedTimezones(language) ? "ready" : "loading",
  );
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (cachedTimezones(language)) {
      return;
    }
    let active = true;
    setStatus("loading");
    loadTimezones(language)
      .then((loaded) => {
        if (active) {
          setTimezones(loaded);
          setStatus("ready");
        }
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(caught);
          setStatus("error");
        }
      });
    return () => {
      active = false;
    };
  }, [language, attempt]);

  return { timezones, status, error, reload: () => setAttempt((count) => count + 1) };
}
