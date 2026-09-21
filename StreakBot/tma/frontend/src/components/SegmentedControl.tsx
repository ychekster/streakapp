/** Сегментированный контрол в стиле iOS. */

import styles from "./SegmentedControl.module.css";

interface Segment<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div className={styles.track} role="tablist">
      {segments.map((segment) => (
        <button
          key={segment.value}
          type="button"
          role="tab"
          aria-selected={value === segment.value}
          className={`${styles.segment} ${value === segment.value ? styles.active : ""}`}
          onClick={() => onChange(segment.value)}
        >
          {segment.label}
        </button>
      ))}
    </div>
  );
}
