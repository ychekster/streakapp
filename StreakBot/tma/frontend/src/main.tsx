/** Точка входа фронтенда: монтирует приложение и подключает глобальные стили. */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { applyPlatform } from "./telegram/webapp";
// Порядок важен: сначала дизайн-токены (переменные), затем глобальные стили.
import "./styles/variables.css";
import "./styles/global.css";

// Платформу отмечаем до первой отрисовки: от неё зависит оформление (см. variables.css),
// и иначе Android-клиент на мгновение показал бы вариант для iPhone.
applyPlatform();

const container = document.getElementById("root");
if (!container) {
  throw new Error("Корневой элемент #root не найден в index.html");
}

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
