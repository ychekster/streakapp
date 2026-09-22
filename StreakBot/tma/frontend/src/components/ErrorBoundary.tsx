/**
 * Последний рубеж: ошибка при отрисовке (например, неожиданный ответ API) не оставляет
 * пустой белый экран, а показывает сообщение и кнопку перезапуска.
 *
 * Стоит над всем приложением, вне контекста языка (preferences.ts), поэтому язык берёт
 * из запомненных на устройстве настроек.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";

import styles from "../App.module.css";
import { readSavedPreferences } from "../preferences";
import { STRINGS } from "../strings";
import { StatusMessage } from "./StatusMessage";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  failed: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Unhandled render error", error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.failed) {
      return this.props.children;
    }
    const strings = STRINGS[readSavedPreferences().language];
    return (
      <main className={styles.fallback}>
        <StatusMessage
          emoji={strings.errorEmoji}
          title={strings.errorTitle}
          description={strings.crashDescription}
          actionLabel={strings.crashReload}
          onAction={() => window.location.reload()}
        />
      </main>
    );
  }
}
