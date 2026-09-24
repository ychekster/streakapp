/**
 * Личное сообщение пользователю — экран поверх его профиля (см. ComposeScreen):
 * поле во весь экран и нижняя кнопка Telegram «Отправить».
 *
 * Отправляет бот (POST /admin/users/{id}/message). Если пользователь заблокировал бота
 * или ни разу его не запускал, сообщение не доставляется — причина встаёт под полем, а
 * текст остаётся на месте. После доставки экран это подтверждает, «Готово» возвращает в
 * профиль (он перечитывается — отметка «заблокировал бота» могла появиться).
 */

import { messageUser } from "../api/admin";
import { describeAdminError, useAdminStrings } from "../adminStrings";
import { ComposeScreen } from "../components/ComposeScreen";
import { MESSAGE_MAX_LENGTH } from "../constants";

interface AdminMessageScreenProps {
  telegramId: number;
  /** Имя получателя — в пояснении под полем. */
  name: string;
  onClose: () => void;
}

export function AdminMessageScreen({ telegramId, name, onClose }: AdminMessageScreenProps) {
  const strings = useAdminStrings();

  async function send(text: string): Promise<string | null> {
    try {
      const result = await messageUser(telegramId, text);
      return result.delivered ? null : strings.undelivered[result.reason ?? "bot_blocked"];
    } catch (error) {
      return describeAdminError(strings, error, strings.messageFailed);
    }
  }

  return (
    <ComposeScreen
      title={strings.messageTitle}
      description={strings.messageDescription(name)}
      placeholder={strings.messagePlaceholder}
      sendLabel={strings.send}
      maxLength={MESSAGE_MAX_LENGTH}
      onSend={send}
      onClose={onClose}
      done={{
        icon: "check",
        title: strings.messageSentTitle,
        message: strings.messageSentMessage,
        label: strings.done,
      }}
    />
  );
}
