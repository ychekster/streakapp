/**
 * Ряды фильтра пользователей (см. audience.ts) — по ряду на признак: слева его название,
 * справа выбранное значение системным меню, как «Частота» в форме привычки. «Все» —
 * условие по признаку не задано. Ряды кладутся в карточку вызывающего: список
 * пользователей показывает все признаки, рассылка — только свои (BROADCAST_FILTER_KEYS).
 */

import { withFilter } from "../audience";
import { useAdminStrings } from "../adminStrings";
import { AUDIENCE_FILTERS } from "../constants";
import type { Audience, AudienceKey } from "../types/admin";
import { ListItem } from "./ListItem";
import { MenuSelect } from "./MenuSelect";

interface AudienceFilterRowsProps {
  keys: readonly AudienceKey[];
  audience: Audience;
  onChange: (audience: Audience) => void;
}

export function AudienceFilterRows({ keys, audience, onChange }: AudienceFilterRowsProps) {
  const strings = useAdminStrings();
  return (
    <>
      {keys.map((key) => {
        const name = strings.filterNames[key];
        const options = [
          { value: "", label: strings.filterAny },
          ...AUDIENCE_FILTERS[key].map((value) => ({
            value: value as string,
            label: strings.filterValues[key][value],
          })),
        ];
        return (
          <ListItem key={key} label={name}>
            <MenuSelect
              options={options}
              value={audience[key] ?? ""}
              onChange={(value) => onChange(withFilter(audience, key, value))}
              label={name}
            />
          </ListItem>
        );
      })}
    </>
  );
}
