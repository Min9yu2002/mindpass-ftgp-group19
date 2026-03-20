import {
  buildBookingFeedback,
  type BookingFeedbackView,
} from "./session-outcome.ts";
import {
  isFundedOrLiveSessionStatus,
  type ProviderQueueSessionStatus,
  type SessionWorkflowStatus,
} from "./session-status.ts";

export type ProviderQueueActionModel = {
  showDecisionButtons: boolean;
  showEnterChat: boolean;
};

export function isFocusedPatientDashboardState(
  status?: SessionWorkflowStatus | null,
) {
  return isFundedOrLiveSessionStatus(status);
}

export function shouldAutoOpenPatientSessionReadyModal(
  session: { id: string; status: SessionWorkflowStatus } | null,
  dismissedSessionId: string | null,
) {
  return Boolean(
    session &&
      session.status === "funded" &&
      session.id &&
      dismissedSessionId !== session.id,
  );
}

export function shouldAutoOpenProviderSessionReadyModal(
  session: { id: string; status: ProviderQueueSessionStatus } | null,
  lastShownSessionId: string | null,
) {
  return Boolean(
    session &&
      session.status === "funded" &&
      session.id &&
      lastShownSessionId !== session.id,
  );
}

export function buildPatientBookingFeedback(
  status: SessionWorkflowStatus,
): BookingFeedbackView {
  return buildBookingFeedback(status);
}

export function getPatientSessionPrimaryAction(
  status: SessionWorkflowStatus,
) {
  if (status === "accepted_awaiting_payment") {
    return "open_payment";
  }

  if (status === "funded") {
    return "open_chat_prompt";
  }

  if (status === "in_session") {
    return "enter_chat";
  }

  return null;
}

export function getProviderQueueActionModel(
  status: ProviderQueueSessionStatus,
): ProviderQueueActionModel {
  return {
    showDecisionButtons: status === "requested",
    showEnterChat: status === "funded" || status === "in_session",
  };
}
