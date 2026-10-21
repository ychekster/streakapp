/**
 * Форма папки — новой («Новая папка», из Настройки → «Папки» → «Создать папку») или
 * существующей (нажатие на папку там же). Как форма папки в Telegram, только без
 * исключений, цвета и «Поделиться»:
 *  - «Название папки» — поле; оно же — название вкладки над списком привычек;
 *  - «Привычки в папке» — «Добавить привычки» открывает выбор привычек
 *    (FolderHabitsScreen), под ним — выбранные типы привычек и привычки (кружками, как
 *    участники групповой привычки);
 *  - у существующей папки внизу — «Удалить папку» (с подтверждением).
 * У рекомендуемой папки (`kind`) привычек не выбирают — она наполняется сама: вместо
 * «Привычки в папке» под названием пояснение, какие привычки в неё попадают.
 *
 * Черновик (название и привычки) хранит App: он переживает выбор привычек, который
 * открывается отдельным экраном поверх формы. Сохраняет нижняя кнопка — «Создать папку»
 * или «Сохранить», неактивная, пока нет названия; «Назад» закрывает форму без сохранения.
 */

import { useRef, useState, type KeyboardEvent } from "react";

import { DestructiveButton } from "../components/DestructiveButton";
import { MemberRows } from "../components/GroupMembers";
import { ListItem } from "../components/ListItem";
import { Screen } from "../components/Screen";
import { Card, Section } from "../components/Section";
import { FOLDER_NAME_MAX_LENGTH } from "../constants";
import { dataStore } from "../data/store";
import { describeError } from "../errors";
import { useMainButton } from "../hooks/useMainButton";
import { useStrings } from "../preferences";
import { confirmAction, hapticNotification } from "../telegram/webapp";
import { MAIN_BUTTON_ACCENT, MAIN_BUTTON_DISABLED } from "../theme";
import type { Folder, FolderHabitType } from "../types/folder";
import type { Habit } from "../types/habit";
import { HABIT_TYPE_COLORS, HabitAvatar, HabitTypeIcon } from "./FolderHabitsScreen";
import formStyles from "./HabitFormScreen.module.css";
import styles from "./FolderFormScreen.module.css";

/** Черновик формы папки. */
export interface FolderDraft {
  /** Изменяемая папка; null — новая. */
  folder: Folder | null;
  name: string;
  /** Выбранные привычки (id на экране). */
  habits: number[];
  /** Выбранные типы привычек: все привычки типа — в папке. */
  types: FolderHabitType[];
}

interface FolderFormScreenProps {
  draft: FolderDraft;
  habits: Habit[];
  onChangeName: (name: string) => void;
  /** Открыть выбор привычек. */
  onPickHabits: () => void;
  /** Папка сохранена или удалена — закрыть форму. */
  onDone: () => void;
}

export function FolderFormScreen({
  draft,
  habits,
  onChangeName,
  onPickHabits,
  onDone,
}: FolderFormScreenProps) {
  const strings = useStrings();
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const valid = draft.name.trim().length > 0;
  const kind = draft.folder?.kind ?? null;
  const selected = kind ? [] : habits.filter((habit) => draft.habits.includes(habit.id));
  const types = kind ? [] : draft.types;

  useMainButton(
    {
      text: draft.folder ? strings.folderEditSubmit : strings.folderCreateSubmit,
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
    // Only habits still there (one may have been deleted while the form was open).
    const ids = selected.map((habit) => habit.id);
    try {
      if (draft.folder) {
        dataStore.updateFolder(draft.folder.id, draft.name.trim(), ids, types);
      } else {
        dataStore.createFolder(draft.name.trim(), ids, undefined, types);
      }
      hapticNotification("success");
      onDone();
    } catch (caught) {
      setError(describeError(strings, caught, strings.folderSaveFailed));
      hapticNotification("error");
      requestAnimationFrame(() =>
        errorRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
      );
    }
  }

  async function remove(folder: Folder): Promise<void> {
    const confirmed = await confirmAction({
      title: strings.folderDeleteTitle,
      message: strings.folderDeleteMessage(folder.name),
      confirmLabel: strings.folderDeleteConfirm,
      cancelLabel: strings.folderDeleteCancel,
      destructive: true,
    });
    if (confirmed) {
      hapticNotification("success");
      dataStore.deleteFolder(folder.id);
      onDone();
    }
  }

  return (
    <Screen
      title={draft.folder ? strings.folderEditTitle : strings.folderCreateTitle}
      withTabBar={false}
      enterAnimation
      pinnedTitle
    >
      <div className={`${formStyles.form} ${formStyles.pinned}`}>
        <Section
          variant="form"
          title={strings.folderNameHeading}
          footer={kind ? strings.folderKindFooter[kind] : undefined}
        >
          <Card>
            <ListItem>
              <input
                className={formStyles.textInput}
                type="text"
                placeholder={strings.folderNamePlaceholder}
                aria-label={strings.folderNamePlaceholder}
                maxLength={FOLDER_NAME_MAX_LENGTH}
                value={draft.name}
                onChange={(event) => onChangeName(event.target.value)}
                enterKeyHint="done"
                onKeyDown={blurOnEnter}
              />
            </ListItem>
          </Card>
        </Section>

        {kind ? null : (
          <Section
            variant="form"
            title={strings.folderHabitsHeading}
            footer={strings.folderHabitsFooter}
          >
            <MemberRows>
              <Card>
                <ListItem
                  accent
                  onPress={onPickHabits}
                  label={
                    <span className={styles.addLabel}>
                      <PlusIcon />
                      {strings.folderAddHabits}
                    </span>
                  }
                />
                {types.map((type) => (
                  <ListItem
                    key={type}
                    icon={<HabitTypeIcon type={type} />}
                    iconColor={HABIT_TYPE_COLORS[type]}
                    roundIcon
                    label={
                      <span className={styles.habitName}>{strings.folderHabitTypeNames[type]}</span>
                    }
                  />
                ))}
                {selected.map((habit) => (
                  <ListItem
                    key={habit.id}
                    icon={<HabitAvatar habit={habit} />}
                    iconColor={habit.color}
                    roundIcon
                    label={<span className={styles.habitName}>{habit.name}</span>}
                  />
                ))}
              </Card>
            </MemberRows>
          </Section>
        )}

        {error ? (
          <p ref={errorRef} className={formStyles.error} role="alert">
            {error}
          </p>
        ) : null}

        {draft.folder ? (
          <DestructiveButton
            label={strings.folderDelete}
            onPress={() => void remove(draft.folder!)}
          />
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

/** «+» перед «Добавить привычки» — как в эталоне, тонкий, цветом акцента. */
function PlusIcon() {
  return (
    <svg className={styles.plus} viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 2.5v15M2.5 10h15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
