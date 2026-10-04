/**
 * Web app: Settings → «Уведомления» on this device (web/push.ts). Turning them on asks
 * for permission right from the tap — again after a refusal too; if the phone no longer
 * asks (iPhone after «Не разрешать»), a dialog tells where to allow them. Turning them
 * off asks first — reminders will stop arriving here. The switch starts in the last known
 * state (no «off → on» animation each time Settings opens); the real state is read again
 * when the app comes back to the foreground (the user may have changed it in the phone's
 * settings).
 */

import { useCallback, useEffect, useState } from "react";

import { useStrings } from "../preferences";
import { confirmAction, hapticNotification } from "../telegram/webapp";
import {
  disablePush,
  enablePushFromTap,
  pushEnabled,
  pushEnabledGuess,
  pushPermission,
} from "../web/push";

export interface PushToggle {
  on: boolean;
  /** Turning them on or off did not work (no permission aside). */
  failed: boolean;
  change: (on: boolean) => void;
}

export function usePushToggle(enabled: boolean): PushToggle {
  const strings = useStrings();
  const [on, setOn] = useState(pushEnabledGuess);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const read = useCallback(() => {
    void pushEnabled().then(setOn);
  }, []);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    read();
    const onVisible = (): void => {
      if (document.visibilityState === "visible") {
        read();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [enabled, read]);

  const change = useCallback(
    (next: boolean) => {
      if (busy) {
        return;
      }
      setFailed(false);
      if (next) {
        // Synchronously inside the tap: Safari asks for permission only from a gesture.
        const request = enablePushFromTap();
        setBusy(true);
        setOn(true);
        void request
          .then((done) => {
            setOn(done);
            setFailed(!done && pushPermission() === "granted");
            if (pushPermission() === "denied") {
              window.alert(strings.notificationsDenied);
            }
            if (done) {
              hapticNotification("success");
            }
          })
          .finally(() => setBusy(false));
        return;
      }
      setBusy(true);
      void confirmAction({
        title: strings.notificationsOffTitle,
        message: strings.notificationsOffMessage,
        confirmLabel: strings.notificationsOffConfirm,
        cancelLabel: strings.notificationsOffCancel,
        destructive: true,
      })
        .then(async (confirmed) => {
          if (confirmed) {
            setOn(false);
            await disablePush();
          }
        })
        .catch(() => {
          setOn(true);
          setFailed(true);
        })
        .finally(() => setBusy(false));
    },
    [busy, strings],
  );

  return { on, failed, change };
}
