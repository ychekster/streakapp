/**
 * Web app: Settings → «Аккаунт» of a linked account — the Telegram it is logged in with
 * and «Выйти из аккаунта». The place for the profile to grow into later.
 *
 * Logging out asks first, then the app continues as a new guest (web/login.ts logOut);
 * `onLoggedOut` reloads everything and returns to Settings.
 */

import { useState } from "react";

import { ListGroup } from "../components/ListGroup";
import { ListItem } from "../components/ListItem";
import { Screen } from "../components/Screen";
import { PersonIcon } from "../components/SettingsIcons";
import { describeError } from "../errors";
import { useStrings } from "../preferences";
import { confirmAction, hapticNotification } from "../telegram/webapp";
import { logOut } from "../web/login";
import styles from "./SettingsScreen.module.css";

interface AccountScreenProps {
  /** The Telegram name the account is linked as. */
  label: string | null;
  onLoggedOut: () => void;
}

export function AccountScreen({ label, onLoggedOut }: AccountScreenProps) {
  const strings = useStrings();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmLogOut(): Promise<void> {
    const confirmed = await confirmAction({
      title: strings.accountLogoutTitle,
      message: strings.accountLogoutMessage,
      confirmLabel: strings.accountLogoutConfirm,
      cancelLabel: strings.accountLogoutCancel,
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await logOut();
      onLoggedOut();
    } catch (caught) {
      hapticNotification("error");
      setError(describeError(strings, caught, strings.accountActionFailed));
      setBusy(false);
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
            onPress={() => void confirmLogOut()}
          />
        </ListGroup>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Screen>
  );
}
