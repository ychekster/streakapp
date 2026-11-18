/** The consent page's address: what the AI app asked for (backend/routers/oauth.py
 *  `/oauth/authorize` sends the browser here with the same parameters), or `error=<code>`
 *  when the request was refused before the page. */

export interface AuthorizeRequest {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string | null;
}

export type ConnectParams =
  | { kind: "request"; request: AuthorizeRequest }
  | { kind: "error"; code: string };

/** Read `/connect?…`; anything incomplete is the request error the server would give. */
export function readConnectParams(search: string): ConnectParams {
  const params = new URLSearchParams(search);
  const error = params.get("error");
  if (error) {
    return { kind: "error", code: error };
  }
  const clientId = params.get("client_id");
  const redirectUri = params.get("redirect_uri");
  const codeChallenge = params.get("code_challenge");
  if (!clientId || !redirectUri || !codeChallenge) {
    return { kind: "error", code: "oauth_request_invalid" };
  }
  return {
    kind: "request",
    request: { clientId, redirectUri, codeChallenge, state: params.get("state") },
  };
}

/** Where «Отмена» sends the browser: back to the AI app with `access_denied` (RFC 6749
 *  §4.1.2.1), so it stops waiting. */
export function deniedRedirect(request: AuthorizeRequest): string {
  const url = new URL(request.redirectUri);
  url.searchParams.set("error", "access_denied");
  if (request.state !== null) {
    url.searchParams.set("state", request.state);
  }
  return url.toString();
}
