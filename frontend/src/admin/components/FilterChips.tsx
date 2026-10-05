/**
 * Кнопка «Фильтры» и выбранные условия фильтра пользователей капсулами под поиском — как
 * фильтры в «Файлах» и «Почте» iOS. Кнопка открывает экран фильтров (на ней — сколько
 * условий выбрано), нажатие на капсулу условия снимает его. Капсулы стоят одной
 * строкой, которая листается вбок.
 */

import { audienceEntries, segmentTitle } from "../audience";
import { useAdminStrings } from "../adminStrings";
import type { Audience, AudienceKey } from "../../types/admin";
import { FilterIcon } from "./AdminIcons";
import styles from "./FilterChips.module.css";

interface FilterChipsProps {
  audience: Audience;
  /** Открыть экран фильтров. */
  onOpen: () => void;
  /** Снять условие признака (или группу из аналитики). */
  onRemove: (key: AudienceKey | "segment") => void;
}

export function FilterChips({ audience, onOpen, onRemove }: FilterChipsProps) {
  const strings = useAdminStrings();
  const entries = audienceEntries(audience);
  return (
    <div className={styles.chips}>
      <button
        type="button"
        className={`${styles.chip} ${styles.open}`}
        onClick={onOpen}
        aria-haspopup="dialog"
      >
        <FilterIcon />
        <span>{strings.filters}</span>
        {entries.length ? <span className={styles.count}>{entries.length}</span> : null}
      </button>
      {audience.segment ? (
        <button
          type="button"
          className={`${styles.chip} ${styles.active}`}
          onClick={() => onRemove("segment")}
          aria-label={strings.removeFilter(strings.an.segmentRow)}
        >
          <span className={styles.label}>
            {strings.an.segmentChip(
              segmentTitle(audience.segment) ?? strings.an.segmentFallback(audience.segment),
            )}
          </span>
          <svg className={styles.remove} viewBox="0 0 12 12" aria-hidden="true">
            <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      ) : null}
      {entries.map(([key, value]) => {
        const label = strings.filterValues[key][value];
        return (
          <button
            key={key}
            type="button"
            className={`${styles.chip} ${styles.active}`}
            onClick={() => onRemove(key)}
            aria-label={strings.removeFilter(label)}
          >
            <span className={styles.label}>{label}</span>
            <svg className={styles.remove} viewBox="0 0 12 12" aria-hidden="true">
              <path
                d="M3 3l6 6M9 3l-6 6"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        );
      })}
    </div>
  );
}
