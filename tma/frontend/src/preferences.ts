/**
 * Язык и тема интерфейса.
 *
 * Их выбирают в настройках (они хранятся на сервере), а App раздаёт их всему дереву
 * через контекст: язык — строками интерфейса (useStrings), тему — уже разрешённой,
 * светлой или тёмной (useResolvedTheme).
 *
 * Настройки приходят с сервера не сразу, а язык и тема нужны с первого кадра. Поэтому
 * последние известные значения запоминаются на устройстве, и приложение открывается
 * сразу в них. Пока их нет (первый запуск), язык берётся из Telegram — по тому же
 * правилу, по которому бэкенд выбирает язык новому пользователю, — а тема и режим
 * «Отмечать за вчера» — по умолчанию.
 */

import { createContext, useContext } from "react";

import { DEFAULT_LANGUAGE, DEFAULT_THEME, LANGUAGES, THEMES } from "./constants";
import { STRINGS, type Strings } from "./strings";
import { getTelegramLanguageCode } from "./telegram/webapp";
import type { Language, ResolvedTheme, ThemePreference } from "./types/settings";

interface Preferences {
  language: Language;
  strings: Strings;
  theme: ResolvedTheme;
}

export const PreferencesContext = createContext<Preferences>({
  language: DEFAULT_LANGUAGE,
  strings: STRINGS[DEFAULT_LANGUAGE],
  theme: DEFAULT_THEME,
});

/** Строки интерфейса на текущем языке. */
export function useStrings(): Strings {
  return useContext(PreferencesContext).strings;
}

/** Текущий язык интерфейса. */
export function useLanguage(): Language {
  return useContext(PreferencesContext).language;
}

/** Тема, которая сейчас на экране. */
export function useResolvedTheme(): ResolvedTheme {
  return useContext(PreferencesContext).theme;
}

/** Тема на экране: выбранная, а для адаптивной — как в системе. */
export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  if (preference === "system") {
    return systemDark ? "dark" : "light";
  }
  return preference;
}

/** Язык по коду языка Telegram или браузера: русский для «ru…», иначе английский. */
function languageFromCode(code: string | undefined): Language {
  if (!code) {
    return DEFAULT_LANGUAGE;
  }
  return code.toLowerCase().startsWith("ru") ? "ru" : "en";
}

/** Настройки, от которых зависит вид приложения с первого кадра. */
export interface SavedPreferences {
  language: Language;
  theme: ThemePreference;
  markYesterday: boolean;
}

const STORAGE_KEY = "streak:preferences";

function isLanguage(value: unknown): value is Language {
  return (LANGUAGES as readonly unknown[]).includes(value);
}

function isTheme(value: unknown): value is ThemePreference {
  return (THEMES as readonly unknown[]).includes(value);
}

/** Запомненные на устройстве настройки; чего нет (или хранилище недоступно) —
 *  по Telegram и по умолчанию. */
export function readSavedPreferences(): SavedPreferences {
  let saved: Partial<Record<keyof SavedPreferences, unknown>> = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") ?? {};
  } catch {
    // Хранилище недоступно или испорчено — как при первом запуске.
  }
  return {
    language: isLanguage(saved.language)
      ? saved.language
      : languageFromCode(getTelegramLanguageCode() ?? navigator.language),
    theme: isTheme(saved.theme) ? saved.theme : DEFAULT_THEME,
    markYesterday: saved.markYesterday === true,
  };
}

/** Запомнить настройки на устройстве для следующего запуска. */
export function savePreferences(preferences: SavedPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Не удалось запомнить — в следующий раз приложение откроется по умолчанию.
  }
}
