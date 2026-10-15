import { describe, expect, it } from "vitest";

import { keepLastWordsTogether, STRINGS } from "./strings";

describe("keepLastWordsTogether", () => {
  it("joins the last two words of a sentence with a non-breaking space", () => {
    expect(keepLastWordsTogether("Вы можете переключаться между ними.")).toBe(
      "Вы можете переключаться между ними.",
    );
    expect(STRINGS.ru.foldersDescription.endsWith("между ними.")).toBe(true);
  });

  it("leaves short labels and fragments as they are", () => {
    expect(keepLastWordsTogether("Вид сетки")).toBe("Вид сетки");
    expect(keepLastWordsTogether("Добавить на рабочий")).toBe("Добавить на рабочий");
    expect(keepLastWordsTogether(" и ")).toBe(" и ");
  });

  it("applies to the results of template functions and nested objects", () => {
    const strings = keepLastWordsTogether({
      nested: { text: "one two three four" },
      list: ["one two three four"],
      template: (name: string) => `Отметить привычку ${name} сегодня`,
    });
    expect(strings.nested.text).toBe("one two three four");
    expect(strings.list[0]).toBe("one two three four");
    expect(strings.template("Бег")).toBe("Отметить привычку Бег сегодня");
  });
});
