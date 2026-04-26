import { decodeEventLog, type DecodeEventLogReturnType, type Hex } from "viem";

export type HexAddress = `0x${string}`;
export type HexValue = `0x${string}`;

export const MINDPASS_ESCROW_CHAIN_ID = 11155111;
export const MINDPASS_ESCROW_STATUS = {
  None: 0,
  Requested: 1,
  AcceptedAwaitingPayment: 2,
  Funded: 3,
  InSession: 4,
  Completed: 5,
  Rejected: 6,
  CancelledUnstarted: 7,
  PaymentTimeout: 8,
  PatientNoShow: 9,
  TherapistNoShow: 10,
} as const;
export const SESSION_FEE_WEI = 5_000_000_000_000_000n;
export const NORMAL_PROTOCOL_FEE_WEI = 250_000_000_000_000n;
export const NORMAL_THERAPIST_PAYOUT_WEI = 4_750_000_000_000_000n;
export const PATIENT_NO_SHOW_PENALTY_WEI = 1_000_000_000_000_000n;
export const PATIENT_NO_SHOW_REFUND_WEI = 4_000_000_000_000_000n;
export const THERAPIST_NO_SHOW_REFUND_WEI = 5_000_000_000_000_000n;

const configuredEscrowAddress = process.env.NEXT_PUBLIC_MINDPASS_ESCROW_ADDRESS?.trim();

function normalizeHexAddress(value: string | undefined) {
  if (!value || !/^0x[a-fA-F0-9]{40}$/.test(value)) {
    return null;
  }

  return value.toLowerCase() as HexAddress;
}

export const MINDPASS_ESCROW_DEPLOYMENT = {
  chainId: MINDPASS_ESCROW_CHAIN_ID,
  address: normalizeHexAddress(configuredEscrowAddress),
};

export const MINDPASS_ESCROW_WRITE_FUNCTIONS = [
  "createBookingRequest",
  "acceptBooking",
  "rejectBooking",
  "fundPatientPortion",
  "fundSubsidyPortion",
  "resolvePaymentTimeout",
  "checkInAsPatient",
  "checkInAsTherapist",
  "resolveNoShow",
  "requestSessionEnd",
  "confirmSessionEnd",
  "withdraw",
] as const;

export type MindPassEscrowWriteFunctionName =
  (typeof MINDPASS_ESCROW_WRITE_FUNCTIONS)[number];

export const MINDPASS_ESCROW_ABI = [
  {
    type: "error",
    name: "EnforcedPause",
    inputs: [],
  },
  {
    type: "error",
    name: "ZeroAddress",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidTherapist",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidFundingSplit",
    inputs: [],
  },
  {
    type: "error",
    name: "SessionNotFound",
    inputs: [{ name: "sessionId", type: "uint256" }],
  },
  {
    type: "error",
    name: "SessionAlreadyExists",
    inputs: [
      { name: "patient", type: "address" },
      { name: "activeSessionId", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "UnauthorizedCaller",
    inputs: [
      { name: "sessionId", type: "uint256" },
      { name: "caller", type: "address" },
    ],
  },
  {
    type: "error",
    name: "OnlyVault",
    inputs: [{ name: "caller", type: "address" }],
  },
  {
    type: "error",
    name: "InvalidStatus",
    inputs: [
      { name: "sessionId", type: "uint256" },
      { name: "expected", type: "uint8" },
      { name: "actual", type: "uint8" },
    ],
  },
  {
    type: "error",
    name: "InvalidFundingAmount",
    inputs: [
      { name: "expected", type: "uint256" },
      { name: "actual", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "NothingToFund",
    inputs: [{ name: "sessionId", type: "uint256" }],
  },
  {
    type: "error",
    name: "PortionAlreadyFunded",
    inputs: [{ name: "sessionId", type: "uint256" }],
  },
  {
    type: "error",
    name: "PaymentWindowExpired",
    inputs: [
      { name: "sessionId", type: "uint256" },
      { name: "paymentDueAt", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "PaymentWindowStillOpen",
    inputs: [
      { name: "sessionId", type: "uint256" },
      { name: "paymentDueAt", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "NoShowWindowStillOpen",
    inputs: [
      { name: "sessionId", type: "uint256" },
      { name: "noShowDeadlineAt", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "NoShowDeadlineNotSet",
    inputs: [{ name: "sessionId", type: "uint256" }],
  },
  {
    type: "error",
    name: "CheckInWindowClosed",
    inputs: [
      { name: "sessionId", type: "uint256" },
      { name: "noShowDeadlineAt", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "AlreadyCheckedIn",
    inputs: [
      { name: "sessionId", type: "uint256" },
      { name: "participant", type: "address" },
    ],
  },
  {
    type: "error",
    name: "SessionAlreadyStarted",
    inputs: [{ name: "sessionId", type: "uint256" }],
  },
  {
    type: "error",
    name: "SessionNotStarted",
    inputs: [{ name: "sessionId", type: "uint256" }],
  },
  {
    type: "error",
    name: "BothParticipantsAlreadyCheckedIn",
    inputs: [{ name: "sessionId", type: "uint256" }],
  },
  {
    type: "error",
    name: "SessionEndAlreadyRequested",
    inputs: [
      { name: "sessionId", type: "uint256" },
      { name: "requester", type: "address" },
    ],
  },
  {
    type: "error",
    name: "SessionEndNotRequested",
    inputs: [{ name: "sessionId", type: "uint256" }],
  },
  {
    type: "error",
    name: "SessionEndRequesterCannotConfirm",
    inputs: [
      { name: "sessionId", type: "uint256" },
      { name: "requester", type: "address" },
    ],
  },
  {
    type: "error",
    name: "SessionNotFullyFunded",
    inputs: [
      { name: "sessionId", type: "uint256" },
      { name: "fundedWei", type: "uint256" },
      { name: "requiredWei", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "NoClaimableBalance",
    inputs: [{ name: "account", type: "address" }],
  },
  {
    type: "error",
    name: "TransferFailed",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "InvalidDistribution",
    inputs: [
      { name: "expectedTotal", type: "uint256" },
      { name: "actualTotal", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "DirectPaymentsDisabled",
    inputs: [],
  },
  {
    type: "function",
    name: "vault",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "activeSessionOfPatient",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "claimableBalance",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "sessions",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "id", type: "uint256" },
      { name: "patient", type: "address" },
      { name: "therapist", type: "address" },
      { name: "status", type: "uint8" },
      { name: "feeWei", type: "uint256" },
      { name: "walletRequiredWei", type: "uint256" },
      { name: "subsidyRequiredWei", type: "uint256" },
      { name: "walletFundedWei", type: "uint256" },
      { name: "subsidyFundedWei", type: "uint256" },
      { name: "providerAcceptedAt", type: "uint256" },
      { name: "paymentDueAt", type: "uint256" },
      { name: "fundedAt", type: "uint256" },
      { name: "patientJoinedAt", type: "uint256" },
      { name: "therapistJoinedAt", type: "uint256" },
      { name: "sessionStartedAt", type: "uint256" },
      { name: "completedAt", type: "uint256" },
      { name: "cancelledAt", type: "uint256" },
      { name: "noShowDeadlineAt", type: "uint256" },
      { name: "paymentTimeoutAt", type: "uint256" },
      { name: "penaltyFeeWei", type: "uint256" },
      { name: "refundAmountWei", type: "uint256" },
      { name: "protocolFeeWei", type: "uint256" },
      { name: "therapistPayoutWei", type: "uint256" },
      { name: "sessionMode", type: "bytes32" },
    ],
  },
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
    name: "requestSessionEnd",
    stateMutability: "nonpayable",
    inputs: [{ name: "sessionId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "confirmSessionEnd",
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
    name: "SessionEndRequested",
    anonymous: false,
    inputs: [
      { indexed: true, name: "sessionId", type: "uint256" },
      { indexed: true, name: "requestedBy", type: "address" },
      { indexed: false, name: "requestedAt", type: "uint256" },
    ],
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

type EscrowReceiptLog = {
  data: Hex;
  topics: readonly Hex[] | Hex[];
};

type MindPassEscrowAbiEvent = Extract<
  (typeof MINDPASS_ESCROW_ABI)[number],
  { type: "event" }
>;

type MindPassEscrowEventName = MindPassEscrowAbiEvent["name"];

export type MindPassEscrowSessionStruct = {
  id: bigint;
  patient: HexAddress;
  therapist: HexAddress;
  status: number;
  feeWei: bigint;
  walletRequiredWei: bigint;
  subsidyRequiredWei: bigint;
  walletFundedWei: bigint;
  subsidyFundedWei: bigint;
  providerAcceptedAt: bigint;
  paymentDueAt: bigint;
  fundedAt: bigint;
  patientJoinedAt: bigint;
  therapistJoinedAt: bigint;
  sessionStartedAt: bigint;
  completedAt: bigint;
  cancelledAt: bigint;
  noShowDeadlineAt: bigint;
  paymentTimeoutAt: bigint;
  penaltyFeeWei: bigint;
  refundAmountWei: bigint;
  protocolFeeWei: bigint;
  therapistPayoutWei: bigint;
  sessionMode: HexValue;
};

function toBigInt(value: unknown) {
  if (
    typeof value === "bigint" ||
    typeof value === "number" ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return BigInt(value);
  }

  return BigInt(0);
}

export function normalizeMindPassEscrowSession(
  session: readonly unknown[],
): MindPassEscrowSessionStruct {
  return {
    id: toBigInt(session[0]),
    patient: String(session[1] ?? "0x0000000000000000000000000000000000000000").toLowerCase() as HexAddress,
    therapist: String(session[2] ?? "0x0000000000000000000000000000000000000000").toLowerCase() as HexAddress,
    status: Number(session[3] ?? 0),
    feeWei: toBigInt(session[4]),
    walletRequiredWei: toBigInt(session[5]),
    subsidyRequiredWei: toBigInt(session[6]),
    walletFundedWei: toBigInt(session[7]),
    subsidyFundedWei: toBigInt(session[8]),
    providerAcceptedAt: toBigInt(session[9]),
    paymentDueAt: toBigInt(session[10]),
    fundedAt: toBigInt(session[11]),
    patientJoinedAt: toBigInt(session[12]),
    therapistJoinedAt: toBigInt(session[13]),
    sessionStartedAt: toBigInt(session[14]),
    completedAt: toBigInt(session[15]),
    cancelledAt: toBigInt(session[16]),
    noShowDeadlineAt: toBigInt(session[17]),
    paymentTimeoutAt: toBigInt(session[18]),
    penaltyFeeWei: toBigInt(session[19]),
    refundAmountWei: toBigInt(session[20]),
    protocolFeeWei: toBigInt(session[21]),
    therapistPayoutWei: toBigInt(session[22]),
    sessionMode: String(session[23] ?? "0x").toLowerCase() as HexValue,
  };
}

export function findMindPassEscrowEvent<
  TEventName extends MindPassEscrowEventName,
>(
  logs: readonly EscrowReceiptLog[],
  eventName: TEventName,
): DecodeEventLogReturnType<typeof MINDPASS_ESCROW_ABI, TEventName> | null;
export function findMindPassEscrowEvent<
  TEventName extends MindPassEscrowEventName,
>(
  logs: readonly EscrowReceiptLog[],
  eventName: TEventName,
) {
  for (const log of logs) {
    try {
      const decoded = decodeEventLog({
        abi: MINDPASS_ESCROW_ABI,
        eventName,
        data: log.data,
        topics: log.topics.length > 0 ? [log.topics[0], ...log.topics.slice(1)] : [],
      });
      if (decoded.eventName === eventName) {
        return decoded;
      }
    } catch {
      continue;
    }
  }

  return null;
}

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

export function prepareRequestSessionEnd(params: {
  address: HexAddress;
  sessionId: bigint;
}) {
  return {
    ...getMindPassEscrowConfig(params.address),
    functionName: "requestSessionEnd",
    args: [params.sessionId],
  } as PreparedMindPassEscrowWrite<"requestSessionEnd", readonly [bigint]>;
}

export function prepareConfirmSessionEnd(params: {
  address: HexAddress;
  sessionId: bigint;
}) {
  return {
    ...getMindPassEscrowConfig(params.address),
    functionName: "confirmSessionEnd",
    args: [params.sessionId],
  } as PreparedMindPassEscrowWrite<"confirmSessionEnd", readonly [bigint]>;
}

export function prepareWithdraw(params: { address: HexAddress }) {
  return {
    ...getMindPassEscrowConfig(params.address),
    functionName: "withdraw",
    args: [],
  } as PreparedMindPassEscrowWrite<"withdraw", readonly []>;
}
