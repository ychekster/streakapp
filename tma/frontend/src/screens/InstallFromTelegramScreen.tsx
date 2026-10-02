/**
 * «Приложение на телефоне» inside the Mini App — where the bot's «Установить» button
 * (the one-time offer after the first check-in) leads, address parameter `open=install`.
 *
 * One button opens the install page in the phone's real browser with a single-use
 * handoff link, so the installed app opens the same account. The browser is opened from
 * here rather than by a plain link in the bot message: that would open Telegram's
 * built-in browser, where an app cannot be installed.
 */

import { StatusMessage } from "../components/StatusMessage";
import { Screen } from "../components/Screen";
import { useHandoffLink } from "../hooks/useHandoffLink";
import { useStrings } from "../preferences";

export function InstallFromTelegramScreen({ src }: { src: string }) {
  const strings = useStrings();
  const link = useHandoffLink(src, true);

  return (
    <Screen title={strings.installTitle} withTabBar={false} enterAnimation>
      {link.ready || link.failed ? (
        <StatusMessage
          icon="send"
          title={strings.installTitle}
          description={link.failed && !link.ready ? strings.installFailed : strings.installDescription}
          actionLabel={strings.installOpen}
          onAction={link.open}
        />
      ) : (
        <StatusMessage icon="spinner" title={strings.installPreparing} />
      )}
    </Screen>
  );
}
