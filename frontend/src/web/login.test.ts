// @vitest-environment jsdom
/**
 * Picking up a bot login (login.ts): the guest's unsent changes reach the server before
 * the poll that may link (and switch) the account.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
const sendAll = vi.fn(async () => {
  calls.push("sendAll");
  return true;
});
const pollTelegramLogin = vi.fn(async () => {
  calls.push("poll");
  return { status: "pending" as const, result: null };
});

vi.mock("../data/store", () => ({ dataStore: { sendAll }, forgetKeptData: vi.fn() }));
vi.mock("../api/web", () => ({
  createGuest: vi.fn(),
  logout: vi.fn(),
  pollTelegramLogin,
  startTelegramLogin: vi.fn(),
}));
vi.mock("./push", () => ({ pushEndpoint: vi.fn(), subscribePush: vi.fn() }));

const { checkTelegramBotLogin } = await import("./login");

describe("checkTelegramBotLogin", () => {
  beforeEach(() => {
    calls.length = 0;
    localStorage.clear();
  });

  it("sends the queued changes before polling", async () => {
    localStorage.setItem(
      "streak:tg-login",
      JSON.stringify({ code: "abc", expires: Date.now() + 60_000 }),
    );
    expect(await checkTelegramBotLogin()).toBeNull();
    expect(calls).toEqual(["sendAll", "poll"]);
  });

  it("does nothing without a pending login", async () => {
    expect(await checkTelegramBotLogin()).toBeNull();
    expect(calls).toEqual([]);
  });
});
