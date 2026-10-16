/**
 * Фильтры списка пользователей — экран поверх вкладки «Пользователи» (кнопка «Фильтры»
 * под поиском). По ряду на признак (AudienceFilterRows): выбранное значение сразу
 * применяется к списку, над рядами — сколько пользователей под фильтром сейчас (с учётом
 * поиска), ниже — «Сбросить фильтры». Нижняя кнопка Telegram «Показать · N» возвращает к
 * списку, как и «Назад».
 *
 * Фильтр хранит AdminApp: он общий с экраном списка и переживает переходы.
 */

import { AUDIENCE_KEYS, audienceParam } from "../audience";
import { countUsers } from "../../api/admin";
import { useAdminStrings } from "../adminStrings";
import { AudienceFilterRows } from "../components/AudienceFilterRows";
import { ListItem } from "../../components/ListItem";
import { Screen } from "../../components/Screen";
import { Card, Section } from "../../components/Section";
import { AUDIENCE_COUNT_DELAY_MS } from "../../constants";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useMainButton } from "../../hooks/useMainButton";
import { useResource } from "../../hooks/useResource";
import { MAIN_BUTTON_ACCENT } from "../../theme";
import type { Audience } from "../../types/admin";
import styles from "./AdminUserFiltersScreen.module.css";

interface AdminUserFiltersScreenProps {
  /** Поиск на вкладке пользователей — число под фильтром считается вместе с ним. */
  query: string;
  audience: Audience;
  onChange: (audience: Audience) => void;
  onClose: () => void;
}

export function AdminUserFiltersScreen({
  query,
  audience,
  onChange,
  onClose,
}: AdminUserFiltersScreenProps) {
  const strings = useAdminStrings();
  // Пока значения переключают подряд, число не пересчитывается на каждое.
  const settled = useDebouncedValue(audience, AUDIENCE_COUNT_DELAY_MS);
  const counted = useResource(
    () => countUsers(query, settled),
    `${query}\n${audienceParam(settled)}`,
  );
  const current = audienceParam(settled) === audienceParam(audience) && !counted.refreshing;
  const count = current && counted.status === "ready" ? counted.data : null;

  useMainButton(
    { text: strings.filtersShow(count), ...MAIN_BUTTON_ACCENT, active: true, progress: false },
    onClose,
  );

  const empty = audienceParam(audience) === "";
  return (
    <Screen title={strings.filtersTitle} withTabBar={false} enterAnimation>
      <div className={styles.form}>
        <Section variant="form" title={strings.filtersCount(count)} footer={strings.filtersFooter}>
          <Card>
            <AudienceFilterRows keys={AUDIENCE_KEYS} audience={audience} onChange={onChange} />
          </Card>
        </Section>
        <div className={styles.reset}>
          <Card>
            <ListItem
              label={strings.filtersReset}
              destructive
              disabled={empty}
              onPress={() => onChange({})}
            />
          </Card>
        </div>
      </div>
    </Screen>
  );
}
