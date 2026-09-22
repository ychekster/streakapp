/**
 * Вкладка «Люди» админ-панели — как «Настройки»: одна карточка с двумя рядами, у каждого
 * — иконка в цветной плашке и число справа.
 *  - Пользователи — список с поиском (AdminUsersScreen);
 *  - Отзывы — отзывы всех пользователей (AdminReviewsScreen).
 * Числа загружаются при каждом открытии вкладки; пока их нет, ряды уже можно нажать.
 */

import { fetchCounts } from "../api/admin";
import { formatCount } from "../adminFormat";
import { ADMIN_STRINGS as S } from "../adminStrings";
import { PersonIcon } from "../components/AdminIcons";
import { Disclosure } from "../components/Disclosure";
import { ListGroup } from "../components/ListGroup";
import { ListItem } from "../components/ListItem";
import { Screen } from "../components/Screen";
import { StarIcon } from "../components/SettingsIcons";
import { useResource } from "../hooks/useResource";
import styles from "./AdminPeopleScreen.module.css";

/** Вложенные экраны вкладки «Люди». */
export type PeoplePage = "users" | "reviews";

interface AdminPeopleScreenProps {
  onOpen: (page: PeoplePage) => void;
}

export function AdminPeopleScreen({ onOpen }: AdminPeopleScreenProps) {
  const counts = useResource(fetchCounts, "counts").data;

  return (
    <Screen title={S.peopleTitle}>
      <div className={styles.people}>
        <ListGroup>
          <ListItem
            icon={<PersonIcon />}
            iconColor="blue"
            label={S.peopleUsers}
            onPress={() => onOpen("users")}
          >
            {counts ? <span className={styles.count}>{formatCount(counts.users)}</span> : null}
            <Disclosure />
          </ListItem>
          <ListItem
            icon={<StarIcon />}
            iconColor="red"
            label={S.peopleReviews}
            onPress={() => onOpen("reviews")}
          >
            {counts ? <span className={styles.count}>{formatCount(counts.reviews)}</span> : null}
            <Disclosure />
          </ListItem>
        </ListGroup>
      </div>
    </Screen>
  );
}
