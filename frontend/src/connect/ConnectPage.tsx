/**
 * «Подключить ИИ»: the page an AI app (Claude, ChatGPT…) opens to get access to the
 * person's Knot (backend/oauth.py). Opened in a plain browser tab at `/connect?…`, never
 * inside Telegram or the installed app (main.tsx).
 *
 * One screen and one confirmation: the page shows which AI asks and what it will be able
 * to do; «Разрешить» opens the bot, which asks «Подключить Claude к вашему Knot?»; that
 * press is the consent, so the page then finishes by itself (`/oauth/approve`) and sends
 * the browser back to the AI app with the code. «Отмена» sends it back with
 * `access_denied`.
 *
 * The login code is kept for the tab (sessionStorage): a phone that reloads the page
 * after Telegram picks the login up where it was.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { approveOAuth, fetchOAuthClient, pollOAuthLogin, startOAuthLogin } from "../api/ai";
import { ListGroup } from "../components/ListGroup";
import { ListItem } from "../components/ListItem";
import { StatusMessage } from "../components/StatusMessage";
import { describeError } from "../errors";
import { readSavedPreferences } from "../preferences";
import { STRINGS } from "../strings";
import type { OAuthClientInfo } from "../types/ai";
import { openTelegram } from "../web/login";
import { deniedRedirect, readConnectParams, type AuthorizeRequest } from "./params";
import styles from "./ConnectPage.module.css";

// How often the page asks whether the bot's «Разрешить» was pressed (ms).
const POLL_INTERVAL_MS = 2000;
const PENDING_KEY = "knot:connect-login";

type Step =
  | { kind: "loading" }
  | { kind: "ask" }
  | { kind: "waiting"; code: string; appUrl: string; webUrl: string }
  | { kind: "finishing" }
  | { kind: "done" }
  | { kind: "cancelled" }
  | { kind: "failed"; error: unknown };

interface PendingLogin {
  code: string;
  appUrl: string;
  webUrl: string;
  expires: number;
}

function readPending(): PendingLogin | null {
  try {
    const pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? "null") as PendingLogin | null;
    return pending && pending.expires > Date.now() ? pending : null;
  } catch {
    return null;
  }
}

function writePending(pending: PendingLogin | null): void {
  try {
    if (pending) {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    } else {
      sessionStorage.removeItem(PENDING_KEY);
    }
  } catch {
    // Without storage the login still works while the tab stays open.
  }
}

export function ConnectPage() {
  const strings = STRINGS[readSavedPreferences().language];
  const [params] = useState(() => readConnectParams(window.location.search));
  const [client, setClient] = useState<OAuthClientInfo | null>(null);
  const [step, setStep] = useState<Step>({ kind: "loading" });

  const request = params.kind === "request" ? params.request : null;

  useEffect(() => {
    if (request === null) {
      return;
    }
    fetchOAuthClient(request.clientId, request.redirectUri).then(
      (info) => {
        setClient(info);
        const pending = readPending();
        setStep(pending ? { kind: "waiting", ...pending } : { kind: "ask" });
      },
      (error: unknown) => setStep({ kind: "failed", error }),
    );
  }, [request]);

  /** «Разрешить»: the bot asks to confirm (or, while waiting, opens it again). */
  const allow = useCallback(() => {
    if (request === null) {
      return;
    }
    if (step.kind === "waiting") {
      openTelegram(step);
      return;
    }
    startOAuthLogin(request.clientId, request.redirectUri).then(
      (start) => {
        const pending = {
          code: start.code,
          appUrl: start.app_url,
          webUrl: start.web_url,
          expires: Date.now() + start.expires_in * 1000,
        };
        writePending(pending);
        setStep({ kind: "waiting", ...pending });
        openTelegram(pending);
      },
      (error: unknown) => setStep({ kind: "failed", error }),
    );
  }, [request, step]);

  // Confirmed in the bot: finish without another press and go back to the AI.
  const finished = useRef(false);
  const finish = useCallback((ticket: string, authorize: AuthorizeRequest) => {
    if (finished.current) {
      return;
    }
    finished.current = true;
    setStep({ kind: "finishing" });
    approveOAuth({
      ticket,
      client_id: authorize.clientId,
      redirect_uri: authorize.redirectUri,
      code_challenge: authorize.codeChallenge,
      state: authorize.state,
      admin: false,
    }).then(
      (answer) => {
        setStep({ kind: "done" });
        window.location.assign(answer.redirect);
      },
      (error: unknown) => setStep({ kind: "failed", error }),
    );
  }, []);

  const code = step.kind === "waiting" ? step.code : null;
  useEffect(() => {
    if (code === null || request === null) {
      return;
    }
    let stopped = false;
    const check = (): void => {
      pollOAuthLogin(code).then(
        (answer) => {
          if (stopped || answer.status !== "done" || answer.ticket === null) {
            return;
          }
          stopped = true;
          writePending(null);
          finish(answer.ticket, request);
        },
        (error: unknown) => {
          // No connection for a moment: the next poll tries again; a stale login stops.
          if (!stopped && (error as { status?: number }).status) {
            stopped = true;
            writePending(null);
            setStep({ kind: "failed", error });
          }
        },
      );
    };
    const timer = window.setInterval(check, POLL_INTERVAL_MS);
    // Back from Telegram: ask at once.
    const onVisible = (): void => {
      if (document.visibilityState === "visible") {
        check();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [code, request, finish]);

  function cancel(authorize: AuthorizeRequest): void {
    writePending(null);
    setStep({ kind: "cancelled" });
    window.location.assign(deniedRedirect(authorize));
  }

  return (
    <main className={styles.page}>
      <div className={styles.column}>{renderStep()}</div>
    </main>
  );

  function renderStep() {
    if (params.kind === "error") {
      return (
        <StatusMessage
          icon="alert"
          title={strings.connectErrorTitle}
          description={strings.apiErrors[params.code as keyof typeof strings.apiErrors] ?? strings.connectFailed}
        />
      );
    }
    const authorize = params.request;
    const name = client?.name ?? "";
    switch (step.kind) {
      case "loading":
      case "finishing":
        return <StatusMessage icon="spinner" title={strings.connectLoading} />;
      case "failed":
        return (
          <StatusMessage
            icon="alert"
            title={strings.connectErrorTitle}
            description={describeError(strings, step.error, strings.connectFailed)}
          />
        );
      case "done":
        return (
          <StatusMessage icon="check" title={strings.connectDoneTitle} description={strings.connectDoneHint} />
        );
      case "cancelled":
        return (
          <StatusMessage
            icon="hand"
            title={strings.connectCancelledTitle}
            description={strings.connectCancelledHint}
          />
        );
      case "ask":
      case "waiting":
        return (
          <>
            <header className={styles.header}>
              <h1 className={styles.title}>
                {step.kind === "waiting" ? strings.connectWaitingTitle : strings.connectTitle(name)}
              </h1>
              {step.kind === "waiting" ? (
                <p className={styles.lead}>{strings.connectWaitingHint}</p>
              ) : null}
            </header>
            {step.kind === "ask" ? (
              <>
                <p className={styles.heading}>{strings.connectCan(name)}</p>
                <ListGroup footer={strings.connectCannot}>
                  <ListItem label={strings.connectCanRead} alignTop />
                  <ListItem label={strings.connectCanWrite} alignTop />
                </ListGroup>
                {client?.redirect_host ? (
                  <p className={styles.note}>{strings.connectReturn(client.redirect_host)}</p>
                ) : null}
              </>
            ) : null}
            <div className={styles.actions}>
              <button type="button" className={styles.primary} onClick={allow}>
                {step.kind === "waiting" ? strings.connectOpenAgain : strings.connectAllow}
              </button>
              <button type="button" className={styles.secondary} onClick={() => cancel(authorize)}>
                {strings.connectCancel}
              </button>
            </div>
          </>
        );
    }
  }
}
