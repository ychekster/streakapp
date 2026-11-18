/** «Подключить ИИ»: the consent page (/connect) and Settings. Mirrors
 *  backend/routers/oauth.py. */

import type {
  AiConnections,
  OAuthApproveRequest,
  OAuthApproveResponse,
  OAuthClientInfo,
  OAuthLoginPoll,
  OAuthLoginStart,
} from "../types/ai";
import { apiRequest } from "./client";

const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

export const fetchOAuthClient = (clientId: string, redirectUri: string) =>
  apiRequest<OAuthClientInfo>(
    `/oauth/client?${new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri })}`,
    { method: "GET" },
  );
export const startOAuthLogin = (clientId: string, redirectUri: string) =>
  apiRequest<OAuthLoginStart>(
    "/oauth/login/start",
    post({ client_id: clientId, redirect_uri: redirectUri }),
  );
export const pollOAuthLogin = (code: string) =>
  apiRequest<OAuthLoginPoll>("/oauth/login/poll", post({ token: code }));
export const approveOAuth = (request: OAuthApproveRequest) =>
  apiRequest<OAuthApproveResponse>("/oauth/approve", post(request));

export const fetchAiConnections = () =>
  apiRequest<AiConnections>("/ai/connections", { method: "GET" });
export const deleteAiConnection = (id: number) =>
  apiRequest<void>(`/ai/connections/${id}`, { method: "DELETE" });
