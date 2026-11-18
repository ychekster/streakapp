/** «Подключить ИИ»: mirrors backend/schemas.py (OAuth*, AiConnection*). */

/** GET /oauth/client: which AI asks for access. */
export interface OAuthClientInfo {
  name: string;
  /** Where the answer goes back to (claude.ai…). */
  redirect_host: string;
}

export interface OAuthLoginStart {
  code: string;
  app_url: string;
  web_url: string;
  expires_in: number;
}

export interface OAuthLoginPoll {
  status: "pending" | "done";
  ticket: string | null;
  name: string | null;
  is_admin: boolean;
}

export interface OAuthApproveRequest {
  ticket: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  state: string | null;
  admin: boolean;
}

export interface OAuthApproveResponse {
  redirect: string;
  /** Statistics wait for «Разрешить» under the bot's message. */
  admin_pending: boolean;
}

/** One connected AI in Settings → «Подключить ИИ». */
export interface AiConnection {
  id: number;
  client_name: string;
  /** ISO, UTC. */
  created_at: string;
  last_used_at: string | null;
  /** Statistics allowed (administrator). */
  admin: boolean;
}

export interface AiConnections {
  /** The address to paste into the AI. */
  mcp_url: string;
  connections: AiConnection[];
}
