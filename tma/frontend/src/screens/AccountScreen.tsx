/**
 * Settings → «Аккаунт» (spec 7.2): the account's logins — Telegram and Google — each
 * linked (with the name or e-mail) or with «Привязать». Tapping a linked login offers to
 * unlink it, unless it is the only one. In the installed app there is also the state of
 * notifications and a test button.
 *
 * - Web app: Telegram links through the bot (confirm there, come back — the screen picks
 *   it up by itself) or Telegram's website login; Google — a redirect and back.
 * - Mini App: Telegram is the login in use; Google finishes in the phone's browser
 *   (Google does not allow its login inside Telegram), and the screen refreshes when the
 *   user comes back.
 *
 * Linking may switch the app to another account or merge two (accounts.py on the
 * server); then `onAccountChanged` reloads habits and settings.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchAccount,
  fetchPushStatus,
  fetchWebConfig,
  sendTestPush,
  unlinkLogin,
  type Account,
  type LoginProvider,
} from "../api/web";
import { ListGroup } from "../components/ListGroup";
import { ListItem } from "../components/ListItem";
import { Screen } from "../components/Screen";
import { BellIcon, GoogleIcon, TelegramIcon } from "../components/SettingsIcons";
import { StatusMessage } from "../components/StatusMessage";
import { TELEGRAM_LOGIN_POLL_LIMIT_MS, TELEGRAM_LOGIN_POLL_MS } from "../constants";
import { describeError } from "../errors";
import { usePlatform } from "../platform";
import { useStrings } from "../preferences";
import { confirmAction, hapticNotification } from "../telegram/webapp";
import { takeAuthNotice } from "../web/bootstrap";
import {
  applyLinkResult,
  beginGoogleLogin,
  beginTelegramBotLogin,
  checkTelegramBotLogin,
  hasPendingTelegramLogin,
  telegramWebLoginUrl,
} from "../web/login";
import { pushPermission } from "../web/push";
import styles from "./AccountScreen.module.css";

interface AccountScreenProps {
  /** The app switched to another account or merged: reload habits and settings. */
  onAccountChanged: () => void;
}

type Message = { kind: "info" | "error"; text: string } | null;

export function AccountScreen({ onAccountChanged }: AccountScreenProps) {
  const strings = useStrings();
  const platform = usePlatform();
  const web = platform === "web";
  const [account, setAccount] = useState<Account | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [botId, setBotId] = useState<number | null>(null);
  const [pushOn, setPushOn] = useState(false);
  const pollStarted = useRef(0);

  const describe = useCallback(
    (error: unknown) => describeError(strings, error, strings.accountActionFailed),
    [strings],
  );

  const load = useCallback(async () => {
    try {
      setAccount(await fetchAccount());
      setFailed(false);
    } catch {
      setFailed(true);
    }
    if (web) {
      fetchPushStatus()
        .then((status) => setPushOn(status.subscribed && pushPermission() === "granted"))
        .catch(() => undefined);
    }
  }, [web]);

  // A login that finished outside this screen (bootstrap: Google, website login).
  useEffect(() => {
    const notice = takeAuthNotice();
    if (notice?.kind === "linked") {
      setMessage({ kind: "info", text: strings.accountLinkedNotice });
    } else if (notice?.kind === "error") {
      const text =
        strings.authErrors[notice.code] ??
        strings.apiErrors[notice.code as keyof typeof strings.apiErrors] ??
        strings.accountActionFailed;
      setMessage({ kind: "error", text });
    }
    void load();
    if (web) {
      fetchWebConfig()
        .then((config) => setBotId(config.telegram_bot_id))
        .catch(() => undefined);
    }
    // Once per opening of the screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check the bot login: done → the account may have changed.
  const checkBotLogin = useCallback(async () => {
    try {
      const result = await checkTelegramBotLogin();
      if (result) {
        hapticNotification("success");
        setAccount(result.account);
        setMessage({ kind: "info", text: strings.accountLinkedNotice });
        onAccountChanged();
      }
    } catch (error) {
      setMessage({ kind: "error", text: describe(error) });
    }
  }, [describe, onAccountChanged, strings.accountLinkedNotice]);

  // Coming back to the app (from Telegram or the browser): refresh, pick up logins.
  useEffect(() => {
    const onVisible = (): void => {
      if (document.visibilityState !== "visible") {
        return;
      }
      if (web && hasPendingTelegramLogin()) {
        void checkBotLogin();
      } else {
        void load();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [checkBotLogin, load, web]);

  // While a bot login waits, ask the server every few seconds.
  useEffect(() => {
    if (!web) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      if (!hasPendingTelegramLogin()) {
        return;
      }
      if (Date.now() - pollStarted.current > TELEGRAM_LOGIN_POLL_LIMIT_MS) {
        return;
      }
      void checkBotLogin();
    }, TELEGRAM_LOGIN_POLL_MS);
    return () => window.clearInterval(timer);
  }, [checkBotLogin, web]);

  async function run(action: () => Promise<void>): Promise<void> {
    if (busy) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (error) {
      hapticNotification("error");
      setMessage({ kind: "error", text: describe(error) });
    } finally {
      setBusy(false);
    }
  }

  function linkTelegram(): void {
    void run(async () => {
      pollStarted.current = Date.now();
      await beginTelegramBotLogin();
      setMessage({ kind: "info", text: strings.accountWaitingTelegram });
    });
  }

  function linkGoogle(): void {
    void run(async () => {
      await beginGoogleLogin();
      if (!web) {
        setMessage({ kind: "info", text: strings.accountWaitingGoogle });
      }
    });
  }

  async function unlink(provider: LoginProvider): Promise<void> {
    const confirmed = await confirmAction({
      title: strings.accountUnlinkTitle,
      message: strings.accountUnlinkMessage,
      confirmLabel: strings.accountUnlink,
      cancelLabel: strings.accountUnlinkCancel,
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    await run(async () => {
      const result = await unlinkLogin(provider);
      applyLinkResult(result);
      setAccount(result.account);
      if (provider === "telegram") {
        onAccountChanged();
      }
    });
  }

  function testPush(): void {
    void run(async () => {
      await sendTestPush();
      setMessage({ kind: "info", text: strings.notificationsTestSent });
    });
  }

  return <Screen title={strings.accountTitle} withTabBar={false} enterAnimation>{renderContent()}</Screen>;

  function renderContent() {
    if (!account) {
      return failed ? (
        <StatusMessage
          icon="alert"
          title={strings.errorTitle}
          description={strings.accountLoadFailed}
          actionLabel={strings.errorRetry}
          onAction={() => void load()}
        />
      ) : (
        <StatusMessage icon="spinner" title={strings.accountLoading} />
      );
    }
    const linkedCount = account.logins.filter((login) => login.linked).length;
    const telegram = account.logins.find((login) => login.provider === "telegram");
    const google = account.logins.find((login) => login.provider === "google");
    // Inside Telegram, Telegram is the login in use: it cannot be unlinked there.
    const canUnlink = (provider: LoginProvider) =>
      linkedCount > 1 && (web || provider !== "telegram");

    const row = (
      provider: LoginProvider,
      label: string,
      icon: JSX.Element,
      iconColor: "lightblue" | "red",
      state: { linked: boolean; label: string | null } | undefined,
      onLink: () => void,
    ) => (
      <ListItem
        icon={icon}
        iconColor={iconColor}
        label={label}
        disabled={busy}
        onPress={
          state?.linked
            ? canUnlink(provider)
              ? () => void unlink(provider)
              : undefined
            : onLink
        }
      >
        {state?.linked ? (
          <span className={styles.value}>{state.label ?? label}</span>
        ) : (
          <span className={styles.link}>{strings.accountLink}</span>
        )}
      </ListItem>
    );

    return (
      <div className={styles.account}>
        <ListGroup footer={account.is_guest ? strings.accountGuestFooter : strings.accountLinkedFooter}>
          {row("telegram", strings.accountTelegram, <TelegramIcon />, "lightblue", telegram, linkTelegram)}
          {web && !telegram?.linked && botId !== null ? (
            <ListItem
              accent
              disabled={busy}
              label={strings.accountTelegramWeb}
              onPress={() => {
                window.location.href = telegramWebLoginUrl(botId);
              }}
            />
          ) : null}
          {account.google_available || google?.linked
            ? row("google", strings.accountGoogle, <GoogleIcon />, "red", google, linkGoogle)
            : null}
        </ListGroup>

        {web ? (
          <ListGroup
            footer={pushPermission() === "denied" ? strings.notificationsDenied : strings.notificationsFooter}
          >
            <ListItem icon={<BellIcon />} iconColor="orange" label={strings.notificationsRow}>
              <span className={styles.value}>
                {pushOn ? strings.notificationsOn : strings.notificationsOff}
              </span>
            </ListItem>
            {pushOn ? (
              <ListItem accent disabled={busy} label={strings.notificationsTest} onPress={testPush} />
            ) : null}
          </ListGroup>
        ) : null}

        {message ? (
          <p
            className={message.kind === "error" ? styles.error : styles.info}
            role={message.kind === "error" ? "alert" : "status"}
          >
            {message.text}
          </p>
        ) : null}
      </div>
    );
  }
}
