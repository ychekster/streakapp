/**
 * Settings → «Подключить ИИ» (Mini App and web app alike): the address to paste into
 * Claude or ChatGPT as a connector, how to do it, and the AIs already connected with
 * «Отключить» (backend/routers/oauth.py `/ai/connections`). The AI itself logs in on the
 * consent page (connect/ConnectPage.tsx) when the person adds the connector.
 */

import { useCallback, useEffect, useState } from "react";

import { deleteAiConnection, fetchAiConnections } from "../api/ai";
import { ListGroup } from "../components/ListGroup";
import { ListItem } from "../components/ListItem";
import { Screen } from "../components/Screen";
import { Card, Section } from "../components/Section";
import { LinkIcon, SparklesIcon } from "../components/SettingsIcons";
import { StatusMessage } from "../components/StatusMessage";
import { describeError } from "../errors";
import { useLanguage, useStrings } from "../preferences";
import { confirmAction, hapticNotification, showAlert } from "../telegram/webapp";
import type { AiConnections } from "../types/ai";
import screenStyles from "./AiConnectScreen.module.css";
import formStyles from "./HabitFormScreen.module.css";
import styles from "./SettingsScreen.module.css";

type State =
  | { status: "loading" }
  | { status: "ready"; data: AiConnections }
  | { status: "error"; error: unknown };

export function AiConnectScreen() {
  const strings = useStrings();
  const language = useLanguage();
  const [state, setState] = useState<State>({ status: "loading" });
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(() => {
    setState({ status: "loading" });
    fetchAiConnections().then(
      (data) => setState({ status: "ready", data }),
      (error: unknown) => setState({ status: "error", error }),
    );
  }, []);

  useEffect(load, [load]);

  async function copy(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt(strings.aiCopiedTitle, url);
      return;
    }
    hapticNotification("success");
    await showAlert({ okLabel: strings.alertOk, title: strings.aiCopiedTitle, message: strings.aiCopiedMessage });
  }

  async function disconnect(id: number, name: string): Promise<void> {
    const confirmed = await confirmAction({
      title: strings.aiDisconnectTitle(name),
      message: strings.aiDisconnectMessage,
      confirmLabel: strings.aiDisconnect,
      cancelLabel: strings.aiDisconnectCancel,
      destructive: true,
    });
    if (!confirmed || state.status !== "ready") {
      return;
    }
    setBusy(id);
    try {
      await deleteAiConnection(id);
      hapticNotification("success");
      setState({
        status: "ready",
        data: { ...state.data, connections: state.data.connections.filter((item) => item.id !== id) },
      });
    } catch (caught) {
      hapticNotification("error");
      void showAlert({
        okLabel: strings.alertOk,
        title: strings.aiDisconnectFailed,
        message: describeError(strings, caught, strings.aiDisconnectFailed),
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen title={strings.aiTitle} withTabBar={false} enterAnimation pinnedTitle>
      <div className={`${styles.settings} ${formStyles.pinned}`}>{renderContent()}</div>
    </Screen>
  );

  function renderContent() {
    if (state.status === "loading") {
      return <StatusMessage icon="spinner" title={strings.settingsLoading} />;
    }
    if (state.status === "error") {
      return (
        <StatusMessage
          icon="alert"
          title={strings.errorTitle}
          description={describeError(strings, state.error, strings.aiLoadFailed)}
          actionLabel={strings.errorRetry}
          onAction={load}
        />
      );
    }
    const { mcp_url: url, connections } = state.data;
    return (
      <>
        <ListGroup footer={strings.aiIntro}>
          <ListItem
            icon={<LinkIcon />}
            iconColor="indigo"
            label={<span className={screenStyles.url}>{url}</span>}
            alignTop
          />
          <ListItem accent label={strings.aiCopy} onPress={() => void copy(url)} />
        </ListGroup>

        <div className={screenStyles.steps}>
          <Section variant="form" title={strings.aiStepsHeader} footer={strings.aiStepsFooter}>
            <Card>
              <ListItem label={strings.aiStepClaude} alignTop />
              <ListItem label={strings.aiStepChatgpt} alignTop />
            </Card>
          </Section>

          <Section variant="form" title={strings.aiConnectionsHeader}>
            <Card>
              {connections.length === 0 ? (
                <ListItem label={strings.aiNoConnections} />
              ) : (
                connections.map((item) => (
                  <ListItem
                    key={item.id}
                    icon={<SparklesIcon />}
                    iconColor="orange"
                    label={
                      <span className={screenStyles.stack}>
                        <span className={screenStyles.name}>{item.client_name}</span>
                        <span className={screenStyles.caption}>
                          {strings.aiConnectedOn(formatDate(item.created_at, language))}
                        </span>
                      </span>
                    }
                  >
                    <button
                      type="button"
                      className={screenStyles.disconnect}
                      disabled={busy === item.id}
                      onClick={() => void disconnect(item.id, item.client_name)}
                    >
                      {strings.aiDisconnect}
                    </button>
                  </ListItem>
                ))
              )}
            </Card>
          </Section>
        </div>
      </>
    );
  }
}

/** «12 марта 2026 г.» / «March 12, 2026» in the device's time zone. */
function formatDate(iso: string, language: string): string {
  return new Intl.DateTimeFormat(language, { day: "numeric", month: "long", year: "numeric" }).format(
    new Date(iso),
  );
}
