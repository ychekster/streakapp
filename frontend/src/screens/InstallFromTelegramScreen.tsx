/**
 * «Приложение на телефоне» inside the Mini App — where the bot's «Установить» button
 * (the one-time offer after the first check-in) leads, address parameter `open=install`.
 *
 * The bottom button opens the install page in the phone's real browser with a
 * single-use handoff link, so the installed app opens the same account. The browser is
 * opened from here rather than by a plain link in the bot message: that would open
 * Telegram's built-in browser, where an app cannot be installed.
 *
 * Looks like the landing it leads to: the app icon and one line, centred.
 */

import { useMemo } from "react";

import { Screen } from "../components/Screen";
import { describeError } from "../errors";
import { useHandoffLink } from "../hooks/useHandoffLink";
import { useMainButton } from "../hooks/useMainButton";
import { useResolvedTheme, useStrings } from "../preferences";
import { readRootVariable } from "../theme";
import styles from "./InstallFromTelegramScreen.module.css";

export function InstallFromTelegramScreen({ src }: { src: string }) {
  const strings = useStrings();
  const theme = useResolvedTheme();
  const link = useHandoffLink(src, true);

  // Цвета нижней кнопки — из дизайн-токенов; у тёмной темы они свои.
  const buttonColors = useMemo(
    () => ({
      color: readRootVariable("--color-accent"),
      textColor: readRootVariable("--color-on-habit"),
    }),
    [theme],
  );
  useMainButton(
    {
      text: strings.installOpen,
      ...buttonColors,
      active: true,
      progress: !link.ready && !link.failed,
    },
    () => link.open(),
  );

  return (
    <Screen title={strings.installTitle} withTabBar={false} enterAnimation>
      <div className={styles.hero}>
        <img className={styles.icon} src="/icons/app-icon.webp" alt="" />
        <p className={styles.description}>
          {link.failed && !link.ready
            ? describeError(strings, link.error, strings.installFailed)
            : strings.installDescription}
        </p>
      </div>
    </Screen>
  );
}
