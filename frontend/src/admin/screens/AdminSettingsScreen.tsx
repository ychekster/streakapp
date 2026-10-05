/**
 * Вкладка «Настройки» админ-панели:
 *  - Аналитика — пороги активации («в первые N дней отметил хотя бы в M разных дней»,
 *    по умолчанию 3 и 2) и вход в генератор ссылок с меткой (AdminLinksScreen);
 *  - Язык и тема — те же ряды, что в настройках приложения (PreferenceRows): настройки
 *    общие, поэтому смена сразу видна и в панели, и в приложении. Если сервер изменение не
 *    принял, оно откатывается, а под рядами появляется ошибка;
 *  - Администраторы — все, с именем и id (вы — с пометкой «Вы»). Нажатие на другого
 *    администратора — «Забрать права» системным диалогом Telegram; себя убрать нельзя
 *    (это делает другой администратор — так в списке всегда кто-то остаётся). «Добавить
 *    администратора» открывает экран с полем для id Telegram (см. AdminAddAdminScreen);
 *  - «Вернуться в приложение» — выход из админ-панели на экран настроек приложения.
 */

import { useState } from "react";

import { fetchAdmins, fetchAnalyticsConfig, removeAdmin, saveAnalyticsConfig } from "../../api/admin";
import { useAdminFormat } from "../adminFormat";
import { describeAdminError, useAdminStrings } from "../adminStrings";
import { ExitIcon, KeyIcon, PlusRowIcon } from "../components/AdminIcons";
import { Disclosure } from "../../components/Disclosure";
import { ListGroup } from "../../components/ListGroup";
import { ListItem } from "../../components/ListItem";
import { MenuSelect } from "../../components/MenuSelect";
import { LanguageRow, ThemeRow } from "../../components/PreferenceRows";
import { ACTIVATION_WINDOW_MAX_DAYS } from "../../constants";
import { Screen } from "../../components/Screen";
import { Card, Section } from "../../components/Section";
import { StatusMessage } from "../../components/StatusMessage";
import { describeError } from "../../errors";
import { useResource } from "../../hooks/useResource";
import type { UseSettingsResult } from "../../hooks/useSettings";
import { useStrings } from "../../preferences";
import { confirmAction, hapticNotification } from "../../telegram/webapp";
import type { AdminEntry } from "../../types/admin";
import type { SettingsUpdate } from "../../types/settings";
import styles from "./AdminSettingsScreen.module.css";

interface AdminSettingsScreenProps {
  /** Настройки пользователя (язык, тема) — общие с приложением. */
  settings: UseSettingsResult;
  onSaveSettings: (patch: SettingsUpdate) => void;
  /** Открыть экран добавления администратора. */
  onAddAdmin: () => void;
  /** Открыть генератор ссылок с меткой. */
  onOpenLinks: () => void;
  onExit: () => void;
}

export function AdminSettingsScreen({
  settings,
  onSaveSettings,
  onAddAdmin,
  onOpenLinks,
  onExit,
}: AdminSettingsScreenProps) {
  const strings = useAdminStrings();
  const appStrings = useStrings();
  const format = useAdminFormat();
  const admins = useResource(fetchAdmins, "admins");
  const analytics = useResource(fetchAnalyticsConfig, "analytics-config");
  const [configError, setConfigError] = useState<string | null>(null);

  async function saveActivation(windowDays: number, minDays: number): Promise<void> {
    setConfigError(null);
    const previous = analytics.data;
    analytics.setData((current) => ({
      ...current,
      activation_window_days: windowDays,
      activation_min_days: minDays,
    }));
    try {
      const saved = await saveAnalyticsConfig(windowDays, minDays);
      analytics.setData(() => saved);
    } catch (error) {
      if (previous) {
        analytics.setData(() => previous);
      }
      setConfigError(describeAdminError(strings, error, strings.an.activationSaveFailed));
      hapticNotification("error");
    }
  }
  const [busy, setBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const preferences = settings.settings;

  async function askToRemove(admin: AdminEntry): Promise<void> {
    setRemoveError(null);
    const confirmed = await confirmAction({
      title: strings.removeAdminTitle,
      message: strings.removeAdminMessage(format.userName(admin)),
      confirmLabel: strings.removeAdminConfirm,
      cancelLabel: strings.cancel,
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    setBusy(true);
    try {
      const updated = await removeAdmin(admin.telegram_id);
      admins.setData(() => updated);
      hapticNotification("success");
    } catch (error) {
      setRemoveError(describeAdminError(strings, error, strings.removeAdminFailed));
      hapticNotification("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title={strings.settingsTitle}>
      <div className={styles.settings}>
        {preferences ? (
          <div className={styles.block}>
            <ListGroup>
              <LanguageRow
                value={preferences.language}
                onChange={(language) => onSaveSettings({ language })}
              />
              <ThemeRow
                value={preferences.theme}
                onChange={(theme) => onSaveSettings({ theme })}
              />
            </ListGroup>
            {settings.saveError ? (
              <p className={styles.error} role="alert">
                {describeError(appStrings, settings.saveError, appStrings.settingsSaveFailed)}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className={styles.block}>{renderAnalytics()}</div>
        <div className={styles.block}>{renderAdmins()}</div>
        <div className={styles.block}>
          <ListGroup>
            <ListItem
              icon={<ExitIcon />}
              iconColor="graphite"
              label={strings.returnToApp}
              onPress={onExit}
            />
          </ListGroup>
        </div>
      </div>
    </Screen>
  );

  function renderAnalytics() {
    const an = strings.an;
    const config = analytics.data;
    const dayOptions = (max: number) =>
      Array.from({ length: max }, (_, index) => ({
        value: String(index + 1),
        label: an.daysValue(index + 1),
      }));
    return (
      <Section
        title={an.settingsHeading}
        footer={
          configError ? (
            <span className={styles.removeError}>{configError}</span>
          ) : config ? (
            an.activationFooter(config.activation_window_days, config.activation_min_days)
          ) : undefined
        }
      >
        <Card>
          {config ? (
            <>
              <ListItem label={an.activationWindow}>
                <MenuSelect
                  options={dayOptions(ACTIVATION_WINDOW_MAX_DAYS)}
                  value={String(config.activation_window_days)}
                  onChange={(value) => {
                    const days = Number(value);
                    void saveActivation(days, Math.min(days, config.activation_min_days));
                  }}
                  label={an.activationWindow}
                />
              </ListItem>
              <ListItem label={an.activationMin}>
                <MenuSelect
                  options={dayOptions(config.activation_window_days)}
                  value={String(config.activation_min_days)}
                  onChange={(value) => void saveActivation(config.activation_window_days, Number(value))}
                  label={an.activationMin}
                />
              </ListItem>
            </>
          ) : null}
          <ListItem label={an.linksRow} onPress={onOpenLinks}>
            <Disclosure />
          </ListItem>
        </Card>
      </Section>
    );
  }

  function renderAdmins() {
    if (!admins.data) {
      return admins.status === "error" ? (
        <StatusMessage
          icon="alert"
          title={strings.errorTitle}
          description={describeAdminError(strings, admins.error, strings.adminsLoadFailed)}
          actionLabel={strings.retry}
          onAction={admins.reload}
        />
      ) : (
        <StatusMessage icon="spinner" title={strings.loading} />
      );
    }
    return (
      <Section
        title={strings.adminsHeading}
        footer={
          removeError ? (
            <span className={styles.removeError}>{removeError}</span>
          ) : (
            strings.adminsFooter
          )
        }
      >
        <Card>
          {admins.data.map((admin) => (
            <ListItem
              key={admin.telegram_id}
              icon={<KeyIcon />}
              iconColor="indigo"
              label={format.userName(admin)}
              disabled={!admin.is_self && busy}
              onPress={admin.is_self ? undefined : () => void askToRemove(admin)}
            >
              <span className={styles.id}>{admin.is_self ? strings.you : admin.telegram_id}</span>
            </ListItem>
          ))}
          <ListItem
            icon={<PlusRowIcon />}
            iconColor="blue"
            label={strings.addAdmin}
            accent
            onPress={onAddAdmin}
          />
        </Card>
      </Section>
    );
  }
}
