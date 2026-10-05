/** Web app (PWA) requests: accounts and logins, handoff, push subscriptions. Mirrors
 *  backend/routers/auth.py and routers/web.py. */

import { apiRequest } from "./client";

export interface AccountLogin {
  provider: "telegram";
  linked: boolean;
  /** @username or name it is linked as. */
  label: string | null;
}

export interface Account {
  user_id: number;
  is_guest: boolean;
  has_habits: boolean;
  logins: AccountLogin[];
}

export interface WebSession {
  token: string;
  user_id: number;
}

/** Result of linking a login: the account to continue in and, in the web app, its new
 *  session (the account may have switched or merged). */
export interface LinkResult {
  account: Account;
  session: WebSession | null;
}

export interface WebConfig {
  vapid_public_key: string | null;
  telegram_bot_username: string | null;
  telegram_bot_id: number | null;
}

export interface TelegramLoginStart {
  code: string;
  app_url: string;
  web_url: string;
  expires_in: number;
}

export interface Handoff {
  token: string;
  url: string;
  expires_in: number;
}

const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

export const createGuest = () => apiRequest<WebSession>("/auth/guest", { method: "POST" });
export const fetchAccount = () => apiRequest<Account>("/auth/account", { method: "GET" });
export const logout = (endpoint: string | null) =>
  apiRequest<null>("/auth/logout", post({ endpoint }));
export const fetchWebConfig = () => apiRequest<WebConfig>("/web/config", { method: "GET" });

export const createHandoff = (src: string) => apiRequest<Handoff>("/auth/handoff", post({ src }));
export const redeemHandoff = (token: string) =>
  apiRequest<LinkResult>("/auth/handoff/redeem", post({ token }));

export const startTelegramLogin = () =>
  apiRequest<TelegramLoginStart>("/auth/telegram/start", { method: "POST" });
export const pollTelegramLogin = (code: string) =>
  apiRequest<{ status: "pending" | "done"; result: LinkResult | null }>(
    "/auth/telegram/poll",
    post({ token: code }),
  );
export const savePushSubscription = (subscription: PushSubscriptionJSON) =>
  apiRequest<{ subscribed: boolean }>("/web/push/subscribe", post(subscription));
export const removePushSubscription = (endpoint: string) =>
  apiRequest<{ subscribed: boolean }>("/web/push/unsubscribe", post({ endpoint }));
