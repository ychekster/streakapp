/**
 * Web app: a reminder was just turned on (a habit's or «Напоминать отмечать») — make
 * sure it can arrive (web/push.ts `enablePushForReminder`):
 *  - never asked → the system permission prompt;
 *  - refused earlier → a dialog: only the phone's settings can allow them now;
 *  - allowed, but turned off in Settings → turned back on silently.
 * In Telegram reminders come from the bot — nothing to do.
 */

import { useCallback } from "react";

import { usePlatform } from "../platform";
import { useStrings } from "../preferences";
import { showAlert } from "../telegram/webapp";
import { enablePushForReminder, pushPermission } from "../web/push";

/** Returns the handler; call it synchronously inside the tap (Safari asks only from a
 *  gesture). It resolves with the permission. */
export function useReminderPush(): () => Promise<NotificationPermission | "unsupported"> {
  const strings = useStrings();
  const web = usePlatform() === "web";
  return useCallback(() => {
    if (!web) {
      return Promise.resolve(pushPermission());
    }
    const refusedBefore = pushPermission() === "denied";
    return enablePushForReminder().then((permission) => {
      if (refusedBefore) {
        void showAlert({
          title: strings.notificationsDeniedTitle,
          message: strings.notificationsDeniedHint,
        });
      }
      return permission;
    });
  }, [web, strings]);
}
