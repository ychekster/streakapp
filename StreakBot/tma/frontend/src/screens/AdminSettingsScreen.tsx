/**
 * Вкладка «Настройки» админ-панели:
 *  - Администраторы — все, с именем и id (вы — с пометкой «Вы»). Нажатие на другого
 *    администратора — диалог «Убрать администратора»; себя убрать нельзя (это делает
 *    другой администратор — так в списке всегда кто-то остаётся). «Добавить» — диалог
 *    с полем для id Telegram;
 *  - «Вернуться в приложение» — выход из админ-панели на экран настроек приложения.
 */

import { useState } from "react";

import { addAdmin, fetchAdmins, removeAdmin } from "../api/admin";
import { userName } from "../adminFormat";
import { ADMIN_STRINGS as S, describeAdminError } from "../adminStrings";
import { ExitIcon, KeyIcon, PlusRowIcon } from "../components/AdminIcons";
import { ComposeDialog } from "../components/ComposeDialog";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ListGroup } from "../components/ListGroup";
import { ListItem } from "../components/ListItem";
import { Screen } from "../components/Screen";
import { Card, Section } from "../components/Section";
import { StatusMessage } from "../components/StatusMessage";
import { useResource } from "../hooks/useResource";
import { hapticNotification } from "../telegram/webapp";
import type { AdminEntry } from "../types/admin";
import styles from "./AdminSettingsScreen.module.css";

// Самый длинный id Telegram (в цифрах) — с запасом: сейчас они 10-значные.
const TELEGRAM_ID_MAX_DIGITS = 16;

interface AdminSettingsScreenProps {
  onExit: () => void;
}

export function AdminSettingsScreen({ onExit }: AdminSettingsScreenProps) {
  const admins = useResource(fetchAdmins, "admins");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<AdminEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  async function add(text: string): Promise<string | null> {
    const telegramId = Number(text);
    if (!/^\d+$/.test(text) || !Number.isSafeInteger(telegramId) || telegramId < 1) {
      return S.addAdminInvalid;
    }
    try {
      const updated = await addAdmin(telegramId);
      admins.setData(() => updated);
      return null;
    } catch (error) {
      return describeAdminError(error, S.addAdminFailed);
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
      setRemoveError(describeAdminError(error, S.removeAdminFailed));
      hapticNotification("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title={S.settingsTitle}>
      <div className={styles.settings}>
        {renderAdmins()}
        <div className={styles.exit}>
          <ListGroup>
            <ListItem icon={<ExitIcon />} iconColor="graphite" label={S.returnToApp} onPress={onExit} />
          </ListGroup>
        </div>
      </div>
      <ComposeDialog
        open={adding}
        title={S.addAdminTitle}
        message={S.addAdminMessage}
        placeholder={S.addAdminPlaceholder}
        cancelLabel={S.cancel}
        sendLabel={S.add}
        maxLength={TELEGRAM_ID_MAX_DIGITS}
        numeric
        onSend={add}
        onClose={() => setAdding(false)}
      />
      <ConfirmDialog
        open={removing !== null}
        title={S.removeAdminTitle}
        message={removeError ?? S.removeAdminMessage(removing ? userName(removing) : "")}
        cancelLabel={S.cancel}
        confirmLabel={S.removeAdminConfirm}
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
          emoji={S.errorEmoji}
          title={S.errorTitle}
          description={describeAdminError(admins.error, S.adminsLoadFailed)}
          actionLabel={S.retry}
          onAction={admins.reload}
        />
      ) : (
        <StatusMessage emoji={S.loadingEmoji} title={S.loading} />
      );
    }
    return (
      <Section title={S.adminsHeading} footer={S.adminsFooter}>
        <Card>
          {admins.data.map((admin) => (
            <ListItem
              key={admin.telegram_id}
              icon={<KeyIcon />}
              iconColor="indigo"
              label={userName(admin)}
              onPress={
                admin.is_self
                  ? undefined
                  : () => {
                      setRemoveError(null);
                      setRemoving(admin);
                    }
              }
            >
              <span className={styles.id}>{admin.is_self ? S.you : admin.telegram_id}</span>
            </ListItem>
          ))}
          <ListItem
            icon={<PlusRowIcon />}
            iconColor="blue"
            label={S.addAdmin}
            accent
            onPress={() => setAdding(true)}
          />
        </Card>
      </Section>
    );
  }
}
