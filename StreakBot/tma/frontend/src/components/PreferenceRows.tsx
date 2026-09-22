/**
 * Ряды «Язык» и «Тема» — одни и те же в настройках приложения и админ-панели: иконка в
 * цветной плашке, справа — выбранное значение с системным меню (MenuSelect). Изменение
 * сохраняет App (useSettings), поэтому язык и тема меняются сразу везде.
 */

import { LANGUAGES, THEMES } from "../constants";
import { useStrings } from "../preferences";
import { LANGUAGE_NAMES } from "../strings";
import type { Language, ThemePreference } from "../types/settings";
import { ListItem } from "./ListItem";
import { MenuSelect } from "./MenuSelect";
import { GlobeIcon, PaletteIcon } from "./SettingsIcons";

const LANGUAGE_OPTIONS = LANGUAGES.map((language) => ({
  value: language,
  label: LANGUAGE_NAMES[language],
}));

export function LanguageRow({
  value,
  onChange,
}: {
  value: Language;
  onChange: (language: Language) => void;
}) {
  const strings = useStrings();
  return (
    <ListItem icon={<GlobeIcon />} iconColor="orange" label={strings.settingsLanguage}>
      <MenuSelect<Language>
        options={LANGUAGE_OPTIONS}
        value={value}
        onChange={onChange}
        label={strings.settingsLanguage}
      />
    </ListItem>
  );
}

export function ThemeRow({
  value,
  onChange,
}: {
  value: ThemePreference;
  onChange: (theme: ThemePreference) => void;
}) {
  const strings = useStrings();
  const options = THEMES.map((theme) => ({ value: theme, label: strings.themeNames[theme] }));
  return (
    <ListItem icon={<PaletteIcon />} iconColor="teal" label={strings.settingsTheme}>
      <MenuSelect<ThemePreference>
        options={options}
        value={value}
        onChange={onChange}
        label={strings.settingsTheme}
      />
    </ListItem>
  );
}
