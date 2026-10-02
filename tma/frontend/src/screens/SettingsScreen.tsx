/**
 * Экран «Настройки» в стиле «Настроек» iOS: под заголовком — три белые карточки без
 * подписей над ними, у каждого ряда — иконка в цветной плашке.
 *  1. Часовой пояс (открывает выбор пояса с поиском по городу), язык и тема
 *     (светлая, тёмная или адаптивная — как в системе) — системными меню.
 *  2. «Отмечать за вчера» — переключатель и пояснение под карточкой.
 *  3. «Написать отзыв» — открывает экран с полем для отзыва (см. ReviewScreen);
 *     политика конфиденциальности и условия использования — открывают документы.
 *  4. «Админ-панель» — только у администраторов: переключает приложение в режим
 *     админ-панели (см. AdminApp).
 *
 * Above them (spec §7): «Аккаунт» — logins of the account (AccountScreen), in both the
 * Mini App and the web app; «Установить на рабочий стол» — only in Telegram: opens the
 * install page in the phone's browser with a single-use login link.
 *
 * Настройки хранит App (от них зависят язык и тема всего приложения): изменение
 * применяется сразу и уходит на сервер, а если сервер его не принял — откатывается,
 * и под карточками появляется ошибка.
 */

import { Disclosure } from "../components/Disclosure";
import { ListGroup } from "../components/ListGroup";
import { ListItem } from "../components/ListItem";
import { LanguageRow, ThemeRow } from "../components/PreferenceRows";
import { Screen } from "../components/Screen";
import {
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
import type { UseSettingsResult } from "../hooks/useSettings";
import { useStrings } from "../preferences";
import type { SettingsUpdate } from "../types/settings";
import styles from "./SettingsScreen.module.css";

/** Вложенные экраны настроек. */
export type SettingsPage = "timezone" | "review" | "privacy" | "terms" | "account" | "install";

interface SettingsScreenProps {
  state: UseSettingsResult;
  onSave: (patch: SettingsUpdate) => void;
  onOpen: (page: SettingsPage) => void;
  /** Войти в админ-панель (ряд виден только администраторам). */
  onOpenAdmin: () => void;
  /** Install link (Telegram only; null — the row is hidden: the web app is installed). */
  install: HandoffLink | null;
  /** The web account is still a guest (shown next to «Аккаунт»). */
  guest: boolean;
}

export function SettingsScreen({
  state,
  onSave,
  onOpen,
  onOpenAdmin,
  install,
  guest,
}: SettingsScreenProps) {
  const strings = useStrings();
  const { settings, status, error, saveError, reload } = state;

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
        <ListGroup>
          <ListItem
            icon={<PersonIcon />}
            iconColor="blue"
            label={strings.settingsAccount}
            onPress={() => onOpen("account")}
          >
            {guest ? <span className={styles.value}>{strings.settingsAccountGuest}</span> : null}
            <Disclosure />
          </ListItem>
          {install ? (
            <ListItem
              icon={<InstallIcon />}
              iconColor="teal"
              label={strings.settingsInstall}
              onPress={install.ready ? install.open : () => onOpen("install")}
            >
              <Disclosure />
            </ListItem>
          ) : null}
        </ListGroup>

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

        {saveError ? (
          <p className={styles.error} role="alert">
            {describeError(strings, saveError, strings.settingsSaveFailed)}
          </p>
        ) : null}
      </div>
    );
  }
}
