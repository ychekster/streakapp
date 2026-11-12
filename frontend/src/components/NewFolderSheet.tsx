/**
 * Окно снизу «Новая папка» / «Новый список» — прямо из формы привычки («Папки» в
 * «Дополнительно») и из строки задачи (плашка списка), не уходя с них: название, у списка
 * задач ещё «Тема» (цвет), и «Создать». Созданное сразу выбрано там, откуда открыли (это
 * делает `onCreate`); ошибка (лимит, пустое имя) — красной строкой под полем.
 *
 * Поле получает фокус при открытии. Клавиатура iPhone уменьшает видимую область, а не
 * вьюпорт: окно держится над ней (слой окна — по видимой области, visualViewport).
 * Окно — в <body> (портал): у экранов и строк бывает transform (въезд экрана, переезд
 * строк задач), а он сбил бы окно с низа экрана. Слой помечен `data-keeps-todo-edit`:
 * нажатия в нём не заканчивают правку строки задачи (TodoRow).
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

import { DEFAULT_HABIT_COLOR, FOLDER_NAME_MAX_LENGTH } from "../constants";
import { describeError } from "../errors";
import { useStrings } from "../preferences";
import { hapticNotification } from "../telegram/webapp";
import { habitColorStyle } from "../theme";
import type { HabitColor } from "../types/habit";
import { BottomSheet, useSheetContent } from "./BottomSheet";
import { ColorPicker } from "./ColorPicker";
import sheetStyles from "./BottomSheet.module.css";
import styles from "./NewFolderSheet.module.css";

interface NewFolderSheetProps {
  open: boolean;
  /** Заголовок окна: «Новая папка», «Новый список». */
  title: string;
  /** Подпись поля названия. */
  placeholder: string;
  /** Подпись кнопки: «Создать папку», «Создать список». */
  submit: string;
  /** Ошибка без своего текста по коду. */
  failed: string;
  /** С выбором цвета (списки задач). */
  withColor?: boolean;
  /** Создать (бросает ошибку стора — она показывается в окне). */
  onCreate: (name: string, color: HabitColor | null) => void;
  onClose: () => void;
}

export function NewFolderSheet({
  open,
  title,
  placeholder,
  submit,
  failed,
  withColor = false,
  onCreate,
  onClose,
}: NewFolderSheetProps) {
  const { shown, closing, gone } = useSheetContent(open ? true : null);
  const viewport = useVisibleArea(shown !== null);
  if (shown === null) {
    return null;
  }
  return createPortal(
    <div data-keeps-todo-edit="">
      <BottomSheet
        closing={closing}
        onClose={onClose}
        onGone={gone}
        label={title}
        style={{ ...habitColorStyle(DEFAULT_HABIT_COLOR), ...viewport }}
        cardClassName={viewport.top === undefined ? styles.sheet : styles.sheetAboveKeyboard}
      >
        <SheetBody
          title={title}
          placeholder={placeholder}
          submit={submit}
          failed={failed}
          withColor={withColor}
          onCreate={onCreate}
          onClose={onClose}
        />
      </BottomSheet>
    </div>,
    document.body,
  );
}

/** Содержимое окна: своё состояние на каждое открытие (окно размонтируется, уехав). */
function SheetBody({
  title,
  placeholder,
  submit,
  failed,
  withColor,
  onCreate,
  onClose,
}: Omit<NewFolderSheetProps, "open">) {
  const strings = useStrings();
  const [name, setName] = useState("");
  const [color, setColor] = useState<HabitColor>(DEFAULT_HABIT_COLOR);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const valid = name.trim().length > 0;

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  const create = (): void => {
    if (!valid) {
      return;
    }
    try {
      onCreate(name.trim(), withColor ? color : null);
      hapticNotification("success");
      inputRef.current?.blur();
      onClose();
    } catch (caught) {
      setError(describeError(strings, caught, failed));
      hapticNotification("error");
    }
  };

  return (
    <>
      <div className={sheetStyles.header}>
        <span className={styles.title}>{title}</span>
        <button
          type="button"
          className={sheetStyles.close}
          aria-label={strings.countSheetClose}
          onClick={onClose}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M7 7l10 10M17 7L7 17"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      <input
        ref={inputRef}
        className={styles.name}
        type="text"
        placeholder={placeholder}
        aria-label={placeholder}
        maxLength={FOLDER_NAME_MAX_LENGTH}
        value={name}
        enterKeyHint="done"
        onChange={(event) => {
          setName(event.target.value);
          setError(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            create();
          }
        }}
      />
      {withColor ? (
        <div className={styles.colors}>
          <ColorPicker value={color} onChange={setColor} label={strings.formThemeHeading} />
        </div>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        className={styles.submit}
        style={withColor ? habitColorStyle(color) : undefined}
        disabled={!valid}
        // Нажатие не забирает фокус у поля: клавиатура не прячется до создания.
        onPointerDown={(event) => event.preventDefault()}
        onClick={create}
      >
        {submit}
      </button>
    </>
  );
}

/** Слой окна — по видимой области: на iPhone клавиатура уменьшает её, а не вьюпорт, и
 *  окно у низа экрана оказалось бы под клавиатурой. */
function useVisibleArea(active: boolean): CSSProperties {
  const [area, setArea] = useState<CSSProperties>({});
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!active || !viewport) {
      return undefined;
    }
    const apply = (): void => {
      const covered = document.documentElement.clientHeight - viewport.height;
      setArea(
        covered > 1
          ? { top: viewport.offsetTop, bottom: "auto", height: viewport.height }
          : {},
      );
    };
    apply();
    viewport.addEventListener("resize", apply);
    viewport.addEventListener("scroll", apply);
    return () => {
      viewport.removeEventListener("resize", apply);
      viewport.removeEventListener("scroll", apply);
    };
  }, [active]);
  return area;
}
