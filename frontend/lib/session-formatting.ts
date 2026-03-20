import type {
  ProviderQueueSessionStatus,
  SessionMode,
} from "./session-status.ts";

export type SessionTone = "warning" | "success" | "neutral";

export function hasTimestampExpired(value?: string | null, now = Date.now()) {
  if (!value) {
    return false;
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return false;
  }

  return timestamp <= now;
}

export function formatSessionMode(value: SessionMode) {
  return value === "voice" ? "Voice" : "Text";
}

export function formatProviderQueueStatusLabel(status: ProviderQueueSessionStatus) {
  if (status === "accepted_awaiting_payment") {
    return "Awaiting Payment";
  }

  if (status === "funded") {
    return "Funded";
  }

  if (status === "in_session") {
    return "In Session";
  }

  return "Requested";
}

export function formatProviderQueueStatusTone(
  status: ProviderQueueSessionStatus,
): SessionTone {
  if (status === "funded" || status === "in_session") {
    return "success";
  }

  if (status === "accepted_awaiting_payment") {
    return "neutral";
  }

  return "warning";
}
