/**
 * Тонкая типизированная обёртка над window.Telegram.WebApp.
 *
 * SDK подключается скриптом в index.html. Здесь — только то, что реально нужно
 * приложению: получить initData для авторизации и язык Telegram, раскрыть на весь
 * экран (полноэкранный режим — и на iPhone, и на Android), отметить платформу на <html>
 * для оформления, прокинуть отступы безопасных зон в
 * CSS, красить фон и шапку Telegram под тему, следить за светлой/тёмной темой Telegram,
 * управлять кнопками Telegram («Назад» и нижней MainButton), спросить подтверждение
 * системным диалогом и дать тактильный отклик.
 * Все обращения к SDK защищены проверками на наличие — приложение не падает, если
 * открыто вне Telegram или в старом клиенте.
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

/** Кнопка системного диалога Telegram (showPopup, Bot API 6.2+). У типов `ok`, `close`
 *  и `cancel` подпись ставит сам клиент — на языке Telegram. */
interface PopupButton {
  id: string;
  type?: "default" | "ok" | "close" | "cancel" | "destructive";
  text?: string;
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
  /** Неподписанная копия initData — только для оформления (язык), не для авторизации. */
  initDataUnsafe?: { user?: { language_code?: string } };
  platform: string;
  /** Светлая или тёмная тема Telegram сейчас; меняется с событием themeChanged. */
  colorScheme?: "light" | "dark";
  ready(): void;
  expand(): void;
  setBackgroundColor(color: string): void;
  setHeaderColor(color: string): void;
  // Цвет полосы под нижней кнопкой — Bot API 7.10+.
  setBottomBarColor?(color: string): void;
  // Системный диалог клиента Telegram (на iPhone — стандартный алерт iOS) — Bot API 6.2+.
  showPopup?(
    params: { title?: string; message: string; buttons: PopupButton[] },
    callback?: (buttonId: string) => void,
  ): void;
  // Полноэкранный режим и связанные методы — Bot API 8.0+ (могут отсутствовать).
  requestFullscreen?(): void;
  disableVerticalSwipes?(): void;
  // Отступы безопасных зон — Bot API 8.0+.
  safeAreaInset?: SafeAreaInset;
  contentSafeAreaInset?: SafeAreaInset;
  onEvent?(eventType: string, handler: () => void): void;
  offEvent?(eventType: string, handler: () => void): void;
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

/**
 * Отметить платформу клиента Telegram атрибутом data-platform на <html>: «android»,
 * «ios» или «other» (десктоп, веб). По нему стили включают оформление, которое
 * Android-вебвью тянет плохо (см. styles/variables.css) — поведение iPhone при этом
 * не меняется ни на пиксель.
 *
 * Вызывается из main.tsx до первой отрисовки, поэтому приложение сразу рисуется в
 * нужном виде, без мигания.
 */
export function applyPlatform(): void {
  const platform = getWebApp()?.platform ?? "";
  // Клиентов Android два: «android» и старый «android_x».
  const kind = platform.startsWith("android") ? "android" : platform === "ios" ? "ios" : "other";
  document.documentElement.dataset.platform = kind;
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

/** Код языка Telegram пользователя («ru», «en», …) или undefined вне Telegram. */
export function getTelegramLanguageCode(): string | undefined {
  return getWebApp()?.initDataUnsafe?.user?.language_code;
}

/** Светлая или тёмная тема Telegram сейчас; null вне Telegram или в старом клиенте. */
export function getTelegramColorScheme(): "light" | "dark" | null {
  return getWebApp()?.colorScheme ?? null;
}

/** Подписаться на смену темы Telegram; возвращает функцию отписки. */
export function onTelegramThemeChanged(handler: () => void): () => void {
  const webApp = getWebApp();
  webApp?.onEvent?.("themeChanged", handler);
  return () => webApp?.offEvent?.("themeChanged", handler);
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
 * Покрасить фон, шапку и полосу под нижней кнопкой Telegram в цвет фона приложения.
 * Вызывается при запуске и при каждой смене темы.
 */
export function setTelegramColors(backgroundColor: string): void {
  const webApp = getWebApp();
  try {
    webApp?.setBackgroundColor(backgroundColor);
    webApp?.setHeaderColor(backgroundColor);
    // Полоса под нижней кнопкой (форма привычки) — в цвет фона, без светлой плашки.
    webApp?.setBottomBarColor?.(backgroundColor);
  } catch {
    // Старые клиенты могут не поддерживать выбор цвета — не критично.
  }
}

/**
 * Инициализация при запуске: сообщить готовность, раскрыть на весь экран и прокинуть
 * отступы безопасных зон (цвета Telegram ставит setTelegramColors).
 *
 * `expand()` оставляет зазор сверху — приложение открывается «шторкой», которую можно
 * потянуть вниз и закрыть. Поэтому на телефонах (и iPhone, и Android) дополнительно
 * включаем полноэкранный режим (Bot API 8.0) и запрещаем вертикальные свайпы (Bot API
 * 7.7): иначе на Android прокрутка списка то и дело утягивает за собой само окно
 * приложения, из-за чего закреплённые шапка и нижняя навигация дрожат. На десктопе и в
 * вебе поведение не меняем — там приложение и так раскрывается корректно.
 *
 * Оба метода могут отсутствовать в старом клиенте — вызовы защищены проверками, и
 * приложение остаётся рабочим (просто «шторкой», как раньше).
 */
export function initTelegram(): void {
  const webApp = getWebApp();
  if (!webApp) {
    return;
  }
  webApp.ready();
  webApp.expand();

  const isPhone = webApp.platform === "ios" || webApp.platform.startsWith("android");
  if (isPhone) {
    try {
      // В фуллскрине вертикальный свайп не должен случайно сворачивать приложение.
      // Запрет ставим до фуллскрина: он работает и сам по себе, если фуллскрин не вышел.
      webApp.disableVerticalSwipes?.();
      webApp.requestFullscreen?.();
    } catch {
      // requestFullscreen может бросить на неподдерживаемом клиенте — игнорируем.
    }
  }

  // Применяем отступы безопасных зон сейчас и пересчитываем по событиям (фуллскрин
  // меняет их асинхронно — после перехода значения станут известны). На Android высота
  // окна приходит отдельным событием viewportChanged, и до него отступы ещё нулевые.
  applySafeAreaInsets(webApp);
  const refresh = (): void => applySafeAreaInsets(webApp);
  webApp.onEvent?.("safeAreaChanged", refresh);
  webApp.onEvent?.("contentSafeAreaChanged", refresh);
  webApp.onEvent?.("fullscreenChanged", refresh);
  webApp.onEvent?.("fullscreenFailed", refresh);
  webApp.onEvent?.("viewportChanged", refresh);
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

const CONFIRM_BUTTON_ID = "confirm";

/**
 * Спросить подтверждение системным диалогом клиента Telegram (`showPopup`): на iPhone
 * это стандартный алерт iOS — он рисуется самим Telegram, поэтому появляется мгновенно и
 * не зависит от вёрстки приложения. Промис — нажал ли пользователь кнопку действия.
 *
 * `destructive` красит кнопку действия в красный. Если метод недоступен (старый клиент
 * или запуск вне Telegram), спрашивает браузерным `confirm`.
 */
export function confirmAction(options: {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
}): Promise<boolean> {
  const webApp = getWebApp();
  const showPopup = webApp?.showPopup?.bind(webApp);
  const ask = (): boolean => window.confirm(`${options.title}\n\n${options.message}`);
  if (!showPopup) {
    return Promise.resolve(ask());
  }
  return new Promise((resolve) => {
    try {
      showPopup(
        {
          title: options.title,
          message: options.message,
          // Кнопка действия — второй: в алерте iOS главное действие справа.
          buttons: [
            { id: "cancel", type: "default", text: options.cancelLabel },
            {
              id: CONFIRM_BUTTON_ID,
              type: options.destructive ? "destructive" : "default",
              text: options.confirmLabel,
            },
          ],
        },
        // Диалог закрыли мимо кнопок (аппаратная «Назад» на Android) — это отказ.
        (buttonId) => resolve(buttonId === CONFIRM_BUTTON_ID),
      );
    } catch {
      // Другой диалог уже открыт или клиент не принял параметры.
      resolve(ask());
    }
  });
}

/** Тактильный отклик на успешное/неуспешное действие (если поддерживается клиентом). */
export function hapticNotification(type: HapticNotification): void {
  getWebApp()?.HapticFeedback?.notificationOccurred(type);
}

/** Лёгкий тактильный отклик на нажатие (если поддерживается клиентом). */
export function hapticImpact(style: HapticStyle = "light"): void {
  getWebApp()?.HapticFeedback?.impactOccurred(style);
}
