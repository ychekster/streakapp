/**
 * Экран «Настройки» в стиле «Настроек» iOS: под заголовком — белые карточки без
 * подписей над ними, у каждого ряда — иконка в цветной плашке.
 *  0. Web app only: «Аккаунт». A guest sees «Не привязан» with a red «!» (the Settings
 *     tab has it too) and a footer; a tap opens the bot to link Telegram — the only
 *     login. Linked — the Telegram name; a tap opens the account (AccountScreen: log out).
 *  1. Часовой пояс (открывает выбор пояса с поиском по городу), язык и тема
 *     (светлая, тёмная или системная — как в системе) — системными меню; «Напоминать
 *     отмечать» — время или «Выкл.», открывает CheckinReminderScreen. Under them:
 *     in Telegram «Добавить на рабочий стол» (opens the install page in the phone's
 *     browser with a single-use login link, so the installed app opens this account);
 *     in the web app «Уведомления» — a switch (usePushToggle).
 *  2. «Отмечать за вчера» — переключатель и пояснение под карточкой.
 *  3. «Написать отзыв» — открывает экран с полем для отзыва (см. ReviewScreen);
 *     политика конфиденциальности и условия использования — открывают документы.
 *  4. «Админ-панель» — только у администраторов: переключает приложение в режим
 *     админ-панели (см. AdminApp).
 *
 * Настройки хранит App (от них зависят язык и тема всего приложения): изменение
 * применяется сразу и уходит на сервер, а если сервер его не принял — откатывается,
 * и App показывает ошибку окошком.
 */

import { AttentionBadge } from "../components/AttentionBadge";
import { Disclosure } from "../components/Disclosure";
import { ListGroup } from "../components/ListGroup";
import { ListItem } from "../components/ListItem";
import { LanguageRow, ThemeRow } from "../components/PreferenceRows";
import { Screen } from "../components/Screen";
import {
  AlarmIcon,
  BellIcon,
  CalendarBackIcon,
  ClockIcon,
  DocumentIcon,
  InstallIcon,
  PersonIcon,
  ShieldIcon,
  SlidersIcon,
  StarIcon,
} from "../components/SettingsIcons";
import { StatusMessage } from "../components/StatusMessage";
import { Switch } from "../components/Switch";
import { describeError } from "../errors";
import type { HandoffLink } from "../hooks/useHandoffLink";
import { usePushToggle } from "../hooks/usePushToggle";
import type { UseSettingsResult } from "../hooks/useSettings";
import { usePlatform } from "../platform";
import { useStrings } from "../preferences";
import type { SettingsUpdate } from "../types/settings";
import styles from "./SettingsScreen.module.css";

/** Вложенные экраны настроек. */
export type SettingsPage =
  | "timezone"
  | "checkinReminder"
  | "review"
  | "privacy"
  | "terms"
  | "install"
  | "account";

/** Web app: the account in the «Аккаунт» row. */
export interface AccountState {
  guest: boolean;
  /** The Telegram name it is linked as. */
  label: string | null;
}

interface SettingsScreenProps {
  state: UseSettingsResult;
  onSave: (patch: SettingsUpdate) => void;
  onOpen: (page: SettingsPage) => void;
  /** Войти в админ-панель (ряд виден только администраторам). */
  onOpenAdmin: () => void;
  /** Install link (Telegram only; null — the row is hidden: the web app is installed). */
  install: HandoffLink | null;
  /** Web app: the account (null — inside Telegram, or not loaded yet). */
  account: AccountState | null;
  /** Web app: link Telegram (opens the bot). */
  onLinkTelegram: () => void;
}

export function SettingsScreen({
  state,
  onSave,
  onOpen,
  onOpenAdmin,
  install,
  account,
  onLinkTelegram,
}: SettingsScreenProps) {
  const strings = useStrings();
  const { settings, status, error, reload } = state;
  const web = usePlatform() === "web";
  const push = usePushToggle(web);

  return <Screen title={strings.settingsTitle}>{renderContent()}</Screen>;

  function renderContent() {
    if (status === "loading") {
      return (
        <StatusMessage icon="spinner" title={strings.settingsLoading} />
      );
    }
    if (status === "error" || !settings) {
      return (
        <StatusMessage
          icon="alert"
          title={strings.errorTitle}
          description={describeError(strings, error, strings.settingsLoadFailed)}
          actionLabel={strings.errorRetry}
          onAction={reload}
        />
      );
    }

    return (
      <div className={styles.settings}>
        {account ? (
          <ListGroup footer={account.guest ? strings.settingsAccountFooter : undefined}>
            <ListItem
              icon={<PersonIcon />}
              iconColor="blue"
              label={strings.settingsAccount}
              onPress={account.guest ? onLinkTelegram : () => onOpen("account")}
            >
              {account.guest ? (
                <>
                  <span className={styles.value}>{strings.settingsAccountGuest}</span>
                  <AttentionBadge />
                </>
              ) : (
                <span className={styles.value}>{account.label ?? "Telegram"}</span>
              )}
              <Disclosure />
            </ListItem>
          </ListGroup>
        ) : null}

        <ListGroup>
          <ListItem
            icon={<ClockIcon />}
            iconColor="blue"
            label={strings.settingsTimezone}
            onPress={() => onOpen("timezone")}
          >
            <span className={styles.value}>
              {settings.timezone_display ?? strings.settingsTimezoneNone}
            </span>
            <Disclosure />
          </ListItem>
          <LanguageRow value={settings.language} onChange={(language) => onSave({ language })} />
          <ThemeRow value={settings.theme} onChange={(theme) => onSave({ theme })} />
          <ListItem
            icon={<AlarmIcon />}
            iconColor="purple"
            label={strings.settingsCheckinReminder}
            onPress={() => onOpen("checkinReminder")}
          >
            <span className={styles.value}>
              {settings.checkin_reminder_time ?? strings.settingsCheckinReminderOff}
            </span>
            <Disclosure />
          </ListItem>
          {install ? (
            <ListItem
              icon={<InstallIcon />}
              iconColor="indigo"
              label={strings.settingsInstall}
              onPress={install.ready ? install.open : () => onOpen("install")}
            >
              <Disclosure />
            </ListItem>
          ) : null}
          {web ? (
            <ListItem icon={<BellIcon />} iconColor="red" label={strings.notificationsRow}>
              <Switch checked={push.on} onChange={push.change} label={strings.notificationsRow} />
            </ListItem>
          ) : null}
        </ListGroup>

        <ListGroup footer={strings.settingsMarkYesterdayFooter}>
          <ListItem
            icon={<CalendarBackIcon />}
            iconColor="green"
            label={strings.settingsMarkYesterday}
          >
            <Switch
              checked={settings.mark_yesterday}
              onChange={(markYesterday) => onSave({ mark_yesterday: markYesterday })}
              label={strings.settingsMarkYesterday}
            />
          </ListItem>
        </ListGroup>

        <ListGroup>
          <ListItem
            icon={<StarIcon />}
            iconColor="red"
            label={strings.settingsReview}
            onPress={() => onOpen("review")}
          >
            <Disclosure />
          </ListItem>
          <ListItem
            icon={<ShieldIcon />}
            iconColor="indigo"
            label={strings.privacyPolicy.title}
            onPress={() => onOpen("privacy")}
          >
            <Disclosure />
          </ListItem>
          <ListItem
            icon={<DocumentIcon />}
            iconColor="graphite"
            label={strings.termsOfUse.title}
            onPress={() => onOpen("terms")}
          >
            <Disclosure />
          </ListItem>
        </ListGroup>

        {settings.is_admin ? (
          <ListGroup>
            <ListItem
              icon={<SlidersIcon />}
              iconColor="purple"
              label={strings.settingsAdminPanel}
              onPress={onOpenAdmin}
            >
              <Disclosure />
            </ListItem>
          </ListGroup>
        ) : null}
      </div>
    );
  }
}
