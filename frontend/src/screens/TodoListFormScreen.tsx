/**
 * Форма списка задач (бета) — нового («Создать список» в Настройки → «Задачи (Beta)» →
 * «Списки») или существующего (нажатие на список там же): «Название списка» — оно же
 * вкладка над задачами; у рекомендуемого под названием пояснение, какие задачи в него
 * попадают; у существующего внизу «Удалить список» (с подтверждением, задачи остаются во
 * «Все задачи»). Как форма папки привычек (FolderFormScreen), только без выбора привычек,
 * зато с «Темой» — цветом списка (как у привычки): кружок отметки его задач этого цвета.
 * У рекомендуемого темы нет — в нём задачи разных списков, каждая своего цвета.
 * Сохраняет нижняя кнопка; «Назад» закрывает форму без сохранения.
 */

import { useRef, useState, type KeyboardEvent } from "react";

import { ColorPicker } from "../components/ColorPicker";
import { DestructiveButton } from "../components/DestructiveButton";
import { ListItem } from "../components/ListItem";
import { Screen } from "../components/Screen";
import { Card, Section } from "../components/Section";
import { DEFAULT_HABIT_COLOR, FOLDER_NAME_MAX_LENGTH } from "../constants";
import { dataStore } from "../data/store";
import { describeError } from "../errors";
import { useMainButton } from "../hooks/useMainButton";
import { useStrings } from "../preferences";
import { confirmAction, hapticNotification } from "../telegram/webapp";
import { MAIN_BUTTON_ACCENT, MAIN_BUTTON_DISABLED } from "../theme";
import type { HabitColor } from "../types/habit";
import type { TodoFolder } from "../types/todo";
import formStyles from "./HabitFormScreen.module.css";

interface TodoListFormScreenProps {
  /** Изменяемый список; null — новый. */
  list: TodoFolder | null;
  /** Список сохранён или удалён — закрыть форму. */
  onDone: () => void;
}

export function TodoListFormScreen({ list, onDone }: TodoListFormScreenProps) {
  const strings = useStrings();
  const [name, setName] = useState(list?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const valid = name.trim().length > 0;
  const kind = list?.kind ?? null;
  // У списка, созданного без цвета, тема не выбрана: сохранится, только если её выбрать.
  const [color, setColor] = useState<HabitColor | null>(
    list ? (list.color ?? null) : DEFAULT_HABIT_COLOR,
  );

  useMainButton(
    {
      text: list ? strings.folderEditSubmit : strings.todoListCreateSubmit,
      ...(valid ? MAIN_BUTTON_ACCENT : MAIN_BUTTON_DISABLED),
      active: valid,
      progress: false,
    },
    submit,
  );

  function submit(): void {
    if (!valid) {
      return;
    }
    try {
      if (list) {
        dataStore.renameTodoFolder(list.id, name.trim(), color ?? undefined);
      } else {
        dataStore.createTodoFolder(name.trim(), undefined, color ?? undefined);
      }
      hapticNotification("success");
      onDone();
    } catch (caught) {
      setError(describeError(strings, caught, strings.todoListSaveFailed));
      hapticNotification("error");
      requestAnimationFrame(() =>
        errorRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
      );
    }
  }

  async function remove(target: TodoFolder): Promise<void> {
    const confirmed = await confirmAction({
      title: strings.todoListDeleteTitle,
      message: strings.todoListDeleteMessage(target.name),
      confirmLabel: strings.folderDeleteConfirm,
      cancelLabel: strings.folderDeleteCancel,
      destructive: true,
    });
    if (confirmed) {
      hapticNotification("success");
      dataStore.deleteTodoFolder(target.id);
      onDone();
    }
  }

  return (
    <Screen
      title={list ? strings.todoListEditTitle : strings.todoListCreateTitle}
      withTabBar={false}
      enterAnimation
      pinnedTitle
    >
      <div className={`${formStyles.form} ${formStyles.pinned}`}>
        <Section
          variant="form"
          title={strings.todoListNameHeading}
          footer={kind ? strings.todoListKindFooter[kind] : undefined}
        >
          <Card>
            <ListItem>
              <input
                className={formStyles.textInput}
                type="text"
                placeholder={strings.todoListNameHeading}
                aria-label={strings.todoListNameHeading}
                maxLength={FOLDER_NAME_MAX_LENGTH}
                value={name}
                onChange={(event) => setName(event.target.value)}
                enterKeyHint="done"
                onKeyDown={blurOnEnter}
              />
            </ListItem>
          </Card>
        </Section>

        {kind ? null : (
          <Section variant="form" title={strings.formThemeHeading}>
            <Card>
              <ColorPicker
                value={color ?? DEFAULT_HABIT_COLOR}
                onChange={setColor}
                label={strings.formThemeHeading}
              />
            </Card>
          </Section>
        )}

        {error ? (
          <p ref={errorRef} className={formStyles.error} role="alert">
            {error}
          </p>
        ) : null}

        {list ? (
          <DestructiveButton label={strings.todoListDelete} onPress={() => void remove(list)} />
        ) : null}
      </div>
    </Screen>
  );
}

/** «Готово» (Enter) на клавиатуре поля просто её убирает. */
function blurOnEnter(event: KeyboardEvent<HTMLInputElement>): void {
  if (event.key === "Enter") {
    event.currentTarget.blur();
  }
}
