export const SESSION_FEE_ETH = 0.005;
export const BOOKING_STEP_ETH = 0.0005;
export const PLATFORM_FEE_RATE = 0.05;
export const PATIENT_NO_SHOW_RATE = 0.5;
export const MUTUAL_UNSTARTED_PLATFORM_FEE_RATE = 0.2;
export const BOOKING_STEP_SCALE = Math.round(1 / BOOKING_STEP_ETH);
export const SESSION_FEE_STEPS = Math.round(SESSION_FEE_ETH * BOOKING_STEP_SCALE);
export const PAYMENT_WINDOW_MS = 60 * 1000;
export const NO_SHOW_WINDOW_MINUTES = 2;
export const NO_SHOW_WINDOW_MS = NO_SHOW_WINDOW_MINUTES * 60 * 1000;
export const NO_SHOW_WINDOW_LABEL = `${NO_SHOW_WINDOW_MINUTES} minutes`;
export const PLATFORM_FEE_ETH = Number(
  (SESSION_FEE_ETH * PLATFORM_FEE_RATE).toFixed(6),
);
export const NORMAL_THERAPIST_PAYOUT_ETH = Number(
  (SESSION_FEE_ETH - PLATFORM_FEE_ETH).toFixed(6),
);
export const PATIENT_NO_SHOW_PENALTY_ETH = Number(
  (SESSION_FEE_ETH * PATIENT_NO_SHOW_RATE).toFixed(6),
);
export const PATIENT_NO_SHOW_REFUND_ETH = Number(
  (SESSION_FEE_ETH - PATIENT_NO_SHOW_PENALTY_ETH).toFixed(6),
);
export const THERAPIST_NO_SHOW_REFUND_ETH = SESSION_FEE_ETH;
export const MUTUAL_UNSTARTED_PROTOCOL_FEE_ETH = Number(
  (SESSION_FEE_ETH * MUTUAL_UNSTARTED_PLATFORM_FEE_RATE).toFixed(6),
);
export const MUTUAL_UNSTARTED_REFUND_ETH = Number(
  (SESSION_FEE_ETH - MUTUAL_UNSTARTED_PROTOCOL_FEE_ETH).toFixed(6),
);

export type FundingSource = "subsidy" | "mixed" | "wallet";

export type FundingResolution = {
  fee: number;
  subsidyApplied: number;
  walletRequired: number;
  fundingSource: FundingSource;
  feeSteps: number;
  subsidyAppliedSteps: number;
  walletRequiredSteps: number;
};

export type BookingFundingChoice = FundingResolution & {
  selfPay: number;
  selfPaySteps: number;
  patientSubsidyChoiceEth: number;
  patientWalletChoiceEth: number;
};

export type NoShowSettlementResult = {
  status: "patient_no_show" | "therapist_no_show" | "mutual_unstarted";
  penalty_fee_eth: number;
  refund_amount_eth: number;
  therapist_payout_eth: number;
  protocol_fee_eth: number;
  settlement_status:
    | "penalty_paid_to_therapist"
    | "refunded_to_patient"
    | "mutual_unstarted_platform_fee";
};

export const OPEN_BOOKING_STATUSES = [
  "requested",
  "queued_waiting_for_provider",
  "accepted_awaiting_payment",
  "funded",
  "in_session",
] as const;

export type OpenBookingStatus = (typeof OPEN_BOOKING_STATUSES)[number];

function normalizeEthValue(value: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, value);
}

export function ethToBookingSteps(value: number, fallback = 0) {
  const normalizedValue = normalizeEthValue(value, fallback);
  return Math.max(0, Math.round(Number(normalizedValue.toFixed(6)) * BOOKING_STEP_SCALE));
}

export function bookingStepsToEth(steps: number) {
  return Number((Math.max(0, Math.round(steps)) / BOOKING_STEP_SCALE).toFixed(6));
}

export function getBookingFundingSource(
  selfPay: number,
  fee = SESSION_FEE_ETH,
): FundingSource {
  const normalizedFeeSteps = ethToBookingSteps(fee, SESSION_FEE_STEPS);
  const normalizedSelfPaySteps = Math.min(
    normalizedFeeSteps,
    Math.max(0, ethToBookingSteps(selfPay, 0)),
  );

  if (normalizedSelfPaySteps <= 0) {
    return "subsidy";
  }

  if (normalizedSelfPaySteps >= normalizedFeeSteps) {
    return "wallet";
  }

  return "mixed";
}

export function clampSelfPayChoice(
  subsidyBalance: number,
  selfPayChoice: number,
  fee = SESSION_FEE_ETH,
) {
  const normalizedFeeSteps = ethToBookingSteps(fee, SESSION_FEE_STEPS);
  const normalizedSubsidySteps = ethToBookingSteps(subsidyBalance, 0);
  const minimumSelfPaySteps = Math.max(0, normalizedFeeSteps - normalizedSubsidySteps);
  const clampedChoiceSteps = Math.min(
    normalizedFeeSteps,
    Math.max(
      minimumSelfPaySteps,
      ethToBookingSteps(
        selfPayChoice,
        bookingStepsToEth(minimumSelfPaySteps),
      ),
    ),
  );

  return bookingStepsToEth(clampedChoiceSteps);
}

export function resolveFunding(
  subsidyBalance: number,
  fee = SESSION_FEE_ETH,
): FundingResolution {
  const normalizedFeeSteps = ethToBookingSteps(fee, SESSION_FEE_STEPS);
  const normalizedSubsidySteps = Math.min(
    ethToBookingSteps(subsidyBalance, 0),
    normalizedFeeSteps,
  );
  const walletRequiredSteps = Math.max(0, normalizedFeeSteps - normalizedSubsidySteps);
  const subsidyApplied = bookingStepsToEth(normalizedSubsidySteps);
  const walletRequired = bookingStepsToEth(walletRequiredSteps);
  const fundingSource =
    normalizedSubsidySteps >= normalizedFeeSteps
      ? "subsidy"
      : normalizedSubsidySteps > 0 && walletRequiredSteps > 0
        ? "mixed"
        : "wallet";

  return {
    fee: bookingStepsToEth(normalizedFeeSteps),
    subsidyApplied,
    walletRequired,
    fundingSource,
    feeSteps: normalizedFeeSteps,
    subsidyAppliedSteps: normalizedSubsidySteps,
    walletRequiredSteps,
  };
}

export function resolveFundingChoice(
  subsidyBalance: number,
  selfPayChoice: number,
  fee = SESSION_FEE_ETH,
): BookingFundingChoice {
  const normalizedFeeSteps = ethToBookingSteps(fee, SESSION_FEE_STEPS);
  const normalizedSubsidySteps = ethToBookingSteps(subsidyBalance, 0);
  const minimumSelfPaySteps = Math.max(0, normalizedFeeSteps - normalizedSubsidySteps);
  const selfPaySteps = Math.min(
    normalizedFeeSteps,
    Math.max(
      minimumSelfPaySteps,
      ethToBookingSteps(selfPayChoice, bookingStepsToEth(minimumSelfPaySteps)),
    ),
  );
  const subsidyAppliedSteps = Math.max(0, normalizedFeeSteps - selfPaySteps);
  const fundingSource = getBookingFundingSource(
    bookingStepsToEth(selfPaySteps),
    bookingStepsToEth(normalizedFeeSteps),
  );

  return {
    fee: bookingStepsToEth(normalizedFeeSteps),
    subsidyApplied: bookingStepsToEth(subsidyAppliedSteps),
    walletRequired: bookingStepsToEth(selfPaySteps),
    fundingSource,
    feeSteps: normalizedFeeSteps,
    subsidyAppliedSteps,
    walletRequiredSteps: selfPaySteps,
    selfPay: bookingStepsToEth(selfPaySteps),
    selfPaySteps,
    patientSubsidyChoiceEth: bookingStepsToEth(subsidyAppliedSteps),
    patientWalletChoiceEth: bookingStepsToEth(selfPaySteps),
  };
}

export function resolveNoShowSettlement(options: {
  patientJoinedAt?: string | null;
  therapistJoinedAt?: string | null;
}): NoShowSettlementResult | null {
  const patientJoined = Boolean(options.patientJoinedAt);
  const therapistJoined = Boolean(options.therapistJoinedAt);

  if (patientJoined && therapistJoined) {
    return null;
  }

  if (therapistJoined && !patientJoined) {
    return {
      status: "patient_no_show",
      penalty_fee_eth: PATIENT_NO_SHOW_PENALTY_ETH,
      refund_amount_eth: PATIENT_NO_SHOW_REFUND_ETH,
      therapist_payout_eth: PATIENT_NO_SHOW_PENALTY_ETH,
      protocol_fee_eth: 0,
      settlement_status: "penalty_paid_to_therapist",
    };
  }

  if (patientJoined && !therapistJoined) {
    return {
      status: "therapist_no_show",
      penalty_fee_eth: 0,
      refund_amount_eth: THERAPIST_NO_SHOW_REFUND_ETH,
      therapist_payout_eth: 0,
      protocol_fee_eth: 0,
      settlement_status: "refunded_to_patient",
    };
  }

  return {
    status: "mutual_unstarted",
    penalty_fee_eth: 0,
    refund_amount_eth: MUTUAL_UNSTARTED_REFUND_ETH,
    therapist_payout_eth: 0,
    protocol_fee_eth: MUTUAL_UNSTARTED_PROTOCOL_FEE_ETH,
    settlement_status: "mutual_unstarted_platform_fee",
  };
}

export function getSettlementPreview(status: string) {
  switch (status) {
    case "requested":
      return "Waiting for provider decision";
    case "queued_waiting_for_provider":
      return "Provider is currently busy. You are in the wait queue and can leave at any time without charge.";
    case "accepted_awaiting_payment":
      return "Provider accepted. Please confirm payment within 3 minutes.";
    case "funded":
      return "Session funded. Waiting for both participants to enter.";
    case "in_session":
      return "Session is live. Both participants have entered.";
    case "payment_timeout":
      return "Booking expired because payment was not confirmed in time.";
    case "patient_no_show":
      return `You did not arrive within ${NO_SHOW_WINDOW_LABEL}. 50% of the session fee was refunded and 50% was paid to the therapist.`;
    case "therapist_no_show":
      return `The therapist did not arrive within ${NO_SHOW_WINDOW_LABEL}. You have received a full refund.`;
    case "mutual_unstarted":
      return `Neither participant arrived within ${NO_SHOW_WINDOW_LABEL}. 80% of the session fee was refunded and a 20% platform fee was retained.`;
    case "rejected":
      return "The provider rejected this booking request.";
    case "patient_cancelled_waiting":
      return "You left the provider wait queue. No fee, penalty, or deposit was charged.";
    case "completed":
      return "Session completed and settlement released to the provider.";
    default:
      return "Session update available.";
  }
}
