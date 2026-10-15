// @vitest-environment jsdom
/**
 * Sending the queue (sync.ts): an answer that is not the server's — a Wi-Fi login page
 * with 200, a body that stops halfway — is a network error, so the store keeps the
 * changes and tries again instead of stalling.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "./client";
import { syncChanges } from "./sync";

const fetchMock = vi.fn<typeof fetch>();

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("syncChanges", () => {
  it("returns the server's answer", async () => {
    vi.stubGlobal("fetch", fetchMock);
    const answer = { results: [], habits: [], folders: [] };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(answer), { status: 200 }));
    await expect(syncChanges([])).resolves.toEqual(answer);
  });

  it("treats a 200 page that is not JSON as a network error", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce(new Response("<html>Wi-Fi login</html>", { status: 200 }));
    const error = await syncChanges([]).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).code).toBe("network_error");
  });

  it("gives up on a body that never ends", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementationOnce(async (_input, init) => {
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"results": ['));
          init?.signal?.addEventListener("abort", () => controller.error(new Error("aborted")));
        },
      });
      return new Response(body, { status: 200 });
    });
    const pending = syncChanges([]).catch((caught: unknown) => caught);
    await vi.runAllTimersAsync();
    const error = await pending;
    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).code).toBe("network_error");
  });
});
