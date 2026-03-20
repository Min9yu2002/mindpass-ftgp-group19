export type HexAddress = `0x${string}`;
export type HexValue = `0x${string}`;

export const MINDPASS_ESCROW_CHAIN_ID = 11155111;
export const SESSION_FEE_WEI = 5_000_000_000_000_000n;
export const NORMAL_PROTOCOL_FEE_WEI = 250_000_000_000_000n;
export const NORMAL_THERAPIST_PAYOUT_WEI = 4_750_000_000_000_000n;
export const PATIENT_NO_SHOW_PENALTY_WEI = 1_000_000_000_000_000n;
export const PATIENT_NO_SHOW_REFUND_WEI = 4_000_000_000_000_000n;
export const THERAPIST_NO_SHOW_REFUND_WEI = 5_000_000_000_000_000n;

export const MINDPASS_ESCROW_DEPLOYMENT = {
  chainId: MINDPASS_ESCROW_CHAIN_ID,
  address: null as HexAddress | null,
};

export const MINDPASS_ESCROW_WRITE_FUNCTIONS = [
  "createBookingRequest",
  "acceptBooking",
  "rejectBooking",
  "fundPatientPortion",
  "fundSubsidyPortion",
  "resolvePaymentTimeout",
  "cancelUnstartedSession",
  "checkInAsPatient",
  "checkInAsTherapist",
  "resolveNoShow",
  "completeSession",
  "withdraw",
] as const;

export type MindPassEscrowWriteFunctionName =
  (typeof MINDPASS_ESCROW_WRITE_FUNCTIONS)[number];

export const MINDPASS_ESCROW_ABI = [
  {
    type: "function",
    name: "createBookingRequest",
    stateMutability: "nonpayable",
    inputs: [
      { name: "therapist", type: "address" },
      { name: "walletRequiredWei", type: "uint256" },
      { name: "subsidyRequiredWei", type: "uint256" },
      { name: "sessionMode", type: "bytes32" },
    ],
    outputs: [{ name: "sessionId", type: "uint256" }],
  },
  {
    type: "function",
    name: "acceptBooking",
    stateMutability: "nonpayable",
    inputs: [{ name: "sessionId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "rejectBooking",
    stateMutability: "nonpayable",
    inputs: [{ name: "sessionId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "fundPatientPortion",
    stateMutability: "payable",
    inputs: [{ name: "sessionId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "fundSubsidyPortion",
    stateMutability: "payable",
    inputs: [{ name: "sessionId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "resolvePaymentTimeout",
    stateMutability: "nonpayable",
    inputs: [{ name: "sessionId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "cancelUnstartedSession",
    stateMutability: "nonpayable",
    inputs: [{ name: "sessionId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "checkInAsPatient",
    stateMutability: "nonpayable",
    inputs: [{ name: "sessionId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "checkInAsTherapist",
    stateMutability: "nonpayable",
    inputs: [{ name: "sessionId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "resolveNoShow",
    stateMutability: "nonpayable",
    inputs: [{ name: "sessionId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "completeSession",
    stateMutability: "nonpayable",
    inputs: [{ name: "sessionId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "event",
    name: "BookingRequested",
    anonymous: false,
    inputs: [
      { indexed: true, name: "sessionId", type: "uint256" },
      { indexed: true, name: "patient", type: "address" },
      { indexed: true, name: "therapist", type: "address" },
      { indexed: false, name: "walletRequiredWei", type: "uint256" },
      { indexed: false, name: "subsidyRequiredWei", type: "uint256" },
      { indexed: false, name: "sessionMode", type: "bytes32" },
    ],
  },
  {
    type: "event",
    name: "BookingAccepted",
    anonymous: false,
    inputs: [
      { indexed: true, name: "sessionId", type: "uint256" },
      { indexed: true, name: "therapist", type: "address" },
      { indexed: false, name: "providerAcceptedAt", type: "uint256" },
      { indexed: false, name: "paymentDueAt", type: "uint256" },
      { indexed: false, name: "noShowDeadlineAt", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "BookingRejected",
    anonymous: false,
    inputs: [
      { indexed: true, name: "sessionId", type: "uint256" },
      { indexed: true, name: "therapist", type: "address" },
    ],
  },
  {
    type: "event",
    name: "PatientPortionFunded",
    anonymous: false,
    inputs: [
      { indexed: true, name: "sessionId", type: "uint256" },
      { indexed: true, name: "patient", type: "address" },
      { indexed: false, name: "amountWei", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "SubsidyPortionFunded",
    anonymous: false,
    inputs: [
      { indexed: true, name: "sessionId", type: "uint256" },
      { indexed: true, name: "vault", type: "address" },
      { indexed: false, name: "amountWei", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "SessionFunded",
    anonymous: false,
    inputs: [
      { indexed: true, name: "sessionId", type: "uint256" },
      { indexed: false, name: "walletFundedWei", type: "uint256" },
      { indexed: false, name: "subsidyFundedWei", type: "uint256" },
      { indexed: false, name: "fundedAt", type: "uint256" },
      { indexed: false, name: "noShowDeadlineAt", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "SessionCancelledUnstarted",
    anonymous: false,
    inputs: [
      { indexed: true, name: "sessionId", type: "uint256" },
      { indexed: true, name: "cancelledBy", type: "address" },
      { indexed: false, name: "patientRefundWei", type: "uint256" },
      { indexed: false, name: "vaultRefundWei", type: "uint256" },
      { indexed: false, name: "cancelledAt", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "PaymentTimedOut",
    anonymous: false,
    inputs: [
      { indexed: true, name: "sessionId", type: "uint256" },
      { indexed: false, name: "paymentTimeoutAt", type: "uint256" },
      { indexed: false, name: "patientRefundWei", type: "uint256" },
      { indexed: false, name: "vaultRefundWei", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "PatientCheckedIn",
    anonymous: false,
    inputs: [
      { indexed: true, name: "sessionId", type: "uint256" },
      { indexed: true, name: "patient", type: "address" },
      { indexed: false, name: "checkedInAt", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "TherapistCheckedIn",
    anonymous: false,
    inputs: [
      { indexed: true, name: "sessionId", type: "uint256" },
      { indexed: true, name: "therapist", type: "address" },
      { indexed: false, name: "checkedInAt", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "SessionStarted",
    anonymous: false,
    inputs: [{ indexed: true, name: "sessionId", type: "uint256" }, { indexed: false, name: "sessionStartedAt", type: "uint256" }],
  },
  {
    type: "event",
    name: "PatientNoShowResolved",
    anonymous: false,
    inputs: [
      { indexed: true, name: "sessionId", type: "uint256" },
      { indexed: false, name: "therapistPayoutWei", type: "uint256" },
      { indexed: false, name: "patientRefundWei", type: "uint256" },
      { indexed: false, name: "vaultRefundWei", type: "uint256" },
      { indexed: false, name: "penaltyFeeWei", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "TherapistNoShowResolved",
    anonymous: false,
    inputs: [
      { indexed: true, name: "sessionId", type: "uint256" },
      { indexed: false, name: "patientRefundWei", type: "uint256" },
      { indexed: false, name: "vaultRefundWei", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "SessionCompleted",
    anonymous: false,
    inputs: [
      { indexed: true, name: "sessionId", type: "uint256" },
      { indexed: false, name: "therapistPayoutWei", type: "uint256" },
      { indexed: false, name: "protocolFeeWei", type: "uint256" },
      { indexed: false, name: "completedAt", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "Withdrawal",
    anonymous: false,
    inputs: [
      { indexed: true, name: "account", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
    ],
  },
] as const;

export type MindPassEscrowContractConfig = {
  address: HexAddress;
  abi: typeof MINDPASS_ESCROW_ABI;
  chainId: typeof MINDPASS_ESCROW_CHAIN_ID;
};

export type PreparedMindPassEscrowWrite<
  TFunctionName extends MindPassEscrowWriteFunctionName,
  TArgs extends readonly unknown[],
> = MindPassEscrowContractConfig & {
  functionName: TFunctionName;
  args: TArgs;
  value?: bigint;
};

export function getMindPassEscrowConfig(
  address: HexAddress,
): MindPassEscrowContractConfig {
  return {
    address,
    abi: MINDPASS_ESCROW_ABI,
    chainId: MINDPASS_ESCROW_CHAIN_ID,
  };
}

function textToBytes32Hex(value: string): HexValue {
  const normalized = value.trim().slice(0, 32);
  let hex = "";

  for (let index = 0; index < normalized.length; index += 1) {
    hex += normalized.charCodeAt(index).toString(16).padStart(2, "0");
  }

  return `0x${hex.padEnd(64, "0")}` as HexValue;
}

export function encodeSessionModeBytes32(
  sessionMode: "text" | "voice" | string,
) {
  return textToBytes32Hex(sessionMode);
}

export function prepareCreateBookingRequest(params: {
  address: HexAddress;
  therapist: HexAddress;
  walletRequiredWei: bigint;
  subsidyRequiredWei: bigint;
  sessionMode: "text" | "voice" | string;
}) {
  return {
    ...getMindPassEscrowConfig(params.address),
    functionName: "createBookingRequest",
    args: [
      params.therapist,
      params.walletRequiredWei,
      params.subsidyRequiredWei,
      encodeSessionModeBytes32(params.sessionMode),
    ],
  } as PreparedMindPassEscrowWrite<
    "createBookingRequest",
    readonly [HexAddress, bigint, bigint, HexValue]
  >;
}

export function prepareAcceptBooking(params: {
  address: HexAddress;
  sessionId: bigint;
}) {
  return {
    ...getMindPassEscrowConfig(params.address),
    functionName: "acceptBooking",
    args: [params.sessionId],
  } as PreparedMindPassEscrowWrite<"acceptBooking", readonly [bigint]>;
}

export function prepareRejectBooking(params: {
  address: HexAddress;
  sessionId: bigint;
}) {
  return {
    ...getMindPassEscrowConfig(params.address),
    functionName: "rejectBooking",
    args: [params.sessionId],
  } as PreparedMindPassEscrowWrite<"rejectBooking", readonly [bigint]>;
}

export function prepareFundPatientPortion(params: {
  address: HexAddress;
  sessionId: bigint;
  valueWei: bigint;
}) {
  return {
    ...getMindPassEscrowConfig(params.address),
    functionName: "fundPatientPortion",
    args: [params.sessionId],
    value: params.valueWei,
  } as PreparedMindPassEscrowWrite<"fundPatientPortion", readonly [bigint]>;
}

export function prepareFundSubsidyPortion(params: {
  address: HexAddress;
  sessionId: bigint;
  valueWei: bigint;
}) {
  return {
    ...getMindPassEscrowConfig(params.address),
    functionName: "fundSubsidyPortion",
    args: [params.sessionId],
    value: params.valueWei,
  } as PreparedMindPassEscrowWrite<"fundSubsidyPortion", readonly [bigint]>;
}

export function prepareResolvePaymentTimeout(params: {
  address: HexAddress;
  sessionId: bigint;
}) {
  return {
    ...getMindPassEscrowConfig(params.address),
    functionName: "resolvePaymentTimeout",
    args: [params.sessionId],
  } as PreparedMindPassEscrowWrite<"resolvePaymentTimeout", readonly [bigint]>;
}

export function prepareCancelUnstartedSession(params: {
  address: HexAddress;
  sessionId: bigint;
}) {
  return {
    ...getMindPassEscrowConfig(params.address),
    functionName: "cancelUnstartedSession",
    args: [params.sessionId],
  } as PreparedMindPassEscrowWrite<"cancelUnstartedSession", readonly [bigint]>;
}

export function prepareCheckInAsPatient(params: {
  address: HexAddress;
  sessionId: bigint;
}) {
  return {
    ...getMindPassEscrowConfig(params.address),
    functionName: "checkInAsPatient",
    args: [params.sessionId],
  } as PreparedMindPassEscrowWrite<"checkInAsPatient", readonly [bigint]>;
}

export function prepareCheckInAsTherapist(params: {
  address: HexAddress;
  sessionId: bigint;
}) {
  return {
    ...getMindPassEscrowConfig(params.address),
    functionName: "checkInAsTherapist",
    args: [params.sessionId],
  } as PreparedMindPassEscrowWrite<"checkInAsTherapist", readonly [bigint]>;
}

export function prepareResolveNoShow(params: {
  address: HexAddress;
  sessionId: bigint;
}) {
  return {
    ...getMindPassEscrowConfig(params.address),
    functionName: "resolveNoShow",
    args: [params.sessionId],
  } as PreparedMindPassEscrowWrite<"resolveNoShow", readonly [bigint]>;
}

export function prepareCompleteSession(params: {
  address: HexAddress;
  sessionId: bigint;
}) {
  return {
    ...getMindPassEscrowConfig(params.address),
    functionName: "completeSession",
    args: [params.sessionId],
  } as PreparedMindPassEscrowWrite<"completeSession", readonly [bigint]>;
}

export function prepareWithdraw(params: { address: HexAddress }) {
  return {
    ...getMindPassEscrowConfig(params.address),
    functionName: "withdraw",
    args: [],
  } as PreparedMindPassEscrowWrite<"withdraw", readonly []>;
}
