/**
 * Web app: Settings → «Аккаунт» of a linked account — the Telegram it is logged in with,
 * «Выйти из аккаунта» and «Выйти на всех устройствах» (a lost phone: every web session of
 * the account ends). The place for the profile to grow into later.
 *
 * Logging out asks first, then the app continues as a new guest (web/login.ts logOut);
 * `onLoggedOut` reloads everything and returns to Settings. A failure is shown in a
 * dialog.
 */

import { useState } from "react";

import { ListGroup } from "../components/ListGroup";
import { ListItem } from "../components/ListItem";
import { Screen } from "../components/Screen";
import { PersonIcon } from "../components/SettingsIcons";
import { describeError } from "../errors";
import { useStrings } from "../preferences";
import { confirmAction, hapticNotification, showAlert } from "../telegram/webapp";
import { logOut, UnsentChangesError } from "../web/login";
import styles from "./SettingsScreen.module.css";

interface AccountScreenProps {
  /** The Telegram name the account is linked as. */
  label: string | null;
  onLoggedOut: () => void;
}

export function AccountScreen({ label, onLoggedOut }: AccountScreenProps) {
  const strings = useStrings();
  const [busy, setBusy] = useState(false);

  async function confirmLogOut(everywhere: boolean): Promise<void> {
    const confirmed = await confirmAction({
      title: everywhere ? strings.accountLogoutEverywhereTitle : strings.accountLogoutTitle,
      message: everywhere ? strings.accountLogoutEverywhereMessage : strings.accountLogoutMessage,
      confirmLabel: strings.accountLogoutConfirm,
      cancelLabel: strings.accountLogoutCancel,
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    setBusy(true);
    try {
      await logOut(everywhere);
      onLoggedOut();
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
          <ListItem
            destructive
            disabled={busy}
            label={strings.accountLogout}
            onPress={() => void confirmLogOut(false)}
          />
          <ListItem
            destructive
            disabled={busy}
            label={strings.accountLogoutEverywhere}
            onPress={() => void confirmLogOut(true)}
          />
        </ListGroup>
      </div>
    </Screen>
  );
}
