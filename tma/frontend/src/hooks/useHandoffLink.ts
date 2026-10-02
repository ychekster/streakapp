/**
 * Single-use link that opens the install page in the phone's browser logged into the same
 * account (spec 6.5, 7.1). Fetched ahead of the tap — so the tap opens the browser at
 * once — and refreshed before it expires. A used link is replaced right away: it works
 * only once.
 *
 * Only inside Telegram (the web app is already installed).
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { createHandoff } from "../api/web";
import { HANDOFF_REFRESH_MS } from "../constants";
import { openExternalLink } from "../telegram/webapp";

export interface HandoffLink {
  ready: boolean;
  failed: boolean;
  /** Open the install page in the browser (fetches a link first if none is ready). */
  open: () => void;
}

export function useHandoffLink(src: string, enabled: boolean): HandoffLink {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const fetchedAt = useRef(0);

  const refresh = useCallback(async (): Promise<string | null> => {
    try {
      const handoff = await createHandoff(src);
      fetchedAt.current = Date.now();
      setUrl(handoff.url);
      setFailed(false);
      return handoff.url;
    } catch {
      setFailed(true);
      return null;
    }
  }, [src]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), HANDOFF_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [enabled, refresh]);

  const open = useCallback(() => {
    const fresh = url !== null && Date.now() - fetchedAt.current < HANDOFF_REFRESH_MS;
    if (fresh && url) {
      openExternalLink(url);
      setUrl(null);
      void refresh();
      return;
    }
    void refresh().then((next) => {
      if (next) {
        openExternalLink(next);
        setUrl(null);
        void refresh();
      }
    });
  }, [refresh, url]);

  return { ready: url !== null, failed, open };
}
