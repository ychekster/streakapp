/**
 * Вкладка «Настройки» админ-панели:
 *  - Язык и тема — те же ряды, что в настройках приложения (PreferenceRows): настройки
 *    общие, поэтому смена сразу видна и в панели, и в приложении. Если сервер изменение не
 *    принял, оно откатывается, а под рядами появляется ошибка;
 *  - Администраторы — все, с именем и id (вы — с пометкой «Вы»). Нажатие на другого
 *    администратора — диалог «Забрать права»; себя убрать нельзя (это делает другой
 *    администратор — так в списке всегда кто-то остаётся). «Добавить администратора» —
 *    диалог с полем для id Telegram;
 *  - «Вернуться в приложение» — выход из админ-панели на экран настроек приложения.
 */

import { useState } from "react";

import { addAdmin, fetchAdmins, removeAdmin } from "../api/admin";
import { useAdminFormat } from "../adminFormat";
import { describeAdminError, useAdminStrings } from "../adminStrings";
import { ExitIcon, KeyIcon, PlusRowIcon } from "../components/AdminIcons";
import { ComposeDialog } from "../components/ComposeDialog";
import { ConfirmDialog } from "../components/ConfirmDialog";
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
import { hapticNotification } from "../telegram/webapp";
import type { AdminEntry } from "../types/admin";
import type { SettingsUpdate } from "../types/settings";
import styles from "./AdminSettingsScreen.module.css";

// Самый длинный id Telegram (в цифрах) — с запасом: сейчас они 10-значные.
const TELEGRAM_ID_MAX_DIGITS = 16;

interface AdminSettingsScreenProps {
  /** Настройки пользователя (язык, тема) — общие с приложением. */
  settings: UseSettingsResult;
  onSaveSettings: (patch: SettingsUpdate) => void;
  onExit: () => void;
}

export function AdminSettingsScreen({ settings, onSaveSettings, onExit }: AdminSettingsScreenProps) {
  const strings = useAdminStrings();
  const appStrings = useStrings();
  const format = useAdminFormat();
  const admins = useResource(fetchAdmins, "admins");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<AdminEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const preferences = settings.settings;

  async function add(text: string): Promise<string | null> {
    const telegramId = Number(text);
    if (!/^\d+$/.test(text) || !Number.isSafeInteger(telegramId) || telegramId < 1) {
      return strings.addAdminInvalid;
    }
    try {
      const updated = await addAdmin(telegramId);
      admins.setData(() => updated);
      return null;
    } catch (error) {
      return describeAdminError(strings, error, strings.addAdminFailed);
    }
  }

  async function confirmRemove(): Promise<void> {
    if (!removing) {
      return;
    }
    setBusy(true);
    setRemoveError(null);
    try {
      const updated = await removeAdmin(removing.telegram_id);
      admins.setData(() => updated);
      hapticNotification("success");
      setRemoving(null);
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
      <ComposeDialog
        open={adding}
        title={strings.addAdminTitle}
        message={strings.addAdminMessage}
        placeholder={strings.addAdminPlaceholder}
        cancelLabel={strings.cancel}
        sendLabel={strings.add}
        maxLength={TELEGRAM_ID_MAX_DIGITS}
        numeric
        onSend={add}
        onClose={() => setAdding(false)}
      />
      <ConfirmDialog
        open={removing !== null}
        title={strings.removeAdminTitle}
        message={removeError ?? strings.removeAdminMessage(removing ? format.userName(removing) : "")}
        cancelLabel={strings.cancel}
        confirmLabel={strings.removeAdminConfirm}
        destructive
        busy={busy}
        onCancel={() => setRemoving(null)}
        onConfirm={() => void confirmRemove()}
      />
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
      <Section title={strings.adminsHeading} footer={strings.adminsFooter}>
        <Card>
          {admins.data.map((admin) => (
            <ListItem
              key={admin.telegram_id}
              icon={<KeyIcon />}
              iconColor="indigo"
              label={format.userName(admin)}
              onPress={
                admin.is_self
                  ? undefined
                  : () => {
                      setRemoveError(null);
                      setRemoving(admin);
                    }
              }
            >
              <span className={styles.id}>{admin.is_self ? strings.you : admin.telegram_id}</span>
            </ListItem>
          ))}
          <ListItem
            icon={<PlusRowIcon />}
            iconColor="blue"
            label={strings.addAdmin}
            accent
            onPress={() => setAdding(true)}
          />
        </Card>
      </Section>
    );
  }
}
