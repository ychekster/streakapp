/**
 * Задачи (бета): плавные перемены на экране задач — чтобы после сохранения, отметки или
 * удаления строки не перескакивали и глаз успевал понять, что куда делось.
 *
 * Перед переменой экран снимает «снимок» (`takeSnapshot`): где стоят строки задач
 * (`[data-todo]`) и блоки (`[data-section]`, Section `motionKey`), и копии строк. После
 * отрисовки `playMotion` сравнивает:
 *  - строка осталась на экране (в том же блоке или в другом) — плавно едет из прежнего
 *    места на новое (FLIP: встаёт на новое место и сдвигается из старого в ноль);
 *  - строки больше нет (дата в будущем, другой список, удалена) — на её прежнем месте
 *    копия, которая растворяется; соседи плавно смыкаются;
 *  - новая строка — проявляется; новая задача из строки ввода (`alias`) едет из неё;
 *  - блоки едут так же, новый блок проявляется. Строка внутри блока едет только на свою
 *    часть пути (путь блока уже даёт ему сдвиг).
 * Без анимаций в системе («Уменьшить движение») — сразу на месте.
 */

/** Переезд строк и блоков на новые места (мс). */
export const MOVE_MS = 400;
/** Растворение ушедших и проявление новых строк (мс). */
const FADE_MS = 260;
const EASING = "cubic-bezier(0.2, 0, 0, 1)";

export interface MotionSnapshot {
  /** Верх контейнера: от него ставятся копии ушедших строк. */
  top: number;
  left: number;
  rows: Map<string, DOMRect>;
  clones: Map<string, HTMLElement>;
  sections: Map<string, number>;
}

/** Где стоят строки и блоки в `list` сейчас (до перемены). */
export function takeSnapshot(list: HTMLElement | null): MotionSnapshot | null {
  if (!list) {
    return null;
  }
  const box = list.getBoundingClientRect();
  const snapshot: MotionSnapshot = {
    top: box.top,
    left: box.left,
    rows: new Map(),
    clones: new Map(),
    sections: new Map(),
  };
  list.querySelectorAll<HTMLElement>("[data-todo]").forEach((row) => {
    const id = row.dataset.todo ?? "";
    snapshot.rows.set(id, row.getBoundingClientRect());
    snapshot.clones.set(id, cloneRow(row));
  });
  list.querySelectorAll<HTMLElement>("[data-section]").forEach((section) => {
    snapshot.sections.set(section.dataset.section ?? "", section.getBoundingClientRect().top);
  });
  return snapshot;
}

/** Копия строки — с тем, что написано в поле (cloneNode не переносит значение). */
function cloneRow(row: HTMLElement): HTMLElement {
  const clone = row.cloneNode(true) as HTMLElement;
  const fields = row.querySelectorAll("textarea");
  clone.querySelectorAll("textarea").forEach((field, index) => {
    field.value = fields[index]?.value ?? "";
  });
  clone.removeAttribute("data-todo");
  return clone;
}

/** Плавно перевести `list` от снимка к тому, что на экране сейчас. `alias` — новая
 *  строка (id), которая была строкой `from` (строка ввода). */
export function playMotion(
  list: HTMLElement | null,
  before: MotionSnapshot,
  alias: { from: string; to: string } | null = null,
): void {
  if (!list || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }
  // Места — от верха контейнера, не окна: закрытая клавиатура iPhone в тот же миг сдвигает
  // страницу, и этот сдвиг иначе считался бы переездом строк (рывок). `drift` — насколько
  // сам контейнер сдвинулся в окне.
  const drift = list.getBoundingClientRect().top - before.top;
  // Сначала все замеры: анимация, запущенная раньше, сдвинула бы следующие замеры.
  const sections = [...list.querySelectorAll<HTMLElement>("[data-section]")].map((element) => {
    const old = before.sections.get(element.dataset.section ?? "");
    return {
      element,
      shift: old === undefined ? null : old + drift - element.getBoundingClientRect().top,
    };
  });
  const sectionShift = new Map(sections.map(({ element, shift }) => [element, shift ?? 0]));
  const seen = new Set<string>();
  const rows = [...list.querySelectorAll<HTMLElement>("[data-todo]")].map((element) => {
    const id = element.dataset.todo ?? "";
    const from = before.rows.has(id) ? id : alias?.to === id ? alias.from : null;
    if (from === null) {
      return { element, shift: null };
    }
    seen.add(from);
    const section = element.closest<HTMLElement>("[data-section]");
    const parent = section ? (sectionShift.get(section) ?? 0) : 0;
    const old = before.rows.get(from) as DOMRect;
    return { element, shift: old.top + drift - element.getBoundingClientRect().top - parent };
  });

  for (const { element, shift } of [...sections, ...rows]) {
    if (shift === null) {
      element.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: FADE_MS,
        delay: MOVE_MS / 3,
        easing: "ease-out",
        fill: "backwards",
      });
    } else if (Math.abs(shift) > 0.5) {
      element.animate(
        [{ transform: `translateY(${shift}px)` }, { transform: "translateY(0)" }],
        { duration: MOVE_MS, easing: EASING },
      );
    }
  }

  // Ушедшие: копия на прежнем месте растворяется (контейнер — position: relative).
  for (const [id, rect] of before.rows) {
    const clone = before.clones.get(id);
    if (seen.has(id) || !clone) {
      continue;
    }
    Object.assign(clone.style, {
      position: "absolute",
      top: `${rect.top - before.top}px`,
      left: `${rect.left - before.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      margin: "0",
      zIndex: "1",
      pointerEvents: "none",
      borderRadius: "var(--radius-card)",
    });
    clone.setAttribute("aria-hidden", "true");
    list.appendChild(clone);
    const fade = clone.animate(
      [
        { opacity: 1, transform: "scale(1)" },
        { opacity: 0, transform: "scale(0.97)" },
      ],
      { duration: FADE_MS, easing: "ease-out", fill: "forwards" },
    );
    fade.onfinish = () => clone.remove();
    fade.oncancel = () => clone.remove();
  }
}
