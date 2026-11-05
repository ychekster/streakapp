/**
 * Web app only: «Админ-панель» on a device the administrator has not allowed yet.
 *
 * A web session lives long in the browser, so on its own it opens no admin panel. On
 * this screen the app asks (`POST /auth/admin-device`): the bot writes to the
 * administrator's Telegram naming the device, and once «Разрешить» is pressed there the
 * panel opens (`onAllowed`). On this device it is never asked again, until logging out.
 * Declined or too late: the screen says so and offers to ask again.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { pollAdminDevice, requestAdminDevice } from "../api/web";
import { Screen } from "../components/Screen";
import { StatusMessage } from "../components/StatusMessage";
import { describeError } from "../errors";
import { useStrings } from "../preferences";

// How often the app asks whether the administrator has pressed «Разрешить» (ms).
const POLL_INTERVAL_MS = 2000;

type Step =
  | { kind: "sending" }
  | { kind: "pending"; token: string }
  | { kind: "expired" }
  | { kind: "failed"; error: unknown };

export function AdminDeviceScreen({ onAllowed }: { onAllowed: () => void }) {
  const strings = useStrings();
  const [step, setStep] = useState<Step>({ kind: "sending" });
  const allowedRef = useRef(onAllowed);
  allowedRef.current = onAllowed;

  const ask = useCallback(() => {
    setStep({ kind: "sending" });
    requestAdminDevice().then(
      (answer) => {
        if (answer.status === "done" || answer.token === null) {
          allowedRef.current();
        } else {
          setStep({ kind: "pending", token: answer.token });
        }
      },
      (error: unknown) => setStep({ kind: "failed", error }),
    );
  }, []);

  // One request per opening (a remount in development keeps the ref).
  const asked = useRef(false);
  useEffect(() => {
    if (!asked.current) {
      asked.current = true;
      ask();
    }
  }, [ask]);

  const token = step.kind === "pending" ? step.token : null;
  useEffect(() => {
    if (token === null) {
      return;
    }
    let stopped = false;
    const timer = window.setInterval(() => {
      pollAdminDevice(token).then(
        (answer) => {
          if (stopped) {
            return;
          }
          if (answer.status === "done") {
            stopped = true;
            allowedRef.current();
          } else if (answer.status === "expired") {
            setStep({ kind: "expired" });
          }
        },
        // No connection for a moment: the next poll tries again.
        () => undefined,
      );
    }, POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [token]);

  return (
    <Screen title={strings.settingsAdminPanel} withTabBar={false} enterAnimation pinnedTitle>
      {step.kind === "sending" ? (
        <StatusMessage icon="spinner" title={strings.adminLoading} />
      ) : step.kind === "pending" ? (
        <StatusMessage
          icon="send"
          title={strings.adminDeviceWaitTitle}
          description={strings.adminDeviceWaitDescription}
        />
      ) : step.kind === "expired" ? (
        <StatusMessage
          icon="alert"
          title={strings.adminDeviceExpiredTitle}
          description={strings.adminDeviceExpiredDescription}
          actionLabel={strings.adminDeviceRetry}
          onAction={ask}
        />
      ) : (
        <StatusMessage
          icon="alert"
          title={strings.adminDeviceFailedTitle}
          description={describeError(strings, step.error, strings.adminDeviceFailed)}
          actionLabel={strings.adminDeviceRetry}
          onAction={ask}
        />
      )}
    </Screen>
  );
}
