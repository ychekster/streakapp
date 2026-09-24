/**
 * Новый администратор — экран поверх настроек админ-панели (см. ComposeScreen): поле
 * для Telegram ID с цифровой клавиатурой и нижняя кнопка Telegram «Добавить».
 *
 * Права выдаются сразу (POST /admin/admins), после чего экран закрывается — обновлённый
 * список виден в настройках. Непохожий на id ввод и отказ сервера объясняются под полем.
 */

import { addAdmin } from "../api/admin";
import { describeAdminError, useAdminStrings } from "../adminStrings";
import { ComposeScreen } from "../components/ComposeScreen";

// Самый длинный id Telegram (в цифрах) — с запасом: сейчас они 10-значные.
const TELEGRAM_ID_MAX_DIGITS = 16;

interface AdminAddAdminScreenProps {
  onClose: () => void;
}

export function AdminAddAdminScreen({ onClose }: AdminAddAdminScreenProps) {
  const strings = useAdminStrings();

  async function send(text: string): Promise<string | null> {
    const telegramId = Number(text);
    if (!/^\d+$/.test(text) || !Number.isSafeInteger(telegramId) || telegramId < 1) {
      return strings.addAdminInvalid;
    }
    try {
      await addAdmin(telegramId);
      return null;
    } catch (error) {
      return describeAdminError(strings, error, strings.addAdminFailed);
    }
  }

  return (
    <ComposeScreen
      title={strings.addAdminTitle}
      description={strings.addAdminDescription}
      placeholder={strings.addAdminPlaceholder}
      sendLabel={strings.add}
      maxLength={TELEGRAM_ID_MAX_DIGITS}
      numeric
      onSend={send}
      onClose={onClose}
    />
  );
}
