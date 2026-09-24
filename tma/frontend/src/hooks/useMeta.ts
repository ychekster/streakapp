/** Загрузка справочных данных форм (кешируются в api/meta на уровне модуля). */

import { useEffect, useState } from "react";

import { loadMeta } from "../api/meta";
import type { Meta } from "../types/meta";

export function useMeta(): Meta | null {
  const [meta, setMeta] = useState<Meta | null>(null);

  useEffect(() => {
    let active = true;
    loadMeta()
      .then((loaded) => {
        if (active) {
          setMeta(loaded);
        }
      })
      .catch(() => {
        // Метаданные не критичны для рендера: формы используют разумные дефолты.
      });
    return () => {
      active = false;
    };
  }, []);

  return meta;
}
