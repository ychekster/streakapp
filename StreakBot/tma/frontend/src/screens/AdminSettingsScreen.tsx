/**
 * Вкладка «Настройки» админ-панели:
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

import { fetchAdmins, removeAdmin } from "../api/admin";
import { useAdminFormat } from "../adminFormat";
import { describeAdminError, useAdminStrings } from "../adminStrings";
import { ExitIcon, KeyIcon, PlusRowIcon } from "../components/AdminIcons";
import { ListGroup } from "../components/ListGroup";
import { ListItem } from "../components/ListItem";
import { LanguageRow, ThemeRow } from "../components/PreferenceRows";
import { Screen } from "../components/Screen";
import { Card, Section } from "../components/Section";
import { StatusMessage } from "../components/StatusMessage";
import { describeError } from "../errors";
import { useResource } from "../hooks/useResource";
import type { UseSettingsResult } from "../hooks/useSettings";
import { useStrings } from "../preferences";
import { confirmAction, hapticNotification } from "../telegram/webapp";
import type { AdminEntry } from "../types/admin";
import type { SettingsUpdate } from "../types/settings";
import styles from "./AdminSettingsScreen.module.css";

interface AdminSettingsScreenProps {
  /** Настройки пользователя (язык, тема) — общие с приложением. */
  settings: UseSettingsResult;
  onSaveSettings: (patch: SettingsUpdate) => void;
  /** Открыть экран добавления администратора. */
  onAddAdmin: () => void;
  onExit: () => void;
}

export function AdminSettingsScreen({
  settings,
  onSaveSettings,
  onAddAdmin,
  onExit,
}: AdminSettingsScreenProps) {
  const strings = useAdminStrings();
  const appStrings = useStrings();
  const format = useAdminFormat();
  const admins = useResource(fetchAdmins, "admins");
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

  function renderAdmins() {
    if (!admins.data) {
      return admins.status === "error" ? (
        <StatusMessage
          emoji={strings.errorEmoji}
          title={strings.errorTitle}
          description={describeAdminError(strings, admins.error, strings.adminsLoadFailed)}
          actionLabel={strings.retry}
          onAction={admins.reload}
        />
      ) : (
        <StatusMessage emoji={strings.loadingEmoji} title={strings.loading} />
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
