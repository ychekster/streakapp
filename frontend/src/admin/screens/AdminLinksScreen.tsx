/**
 * Генератор ссылок с меткой: выбираете источник (Threads, Instagram, друзья или свой) и
 * пишете подпись — например, номер поста. Получаете две готовые ссылки и копируете их
 * одной кнопкой:
 *  - на бота — `t.me/<бот>?start=src_<источник>_<подпись>`: источник запоминается, когда
 *    человек нажмёт «Запустить» (bot/handlers/start.py);
 *  - на веб-версию — `<адрес>/?src=<источник>_<подпись>`: страница запоминает метку на
 *    устройстве и передаёт её дальше — и в установку, и в бота.
 *
 * Источник — латиница и цифры, подпись — ещё «-» и «_» (backend/sources.py); лишнее
 * отбрасывается прямо при вводе.
 */

import { useState } from "react";

import { fetchAnalyticsConfig } from "../../api/admin";
import { useAdminStrings } from "../adminStrings";
import { copyText } from "../analytics/exportTable";
import { ListItem } from "../../components/ListItem";
import { MenuSelect } from "../../components/MenuSelect";
import { Screen } from "../../components/Screen";
import { Card, Section } from "../../components/Section";
import { SOURCE_LINK_MAX_LENGTH, SOURCE_MAX_LENGTH, SOURCE_PRESETS } from "../../constants";
import { useResource } from "../../hooks/useResource";
import { hapticNotification } from "../../telegram/webapp";
import styles from "./AdminLinksScreen.module.css";

const OTHER = "other";

function cleanSource(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, SOURCE_MAX_LENGTH);
}

function cleanTag(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, SOURCE_LINK_MAX_LENGTH);
}

export function AdminLinksScreen() {
  const strings = useAdminStrings();
  const an = strings.an;
  const config = useResource(fetchAnalyticsConfig, "analytics-config");
  const [preset, setPreset] = useState<string>(SOURCE_PRESETS[0]);
  const [custom, setCustom] = useState("");
  const [tag, setTag] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const source = preset === OTHER ? custom : preset;
  const label = tag ? `${source}_${tag}` : source;
  const tooLong = label.length > SOURCE_LINK_MAX_LENGTH;
  const ready = source.length > 0 && !tooLong;
  const bot = config.data?.bot_username;
  const botLink = ready && bot ? `https://t.me/${bot}?start=src_${label}` : null;
  const webLink = ready && config.data ? `${config.data.web_url}/?src=${label}` : null;

  async function copy(kind: string, link: string): Promise<void> {
    if (await copyText(link)) {
      setCopied(kind);
      hapticNotification("success");
      window.setTimeout(() => setCopied((current) => (current === kind ? null : current)), 1500);
    }
  }

  const options = [
    ...SOURCE_PRESETS.map((name) => ({ value: name as string, label: an.sourceName(name) })),
    { value: OTHER, label: an.linksOther },
  ];

  return (
    <Screen title={an.linksTitle} withTabBar={false} enterAnimation>
      <div className={styles.form}>
        <Section variant="form" title={an.linksSource}>
          <Card>
            <ListItem label={an.linksSource}>
              <MenuSelect options={options} value={preset} onChange={setPreset} label={an.linksSource} />
            </ListItem>
            {preset === OTHER ? (
              <ListItem>
                <input
                  className={styles.input}
                  value={custom}
                  onChange={(event) => setCustom(cleanSource(event.target.value))}
                  placeholder={an.linksCustomPlaceholder}
                  aria-label={an.linksCustom}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </ListItem>
            ) : null}
          </Card>
        </Section>

        <Section
          variant="form"
          title={an.linksTag}
          footer={tooLong ? <span className={styles.error}>{an.linksTooLong(SOURCE_LINK_MAX_LENGTH)}</span> : an.linksTagFooter}
        >
          <Card>
            <ListItem>
              <input
                className={styles.input}
                value={tag}
                onChange={(event) => setTag(cleanTag(event.target.value))}
                placeholder={an.linksTagPlaceholder}
                aria-label={an.linksTag}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </ListItem>
          </Card>
        </Section>

        <LinkSection
          title={an.linksWeb}
          footer={an.linksWebFooter}
          link={webLink}
          copied={copied === "web"}
          onCopy={(link) => void copy("web", link)}
        />
        <LinkSection
          title={an.linksBot}
          footer={config.data && !bot ? an.linksBotMissing : an.linksBotFooter}
          link={botLink}
          copied={copied === "bot"}
          onCopy={(link) => void copy("bot", link)}
        />
      </div>
    </Screen>
  );
}

function LinkSection({
  title,
  footer,
  link,
  copied,
  onCopy,
}: {
  title: string;
  footer: string;
  link: string | null;
  copied: boolean;
  onCopy: (link: string) => void;
}) {
  const strings = useAdminStrings();
  return (
    <Section variant="form" title={title} footer={footer}>
      <Card>
        <ListItem>
          <span className={styles.link}>{link ?? "—"}</span>
        </ListItem>
        <ListItem
          label={copied ? strings.an.linksCopied : strings.an.linksCopy}
          accent
          disabled={!link}
          onPress={link ? () => onCopy(link) : undefined}
        />
      </Card>
    </Section>
  );
}
