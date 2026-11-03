/**
 * Настройки → «Папки»: папки привычек, как «Папки с чатами» в Telegram.
 *
 * Заголовок экрана — сразу маленький, по центру шапки (Screen `pinnedTitle`): подложка
 * шапки проявляется, когда контент уходит под неё. Сверху — значок и пояснение, под ними
 * секция «Папки»: «Создать папку» (форма новой папки, FolderFormScreen), «Все привычки» и
 * папки пользователя по порядку — в таком же порядке их вкладки стоят в таблетке над
 * списком привычек. Нажатие на папку открывает её форму (название, привычки, удаление).
 *
 * «Рекомендуемые папки» — папки, которые наполняются сами (FOLDER_KINDS): название,
 * под ним пояснение, справа «Добавить» — папка сразу создаётся и пропадает отсюда. Ниже,
 * без заголовка, — переключатель с пояснением (`option`): у папок — «Переключение
 * свайпом» (`folder_swipe`), у списков задач — «Скрыть названия списков»
 * (`todo_hide_list_names`).
 *
 * «Изменить» справа от заголовка секции (кнопку в шапке не поставить: в Mini App там
 * кнопки Telegram) включает правку: у папок слева красный «−» — удалить (с
 * подтверждением), справа у всех рядов, и у «Все привычки», — ручка: потянув за неё,
 * ряд переставляют. «Создать папку» сдвигается вправо вместе с названиями, и линии между
 * рядами начинаются от текста — «−» стоят без линий. «Готово» выключает правку. Всё
 * сохраняется сразу, как остальные изменения (data/store.ts).
 *
 * Тот же экран — «Списки» задач (бета; настройки → «Задачи (Beta)» → «Списки»): тексты,
 * виды рекомендуемых, предел и значок свои (`texts`, `kinds`, `max`, `icon`); «Все
 * задачи» стоит среди списков так же, как «Все привычки».
 */

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from "react";

import { Disclosure } from "../components/Disclosure";
import { ListItem } from "../components/ListItem";
import { Screen } from "../components/Screen";
import { Card, Section } from "../components/Section";
import { FolderIcon } from "../components/SettingsIcons";
import { Switch } from "../components/Switch";
import { FOLDER_KINDS, MAX_FOLDERS_PER_USER } from "../constants";
import { useStrings } from "../preferences";
import type { Strings } from "../strings";
import { confirmAction, hapticImpact, hapticNotification } from "../telegram/webapp";
import { habitColorStyle } from "../theme";
import type { FolderKind } from "../types/folder";
import type { HabitColor } from "../types/habit";
import rowStyles from "../components/ListItem.module.css";
import styles from "./FoldersScreen.module.css";

/** Папка в ряду: у привычек — Folder, у задач — список. */
interface FolderLike<K extends string> {
  id: number;
  name: string;
  kind?: K | null;
}

/** Тексты экрана: у папок привычек и у списков задач свои. */
export interface FoldersTexts<K extends string> {
  title: string;
  description: string;
  heading: string;
  create: string;
  /** Ряд «Все привычки» / «Все задачи». */
  all: string;
  footer: string;
  limitFooter: string;
  recommendedHeading: string;
  kindNames: Record<K, string>;
  kindDescriptions: Record<K, string>;
  /** Переключатель внизу экрана и пояснение под ним. */
  option: string;
  optionFooter: string;
  remove: (name: string) => string;
  deleteTitle: string;
  deleteMessage: (name: string) => string;
  /** Подпись справа у папки: сколько в ней. */
  count: (count: number) => string;
}

/** Тексты экрана папок привычек. */
export function habitFoldersTexts(strings: Strings): FoldersTexts<FolderKind> {
  return {
    title: strings.foldersTitle,
    description: strings.foldersDescription,
    heading: strings.foldersHeading,
    create: strings.foldersCreate,
    all: strings.foldersAll,
    footer: strings.foldersFooter,
    limitFooter: strings.foldersLimitFooter,
    recommendedHeading: strings.foldersRecommendedHeading,
    kindNames: strings.folderKindNames,
    kindDescriptions: strings.folderKindDescriptions,
    option: strings.foldersSwipe,
    optionFooter: strings.foldersSwipeFooter,
    remove: strings.folderRemove,
    deleteTitle: strings.folderDeleteTitle,
    deleteMessage: strings.folderDeleteMessage,
    count: strings.folderHabitCount,
  };
}

interface FoldersScreenProps<K extends string, F extends FolderLike<K>> {
  folders: F[];
  /** Место «Все привычки» среди папок. */
  allHabitsPosition: number;
  onCreate: () => void;
  onOpen: (folder: F) => void;
  onDelete: (folder: F) => void;
  /** Новый порядок: id папок, null — «Все привычки». */
  onReorder: (order: (number | null)[]) => void;
  /** Добавить рекомендуемую папку. */
  onAddRecommended: (kind: K) => void;
  /** Переключатель внизу экрана (`texts.option`). */
  option: boolean;
  onOptionChange: (on: boolean) => void;
  /** Сколько в папке (подпись справа). */
  countOf: (folder: F) => number;
  texts: FoldersTexts<K>;
  /** Виды рекомендуемых папок. */
  kinds: readonly K[];
  /** Сколько папок можно завести. */
  max: number;
  /** Значок над пояснением и его цвет. */
  icon?: ReactNode;
  iconColor?: HabitColor;
}

/** Экран папок привычек: значения по умолчанию для общего экрана. */
export const HABIT_FOLDERS = { kinds: FOLDER_KINDS, max: MAX_FOLDERS_PER_USER };

/** Перетаскиваемый ряд: какой, на сколько сдвинут пальцем и куда встанет. */
interface Drag {
  index: number;
  offset: number;
  target: number;
}

export function FoldersScreen<K extends string, F extends FolderLike<K>>({
  folders,
  allHabitsPosition,
  onCreate,
  onOpen,
  onDelete,
  onReorder,
  onAddRecommended,
  option,
  onOptionChange,
  countOf,
  texts,
  kinds,
  max,
  icon = <FolderIcon />,
  iconColor = "blue",
}: FoldersScreenProps<K, F>) {
  const strings = useStrings();
  const [editing, setEditing] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  // Сразу после перестановки ряды встают на новые места без анимации.
  const [settling, setSettling] = useState(false);
  const start = useRef<{ y: number; index: number; height: number } | null>(null);

  // Ряды по порядку: папки и «Все привычки» (null) на своём месте.
  const rows: (F | null)[] = [...folders];
  rows.splice(Math.min(allHabitsPosition, folders.length), 0, null);
  const canCreate = folders.length < max;
  // Рекомендуемые — те, которых ещё нет среди папок (и пока можно создать папку).
  const recommended = canCreate
    ? kinds.filter((kind) => !folders.some((folder) => folder.kind === kind))
    : [];

  // Папок не осталось — правке нечего делать.
  useEffect(() => {
    if (folders.length === 0) {
      setEditing(false);
    }
  }, [folders.length]);

  useEffect(() => {
    if (settling) {
      const frame = requestAnimationFrame(() => setSettling(false));
      return () => cancelAnimationFrame(frame);
    }
    return undefined;
  }, [settling]);

  async function remove(folder: F): Promise<void> {
    const confirmed = await confirmAction({
      title: texts.deleteTitle,
      message: texts.deleteMessage(folder.name),
      confirmLabel: strings.folderDeleteConfirm,
      cancelLabel: strings.folderDeleteCancel,
      destructive: true,
    });
    if (confirmed) {
      hapticNotification("success");
      onDelete(folder);
    }
  }

  function startDrag(event: PointerEvent<HTMLElement>, index: number): void {
    const row = event.currentTarget.closest<HTMLElement>("[data-folder-row]");
    if (!row || start.current) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    start.current = { y: event.clientY, index, height: row.offsetHeight };
    hapticImpact("light");
    setDrag({ index, offset: 0, target: index });
  }

  function moveDrag(event: PointerEvent<HTMLElement>): void {
    const from = start.current;
    if (!from) {
      return;
    }
    // Ряд не выходит за первый и последний.
    const offset = Math.max(
      -from.index * from.height,
      Math.min((rows.length - 1 - from.index) * from.height, event.clientY - from.y),
    );
    const target = from.index + Math.round(offset / from.height);
    if (target !== drag?.target) {
      hapticImpact("light");
    }
    setDrag({ index: from.index, offset, target });
  }

  function endDrag(): void {
    const from = start.current;
    start.current = null;
    if (from && drag && drag.target !== from.index) {
      const order = [...rows];
      const [moved] = order.splice(from.index, 1);
      order.splice(drag.target, 0, moved);
      onReorder(order.map((row) => (row === null ? null : row.id)));
      setSettling(true);
    }
    setDrag(null);
  }

  /** Сдвиг ряда `index`, пока тянут другой: соседи уступают место. */
  function rowStyle(index: number, height: number): CSSProperties | undefined {
    if (!drag) {
      return undefined;
    }
    if (index === drag.index) {
      return { transform: `translateY(${drag.offset}px)` };
    }
    if (drag.index < index && index <= drag.target) {
      return { transform: `translateY(${-height}px)` };
    }
    if (drag.target <= index && index < drag.index) {
      return { transform: `translateY(${height}px)` };
    }
    return undefined;
  }

  const rowHeight = start.current?.height ?? 0;

  return (
    <Screen title={texts.title} withTabBar={false} enterAnimation pinnedTitle>
      <div className={styles.intro}>
        <span className={styles.introIcon} style={habitColorStyle(iconColor)} aria-hidden="true">
          {icon}
        </span>
        <p className={styles.introText}>{texts.description}</p>
      </div>

      <div className={styles.list}>
        <Section
          variant="form"
          title={texts.heading}
          action={
            folders.length > 0 ? (
              <button
                type="button"
                className={styles.editButton}
                onClick={() => setEditing((value) => !value)}
              >
                {editing ? strings.foldersDone : strings.foldersEdit}
              </button>
            ) : undefined
          }
          footer={
            !canCreate
              ? texts.limitFooter
              : folders.length > 0
                ? texts.footer
                : undefined
          }
        >
          <Card>
            <button
              type="button"
              className={[
                rowStyles.row,
                rowStyles.pressable,
                rowStyles.accent,
                editing ? styles.editing : "",
              ]
                .filter(Boolean)
                .join(" ")}
              disabled={!canCreate}
              onClick={onCreate}
            >
              {editing ? <span className={styles.removeSpace} aria-hidden="true" /> : null}
              <span
                className={`${rowStyles.label} ${styles.name} ${!canCreate ? styles.dimmed : ""}`}
              >
                {texts.create}
              </span>
            </button>
            {rows.map((folder, index) => {
              const name = folder ? folder.name : texts.all;
              const className = [
                rowStyles.row,
                styles.row,
                editing ? styles.editing : "",
                !editing && folder ? rowStyles.pressable : "",
                drag?.index === index ? styles.dragging : "",
                drag && !settling ? styles.shifting : "",
              ]
                .filter(Boolean)
                .join(" ");
              const content = (
                <>
                  {editing ? (
                    folder ? (
                      <button
                        type="button"
                        className={styles.remove}
                        aria-label={texts.remove(folder.name)}
                        onClick={() => void remove(folder)}
                      >
                        <span className={styles.minus} />
                      </button>
                    ) : (
                      <span className={styles.removeSpace} aria-hidden="true" />
                    )
                  ) : null}
                  <span className={`${rowStyles.label} ${styles.name}`}>{name}</span>
                  <span className={rowStyles.trailing}>
                    {editing ? (
                      <span
                        className={styles.handle}
                        role="button"
                        aria-label={strings.folderReorder(name)}
                        onPointerDown={(event) => startDrag(event, index)}
                        onPointerMove={moveDrag}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                      >
                        <HandleIcon />
                      </span>
                    ) : folder ? (
                      <>
                        <span>{texts.count(countOf(folder))}</span>
                        <Disclosure />
                      </>
                    ) : null}
                  </span>
                </>
              );
              const style = rowStyle(index, rowHeight);
              return !editing && folder ? (
                <button
                  key={folder.id}
                  type="button"
                  className={className}
                  data-folder-row=""
                  onClick={() => onOpen(folder)}
                >
                  {content}
                </button>
              ) : (
                <div
                  key={folder?.id ?? "all"}
                  className={className}
                  style={style}
                  data-folder-row=""
                >
                  {content}
                </div>
              );
            })}
          </Card>
        </Section>

        {recommended.length > 0 ? (
          <Section variant="form" title={texts.recommendedHeading}>
            <Card>
              {recommended.map((kind) => (
                <div key={kind} className={`${rowStyles.row} ${styles.recommended}`}>
                  <span className={styles.recommendedText}>
                    <span className={styles.recommendedName}>{texts.kindNames[kind]}</span>
                    <span className={styles.recommendedDescription}>
                      {texts.kindDescriptions[kind]}
                    </span>
                  </span>
                  <button
                    type="button"
                    className={styles.addButton}
                    onClick={() => onAddRecommended(kind)}
                  >
                    {strings.foldersRecommendedAdd}
                  </button>
                </div>
              ))}
            </Card>
          </Section>
        ) : null}

        <div className={styles.option}>
          <Section variant="form" footer={texts.optionFooter}>
            <Card>
              <ListItem label={texts.option}>
                <Switch checked={option} onChange={onOptionChange} label={texts.option} />
              </ListItem>
            </Card>
          </Section>
        </div>
      </div>
    </Screen>
  );
}

/** Ручка перетаскивания: три полоски. */
function HandleIcon() {
  return (
    <svg viewBox="0 0 22 16" aria-hidden="true">
      <path
        d="M2 2.5h18M2 8h18M2 13.5h18"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
