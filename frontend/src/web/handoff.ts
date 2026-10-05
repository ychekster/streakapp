/**
 * Logging in with a handoff link — the single-use link of the Mini App's «Добавить на
 * рабочий стол» (spec 6.5). Used by the install page (Android browser) and by the
 * installed app's start (web/bootstrap.ts).
 *
 * When this device's guest already has habits, the user is asked first: the link may be
 * someone else's, and the habits would move into that account. Kept apart from login.ts
 * so the install page does not load the app's data layer.
 */

import { ApiRequestError } from "../api/client";
import { redeemHandoff, type LinkResult } from "../api/web";
import { confirmAction } from "../telegram/webapp";

/** Texts of the «move the habits?» question (the install page and the app have their own). */
export interface MergeQuestion {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
}

/** Redeem the link; null — the user said no, the device stays as it is. */
export async function redeemHandoffLink(
  token: string,
  question: MergeQuestion,
): Promise<LinkResult | null> {
  try {
    return await redeemHandoff(token);
  } catch (error) {
    if (!(error instanceof ApiRequestError && error.code === "handoff_merge")) {
      throw error;
    }
  }
  return (await confirmAction(question)) ? redeemHandoff(token, true) : null;
}
