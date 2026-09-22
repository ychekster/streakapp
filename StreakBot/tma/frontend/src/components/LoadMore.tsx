/**
 * Конец списка с бесконечной прокруткой: когда до него остаётся меньше
 * `--load-more-margin` прокрутки, просит следующую страницу. Пока она грузится — спиннер;
 * не вышло — пояснение и «Повторить» (сам список при этом остаётся).
 */

import { useEffect, useRef } from "react";

import { readRootVariable } from "../theme";
import styles from "./LoadMore.module.css";

interface LoadMoreProps {
  hasMore: boolean;
  loading: boolean;
  failed: boolean;
  onLoad: () => void;
  loadingLabel: string;
  failedLabel: string;
  retryLabel: string;
}

export function LoadMore({
  hasMore,
  loading,
  failed,
  onLoad,
  loadingLabel,
  failedLabel,
  retryLabel,
}: LoadMoreProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const onLoadRef = useRef(onLoad);
  onLoadRef.current = onLoad;
  const waiting = hasMore && !loading && !failed;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !waiting) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onLoadRef.current();
        }
      },
      { rootMargin: `0px 0px ${readRootVariable("--load-more-margin") || "0px"} 0px` },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [waiting]);

  if (!hasMore) {
    return null;
  }
  return (
    <div ref={sentinelRef} className={styles.more}>
      {failed ? (
        <>
          <span>{failedLabel}</span>
          <button type="button" className={styles.retry} onClick={onLoad}>
            {retryLabel}
          </button>
        </>
      ) : (
        <span className={styles.spinner} role="status" aria-label={loadingLabel} />
      )}
    </div>
  );
}
