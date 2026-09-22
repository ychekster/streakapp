/**
 * Вкладка «Рассылка» админ-панели — форма в стиле формы привычки:
 *  - Кому — сегмент получателей (системным меню) и сколько в нём людей сейчас;
 *  - Сообщение — текст (поле растёт вместе с ним), под ним — счётчик символов: у текста
 *    предел Telegram 4096, у подписи к фото или видео — 1024;
 *  - Фото или видео — необязательно: превью, размер и «Убрать»;
 *  - «Отправить рассылку» — после подтверждения в диалоге. Копия сразу приходит автору
 *    (так медиа загружается в Telegram), остальным рассылает бот.
 * Над формой — ход последней рассылки: сколько доставлено и не доставлено; пока она идёт,
 * он обновляется сам.
 *
 * Черновик и последняя рассылка хранятся в AdminApp — переход на другую вкладку их не
 * теряет. История рассылок не ведётся.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { createBroadcast, fetchBroadcast, fetchSegments } from "../api/admin";
import { formatBytes } from "../adminFormat";
import { ADMIN_STRINGS as S, describeAdminError } from "../adminStrings";
import { PaperPlaneIcon, PhotoIcon } from "../components/AdminIcons";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ListItem } from "../components/ListItem";
import { MenuSelect } from "../components/MenuSelect";
import { Screen } from "../components/Screen";
import { Card, Section } from "../components/Section";
import { TrashIcon } from "../components/SettingsIcons";
import { StatusMessage } from "../components/StatusMessage";
import {
  BROADCAST_PHOTO_MAX_BYTES,
  BROADCAST_PHOTO_TYPES,
  BROADCAST_POLL_MS,
  BROADCAST_VIDEO_MAX_BYTES,
  BROADCAST_VIDEO_TYPES,
  CAPTION_MAX_LENGTH,
  MESSAGE_MAX_LENGTH,
} from "../constants";
import { useResource } from "../hooks/useResource";
import { hapticNotification } from "../telegram/webapp";
import type { Broadcast } from "../types/admin";
import styles from "./AdminBroadcastScreen.module.css";

/** Черновик рассылки. */
export interface BroadcastDraft {
  segment: string;
  text: string;
  media: File | null;
}

export const EMPTY_DRAFT: BroadcastDraft = { segment: "all", text: "", media: null };

const MEDIA_ACCEPT = [...BROADCAST_PHOTO_TYPES, ...BROADCAST_VIDEO_TYPES].join(",");

function isVideo(file: File): boolean {
  return (BROADCAST_VIDEO_TYPES as readonly string[]).includes(file.type);
}

/** Почему файл не подходит (тип или размер); null — подходит. */
function mediaProblem(file: File): string | null {
  const photo = (BROADCAST_PHOTO_TYPES as readonly string[]).includes(file.type);
  if (!photo && !isVideo(file)) {
    return S.mediaUnsupported;
  }
  const limit = photo ? BROADCAST_PHOTO_MAX_BYTES : BROADCAST_VIDEO_MAX_BYTES;
  return file.size > limit ? S.mediaTooLarge : null;
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
  const segments = useResource(fetchSegments, "segments");
  const [confirming, setConfirming] = useState(false);
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
  }, [draft.text, segments.data]);

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

  const segmentList = segments.data ?? [];
  const segment = segmentList.find((item) => item.key === draft.segment) ?? segmentList[0];
  const limit = draft.media ? CAPTION_MAX_LENGTH : MESSAGE_MAX_LENGTH;
  const length = draft.text.trim().length;
  const valid =
    segment !== undefined &&
    segment.recipients > 0 &&
    (draft.media !== null || length > 0) &&
    length <= limit;

  function chooseMedia(file: File | undefined): void {
    if (!file) {
      return;
    }
    const problem = mediaProblem(file);
    setMediaError(problem);
    if (!problem) {
      onDraftChange({ ...draft, media: file });
    }
  }

  async function send(): Promise<void> {
    if (!segment) {
      return;
    }
    setSending(true);
    setSendError(null);
    try {
      const broadcast = await createBroadcast(segment.key, draft.text.trim(), draft.media);
      hapticNotification("success");
      onBroadcastChange(broadcast);
      onDraftChange({ ...EMPTY_DRAFT, segment: segment.key });
      setConfirming(false);
      segments.reload();
    } catch (error) {
      setSendError(describeAdminError(error, S.broadcastFailed));
      hapticNotification("error");
    } finally {
      setSending(false);
    }
  }

  return (
    <Screen title={S.broadcastTitle}>
      {renderContent()}
      <ConfirmDialog
        open={confirming}
        title={S.sendDialogTitle}
        message={
          sendError ??
          S.sendDialogMessage(
            segment?.recipients ?? 0,
            segment ? (S.segmentNames[segment.key] ?? segment.key) : "",
          )
        }
        cancelLabel={S.cancel}
        confirmLabel={S.sendDialogConfirm}
        busy={sending}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void send()}
      />
    </Screen>
  );

  function renderContent() {
    if (!segments.data) {
      return segments.status === "error" ? (
        <StatusMessage
          emoji={S.errorEmoji}
          title={S.errorTitle}
          description={describeAdminError(segments.error, S.broadcastLoadFailed)}
          actionLabel={S.retry}
          onAction={segments.reload}
        />
      ) : (
        <StatusMessage emoji={S.loadingEmoji} title={S.loading} />
      );
    }
    const options = segmentList.map((item) => ({
      value: item.key,
      label: S.segmentNames[item.key] ?? item.key,
    }));
    return (
      <div className={styles.form}>
        {lastBroadcast ? <Progress broadcast={lastBroadcast} /> : null}

        <Section
          variant="form"
          title={S.audienceSection}
          footer={segment ? S.recipients(segment.recipients) : undefined}
        >
          <Card>
            <ListItem label={S.sendTo}>
              <MenuSelect
                options={options}
                value={segment?.key ?? draft.segment}
                onChange={(key) => onDraftChange({ ...draft, segment: key })}
                label={S.sendTo}
              />
            </ListItem>
          </Card>
        </Section>

        <Section
          variant="form"
          title={S.messageSection}
          footer={
            <span className={length > limit ? styles.over : undefined}>
              {S.characters(length, limit)}
            </span>
          }
        >
          <Card>
            <ListItem>
              <textarea
                ref={textRef}
                className={styles.text}
                value={draft.text}
                onChange={(event) => onDraftChange({ ...draft, text: event.target.value })}
                placeholder={S.broadcastPlaceholder}
                aria-label={S.broadcastPlaceholder}
                rows={4}
              />
            </ListItem>
          </Card>
        </Section>

        <Section
          variant="form"
          title={S.mediaSection}
          footer={
            mediaError ? <span className={styles.over}>{mediaError}</span> : S.mediaFooter
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
                      <span className={styles.mediaSize}>{formatBytes(draft.media.size)}</span>
                    </span>
                  </span>
                </ListItem>
                <ListItem
                  icon={<TrashIcon />}
                  label={S.removeMedia}
                  destructive
                  onPress={() => onDraftChange({ ...draft, media: null })}
                />
              </>
            ) : (
              <ListItem
                icon={<PhotoIcon />}
                iconColor="green"
                label={S.addMedia}
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

        <div className={styles.send}>
          <Card>
            <ListItem
              icon={<PaperPlaneIcon />}
              iconColor="blue"
              label={S.sendBroadcast}
              accent
              disabled={!valid}
              onPress={() => {
                setSendError(null);
                setConfirming(true);
              }}
            />
          </Card>
        </div>
      </div>
    );
  }
}

/** Ход последней рассылки: полоса прогресса и итог. */
function Progress({ broadcast }: { broadcast: Broadcast }) {
  const processed = broadcast.sent + broadcast.failed;
  const share = broadcast.total ? Math.min(1, processed / broadcast.total) : 1;
  const status =
    broadcast.status === "done"
      ? S.broadcastDone
      : broadcast.status === "pending"
        ? S.broadcastWaiting
        : S.broadcastProgress(processed, broadcast.total);
  return (
    <Section variant="form" title={S.lastBroadcast}>
      <Card padded>
        <div className={styles.progress}>
          <p className={styles.progressStatus}>{status}</p>
          <div
            className={styles.meter}
            role="progressbar"
            aria-label={S.broadcastProgressLabel}
            aria-valuemin={0}
            aria-valuemax={broadcast.total}
            aria-valuenow={processed}
          >
            <span className={styles.meterFill} style={{ width: `${share * 100}%` }} />
          </div>
          <p className={styles.progressResult}>
            {S.broadcastResult(broadcast.sent, broadcast.failed)}
            {broadcast.status === "done" ? "" : ` · ${S.broadcastTotal(broadcast.total)}`}
          </p>
        </div>
      </Card>
    </Section>
  );
}
