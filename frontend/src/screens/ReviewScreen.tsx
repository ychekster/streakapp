/**
 * Экран «Написать отзыв» (открывается из настроек): поле для отзыва с кнопкой отправки
 * внизу карточки — круглая кнопка с самолётиком, как в Telegram, — а под ним история
 * своих отзывов с ответами администратора.
 *
 * Отзыв уходит на сервер (POST /reviews) и появляется в разделе отзывов админ-панели;
 * после отправки поле очищается, а отзыв встаёт первым в историю. Если отправить не
 * вышло, причина видна под полем, а текст остаётся на месте. Нижней кнопки Telegram на
 * этом экране нет — «Назад» возвращает в настройки (её ставит App).
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { keptReviews, loadReviews, sendReview } from "../api/reviews";
import { Screen } from "../components/Screen";
import { Card, Section } from "../components/Section";
import { REVIEW_MAX_LENGTH } from "../constants";
import { describeError } from "../errors";
import { useLanguage, useStrings } from "../preferences";
import { hapticNotification } from "../telegram/webapp";
import type { UserReview } from "../types/review";
import styles from "./ReviewScreen.module.css";

export function ReviewScreen() {
  const strings = useStrings();
  const language = useLanguage();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Загруженная заранее (api/reviews.ts) — сразу; null — ещё не загружалась: секции нет.
  const [reviews, setReviews] = useState<UserReview[] | null>(keptReviews);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  // Отправка уже идёт: `busy` обновится только со следующим рендером, а второе быстрое
  // нажатие отправило бы отзыв дважды.
  const busyRef = useRef(false);
  const ready = text.trim() !== "" && !busy;

  useEffect(() => {
    let cancelled = false;
    // Свежий список (ответы администратора) подменяет показанный; отправленные, пока он
    // грузился (новее всех в нём), остаются первыми.
    loadReviews().then(
      (loaded) => {
        if (!cancelled) {
          const newest = loaded[0]?.id ?? 0;
          setReviews((current) => [
            ...(current ?? []).filter((item) => item.id > newest),
            ...loaded,
          ]);
        }
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // Поле растёт вместе с текстом: страница прокручивается целиком, без своей прокрутки
  // у поля.
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (field) {
      field.style.height = "auto";
      field.style.height = `${field.scrollHeight}px`;
    }
  }, [text]);

  async function send(): Promise<void> {
    const value = text.trim();
    if (value === "" || busyRef.current) {
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const review = await sendReview(value);
      setText("");
      setReviews((current) => [review, ...(current ?? [])]);
      hapticNotification("success");
    } catch (caught) {
      setError(describeError(strings, caught, strings.reviewFailed));
      hapticNotification("error");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <Screen title={strings.reviewTitle} withTabBar={false} enterAnimation>
      <div className={styles.compose}>
        <Card>
          <div className={styles.composer}>
            <textarea
              ref={fieldRef}
              className={styles.field}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={strings.reviewPlaceholder}
              aria-label={strings.reviewPlaceholder}
              maxLength={REVIEW_MAX_LENGTH}
              rows={1}
            />
            <div className={styles.actions}>
              <button
                type="button"
                className={`${styles.send} ${ready ? styles.ready : ""}`}
                onClick={() => void send()}
                disabled={!ready}
                aria-label={strings.reviewSend}
              >
                {busy ? (
                  <span className={styles.spinner} aria-hidden="true" />
                ) : (
                  <PaperPlane />
                )}
              </button>
            </div>
          </div>
        </Card>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : (
          <p className={styles.footer}>{strings.reviewDescription}</p>
        )}
      </div>

      {reviews && reviews.length > 0 ? (
        <Section variant="form" title={strings.reviewHistoryHeading}>
          <div className={styles.history}>
            {reviews.map((review) => (
              <Card key={review.id}>
                <article className={styles.review}>
                  <time className={styles.date} dateTime={review.created_at}>
                    {formatDate(review.created_at, language)}
                  </time>
                  <p className={styles.text}>{review.text}</p>
                  {review.reply_text ? (
                    <div className={styles.reply}>
                      <p className={styles.replyLabel}>{strings.reviewReplyLabel}</p>
                      <p className={styles.text}>{review.reply_text}</p>
                    </div>
                  ) : null}
                </article>
              </Card>
            ))}
          </div>
        </Section>
      ) : null}
    </Screen>
  );
}

/** Самолётик отправки (как в Telegram). */
function PaperPlane() {
  return (
    <svg className={styles.plane} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3.4 11.1 19.6 4.3c.8-.3 1.6.4 1.3 1.2l-6.1 15.6c-.3.8-1.4.8-1.8.1l-2.9-5.6c-.1-.2-.3-.4-.5-.5L4 12.9c-.8-.4-.7-1.5.1-1.8Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** «12 марта 2026 г.» / «March 12, 2026» в поясе устройства. */
function formatDate(iso: string, language: string): string {
  return new Intl.DateTimeFormat(language, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}
