/**
 * Web app: Settings → «Уведомления» on this device (web/push.ts). Turning them on asks
 * for permission right from the tap — again after a refusal too; if the phone no longer
 * asks (iPhone after «Не разрешать»), a dialog tells where to allow them. Turning them
 * off asks first — reminders will stop arriving here. Failures are shown in a dialog.
 * The switch starts in the last known
 * state (no «off → on» animation each time Settings opens); the real state is read again
 * when the app comes back to the foreground (the user may have changed it in the phone's
 * settings).
 */

import { useCallback, useEffect, useState } from "react";

import { describeError } from "../errors";
import { useStrings } from "../preferences";
import { confirmAction, hapticNotification, showAlert } from "../telegram/webapp";
import {
  disablePush,
  enablePushFromTap,
  pushEnabled,
  pushEnabledGuess,
  pushPermission,
} from "../web/push";

export interface PushToggle {
  on: boolean;
  change: (on: boolean) => void;
}

export function usePushToggle(enabled: boolean): PushToggle {
  const strings = useStrings();
  const [on, setOn] = useState(pushEnabledGuess);
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
      if (next) {
        // Synchronously inside the tap: Safari asks for permission only from a gesture.
        const request = enablePushFromTap();
        setBusy(true);
        setOn(true);
        void request
          .then((done) => {
            setOn(done);
            if (done) {
              hapticNotification("success");
            } else if (pushPermission() === "denied") {
              void showAlert({
                title: strings.notificationsDeniedTitle,
                message: strings.notificationsDeniedHint,
              });
            } else if (pushPermission() === "granted") {
              hapticNotification("error");
              void showAlert({
                title: strings.notificationsOnFailed,
                message:
                  (navigator.onLine ? undefined : strings.apiErrors.network_error) ??
                  strings.accountActionFailed,
              });
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
        .catch((error: unknown) => {
          setOn(true);
          hapticNotification("error");
          void showAlert({
            title: strings.notificationsOffFailed,
            message: describeError(strings, error, strings.accountActionFailed),
          });
        })
        .finally(() => setBusy(false));
    },
    [busy, strings],
  );

  return { on, change };
}
