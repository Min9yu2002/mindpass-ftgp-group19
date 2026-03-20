import {
  resolveNoShowSettlement,
  type NoShowSettlementResult,
} from "./booking.ts";
import { hasTimestampExpired } from "./session-formatting.ts";
import {
  isAcceptedAwaitingPaymentStatus,
  isFundedOrLiveSessionStatus,
  isFundedSessionStatus,
} from "./session-status.ts";

type SessionTimingShape = {
  status: string;
  paymentDueAt?: string | null;
  noShowDeadlineAt?: string | null;
  patientJoinedAt?: string | null;
  therapistJoinedAt?: string | null;
  sessionStartedAt?: string | null;
  settlementStatus?: string | null;
};

export function shouldCatchPaymentTimeout(
  session: Pick<SessionTimingShape, "status" | "paymentDueAt">,
  now = Date.now(),
) {
  return (
    isAcceptedAwaitingPaymentStatus(session.status) &&
    hasTimestampExpired(session.paymentDueAt, now)
  );
}

export function shouldCatchFundedNoShow(
  session: Pick<
    SessionTimingShape,
    "status" | "noShowDeadlineAt" | "sessionStartedAt"
  >,
  now = Date.now(),
) {
  return (
    isFundedSessionStatus(session.status) &&
    !session.sessionStartedAt &&
    hasTimestampExpired(session.noShowDeadlineAt, now)
  );
}

export function getNoShowCatchUpSettlement(
  session: Pick<
    SessionTimingShape,
    | "status"
    | "noShowDeadlineAt"
    | "sessionStartedAt"
    | "patientJoinedAt"
    | "therapistJoinedAt"
  >,
  now = Date.now(),
): NoShowSettlementResult | null {
  if (!shouldCatchFundedNoShow(session, now)) {
    return null;
  }

  return resolveNoShowSettlement({
    patientJoinedAt: session.patientJoinedAt,
    therapistJoinedAt: session.therapistJoinedAt,
  });
}

export function canCheckIntoSession(
  session: Pick<SessionTimingShape, "status" | "noShowDeadlineAt">,
  now = Date.now(),
) {
  if (!isFundedOrLiveSessionStatus(session.status)) {
    return false;
  }

  if (!session.noShowDeadlineAt) {
    return true;
  }

  return !hasTimestampExpired(session.noShowDeadlineAt, now);
}

export function canRecordArrivalInteraction(
  session: Pick<SessionTimingShape, "status" | "noShowDeadlineAt">,
  now = Date.now(),
) {
  if (session.status === "in_session") {
    return true;
  }

  return canCheckIntoSession(session, now);
}

export function canAutoStartSession(
  session: Pick<
    SessionTimingShape,
    "status" | "patientJoinedAt" | "therapistJoinedAt" | "sessionStartedAt"
  >,
) {
  return Boolean(
    isFundedSessionStatus(session.status) &&
      session.patientJoinedAt &&
      session.therapistJoinedAt &&
      !session.sessionStartedAt,
  );
}

export function canCompleteSession(
  session: Pick<SessionTimingShape, "status" | "sessionStartedAt" | "settlementStatus">,
) {
  return Boolean(
    session.status === "in_session" &&
      session.sessionStartedAt &&
      session.settlementStatus === "held_in_escrow",
  );
}
