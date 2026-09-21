/**
 * Экран «Настройки» в стиле «Настроек» iOS: под заголовком — три белые карточки без
 * подписей над ними, у каждого ряда — иконка в цветной плашке.
 *  1. Часовой пояс (открывает выбор пояса с поиском по городу), язык и тема
 *     (светлая, тёмная или адаптивная — как в системе) — системными меню.
 *  2. «Отмечать за вчера» — переключатель и пояснение под карточкой.
 *  3. «Написать отзыв» — открывает диалог с полем для отзыва (см. ReviewDialog);
 *     политика конфиденциальности и условия использования — открывают документы.
 *
 * Настройки хранит App (от них зависят язык и тема всего приложения): изменение
 * применяется сразу и уходит на сервер, а если сервер его не принял — откатывается,
 * и под карточками появляется ошибка.
 */

import { useState } from "react";

import { Disclosure } from "../components/Disclosure";
import { ListGroup } from "../components/ListGroup";
import { ListItem } from "../components/ListItem";
import { MenuSelect } from "../components/MenuSelect";
import { ReviewDialog } from "../components/ReviewDialog";
import { Screen } from "../components/Screen";
import {
  CalendarBackIcon,
  ClockIcon,
  DocumentIcon,
  GlobeIcon,
  PaletteIcon,
  ShieldIcon,
  StarIcon,
} from "../components/SettingsIcons";
import { StatusMessage } from "../components/StatusMessage";
import { Switch } from "../components/Switch";
import { LANGUAGES, THEMES } from "../constants";
import { describeError } from "../errors";
import type { UseSettingsResult } from "../hooks/useSettings";
import { useStrings } from "../preferences";
import { LANGUAGE_NAMES } from "../strings";
import type { Language, SettingsUpdate, ThemePreference } from "../types/settings";
import styles from "./SettingsScreen.module.css";

/** Вложенные экраны настроек. */
export type SettingsPage = "timezone" | "privacy" | "terms";

const LANGUAGE_OPTIONS = LANGUAGES.map((language) => ({
  value: language,
  label: LANGUAGE_NAMES[language],
}));

interface SettingsScreenProps {
  state: UseSettingsResult;
  onSave: (patch: SettingsUpdate) => void;
  onOpen: (page: SettingsPage) => void;
}

export function SettingsScreen({ state, onSave, onOpen }: SettingsScreenProps) {
  const strings = useStrings();
  const { settings, status, error, saveError, reload } = state;
  const [reviewOpen, setReviewOpen] = useState(false);

  return (
    <Screen title={strings.settingsTitle}>
      {renderContent()}
      <ReviewDialog open={reviewOpen} onClose={() => setReviewOpen(false)} />
    </Screen>
  );

  function renderContent() {
    if (status === "loading") {
      return (
        <StatusMessage emoji={strings.settingsLoadingEmoji} title={strings.settingsLoading} />
      );
    }
    if (status === "error" || !settings) {
      return (
        <StatusMessage
          emoji={strings.errorEmoji}
          title={strings.errorTitle}
          description={describeError(strings, error, strings.settingsLoadFailed)}
          actionLabel={strings.errorRetry}
          onAction={reload}
        />
      );
    }

    const themeOptions = THEMES.map((theme) => ({
      value: theme,
      label: strings.themeNames[theme],
    }));

    return (
      <div className={styles.settings}>
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
          <ListItem icon={<GlobeIcon />} iconColor="orange" label={strings.settingsLanguage}>
            <MenuSelect<Language>
              options={LANGUAGE_OPTIONS}
              value={settings.language}
              onChange={(language) => onSave({ language })}
              label={strings.settingsLanguage}
            />
          </ListItem>
          <ListItem icon={<PaletteIcon />} iconColor="teal" label={strings.settingsTheme}>
            <MenuSelect<ThemePreference>
              options={themeOptions}
              value={settings.theme}
              onChange={(theme) => onSave({ theme })}
              label={strings.settingsTheme}
            />
          </ListItem>
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
            onPress={() => setReviewOpen(true)}
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

        {saveError ? (
          <p className={styles.error} role="alert">
            {describeError(strings, saveError, strings.settingsSaveFailed)}
          </p>
        ) : null}
      </div>
    );
  }
}
