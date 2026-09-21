/**
 * Тонкая типизированная обёртка над window.Telegram.WebApp.
 *
 * SDK подключается скриптом в index.html. Здесь — только то, что реально нужно
 * приложению: получить initData для авторизации, раскрыть на весь экран (включая
 * полноэкранный режим на iPhone), прокинуть отступы безопасных зон в CSS, управлять
 * кнопками Telegram («Назад» и нижней MainButton) и дать тактильный отклик. Все
 * обращения к SDK защищены проверками на наличие — приложение не падает, если открыто
 * вне Telegram или в старом клиенте.
 */

type HapticStyle = "light" | "medium" | "heavy" | "rigid" | "soft";
type HapticNotification = "error" | "success" | "warning";

interface TelegramHapticFeedback {
  impactOccurred(style: HapticStyle): void;
  notificationOccurred(type: HapticNotification): void;
}

/** Кнопка «Назад» в шапке Telegram (Bot API 6.1+): показанная, заменяет «Закрыть». */
interface TelegramBackButton {
  show(): void;
  hide(): void;
  onClick(handler: () => void): void;
  offClick(handler: () => void): void;
}

/** Параметры нижней кнопки Telegram. Цвета — только «#RRGGBB». */
interface BottomButtonParams {
  text?: string;
  color?: string;
  text_color?: string;
  is_active?: boolean;
  is_visible?: boolean;
}

/** Нижняя кнопка Telegram (MainButton, Bot API 6.0+) — нативная, над клавиатурой. */
interface TelegramBottomButton {
  setParams(params: BottomButtonParams): void;
  /** Спиннер в кнопке; `leaveActive: false` — кнопка неактивна, пока он крутится. */
  showProgress(leaveActive?: boolean): void;
  hideProgress(): void;
  onClick(handler: () => void): void;
  offClick(handler: () => void): void;
}

/** Отступы безопасной зоны (вырез устройства или панель управления Telegram). */
interface SafeAreaInset {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface TelegramWebApp {
  initData: string;
  platform: string;
  ready(): void;
  expand(): void;
  setBackgroundColor(color: string): void;
  setHeaderColor(color: string): void;
  // Цвет полосы под нижней кнопкой — Bot API 7.10+.
  setBottomBarColor?(color: string): void;
  // Полноэкранный режим и связанные методы — Bot API 8.0+ (могут отсутствовать).
  requestFullscreen?(): void;
  disableVerticalSwipes?(): void;
  // Отступы безопасных зон — Bot API 8.0+.
  safeAreaInset?: SafeAreaInset;
  contentSafeAreaInset?: SafeAreaInset;
  onEvent?(eventType: string, handler: () => void): void;
  BackButton?: TelegramBackButton;
  MainButton?: TelegramBottomButton;
  HapticFeedback?: TelegramHapticFeedback;
}

interface TelegramNamespace {
  WebApp?: TelegramWebApp;
}

declare global {
  interface Window {
    Telegram?: TelegramNamespace;
  }
}

function getWebApp(): TelegramWebApp | undefined {
  return window.Telegram?.WebApp;
}

/** Доступно ли приложение внутри Telegram (есть ли SDK и непустая initData). */
export function isTelegramAvailable(): boolean {
  const webApp = getWebApp();
  return Boolean(webApp && webApp.initData);
}

/** Сырая строка initData для заголовка авторизации (пустая строка вне Telegram). */
export function getInitData(): string {
  return getWebApp()?.initData ?? "";
}

/**
 * Прокинуть отступы безопасных зон Telegram в CSS-переменные:
 *  --app-safe-area-* — вырез устройства (чёлка, home indicator);
 *  --app-content-safe-area-* — панель управления Telegram в полноэкранном режиме.
 * В фуллскрине эти значения появляются асинхронно, поэтому функция вызывается
 * повторно по событиям изменения зон.
 */
function applySafeAreaInsets(webApp: TelegramWebApp): void {
  const root = document.documentElement;
  const setInset = (name: string, value: number | undefined): void => {
    if (typeof value === "number") {
      root.style.setProperty(name, `${value}px`);
    }
  };
  const safe = webApp.safeAreaInset;
  const content = webApp.contentSafeAreaInset;
  setInset("--app-safe-area-top", safe?.top);
  setInset("--app-safe-area-bottom", safe?.bottom);
  setInset("--app-content-safe-area-top", content?.top);
  setInset("--app-content-safe-area-bottom", content?.bottom);
  // Уведомляем UI (сворачивающийся заголовок) о новых отступах, чтобы он пересчитал
  // геометрию после асинхронного перехода в полноэкранный режим.
  window.dispatchEvent(new Event("app:insets"));
}

/**
 * Инициализация при запуске: сообщить готовность, раскрыть на весь экран,
 * подкрасить фон/шапку и прокинуть отступы безопасных зон.
 *
 * На iPhone `expand()` оставляет зазор сверху (приложение открывается «шторкой»),
 * поэтому дополнительно включаем полноэкранный режим (Bot API 8.0). На других
 * платформах поведение не меняем — там приложение и так раскрывается корректно.
 */
export function initTelegram(backgroundColor: string): void {
  const webApp = getWebApp();
  if (!webApp) {
    return;
  }
  webApp.ready();
  webApp.expand();
  try {
    webApp.setBackgroundColor(backgroundColor);
    webApp.setHeaderColor(backgroundColor);
    // Полоса под нижней кнопкой (форма привычки) — в цвет фона, без светлой плашки.
    webApp.setBottomBarColor?.(backgroundColor);
  } catch {
    // Старые клиенты могут не поддерживать выбор цвета — не критично.
  }

  if (webApp.platform === "ios" && typeof webApp.requestFullscreen === "function") {
    try {
      webApp.requestFullscreen();
      // В фуллскрине вертикальный свайп не должен случайно сворачивать приложение.
      webApp.disableVerticalSwipes?.();
    } catch {
      // requestFullscreen может бросить на неподдерживаемом клиенте — игнорируем.
    }
  }

  // Применяем отступы безопасных зон сейчас и пересчитываем по событиям (фуллскрин
  // меняет их асинхронно — после перехода значения станут известны).
  applySafeAreaInsets(webApp);
  const refresh = (): void => applySafeAreaInsets(webApp);
  webApp.onEvent?.("safeAreaChanged", refresh);
  webApp.onEvent?.("contentSafeAreaChanged", refresh);
  webApp.onEvent?.("fullscreenChanged", refresh);
}

/**
 * Показать кнопку «Назад» Telegram вместо «Закрыть» или вернуть «Закрыть».
 * Видимость и обработчик нажатия задаются отдельно: при переходе между вложенными
 * экранами кнопка остаётся на месте, меняется только обработчик (см. useBackButton).
 */
export function setBackButtonVisible(visible: boolean): void {
  const backButton = getWebApp()?.BackButton;
  if (visible) {
    backButton?.show();
  } else {
    backButton?.hide();
  }
}

/**
 * Подписаться на нажатие «Назад» (его же вызывает системный жест «назад» на Android).
 * Возвращает функцию отписки — её удобно вернуть из эффекта как cleanup.
 */
export function onBackButtonClick(handler: () => void): () => void {
  const backButton = getWebApp()?.BackButton;
  backButton?.onClick(handler);
  return () => backButton?.offClick(handler);
}

/** Состояние нижней кнопки Telegram. Цвета — «#RRGGBB». */
export interface MainButtonState {
  text: string;
  color: string;
  textColor: string;
  /** Можно ли нажать. */
  active: boolean;
  /** Идёт действие: в кнопке спиннер, нажать нельзя. */
  progress: boolean;
}

/** Показать нижнюю кнопку Telegram в заданном состоянии (или обновить показанную). */
export function showMainButton(state: MainButtonState): void {
  const mainButton = getWebApp()?.MainButton;
  if (!mainButton) {
    return;
  }
  // Спиннер — до параметров: hideProgress() в SDK снова делает кнопку активной, и заданная
  // после него активность это исправляет. showProgress(false) сам делает её неактивной.
  if (!state.progress) {
    mainButton.hideProgress();
  }
  mainButton.setParams({
    text: state.text,
    color: state.color,
    text_color: state.textColor,
    is_active: state.active,
    is_visible: true,
  });
  if (state.progress) {
    mainButton.showProgress(false);
  }
}

/** Спрятать нижнюю кнопку Telegram. */
export function hideMainButton(): void {
  const mainButton = getWebApp()?.MainButton;
  mainButton?.hideProgress();
  mainButton?.setParams({ is_visible: false });
}

/** Подписаться на нажатие нижней кнопки; возвращает функцию отписки. */
export function onMainButtonClick(handler: () => void): () => void {
  const mainButton = getWebApp()?.MainButton;
  mainButton?.onClick(handler);
  return () => mainButton?.offClick(handler);
}

/** Тактильный отклик на успешное/неуспешное действие (если поддерживается клиентом). */
export function hapticNotification(type: HapticNotification): void {
  getWebApp()?.HapticFeedback?.notificationOccurred(type);
}

/** Лёгкий тактильный отклик на нажатие (если поддерживается клиентом). */
export function hapticImpact(style: HapticStyle = "light"): void {
  getWebApp()?.HapticFeedback?.impactOccurred(style);
}
