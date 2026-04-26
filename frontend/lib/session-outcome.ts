import { getSettlementPreview, NO_SHOW_WINDOW_LABEL } from "./booking";
import type { SessionTone } from "./session-formatting";
import type {
  SessionWorkflowStatus,
  TerminalSessionStatus,
} from "./session-status";
import { isTerminalSessionStatus } from "./session-status";

export type { TerminalSessionStatus } from "./session-status";

export const DEADLINE_OUTCOME_STATUSES = [
  "patient_no_show",
  "therapist_no_show",
  "mutual_unstarted",
] as const;

export type DeadlineOutcomeStatus = (typeof DEADLINE_OUTCOME_STATUSES)[number];

const deadlineOutcomeStatusSet = new Set<string>(DEADLINE_OUTCOME_STATUSES);

export type TerminalOutcomeCopy = {
  title: string;
  message: string;
  actionLabel: string;
  href: string;
};

export type BookingFeedbackTone = "warning" | "success";

export type BookingFeedbackView = {
  message: string;
  tone: BookingFeedbackTone;
};

export function isDeadlineOutcomeStatus(
  status?: string | null,
): status is DeadlineOutcomeStatus {
  return Boolean(status && deadlineOutcomeStatusSet.has(status));
}

export function getTerminalSessionOutcome(
  status: TerminalSessionStatus,
  isTherapist: boolean,
): TerminalOutcomeCopy {
  const fallbackHref = isTherapist ? "/provider-lobby" : "/dashboard";
  const fallbackAction = isTherapist ? "Back to lobby" : "Return";

  switch (status) {
    case "payment_timeout":
      return {
        title: "Booking expired",
        message: "Payment was not confirmed in time. You can return and book again.",
        actionLabel: isTherapist ? "Back to lobby" : "Book again",
        href: fallbackHref,
      };
    case "therapist_no_show":
      return {
        title: isTherapist ? "Session closed for therapist no-show" : "Therapist missed the session",
        message: isTherapist
          ? `You did not arrive within ${NO_SHOW_WINDOW_LABEL}. The session was fully refunded to the patient.`
          : `The therapist did not arrive within ${NO_SHOW_WINDOW_LABEL}. You have received a full refund.`,
        actionLabel: isTherapist ? "Back to lobby" : "Back to dashboard",
        href: fallbackHref,
      };
    case "patient_no_show":
      return {
        title: isTherapist ? "Patient missed the session" : "Session closed for patient no-show",
        message: isTherapist
          ? `The patient did not arrive within ${NO_SHOW_WINDOW_LABEL}. You received 50% of the session fee as compensation.`
          : `You did not arrive within ${NO_SHOW_WINDOW_LABEL}. 50% of the session fee has been refunded. The remaining 50% was paid to the therapist as compensation.`,
        actionLabel: isTherapist ? "Back to lobby" : "Back to dashboard",
        href: fallbackHref,
      };
    case "mutual_unstarted":
      return {
        title: "Session closed as mutual unstarted",
        message: isTherapist
          ? `Neither participant arrived within ${NO_SHOW_WINDOW_LABEL}. The session was closed. A reliability flag was recorded.`
          : `Neither participant arrived within ${NO_SHOW_WINDOW_LABEL}. 80% of the session fee has been refunded. A 20% platform fee was retained.`,
        actionLabel: isTherapist ? "Back to lobby" : "Back to dashboard",
        href: fallbackHref,
      };
    case "completed":
      return {
        title: "Session completed",
        message: "This session has already ended successfully.",
        actionLabel: isTherapist ? "Back to lobby" : "Back to dashboard",
        href: fallbackHref,
      };
    case "patient_cancelled_waiting":
      return {
        title: "Wait queue exited",
        message: "This queued request was cancelled before any funds were charged.",
        actionLabel: isTherapist ? "Back to lobby" : "Back to dashboard",
        href: fallbackHref,
      };
    case "rejected":
      return {
        title: "Booking unavailable",
        message: "This booking request was rejected and is no longer active.",
        actionLabel: isTherapist ? "Back to lobby" : "Return to dashboard",
        href: fallbackHref,
      };
    default:
      return {
        title: "Session unavailable",
        message: "This session is no longer available for live access.",
        actionLabel: fallbackAction,
        href: fallbackHref,
      };
  }
}

export function getTerminalSessionOutcomeOrNull(
  status: string,
  isTherapist: boolean,
): TerminalOutcomeCopy | null {
  return isTerminalSessionStatus(status)
    ? getTerminalSessionOutcome(status, isTherapist)
    : null;
}

export function getBookingStatusTone(status: SessionWorkflowStatus): SessionTone {
  if (status === "funded" || status === "in_session") {
    return "success";
  }

  if (status === "payment_timeout") {
    return "neutral";
  }

  return "warning";
}

export function getBookingFeedbackTone(
  status: SessionWorkflowStatus,
): BookingFeedbackTone {
  if (
    status === "funded" ||
    status === "in_session" ||
    status === "therapist_no_show" ||
    status === "completed" ||
    status === "patient_cancelled_waiting"
  ) {
    return "success";
  }

  return "warning";
}

export function buildBookingFeedback(
  statusOrSession:
    | SessionWorkflowStatus
    | Pick<{ status: SessionWorkflowStatus }, "status">,
): BookingFeedbackView {
  const status =
    typeof statusOrSession === "string"
      ? statusOrSession
      : statusOrSession.status;

  return {
    message: getSettlementPreview(status),
    tone: getBookingFeedbackTone(status),
  };
}
