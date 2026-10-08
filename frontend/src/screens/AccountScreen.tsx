/**
 * Settings → «Аккаунт», in the Mini App and in the web app alike:
 *  1. The Telegram the account is linked to.
 *  2. About the account: registration date (from the server), habits, total check-ins and
 *     best streak (from the habits on the device, as the habit screens show them).
 *  3. «Устройств с входом» — devices logged in to the web app (the server's count), and
 *     under it in the same card «Выйти на всех устройствах» while there is somewhere to
 *     log out of: in the web app — other devices (this one stays logged in), in the Mini
 *     App — any device (every web session ends).
 *  4. Web app only: «Выйти из аккаунта» — a pill under the last card, as «Удалить
 *     привычку» on the habit screen. The only way to log out on this device.
 *
 * The account is loaded when Settings opens and again when this screen opens (App); until
 * it arrives the server's values stay empty. Logging out asks first. In the web app the
 * app then continues as a new guest (web/login.ts logOut) and `onLoggedOut` reloads
 * everything; after logging out the other devices `onLoggedOutEverywhere` reloads the
 * count. A failure is shown in a dialog.
 */

import { useState } from "react";

import { logout, type Account } from "../api/web";
import { DestructiveButton } from "../components/DestructiveButton";
import { ListGroup } from "../components/ListGroup";
import { ListItem } from "../components/ListItem";
import { Screen } from "../components/Screen";
import { PersonIcon } from "../components/SettingsIcons";
import { describeError } from "../errors";
import { usePlatform } from "../platform";
import { useLanguage, useStrings } from "../preferences";
import { confirmAction, hapticNotification, showAlert } from "../telegram/webapp";
import type { Habit } from "../types/habit";
import { logOut, logOutOtherDevices, UnsentChangesError } from "../web/login";
import styles from "./SettingsScreen.module.css";

interface AccountScreenProps {
  /** The Telegram name the account is linked as. */
  label: string | null;
  /** As last loaded (null — not yet / no connection). */
  account: Account | null;
  habits: Habit[];
  /** Web app: logged out on this device — the app is a new guest. */
  onLoggedOut: () => void;
  /** The other devices were logged out — load the account again. */
  onLoggedOutEverywhere: () => void;
}

export function AccountScreen({
  label,
  account,
  habits,
  onLoggedOut,
  onLoggedOutEverywhere,
}: AccountScreenProps) {
  const strings = useStrings();
  const language = useLanguage();
  const web = usePlatform() === "web";
  const [busy, setBusy] = useState(false);

  const checkins = habits.reduce((sum, habit) => sum + habit.total_done, 0);
  const bestStreak = habits.reduce((best, habit) => Math.max(best, habit.best_streak), 0);
  // The web app counts itself among the devices: only the others are logged out.
  const canLogOutEverywhere = account !== null && account.devices > (web ? 1 : 0);

  async function confirmLogOut(everywhere: boolean): Promise<void> {
    const confirmed = await confirmAction({
      title: everywhere ? strings.accountLogoutEverywhereTitle : strings.accountLogoutTitle,
      message: everywhere
        ? web
          ? strings.accountLogoutOthersMessage
          : strings.accountLogoutEverywhereMessage
        : strings.accountLogoutMessage,
      confirmLabel: strings.accountLogoutConfirm,
      cancelLabel: strings.accountLogoutCancel,
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    setBusy(true);
    try {
      if (!everywhere) {
        await logOut();
        onLoggedOut();
        return;
      }
      await (web ? logOutOtherDevices() : logout(null, true));
      hapticNotification("success");
      setBusy(false);
      onLoggedOutEverywhere();
    } catch (caught) {
      hapticNotification("error");
      setBusy(false);
      void showAlert({
        title: strings.accountLogoutFailed,
        message:
          caught instanceof UnsentChangesError
            ? strings.accountLogoutUnsent
            : describeError(strings, caught, strings.accountActionFailed),
      });
    }
  }

  return (
    <Screen title={strings.accountTitle} withTabBar={false} enterAnimation>
      <div className={styles.settings}>
        <ListGroup footer={strings.accountFooter}>
          <ListItem icon={<PersonIcon />} iconColor="blue" label="Telegram">
            <span className={styles.value}>{label ?? ""}</span>
          </ListItem>
        </ListGroup>

        <ListGroup>
          <ListItem label={strings.accountCreated}>
            <span className={styles.value}>
              {account ? formatDate(account.created_at, language) : ""}
            </span>
          </ListItem>
          <ListItem label={strings.accountHabits}>
            <span className={styles.value}>{habits.length}</span>
          </ListItem>
          <ListItem label={strings.accountCheckins}>
            <span className={styles.value}>{checkins}</span>
          </ListItem>
          <ListItem label={strings.accountBestStreak}>
            <span className={styles.value}>{strings.accountDays(bestStreak)}</span>
          </ListItem>
        </ListGroup>

        <ListGroup
          footer={web ? strings.accountDevicesFooterWeb : strings.accountDevicesFooterTelegram}
        >
          <ListItem label={strings.accountDevices}>
            <span className={styles.value}>{account ? account.devices : ""}</span>
          </ListItem>
          {canLogOutEverywhere ? (
            <ListItem
              destructive
              disabled={busy}
              label={strings.accountLogoutEverywhere}
              onPress={() => void confirmLogOut(true)}
            />
          ) : null}
        </ListGroup>

        {web ? (
          <DestructiveButton
            label={strings.accountLogout}
            disabled={busy}
            onPress={() => void confirmLogOut(false)}
          />
        ) : null}
      </div>
    </Screen>
  );
}

/** «12 марта 2026 г.» / «March 12, 2026» in the device's time zone. */
function formatDate(iso: string, language: string): string {
  return new Intl.DateTimeFormat(language, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}
