import test from "node:test";
import assert from "node:assert/strict";

import {
  isChatAllowedStatus,
  isFundedOrLiveSessionStatus,
  isOpenBookingStatus,
  isTerminalSessionStatus,
  normalizeSessionMode,
  normalizeSessionStatus,
} from "../session-status.ts";

test("normalizeSessionStatus keeps known workflow states and falls back safely", () => {
  assert.equal(normalizeSessionStatus("FUNDED"), "funded");
  assert.equal(normalizeSessionStatus(" patient_no_show "), "patient_no_show");
  assert.equal(normalizeSessionStatus(" mutual_unstarted "), "mutual_unstarted");
  assert.equal(
    normalizeSessionStatus(" queued_waiting_for_provider "),
    "queued_waiting_for_provider",
  );
  assert.equal(normalizeSessionStatus("unexpected_status"), "requested");
});

test("session-status predicates split open, chat, funded/live, and terminal states consistently", () => {
  assert.equal(isOpenBookingStatus("requested"), true);
  assert.equal(isOpenBookingStatus("queued_waiting_for_provider"), true);
  assert.equal(isOpenBookingStatus("completed"), false);

  assert.equal(isChatAllowedStatus("accepted_awaiting_payment"), true);
  assert.equal(isChatAllowedStatus("payment_timeout"), false);

  assert.equal(isFundedOrLiveSessionStatus("funded"), true);
  assert.equal(isFundedOrLiveSessionStatus("in_session"), true);
  assert.equal(isFundedOrLiveSessionStatus("requested"), false);

  assert.equal(isTerminalSessionStatus("therapist_no_show"), true);
  assert.equal(isTerminalSessionStatus("mutual_unstarted"), true);
  assert.equal(isTerminalSessionStatus("patient_cancelled_waiting"), true);
  assert.equal(isTerminalSessionStatus("funded"), false);
});

test("normalizeSessionMode keeps voice/text handling strict and safe", () => {
  assert.equal(normalizeSessionMode("voice"), "voice");
  assert.equal(normalizeSessionMode("VOICE"), "voice");
  assert.equal(normalizeSessionMode("text"), "text");
  assert.equal(normalizeSessionMode("video"), "text");
});
