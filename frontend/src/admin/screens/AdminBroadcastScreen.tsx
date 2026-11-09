/**
 * Вкладка «Рассылка» админ-панели — форма в стиле формы привычки:
 *  - Куда — канал: сообщение бота в Telegram или пуш в веб-приложении (тем, у кого там
 *    включены уведомления, в том числе без Telegram). У пуша — заголовок и текст, без
 *    медиа, а «кнопка» — куда ведёт нажатие на уведомление; копии автору нет;
 *  - Кому — фильтр получателей, по ряду на признак (AudienceFilterRows; условия
 *    складываются), и сколько получателей под ним сейчас. Из аналитики сюда приходят с
 *    группой людей («Рассылка этим людям») — она стоит первым рядом, её можно убрать;
 *  - Сообщение — текст (поле растёт вместе с ним), под ним — счётчик символов: у текста
 *    предел Telegram 4096, у подписи к фото или видео — 1024;
 *  - Фото или видео — необязательно: превью, размер и «Убрать»;
 *  - Кнопка под сообщением — необязательно: «Открыть приложение» или «Написать отзыв»
 *    (открывает приложение сразу на экране отзыва);
 *  - «Отправить рассылку» — после подтверждения системным диалогом Telegram. Копия сразу
 *    приходит автору (так медиа загружается в Telegram), остальным рассылает бот.
 * Над формой — ход последней рассылки: сколько доставлено и не доставлено; пока она идёт,
 * он обновляется сам.
 *
 * Черновик и последняя рассылка хранятся в AdminApp — переход на другую вкладку их не
 * теряет. История рассылок не ведётся.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { audienceEntries, audienceParam, segmentTitle, withoutSegment } from "../audience";
import { createBroadcast, fetchBroadcast, fetchRecipients } from "../../api/admin";
import { useAdminFormat } from "../adminFormat";
import { describeAdminError, useAdminStrings, type AdminStrings } from "../adminStrings";
import { PaperPlaneIcon, PhotoIcon } from "../components/AdminIcons";
import { AudienceFilterRows } from "../components/AudienceFilterRows";
import { ListItem } from "../../components/ListItem";
import { MenuSelect } from "../../components/MenuSelect";
import { Screen } from "../../components/Screen";
import { Card, Section } from "../../components/Section";
import { TrashIcon } from "../../components/SettingsIcons";
import {
  AUDIENCE_COUNT_DELAY_MS,
  BROADCAST_BUTTONS,
  BROADCAST_FILTER_KEYS,
  BROADCAST_PHOTO_MAX_BYTES,
  BROADCAST_PHOTO_TYPES,
  BROADCAST_POLL_MS,
  BROADCAST_VIDEO_MAX_BYTES,
  BROADCAST_VIDEO_TYPES,
  CAPTION_MAX_LENGTH,
  MESSAGE_MAX_LENGTH,
  PUSH_TEXT_MAX_LENGTH,
  PUSH_TITLE_MAX_LENGTH,
} from "../../constants";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useResource } from "../../hooks/useResource";
import { confirmAction, hapticNotification } from "../../telegram/webapp";
import type { Audience, Broadcast, BroadcastButton, BroadcastChannel } from "../../types/admin";
import styles from "./AdminBroadcastScreen.module.css";

/** Черновик рассылки. */
export interface BroadcastDraft {
  /** Фильтр получателей; пустой — все пользователи. */
  audience: Audience;
  /** Канал: сообщение бота или пуш веб-приложения. */
  channel: BroadcastChannel;
  /** Заголовок пуша (у Telegram не используется). */
  title: string;
  text: string;
  media: File | null;
  button: BroadcastButton;
}

export const EMPTY_DRAFT: BroadcastDraft = {
  audience: {},
  channel: "telegram",
  title: "",
  text: "",
  media: null,
  button: "",
};

const CHANNELS: BroadcastChannel[] = ["telegram", "push"];

const MEDIA_ACCEPT = [...BROADCAST_PHOTO_TYPES, ...BROADCAST_VIDEO_TYPES].join(",");

function isVideo(file: File): boolean {
  return (BROADCAST_VIDEO_TYPES as readonly string[]).includes(file.type);
}

/** Почему файл не подходит (тип или размер); null — подходит. */
function mediaProblem(file: File, strings: AdminStrings): string | null {
  const photo = (BROADCAST_PHOTO_TYPES as readonly string[]).includes(file.type);
  if (!photo && !isVideo(file)) {
    return strings.mediaUnsupported;
  }
  const limit = photo ? BROADCAST_PHOTO_MAX_BYTES : BROADCAST_VIDEO_MAX_BYTES;
  return file.size > limit ? strings.mediaTooLarge : null;
}

interface AdminBroadcastScreenProps {
  draft: BroadcastDraft;
  onDraftChange: (draft: BroadcastDraft) => void;
  lastBroadcast: Broadcast | null;
  onBroadcastChange: (broadcast: Broadcast) => void;
}

export function AdminBroadcastScreen({
  draft,
  onDraftChange,
  lastBroadcast,
  onBroadcastChange,
}: AdminBroadcastScreenProps) {
  const strings = useAdminStrings();
  const format = useAdminFormat();
  // Пока значения фильтра переключают подряд, получатели не пересчитываются на каждое.
  const settledAudience = useDebouncedValue(draft.audience, AUDIENCE_COUNT_DELAY_MS);
  const push = draft.channel === "push";
  const recipients = useResource(
    () => fetchRecipients(settledAudience, draft.channel),
    `${draft.channel}:${audienceParam(settledAudience)}`,
  );
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const preview = useMemo(
    () => (draft.media ? URL.createObjectURL(draft.media) : null),
    [draft.media],
  );

  useEffect(() => (preview ? () => URL.revokeObjectURL(preview) : undefined), [preview]);

  // Поле текста растёт вместе с текстом: страница прокручивается целиком, без своей
  // прокрутки у поля.
  useLayoutEffect(() => {
    const field = textRef.current;
    if (field) {
      field.style.height = "auto";
      field.style.height = `${field.scrollHeight}px`;
    }
  }, [draft.text]);

  // Пока последняя рассылка идёт, её ход обновляется сам.
  const pollingId = lastBroadcast && lastBroadcast.status !== "done" ? lastBroadcast.id : null;
  useEffect(() => {
    if (pollingId === null) {
      return;
    }
    const timer = window.setInterval(() => {
      fetchBroadcast(pollingId)
        .then(onBroadcastChange)
        .catch(() => {
          // Следующая попытка — через интервал.
        });
    }, BROADCAST_POLL_MS);
    return () => window.clearInterval(timer);
  }, [pollingId, onBroadcastChange]);

  // Число получателей — для текущего фильтра, а не для прежнего, пока идёт пересчёт.
  const counted =
    audienceParam(settledAudience) === audienceParam(draft.audience) &&
    !recipients.refreshing &&
    recipients.status === "ready"
      ? recipients.data
      : null;
  const limit = push
    ? PUSH_TEXT_MAX_LENGTH
    : draft.media
      ? CAPTION_MAX_LENGTH
      : MESSAGE_MAX_LENGTH;
  const length = draft.text.trim().length;
  const titleLength = draft.title.trim().length;
  const valid =
    counted !== null &&
    counted > 0 &&
    (push
      ? length > 0 && titleLength > 0 && titleLength <= PUSH_TITLE_MAX_LENGTH
      : draft.media !== null || length > 0) &&
    length <= limit;

  function chooseMedia(file: File | undefined): void {
    if (!file) {
      return;
    }
    const problem = mediaProblem(file, strings);
    setMediaError(problem);
    if (!problem) {
      onDraftChange({ ...draft, media: file });
    }
  }

  // Кому — для диалога подтверждения: выбранные условия через запятую или «всем».
  const segment = draft.audience.segment;
  const groupName = segment ? segmentTitle(segment) ?? strings.an.segmentFallback(segment) : null;
  const audienceText =
    [
      ...(groupName ? [strings.an.segmentChip(groupName)] : []),
      ...audienceEntries(draft.audience).map(([key, value]) =>
        strings.filterValues[key][value].toLowerCase(),
      ),
    ].join(", ") || strings.audienceAll;

  async function send(): Promise<void> {
    if (counted === null || sending) {
      return;
    }
    setSendError(null);
    const confirmed = await confirmAction({
      title: strings.sendDialogTitle,
      message: (push ? strings.pushDialogMessage : strings.sendDialogMessage)(
        counted,
        audienceText,
      ),
      confirmLabel: strings.sendDialogConfirm,
      cancelLabel: strings.cancel,
    });
    if (!confirmed) {
      return;
    }
    setSending(true);
    try {
      const broadcast = await createBroadcast(
        draft.audience,
        draft.text.trim(),
        draft.button,
        push ? null : draft.media,
        draft.channel,
        push ? draft.title.trim() : "",
      );
      hapticNotification("success");
      onBroadcastChange(broadcast);
      // Текст и медиа — на новую рассылку; кому, куда и с какой кнопкой — как в этой.
      onDraftChange({
        ...EMPTY_DRAFT,
        audience: draft.audience,
        channel: draft.channel,
        button: draft.button,
      });
      recipients.reload();
    } catch (error) {
      setSendError(describeAdminError(strings, error, strings.broadcastFailed));
      hapticNotification("error");
    } finally {
      setSending(false);
    }
  }

  return <Screen title={strings.broadcastTitle}>{renderContent()}</Screen>;

  function renderContent() {
    const buttonOptions = push
      ? BROADCAST_BUTTONS.filter((button) => button !== "").map((button) => ({
          value: button,
          label: strings.pushTargets[button],
        }))
      : BROADCAST_BUTTONS.map((button) => ({
          value: button,
          label: strings.buttonNames[button],
        }));
    const channelOptions = CHANNELS.map((channel) => ({
      value: channel,
      label: strings.channelNames[channel],
    }));
    const recipientsFooter =
      counted !== null ? (
        (push ? strings.pushRecipients : strings.recipients)(counted)
      ) : recipients.status === "error" && !recipients.refreshing ? (
        <span className={styles.over}>
          {describeAdminError(strings, recipients.error, strings.recipientsFailed)}
        </span>
      ) : (
        strings.recipientsCounting
      );
    return (
      <div className={styles.form}>
        {lastBroadcast ? <Progress broadcast={lastBroadcast} /> : null}

        <Section
          variant="form"
          title={strings.channelSection}
          footer={strings.channelFooters[draft.channel]}
        >
          <Card>
            <ListItem label={strings.channelRow}>
              <MenuSelect
                options={channelOptions}
                value={draft.channel}
                onChange={(channel) => onDraftChange({ ...draft, channel })}
                label={strings.channelRow}
              />
            </ListItem>
          </Card>
        </Section>

        <Section
          variant="form"
          title={strings.audienceSection}
          footer={recipientsFooter}
        >
          <Card>
            {groupName ? (
              <>
                <ListItem label={strings.an.segmentRow}>
                  <span className={styles.segment}>{groupName}</span>
                </ListItem>
                <ListItem
                  label={strings.an.removeSegment}
                  destructive
                  onPress={() => onDraftChange({ ...draft, audience: withoutSegment(draft.audience) })}
                />
              </>
            ) : null}
            <AudienceFilterRows
              keys={BROADCAST_FILTER_KEYS}
              audience={draft.audience}
              onChange={(audience) => onDraftChange({ ...draft, audience })}
            />
          </Card>
        </Section>

        <Section
          variant="form"
          title={strings.messageSection}
          footer={
            <span className={length > limit ? styles.over : undefined}>
              {strings.characters(length, limit, !push && draft.media !== null)}
            </span>
          }
        >
          <Card>
            {push ? (
              <ListItem>
                <input
                  className={styles.title}
                  value={draft.title}
                  maxLength={PUSH_TITLE_MAX_LENGTH}
                  onChange={(event) => onDraftChange({ ...draft, title: event.target.value })}
                  placeholder={strings.pushTitlePlaceholder}
                  aria-label={strings.pushTitlePlaceholder}
                />
              </ListItem>
            ) : null}
            <ListItem>
              <textarea
                ref={textRef}
                className={styles.text}
                value={draft.text}
                onChange={(event) => onDraftChange({ ...draft, text: event.target.value })}
                placeholder={push ? strings.pushTextPlaceholder : strings.broadcastPlaceholder}
                aria-label={push ? strings.pushTextPlaceholder : strings.broadcastPlaceholder}
                rows={4}
              />
            </ListItem>
          </Card>
        </Section>

        {push ? null : (
          <Section
            variant="form"
            title={strings.mediaSection}
            footer={
              mediaError ? <span className={styles.over}>{mediaError}</span> : strings.mediaFooter
            }
          >
            <Card>
              {draft.media && preview ? (
                <>
                  <ListItem>
                    <span className={styles.media}>
                      {isVideo(draft.media) ? (
                        <video className={styles.preview} src={preview} muted playsInline />
                      ) : (
                        <img className={styles.preview} src={preview} alt="" />
                      )}
                      <span className={styles.mediaInfo}>
                        <span className={styles.mediaName}>{draft.media.name}</span>
                        <span className={styles.mediaSize}>{format.bytes(draft.media.size)}</span>
                      </span>
                    </span>
                  </ListItem>
                  <ListItem
                    icon={<TrashIcon />}
                    label={strings.removeMedia}
                    destructive
                    onPress={() => onDraftChange({ ...draft, media: null })}
                  />
                </>
              ) : (
                <ListItem
                  icon={<PhotoIcon />}
                  iconColor="green"
                  label={strings.addMedia}
                  accent
                  onPress={() => fileInputRef.current?.click()}
                />
              )}
            </Card>
            <input
              ref={fileInputRef}
              className={styles.file}
              type="file"
              accept={MEDIA_ACCEPT}
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => {
                chooseMedia(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </Section>
        )}

        <Section
          variant="form"
          title={strings.buttonSection}
          footer={push ? strings.pushButtonFooter : strings.buttonFooters[draft.button]}
        >
          <Card>
            <ListItem label={push ? strings.pushButtonRow : strings.buttonRow}>
              <MenuSelect
                options={buttonOptions}
                value={push && draft.button === "" ? "open_app" : draft.button}
                onChange={(button) => onDraftChange({ ...draft, button })}
                label={push ? strings.pushButtonRow : strings.buttonRow}
              />
            </ListItem>
          </Card>
        </Section>

        <div className={styles.send}>
          <Card>
            <ListItem
              icon={<PaperPlaneIcon />}
              iconColor="blue"
              label={strings.sendBroadcast}
              accent
              disabled={!valid || sending}
              onPress={() => void send()}
            />
          </Card>
          {sendError ? (
            <p className={styles.error} role="alert">
              {sendError}
            </p>
          ) : null}
        </div>
      </div>
    );
  }
}

/** Ход последней рассылки: полоса прогресса и итог. */
function Progress({ broadcast }: { broadcast: Broadcast }) {
  const strings = useAdminStrings();
  const processed = broadcast.sent + broadcast.failed;
  const share = broadcast.total ? Math.min(1, processed / broadcast.total) : 1;
  const status =
    broadcast.status === "done"
      ? strings.broadcastDone
      : broadcast.status === "pending"
        ? strings.broadcastWaiting
        : strings.broadcastProgress(processed, broadcast.total);
  return (
    <Section variant="form" title={strings.lastBroadcast}>
      <Card padded>
        <div className={styles.progress}>
          <p className={styles.progressStatus}>{status}</p>
          <div
            className={styles.meter}
            role="progressbar"
            aria-label={strings.broadcastProgressLabel}
            aria-valuemin={0}
            aria-valuemax={broadcast.total}
            aria-valuenow={processed}
          >
            <span className={styles.meterFill} style={{ width: `${share * 100}%` }} />
          </div>
          <p className={styles.progressResult}>
            {strings.broadcastResult(broadcast.sent, broadcast.failed)}
            {broadcast.status === "done" ? "" : `, ${strings.broadcastTotal(broadcast.total)}`}
          </p>
        </div>
      </Card>
    </Section>
  );
}
