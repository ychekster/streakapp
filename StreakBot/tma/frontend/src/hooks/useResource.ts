/**
 * Загрузка данных экрана админ-панели по ключу: статус (загрузка / ошибка / готово),
 * перезагрузка и прямая замена данных (после действия — без повторного запроса).
 *
 * Смена ключа (например, периода аналитики) загружает данные заново, но прежние
 * остаются на экране, пока не придут новые (`refreshing`): экран не мигает загрузкой.
 * Ответ на устаревший ключ не применяется. `initial` — данные, которые уже известны
 * (строка списка): они видны сразу, пока загружаются свежие.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type ResourceStatus = "loading" | "ready" | "error";

export interface Resource<T> {
  data: T | null;
  status: ResourceStatus;
  error: unknown;
  /** Идёт загрузка, а на экране — прежние данные. */
  refreshing: boolean;
  reload: () => void;
  setData: (update: (current: T) => T) => void;
}

export function useResource<T>(
  load: () => Promise<T>,
  key: string,
  initial: T | null = null,
): Resource<T> {
  const [data, setDataState] = useState<T | null>(initial);
  const [status, setStatus] = useState<ResourceStatus>(initial === null ? "loading" : "ready");
  const [error, setError] = useState<unknown>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Загрузчик из последнего рендера: эффект зависит только от ключа и попытки.
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let active = true;
    setRefreshing(true);
    setError(null);
    loadRef
      .current()
      .then((loaded) => {
        if (active) {
          setDataState(loaded);
          setStatus("ready");
        }
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(caught);
          setStatus("error");
        }
      })
      .finally(() => {
        if (active) {
          setRefreshing(false);
        }
      });
    return () => {
      active = false;
    };
  }, [key, attempt]);

  const reload = useCallback(() => {
    setStatus((current) => (current === "error" ? "loading" : current));
    setAttempt((count) => count + 1);
  }, []);

  const setData = useCallback((update: (current: T) => T) => {
    setDataState((current) => (current === null ? current : update(current)));
  }, []);

  return { data, status, error, refreshing: refreshing && data !== null, reload, setData };
}
