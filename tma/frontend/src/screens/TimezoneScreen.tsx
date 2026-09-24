/**
 * Выбор часового пояса — вложенный экран настроек.
 *
 * Под крупным заголовком — поиск и одна карточка с поясами: «Город, Страна» и текущее
 * смещение, у выбранного — галочка. Без запроса это каталог (GET /meta/timezones) — по
 * поясу на зону, с запада на восток. С запросом — города, найденные сервером по
 * справочнику из ~64 тыс. городов (см. useTimezoneSearch): по названию на русском,
 * английском и других языках («Питер», «St. Petersburg»), с уточнением страны или
 * региона («портленд орегон»); по названию страны — её пояса; по смещению («+3») —
 * пояса с ним. У одноимённых городов страны видно регион: «Портленд, Орегон, США».
 *
 * Нажатие на пояс выбирает его и возвращает в настройки (сохраняет App): у города
 * пояс — его зона, а в настройках видно сам город. Пока экран открыт, «Закрыть»
 * Telegram заменена на «Назад», а нижняя навигация скрыта.
 */

import { useState } from "react";

import { ListItem } from "../components/ListItem";
import { Screen } from "../components/Screen";
import { SearchField } from "../components/SearchField";
import { Card } from "../components/Section";
import { StatusMessage } from "../components/StatusMessage";
import { describeError } from "../errors";
import { useTimezoneSearch } from "../hooks/useTimezoneSearch";
import { useTimezones } from "../hooks/useTimezones";
import { useLanguage, useStrings } from "../preferences";
import type { TimezoneEntry } from "../types/meta";
import styles from "./TimezoneScreen.module.css";

/** «Город, Регион, Страна» (регион — только у одноимённых городов страны); у
 *  города-государства — одно название («Сингапур», не «Сингапур, Сингапур»). */
function formatPlace(timezone: TimezoneEntry): string {
  const country = timezone.country === timezone.city ? null : timezone.country;
  return [timezone.city, timezone.region, country].filter(Boolean).join(", ");
}

/** Выбран ли этот пояс сейчас: у города — тот же город, у зоны без города — та же зона
 *  (и город не выбран). */
export function isCurrentTimezone(
  timezone: TimezoneEntry,
  zone: string | null,
  city: number | null,
): boolean {
  return timezone.city_id !== null
    ? timezone.city_id === city
    : city === null && timezone.zone === zone;
}

interface TimezoneScreenProps {
  /** Выбранный сейчас пояс (IANA) или null. */
  currentZone: string | null;
  /** Город выбранного пояса (id в справочнике) или null. */
  currentCity: number | null;
  onSelect: (timezone: TimezoneEntry) => void;
}

export function TimezoneScreen({ currentZone, currentCity, onSelect }: TimezoneScreenProps) {
  const strings = useStrings();
  const language = useLanguage();
  const catalog = useTimezones(language);
  const [query, setQuery] = useState("");
  const search = useTimezoneSearch(language, query);

  return (
    <Screen title={strings.timezoneTitle} withTabBar={false} enterAnimation>
      <SearchField
        value={query}
        onChange={setQuery}
        placeholder={strings.timezoneSearch}
        clearLabel={strings.timezoneSearchClear}
      />
      {query.trim() ? renderSearch() : renderCatalog()}
    </Screen>
  );

  function renderCatalog() {
    if (catalog.status === "loading") {
      return (
        <StatusMessage icon="spinner" title={strings.timezoneLoading} />
      );
    }
    if (catalog.status === "error") {
      return renderError(catalog.error, catalog.reload);
    }
    return renderList(catalog.timezones);
  }

  function renderSearch() {
    if (search.error) {
      return renderError(search.error, search.retry);
    }
    // Первый ответ ещё идёт — список появится с ним.
    if (search.results === null) {
      return null;
    }
    if (search.results.length === 0) {
      return search.stale ? null : (
        <p className={styles.empty}>{strings.timezoneNothingFound}</p>
      );
    }
    return renderList(search.results);
  }

  function renderError(error: unknown, retry: () => void) {
    return (
      <StatusMessage
        icon="alert"
        title={strings.errorTitle}
        description={describeError(strings, error, strings.timezonesLoadFailed)}
        actionLabel={strings.errorRetry}
        onAction={retry}
      />
    );
  }

  function renderList(timezones: TimezoneEntry[]) {
    return (
      <div className={styles.list}>
        <Card>
          {timezones.map((timezone) => (
            <ListItem
              key={timezone.city_id ?? timezone.zone}
              onPress={() => onSelect(timezone)}
            >
              <span className={styles.place}>{formatPlace(timezone)}</span>
              <span className={styles.trailing}>
                {timezone.offset}
                <span className={styles.check}>
                  {isCurrentTimezone(timezone, currentZone, currentCity) ? <CheckIcon /> : null}
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
