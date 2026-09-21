/**
 * Экран «Настройки» в стиле iOS Settings: часовой пояс пользователя, от которого
 * зависит, какой день считается сегодняшним. Изменения сразу уходят на сервер
 * (PUT /settings).
 */

import { useState } from "react";

import { ApiRequestError } from "../api/client";
import { ListGroup } from "../components/ListGroup";
import { ListItem } from "../components/ListItem";
import { Screen } from "../components/Screen";
import { StatusMessage } from "../components/StatusMessage";
import { useMeta } from "../hooks/useMeta";
import { useSettings } from "../hooks/useSettings";
import { STRINGS } from "../strings";
import type { SettingsUpdate } from "../types/settings";
import type { TimezoneOption } from "../types/meta";
import styles from "./SettingsScreen.module.css";

export function SettingsScreen() {
  const { settings, status, errorMessage, reload, save } = useSettings();
  const meta = useMeta();
  const [saveError, setSaveError] = useState<string | null>(null);

  async function applyPatch(patch: SettingsUpdate): Promise<void> {
    setSaveError(null);
    try {
      await save(patch);
    } catch (error) {
      setSaveError(
        error instanceof ApiRequestError ? error.message : "Не удалось сохранить",
      );
    }
  }

  return <Screen title={STRINGS.settingsTitle}>{renderContent()}</Screen>;

  function renderContent() {
    if (status === "loading") {
      return (
        <StatusMessage emoji={STRINGS.settingsLoadingEmoji} title={STRINGS.settingsLoading} />
      );
    }
    if (status === "error" || !settings) {
      return (
        <StatusMessage
          emoji={STRINGS.errorEmoji}
          title={STRINGS.errorTitle}
          description={errorMessage ?? undefined}
          actionLabel={STRINGS.errorRetry}
          onAction={reload}
        />
      );
    }

    // Варианты пояса: смещения из бэкенда + текущий пояс, если его нет в списке.
    const baseOffsets: TimezoneOption[] = meta?.timezone_offsets ?? [];
    const current = settings.timezone_offset;
    const offsets =
      current && !baseOffsets.some((option) => option.value === current)
        ? [{ value: current, label: current }, ...baseOffsets]
        : baseOffsets;

    return (
      <>
        <ListGroup header={STRINGS.settingsTimezone} footer={STRINGS.settingsTimezoneFooter}>
          <ListItem label={STRINGS.settingsTimezoneRow}>
            <select
              className={styles.select}
              aria-label={STRINGS.settingsTimezoneRow}
              value={settings.timezone_offset ?? ""}
              onChange={(event) => applyPatch({ timezone: event.target.value })}
            >
              <option value="" disabled>
                {STRINGS.settingsTimezoneNone}
              </option>
              {offsets.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </ListItem>
        </ListGroup>

        {saveError ? <p className={styles.error}>{saveError}</p> : null}
      </>
    );
  }
}
