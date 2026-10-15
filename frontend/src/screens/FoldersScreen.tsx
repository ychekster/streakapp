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
 * без заголовка, — переключатель «Переключение свайпом» (настройка `folder_swipe`) с
 * пояснением.
 *
 * «Изменить» справа от заголовка секции (кнопку в шапке не поставить: в Mini App там
 * кнопки Telegram) включает правку: у папок слева красный «−» — удалить (с
 * подтверждением), справа у всех рядов, и у «Все привычки», — ручка: потянув за неё,
 * ряд переставляют. «Готово» выключает правку. Всё сохраняется сразу, как остальные
 * изменения (data/store.ts).
 */

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";

import { Disclosure } from "../components/Disclosure";
import { ListItem } from "../components/ListItem";
import { Screen } from "../components/Screen";
import { Card, Section } from "../components/Section";
import { FolderIcon } from "../components/SettingsIcons";
import { Switch } from "../components/Switch";
import { FOLDER_KINDS, MAX_FOLDERS_PER_USER } from "../constants";
import { useStrings } from "../preferences";
import { confirmAction, hapticImpact, hapticNotification } from "../telegram/webapp";
import { habitColorStyle } from "../theme";
import type { Folder, FolderKind } from "../types/folder";
import rowStyles from "../components/ListItem.module.css";
import styles from "./FoldersScreen.module.css";

interface FoldersScreenProps {
  folders: Folder[];
  /** Место «Все привычки» среди папок. */
  allHabitsPosition: number;
  onCreate: () => void;
  onOpen: (folder: Folder) => void;
  onDelete: (folder: Folder) => void;
  /** Новый порядок: id папок, null — «Все привычки». */
  onReorder: (order: (number | null)[]) => void;
  /** Добавить рекомендуемую папку. */
  onAddRecommended: (kind: FolderKind) => void;
  /** «Переключение свайпом». */
  swipe: boolean;
  onSwipeChange: (on: boolean) => void;
}

/** Перетаскиваемый ряд: какой, на сколько сдвинут пальцем и куда встанет. */
interface Drag {
  index: number;
  offset: number;
  target: number;
}

export function FoldersScreen({
  folders,
  allHabitsPosition,
  onCreate,
  onOpen,
  onDelete,
  onReorder,
  onAddRecommended,
  swipe,
  onSwipeChange,
}: FoldersScreenProps) {
  const strings = useStrings();
  const [editing, setEditing] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  // Сразу после перестановки ряды встают на новые места без анимации.
  const [settling, setSettling] = useState(false);
  const start = useRef<{ y: number; index: number; height: number } | null>(null);

  // Ряды по порядку: папки и «Все привычки» (null) на своём месте.
  const rows: (Folder | null)[] = [...folders];
  rows.splice(Math.min(allHabitsPosition, folders.length), 0, null);
  const canCreate = folders.length < MAX_FOLDERS_PER_USER;
  // Рекомендуемые — те, которых ещё нет среди папок (и пока можно создать папку).
  const recommended = canCreate
    ? FOLDER_KINDS.filter((kind) => !folders.some((folder) => folder.kind === kind))
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
    <Screen title={strings.foldersTitle} withTabBar={false} enterAnimation pinnedTitle>
      <div className={styles.intro}>
        <span className={styles.introIcon} style={habitColorStyle("blue")} aria-hidden="true">
          <FolderIcon />
        </span>
        <p className={styles.introText}>{strings.foldersDescription}</p>
      </div>

      <div className={styles.list}>
        <Section
          variant="form"
          title={strings.foldersHeading}
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
              ? strings.foldersLimitFooter
              : folders.length > 0
                ? strings.foldersFooter
                : undefined
          }
        >
          <Card>
            <button
              type="button"
              className={`${rowStyles.row} ${rowStyles.pressable} ${rowStyles.accent}`}
              disabled={!canCreate}
              onClick={onCreate}
            >
              <span className={`${rowStyles.label} ${!canCreate ? styles.dimmed : ""}`}>
                {strings.foldersCreate}
              </span>
            </button>
            {rows.map((folder, index) => {
              const name = folder ? folder.name : strings.foldersAll;
              const className = [
                rowStyles.row,
                styles.row,
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
                        aria-label={strings.folderRemove(folder.name)}
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
                        <span>{strings.folderHabitCount(folder.habits.length)}</span>
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
          <Section variant="form" title={strings.foldersRecommendedHeading}>
            <Card>
              {recommended.map((kind) => (
                <div key={kind} className={`${rowStyles.row} ${styles.recommended}`}>
                  <span className={styles.recommendedText}>
                    <span className={styles.recommendedName}>{strings.folderKindNames[kind]}</span>
                    <span className={styles.recommendedDescription}>
                      {strings.folderKindDescriptions[kind]}
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

        <div className={styles.swipe}>
          <Section variant="form" footer={strings.foldersSwipeFooter}>
            <Card>
              <ListItem label={strings.foldersSwipe}>
                <Switch checked={swipe} onChange={onSwipeChange} label={strings.foldersSwipe} />
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
