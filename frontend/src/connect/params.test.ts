import { describe, expect, it } from "vitest";

import { deniedRedirect, readConnectParams } from "./params";

describe("readConnectParams", () => {
  it("reads the AI app's request", () => {
    expect(
      readConnectParams(
        "?response_type=code&client_id=abc&redirect_uri=https%3A%2F%2Fclaude.ai%2Fcb&code_challenge=xyz&code_challenge_method=S256&state=s1",
      ),
    ).toEqual({
      kind: "request",
      request: {
        clientId: "abc",
        redirectUri: "https://claude.ai/cb",
        codeChallenge: "xyz",
        state: "s1",
      },
    });
  });

  it("passes the server's error on", () => {
    expect(readConnectParams("?error=oauth_client_unknown")).toEqual({
      kind: "error",
      code: "oauth_client_unknown",
    });
  });

  it("treats an incomplete request as invalid", () => {
    expect(readConnectParams("?client_id=abc")).toEqual({
      kind: "error",
      code: "oauth_request_invalid",
    });
  });
});

describe("deniedRedirect", () => {
  it("keeps the redirect's own query and adds the error and state", () => {
    expect(
      deniedRedirect({
        clientId: "abc",
        redirectUri: "https://chatgpt.com/cb?x=1",
        codeChallenge: "c",
        state: "s1",
      }),
    ).toBe("https://chatgpt.com/cb?x=1&error=access_denied&state=s1");
  });
});
