/**
 * Настройки → «Задачи (Beta)»: все настройки задач на своём экране (ряд — под «Архивом»).
 * Каждая настройка — своей группой с пояснением под ней:
 *  - «Задачи (Beta)» — переключатель вкладки (`show_todos`); остальные группы — только при
 *    включённых задачах;
 *  - «Начинать с задач» (`open_on_todos`);
 *  - «Списки» — экран списков (FoldersScreen; значение — сколько их);
 *  - «Галочки справа» (`todo_checks_right`);
 *  - «Новые задачи» — сверху или снизу блока (`todo_new_bottom`), системным меню.
 * Изменение сохраняется сразу, как остальные настройки (App → useSettings).
 */

import { Disclosure } from "../components/Disclosure";
import { ListGroup } from "../components/ListGroup";
import { ListItem } from "../components/ListItem";
import { MenuSelect } from "../components/MenuSelect";
import { Screen } from "../components/Screen";
import {
  ChecklistIcon,
  FolderIcon,
  HandIcon,
  HouseIcon,
  SortIcon,
} from "../components/SettingsIcons";
import { Switch } from "../components/Switch";
import { useStrings } from "../preferences";
import type { Settings, SettingsUpdate } from "../types/settings";
import formStyles from "./HabitFormScreen.module.css";
import styles from "./SettingsScreen.module.css";

interface TodoSettingsScreenProps {
  settings: Settings;
  onSave: (patch: SettingsUpdate) => void;
  /** Открыть «Списки». */
  onOpenLists: () => void;
  /** Сколько списков задач. */
  listCount: number;
}

type NewPlace = "top" | "bottom";

export function TodoSettingsScreen({
  settings,
  onSave,
  onOpenLists,
  listCount,
}: TodoSettingsScreenProps) {
  const strings = useStrings();
  const showTodos = settings.show_todos ?? false;
  const newPlace: NewPlace = settings.todo_new_bottom ? "bottom" : "top";
  const placeOptions = (["top", "bottom"] as const).map((value) => ({
    value,
    label: strings.todoSettingsNewPlaces[value],
  }));

  return (
    <Screen title={strings.todoSettingsTitle} withTabBar={false} enterAnimation pinnedTitle>
      <div className={`${styles.settings} ${formStyles.pinned}`}>
        <ListGroup footer={strings.todoSettingsShowFooter}>
          <ListItem icon={<ChecklistIcon />} iconColor="orange" label={strings.settingsTodos}>
            <Switch
              checked={showTodos}
              onChange={(on) => onSave({ show_todos: on })}
              label={strings.settingsTodos}
            />
          </ListItem>
        </ListGroup>
        {showTodos ? (
          <>
            <ListGroup footer={strings.todoSettingsOpenOnFooter}>
              <ListItem icon={<HouseIcon />} iconColor="orange" label={strings.todoSettingsOpenOn}>
                <Switch
                  checked={settings.open_on_todos ?? false}
                  onChange={(on) => onSave({ open_on_todos: on })}
                  label={strings.todoSettingsOpenOn}
                />
              </ListItem>
            </ListGroup>
            <ListGroup footer={strings.todoSettingsListsFooter}>
              <ListItem
                icon={<FolderIcon />}
                iconColor="orange"
                label={strings.todoSettingsLists}
                onPress={onOpenLists}
              >
                {listCount > 0 ? <span className={styles.value}>{listCount}</span> : null}
                <Disclosure />
              </ListItem>
            </ListGroup>
            <ListGroup footer={strings.todoSettingsChecksRightFooter}>
              <ListItem
                icon={<HandIcon />}
                iconColor="orange"
                label={strings.todoSettingsChecksRight}
              >
                <Switch
                  checked={settings.todo_checks_right ?? false}
                  onChange={(on) => onSave({ todo_checks_right: on })}
                  label={strings.todoSettingsChecksRight}
                />
              </ListItem>
            </ListGroup>
            <ListGroup footer={strings.todoSettingsNewFooter}>
              <ListItem icon={<SortIcon />} iconColor="orange" label={strings.todoSettingsNew}>
                <MenuSelect<NewPlace>
                  options={placeOptions}
                  value={newPlace}
                  onChange={(place) => onSave({ todo_new_bottom: place === "bottom" })}
                  label={strings.todoSettingsNew}
                />
              </ListItem>
            </ListGroup>
          </>
        ) : null}
      </div>
    </Screen>
  );
}
