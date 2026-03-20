import { OPEN_BOOKING_STATUSES } from "./booking.ts";

export const SESSION_WORKFLOW_STATUSES = [
  "requested",
  "queued_waiting_for_provider",
  "accepted_awaiting_payment",
  "funded",
  "in_session",
  "payment_timeout",
  "patient_no_show",
  "therapist_no_show",
  "mutual_unstarted",
  "completed",
  "patient_cancelled_waiting",
  "rejected",
] as const;

export type SessionWorkflowStatus = (typeof SESSION_WORKFLOW_STATUSES)[number];
export const OPEN_SESSION_STATUSES = OPEN_BOOKING_STATUSES;
export type OpenSessionStatus = (typeof OPEN_SESSION_STATUSES)[number];

export const TERMINAL_SESSION_STATUSES = [
  "payment_timeout",
  "patient_no_show",
  "therapist_no_show",
  "mutual_unstarted",
  "completed",
  "patient_cancelled_waiting",
  "rejected",
] as const;

export type TerminalSessionStatus = (typeof TERMINAL_SESSION_STATUSES)[number];

export const FUNDED_OR_LIVE_SESSION_STATUSES = ["funded", "in_session"] as const;

export type FundedOrLiveSessionStatus =
  (typeof FUNDED_OR_LIVE_SESSION_STATUSES)[number];

export const CHAT_ALLOWED_SESSION_STATUSES = [
  "accepted_awaiting_payment",
  "funded",
  "in_session",
] as const;

export type ChatAllowedSessionStatus =
  (typeof CHAT_ALLOWED_SESSION_STATUSES)[number];

export const PROVIDER_QUEUE_SESSION_STATUSES = [
  "requested",
  "accepted_awaiting_payment",
  "funded",
  "in_session",
] as const;

export type ProviderQueueSessionStatus =
  (typeof PROVIDER_QUEUE_SESSION_STATUSES)[number];

export type SessionMode = "text" | "voice";

const sessionStatusSet = new Set<string>(SESSION_WORKFLOW_STATUSES);
const openSessionStatusSet = new Set<string>(OPEN_SESSION_STATUSES);
const terminalSessionStatusSet = new Set<string>(TERMINAL_SESSION_STATUSES);
const fundedOrLiveSessionStatusSet = new Set<string>(
  FUNDED_OR_LIVE_SESSION_STATUSES,
);
const chatAllowedSessionStatusSet = new Set<string>(CHAT_ALLOWED_SESSION_STATUSES);
const providerQueueStatusSet = new Set<string>(PROVIDER_QUEUE_SESSION_STATUSES);

export function normalizeSessionStatus(
  value: unknown,
  fallback: SessionWorkflowStatus = "requested",
): SessionWorkflowStatus {
  const status = String(value ?? fallback).trim().toLowerCase();
  return sessionStatusSet.has(status) ? (status as SessionWorkflowStatus) : fallback;
}

export function normalizeSessionMode(value: unknown): SessionMode {
  return String(value ?? "text").trim().toLowerCase() === "voice"
    ? "voice"
    : "text";
}

export function isOpenBookingStatus(
  status?: string | null,
): status is OpenSessionStatus {
  return Boolean(status && openSessionStatusSet.has(status));
}

export function isTerminalSessionStatus(
  status?: string | null,
): status is TerminalSessionStatus {
  return Boolean(status && terminalSessionStatusSet.has(status));
}

export function isProviderQueueSessionStatus(
  status?: string | null,
): status is ProviderQueueSessionStatus {
  return Boolean(status && providerQueueStatusSet.has(status));
}

export function isFundedOrLiveSessionStatus(
  status?: string | null,
): status is FundedOrLiveSessionStatus {
  return Boolean(status && fundedOrLiveSessionStatusSet.has(status));
}

export function isAcceptedAwaitingPaymentStatus(
  status?: string | null,
): status is "accepted_awaiting_payment" {
  return status === "accepted_awaiting_payment";
}

export function isFundedSessionStatus(
  status?: string | null,
): status is "funded" {
  return status === "funded";
}

export function isChatAllowedStatus(
  status?: string | null,
): status is ChatAllowedSessionStatus {
  return Boolean(status && chatAllowedSessionStatusSet.has(status));
}
