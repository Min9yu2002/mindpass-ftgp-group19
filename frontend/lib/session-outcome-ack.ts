"use client";

import type { DeadlineOutcomeStatus } from "./session-outcome";

const DEADLINE_OUTCOME_ACK_PREFIX = "mindpass-deadline-outcome-ack:v1";

export function buildDeadlineOutcomeAckKey(options: {
  viewerRole: "patient" | "therapist";
  sessionId: string;
  status: DeadlineOutcomeStatus;
  updatedAt?: string | null;
}) {
  const normalizedUpdatedAt =
    typeof options.updatedAt === "string" && options.updatedAt.trim().length > 0
      ? options.updatedAt.trim()
      : "unknown";

  return [
    DEADLINE_OUTCOME_ACK_PREFIX,
    options.viewerRole,
    options.sessionId,
    options.status,
    normalizedUpdatedAt,
  ].join(":");
}

export function isDeadlineOutcomeAcknowledged(ackKey: string) {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(ackKey) !== null;
  } catch {
    return false;
  }
}

export function acknowledgeDeadlineOutcome(ackKey: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(ackKey, new Date().toISOString());
  } catch {
    // Ignore localStorage write failures and keep the modal dismiss functional.
  }
}
