/**
 * Задачи (бета): поле ввода внизу экрана, как строка сообщения в «Сообщениях» iOS —
 * капсула во всю ширину по центру снизу, справа внутри синяя кнопка со стрелкой
 * (появляется, когда есть текст). Enter или стрелка — задача добавлена, поле пустое, а
 * фокус и клавиатура остаются: можно сразу писать следующую.
 *
 * Стоит последним в экране задач, который занимает видимую часть окна над клавиатурой
 * (TodosScreen), — поэтому всегда прямо над ней и при прокрутке списка не двигается.
 */

import { useLayoutEffect, useRef, useState } from "react";

import { TODO_TEXT_MAX_LENGTH } from "../constants";
import { useTextFieldFocused } from "../hooks/useTextFieldFocused";
import { useStrings } from "../preferences";
import styles from "./TodoComposer.module.css";

interface TodoComposerProps {
  /** Добавить задачу; false — не добавлена (пустая, предел), текст остаётся. */
  onSend: (text: string) => boolean;
}

export function TodoComposer({ onSend }: TodoComposerProps) {
  const strings = useStrings();
  const [text, setText] = useState("");
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const typing = useTextFieldFocused();

  // Поле растёт по тексту (до max-height, дальше прокручивается).
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (field) {
      field.style.height = "0px";
      field.style.height = `${field.scrollHeight}px`;
    }
  }, [text]);

  const send = (): void => {
    if (text.trim() !== "" && onSend(text.trim())) {
      setText("");
    }
    // Фокус остаётся в поле: клавиатура не закрывается.
    fieldRef.current?.focus({ preventScroll: true });
  };

  const canSend = text.trim() !== "";
  return (
    <div className={`${styles.bar} ${typing ? styles.typing : ""}`}>
      <div className={styles.capsule}>
        <textarea
          ref={fieldRef}
          className={styles.field}
          value={text}
          rows={1}
          placeholder={strings.todosPlaceholder}
          maxLength={TODO_TEXT_MAX_LENGTH}
          enterKeyHint="send"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
        />
        {canSend ? (
          <button
            type="button"
            className={styles.send}
            aria-label={strings.todosAdd}
            // Нажатие не забирает фокус у поля — клавиатура не мигает.
            onPointerDown={(event) => event.preventDefault()}
            onClick={send}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 18.5V6M6.5 11.5L12 6l5.5 5.5" />
            </svg>
          </button>
        ) : null}
      </div>
    </div>
  );
}
