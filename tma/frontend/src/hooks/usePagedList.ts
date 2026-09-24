/**
 * Список с бесконечной прокруткой (пользователи и отзывы в админ-панели): первая
 * страница, догрузка следующей по курсору из ответа и замена элементов после действий.
 *
 * Смена ключа (поисковый запрос) загружает список заново; пока ответа нет, на экране
 * остаётся прежний список (`stale`) — он не мигает на каждой букве. Ответы на устаревший
 * ключ и догрузка прежнего списка не применяются. Элемент, который уже есть в списке
 * (сдвиг страниц, пока список листали), не дублируется. Пока `enabled` ложно, ничего
 * не загружается (список ещё не открывали).
 */

import { useCallback, useEffect, useRef, useState } from "react";

import type { Page } from "../types/admin";

export type PagedListStatus = "loading" | "ready" | "error";

export interface PagedList<T> {
  items: T[];
  status: PagedListStatus;
  error: unknown;
  /** На экране — список по прежнему ключу (ответ на новый ещё идёт). */
  stale: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  /** Не удалось догрузить следующую страницу. */
  moreError: unknown;
  loadMore: () => void;
  reload: () => void;
  /** Изменить загруженные элементы (удалить, обновить) без запроса. */
  update: (change: (items: T[]) => T[]) => void;
}

interface State<T> {
  key: string;
  items: T[];
  cursor: string | null;
}

export function usePagedList<T>(
  fetchPage: (cursor: string | null) => Promise<Page<T>>,
  itemKey: (item: T) => number,
  key: string,
  enabled = true,
): PagedList<T> {
  const [state, setState] = useState<State<T> | null>(null);
  // Ошибка первой страницы — с ключом, к которому она относится.
  const [failed, setFailed] = useState<{ key: string; error: unknown } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;
  const itemKeyRef = useRef(itemKey);
  itemKeyRef.current = itemKey;
  // Ключ, на который сейчас показывается список (для догрузки и её ответа).
  const keyRef = useRef(key);
  keyRef.current = key;

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let active = true;
    setMoreError(null);
    fetchRef
      .current(null)
      .then((page) => {
        if (active) {
          setState({ key, items: page.items, cursor: page.next_cursor });
          setFailed(null);
        }
      })
      .catch((caught: unknown) => {
        if (active) {
          setFailed({ key, error: caught });
        }
      });
    return () => {
      active = false;
    };
  }, [key, attempt, enabled]);

  const cursor = state?.key === key ? state.cursor : null;

  const loadMore = useCallback(() => {
    if (!cursor || loadingMore) {
      return;
    }
    const requestedKey = keyRef.current;
    setLoadingMore(true);
    setMoreError(null);
    fetchRef
      .current(cursor)
      .then((page) => {
        setState((current) => {
          if (!current || current.key !== requestedKey || current.cursor !== cursor) {
            return current;
          }
          const known = new Set(current.items.map((item) => itemKeyRef.current(item)));
          const fresh = page.items.filter((item) => !known.has(itemKeyRef.current(item)));
          return { ...current, items: [...current.items, ...fresh], cursor: page.next_cursor };
        });
      })
      .catch((caught: unknown) => setMoreError(caught))
      .finally(() => setLoadingMore(false));
  }, [cursor, loadingMore]);

  const reload = useCallback(() => {
    setFailed(null);
    setAttempt((count) => count + 1);
  }, []);

  const update = useCallback((change: (items: T[]) => T[]) => {
    setState((current) => current && { ...current, items: change(current.items) });
  }, []);

  return {
    items: state?.items ?? [],
    status: failed?.key === key ? "error" : state === null ? "loading" : "ready",
    error: failed?.key === key ? failed.error : null,
    stale: state !== null && state.key !== key,
    hasMore: cursor !== null,
    loadingMore,
    moreError,
    loadMore,
    reload,
    update,
  };
}
