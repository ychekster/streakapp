/**
 * «Приложение на телефоне» inside the Mini App — Settings → «Добавить на рабочий стол».
 *
 * The bottom button opens the install page in the phone's real browser with a
 * single-use handoff link, so the installed app opens the same account. The browser is
 * opened from here rather than by a plain link: that would open Telegram's built-in
 * browser, where an app cannot be installed.
 *
 * Looks like the landing it leads to: the app icon and one line, centred.
 */

import { Screen } from "../components/Screen";
import { describeError } from "../errors";
import { useHandoffLink } from "../hooks/useHandoffLink";
import { useMainButton } from "../hooks/useMainButton";
import { useStrings } from "../preferences";
import { MAIN_BUTTON_ACCENT } from "../theme";
import styles from "./InstallFromTelegramScreen.module.css";

export function InstallFromTelegramScreen({ src }: { src: string }) {
  const strings = useStrings();
  const link = useHandoffLink(src, true);

  useMainButton(
    {
      text: strings.installOpen,
      ...MAIN_BUTTON_ACCENT,
      active: true,
      progress: !link.ready && !link.failed,
    },
    () => link.open(),
  );

  return (
    <Screen title={strings.installTitle} withTabBar={false} enterAnimation pinnedTitle>
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
