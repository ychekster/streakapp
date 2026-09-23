/**
 * Экран написания текста и его отправки: отзыв из настроек, сообщение пользователю,
 * ответ на отзыв и id нового администратора в админ-панели.
 *
 * Полноценный экран, а не диалог поверх содержимого: поле занимает всю ширину и растёт
 * вместе с текстом, нижняя навигация убрана, а отправляет нижняя кнопка Telegram
 * (`MainButton`) — нативная, она сама встаёт над клавиатурой. Пока в поле пусто, кнопка
 * серая и неактивна; во время отправки в ней крутится спиннер.
 *
 * Если отправить не вышло, причина встаёт под полем, а текст остаётся на месте. После
 * успеха экран либо закрывается сразу, либо (с `done`) показывает подтверждение, и
 * нижняя кнопка становится «Готово» — она и закрывает экран. Закрыть экран, ничего не
 * отправив, можно кнопкой «Назад» Telegram (её ставит владелец экрана).
 */

import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { useMainButton } from "../hooks/useMainButton";
import { useResolvedTheme } from "../preferences";
import { hapticNotification } from "../telegram/webapp";
import { readRootVariable } from "../theme";
import { ListItem } from "./ListItem";
import { Screen } from "./Screen";
import { Card } from "./Section";
import { StatusMessage } from "./StatusMessage";
import styles from "./ComposeScreen.module.css";

/** Подтверждение после отправки. */
interface ComposeDone {
  emoji: string;
  title: string;
  message: string;
  /** Подпись нижней кнопки, закрывающей экран. */
  label: string;
}

interface ComposeScreenProps {
  /** Крупный заголовок экрана. */
  title: string;
  /** Пояснение под полем: что произойдёт с текстом. */
  description: string;
  placeholder: string;
  /** Подпись нижней кнопки Telegram. */
  sendLabel: string;
  maxLength: number;
  /** Однострочное поле с цифровой клавиатурой вместо многострочного (Telegram ID). */
  numeric?: boolean;
  /** Отправить текст (без пробелов по краям). null — отправлено; строка — почему нет. */
  onSend: (text: string) => Promise<string | null>;
  /** Закрыть экран (после отправки или «Готово» в подтверждении). */
  onClose: () => void;
  /** Подтверждение после отправки; без него экран сразу закрывается. */
  done?: ComposeDone;
}

export function ComposeScreen({
  title,
  description,
  placeholder,
  sendLabel,
  maxLength,
  numeric = false,
  onSend,
  onClose,
  done,
}: ComposeScreenProps) {
  const theme = useResolvedTheme();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  // Отправка уже идёт: `busy` обновится только со следующим рендером, а второе быстрое
  // нажатие нижней кнопки отправило бы текст дважды.
  const busyRef = useRef(false);

  // Экран подтверждения вместо поля (только если отправка удалась и `done` задан).
  const success: ComposeDone | null = sent && done ? done : null;
  const ready = success !== null || text.trim() !== "";

  // Цвета нижней кнопки — из дизайн-токенов (Telegram понимает только «#RRGGBB»); у
  // тёмной темы они свои, поэтому при её смене перечитываются.
  const buttonColors = useMemo(
    () =>
      ready
        ? {
            color: readRootVariable("--color-accent"),
            textColor: readRootVariable("--color-on-habit"),
          }
        : {
            color: readRootVariable("--main-button-disabled-bg"),
            textColor: readRootVariable("--main-button-disabled-text"),
          },
    [ready, theme],
  );

  useMainButton(
    {
      text: success ? success.label : sendLabel,
      ...buttonColors,
      active: ready,
      progress: busy,
    },
    () => {
      if (success) {
        onClose();
      } else {
        void send();
      }
    },
  );

  // Поле растёт вместе с текстом: страница прокручивается целиком, без своей прокрутки
  // у поля.
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (field) {
      field.style.height = "auto";
      field.style.height = `${field.scrollHeight}px`;
    }
  }, [text, sent]);

  async function send(): Promise<void> {
    const value = text.trim();
    if (value === "" || busyRef.current) {
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    const failure = await onSend(value);
    busyRef.current = false;
    setBusy(false);
    if (failure !== null) {
      setError(failure);
      hapticNotification("error");
      return;
    }
    hapticNotification("success");
    if (done) {
      setSent(true);
    } else {
      onClose();
    }
  }

  return (
    <Screen title={title} withTabBar={false} enterAnimation>
      {success ? (
        <StatusMessage
          emoji={success.emoji}
          title={success.title}
          description={success.message}
        />
      ) : (
        <div className={styles.compose}>
          <Card>
            <ListItem>
              <textarea
                ref={fieldRef}
                className={styles.field}
                value={text}
                onChange={(event) =>
                  setText(numeric ? event.target.value.replace(/\D/g, "") : event.target.value)
                }
                placeholder={placeholder}
                aria-label={placeholder}
                maxLength={maxLength}
                rows={1}
                autoFocus
                inputMode={numeric ? "numeric" : undefined}
                // У однострочного поля «Готово» на клавиатуре просто её убирает.
                enterKeyHint={numeric ? "done" : undefined}
                onKeyDown={(event) => {
                  if (numeric && event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                }}
              />
            </ListItem>
          </Card>
          <p className={styles.footer}>{description}</p>
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </Screen>
  );
}
