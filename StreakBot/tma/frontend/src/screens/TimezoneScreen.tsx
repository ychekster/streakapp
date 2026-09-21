/**
 * Выбор часового пояса — вложенный экран настроек.
 *
 * Под крупным заголовком — поиск и одна карточка со всеми поясами каталога
 * (GET /meta/timezones): «Город, Страна» и текущее смещение, у выбранного — галочка.
 * Пояса идут с запада на восток; поиск находит пояс по городу, стране, имени зоны
 * («Europe/Moscow» — так можно найти город и по-английски) или смещению («+3»).
 *
 * Нажатие на пояс выбирает его и возвращает в настройки (сохраняет App). Пока экран
 * открыт, «Закрыть» Telegram заменена на «Назад», а нижняя навигация скрыта.
 */

import { useDeferredValue, useMemo, useState } from "react";

import { ListItem } from "../components/ListItem";
import { Screen } from "../components/Screen";
import { SearchField } from "../components/SearchField";
import { Card } from "../components/Section";
import { StatusMessage } from "../components/StatusMessage";
import { describeError } from "../errors";
import { useTimezones } from "../hooks/useTimezones";
import { useLanguage, useStrings } from "../preferences";
import type { TimezoneEntry } from "../types/meta";
import styles from "./TimezoneScreen.module.css";

/** Текст для сравнения без учёта регистра и различия «е»/«ё». */
function normalize(text: string): string {
  return text.toLocaleLowerCase().replace(/ё/g, "е");
}

/** «Город, Страна»; у города-государства — одно название («Сингапур», не «Сингапур,
 *  Сингапур»). */
function formatPlace(timezone: TimezoneEntry): string {
  return timezone.city === timezone.country
    ? timezone.city
    : `${timezone.city}, ${timezone.country}`;
}

interface TimezoneScreenProps {
  /** Выбранный сейчас пояс (IANA) или null. */
  current: string | null;
  onSelect: (timezone: TimezoneEntry) => void;
}

export function TimezoneScreen({ current, onSelect }: TimezoneScreenProps) {
  const strings = useStrings();
  const language = useLanguage();
  const { timezones, status, error, reload } = useTimezones(language);
  const [query, setQuery] = useState("");
  // Список из сотен рядов фильтруется с отставанием от ввода, чтобы поле не подтормаживало.
  const deferredQuery = useDeferredValue(query);

  const searchIndex = useMemo(
    () =>
      timezones.map((timezone) => ({
        timezone,
        text: normalize(
          `${timezone.city} ${timezone.country} ${timezone.id.replace(/_/g, " ")} ${timezone.offset}`,
        ),
      })),
    [timezones],
  );

  const results = useMemo(() => {
    const words = normalize(deferredQuery).split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      return timezones;
    }
    return searchIndex
      .filter(({ text }) => words.every((word) => text.includes(word)))
      .map(({ timezone }) => timezone);
  }, [deferredQuery, searchIndex, timezones]);

  return (
    <Screen title={strings.timezoneTitle} withTabBar={false} enterAnimation>
      <SearchField
        value={query}
        onChange={setQuery}
        placeholder={strings.timezoneSearch}
        clearLabel={strings.timezoneSearchClear}
      />
      {renderContent()}
    </Screen>
  );

  function renderContent() {
    if (status === "loading") {
      return (
        <StatusMessage emoji={strings.settingsLoadingEmoji} title={strings.timezoneLoading} />
      );
    }
    if (status === "error") {
      return (
        <StatusMessage
          emoji={strings.errorEmoji}
          title={strings.errorTitle}
          description={describeError(strings, error, strings.timezonesLoadFailed)}
          actionLabel={strings.errorRetry}
          onAction={reload}
        />
      );
    }
    if (results.length === 0) {
      return <p className={styles.empty}>{strings.timezoneNothingFound}</p>;
    }
    return (
      <div className={styles.list}>
        <Card>
          {results.map((timezone) => (
            <ListItem key={timezone.id} onPress={() => onSelect(timezone)}>
              <span className={styles.place}>{formatPlace(timezone)}</span>
              <span className={styles.trailing}>
                {timezone.offset}
                <span className={styles.check}>
                  {timezone.id === current ? <CheckIcon /> : null}
                </span>
              </span>
            </ListItem>
          ))}
        </Card>
      </div>
    );
  }
}

/** Галочка выбранного пояса (цветом акцента, как в списках выбора iOS). */
function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2.5 8.5l3.5 3.5 7.5-8"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
