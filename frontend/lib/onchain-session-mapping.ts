export type HexAddress = `0x${string}`;
export type HexHash = `0x${string}`;

export const SEPOLIA_CHAIN_ID = 11155111;
export const WEI_PER_ETH = 10n ** 18n;
export const SESSION_FEE_WEI = 5_000_000_000_000_000n;

export type OnchainSessionStatus =
  | "None"
  | "Requested"
  | "AcceptedAwaitingPayment"
  | "Funded"
  | "InSession"
  | "Completed"
  | "Rejected"
  | "CancelledUnstarted"
  | "PaymentTimeout"
  | "PatientNoShow"
  | "TherapistNoShow";

export type DbSessionStatus =
  | "requested"
  | "accepted_awaiting_payment"
  | "funded"
  | "in_session"
  | "completed"
  | "rejected"
  | "cancelled_unstarted"
  | "payment_timeout"
  | "patient_no_show"
  | "therapist_no_show";

export type SessionFundingSource = "wallet" | "subsidy" | "mixed";

export type MindPassEscrowEventName =
  | "BookingRequested"
  | "BookingAccepted"
  | "BookingRejected"
  | "PatientPortionFunded"
  | "SubsidyPortionFunded"
  | "SessionFunded"
  | "SessionCancelledUnstarted"
  | "PaymentTimedOut"
  | "PatientCheckedIn"
  | "TherapistCheckedIn"
  | "SessionStarted"
  | "PatientNoShowResolved"
  | "TherapistNoShowResolved"
  | "SessionCompleted"
  | "Withdrawal";

export type MindPassEscrowTxHashField =
  | "create_booking_tx_hash"
  | "accept_booking_tx_hash"
  | "reject_booking_tx_hash"
  | "fund_patient_tx_hash"
  | "fund_subsidy_tx_hash"
  | "cancel_unstarted_tx_hash"
  | "patient_checkin_tx_hash"
  | "therapist_checkin_tx_hash"
  | "session_started_tx_hash"
  | "complete_session_tx_hash"
  | "resolve_payment_timeout_tx_hash"
  | "resolve_no_show_tx_hash";

export type MindPassSessionSyncPatch = Partial<{
  onchain_session_id: string;
  contract_address: string;
  chain_id: number;
  patient_wallet: string;
  therapist_wallet: string;
  status: DbSessionStatus;
  session_mode: string;
  amount_eth: string;
  session_fee_eth: string;
  escrow_amount: string;
  patient_wallet_choice_eth: string;
  patient_subsidy_choice_eth: string;
  wallet_required_eth: string;
  wallet_funded_eth: string;
  subsidy_applied_eth: string;
  subsidy_funded_eth: string;
  funding_source: SessionFundingSource;
  provider_accepted_at: string;
  payment_due_at: string;
  funded_at: string;
  patient_joined_at: string;
  therapist_joined_at: string;
  session_started_at: string;
  completed_at: string;
  payment_timeout_at: string;
  refund_amount_eth: string;
  patient_refund_eth: string;
  vault_refund_eth: string;
  total_refund_eth: string;
  protocol_fee_eth: string;
  therapist_payout_eth: string;
  penalty_fee_eth: string;
  settlement_status: string;
  settlement_source: "database" | "contract" | "mixed";
  last_onchain_event: MindPassEscrowEventName;
  last_synced_block: number;
  last_synced_tx_hash: string;
  last_synced_at: string;
  sync_error: string | null;
  create_booking_tx_hash: string;
  accept_booking_tx_hash: string;
  reject_booking_tx_hash: string;
  fund_patient_tx_hash: string;
  fund_subsidy_tx_hash: string;
  cancel_unstarted_tx_hash: string;
  patient_checkin_tx_hash: string;
  therapist_checkin_tx_hash: string;
  session_started_tx_hash: string;
  complete_session_tx_hash: string;
  resolve_payment_timeout_tx_hash: string;
  resolve_no_show_tx_hash: string;
  patient_withdrawal_tx_hash: string;
  therapist_withdrawal_tx_hash: string;
  vault_withdrawal_tx_hash: string;
  protocol_withdrawal_tx_hash: string;
}>;

export const ONCHAIN_STATUS_TO_DB_STATUS: Record<
  Exclude<OnchainSessionStatus, "None">,
  DbSessionStatus
> = {
  Requested: "requested",
  AcceptedAwaitingPayment: "accepted_awaiting_payment",
  Funded: "funded",
  InSession: "in_session",
  Completed: "completed",
  Rejected: "rejected",
  CancelledUnstarted: "cancelled_unstarted",
  PaymentTimeout: "payment_timeout",
  PatientNoShow: "patient_no_show",
  TherapistNoShow: "therapist_no_show",
};

export const ESCROW_EVENT_TO_DB_STATUS: Partial<
  Record<MindPassEscrowEventName, DbSessionStatus>
> = {
  BookingRequested: "requested",
  BookingAccepted: "accepted_awaiting_payment",
  BookingRejected: "rejected",
  SessionFunded: "funded",
  SessionCancelledUnstarted: "cancelled_unstarted",
  PaymentTimedOut: "payment_timeout",
  SessionStarted: "in_session",
  PatientNoShowResolved: "patient_no_show",
  TherapistNoShowResolved: "therapist_no_show",
  SessionCompleted: "completed",
};

export const ESCROW_EVENT_TO_TX_HASH_FIELD: Partial<
  Record<MindPassEscrowEventName, MindPassEscrowTxHashField>
> = {
  BookingRequested: "create_booking_tx_hash",
  BookingAccepted: "accept_booking_tx_hash",
  BookingRejected: "reject_booking_tx_hash",
  PatientPortionFunded: "fund_patient_tx_hash",
  SubsidyPortionFunded: "fund_subsidy_tx_hash",
  SessionCancelledUnstarted: "cancel_unstarted_tx_hash",
  PatientCheckedIn: "patient_checkin_tx_hash",
  TherapistCheckedIn: "therapist_checkin_tx_hash",
  SessionStarted: "session_started_tx_hash",
  SessionCompleted: "complete_session_tx_hash",
  PaymentTimedOut: "resolve_payment_timeout_tx_hash",
  PatientNoShowResolved: "resolve_no_show_tx_hash",
  TherapistNoShowResolved: "resolve_no_show_tx_hash",
};

function normalizeBigInt(value: bigint | number | string) {
  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number") {
    return BigInt(Math.trunc(value));
  }

  return BigInt(String(value));
}

export function normalizeOnchainAddress(value?: string | null) {
  return String(value ?? "").trim().toLowerCase();
}

export function normalizeOnchainSessionId(
  value: bigint | number | string,
) {
  return normalizeBigInt(value).toString();
}

export function decodeSessionModeBytes32(value: string) {
  const normalized = String(value ?? "").replace(/^0x/i, "");
  if (!normalized) {
    return "";
  }

  let result = "";
  for (let index = 0; index < normalized.length; index += 2) {
    const hexPair = normalized.slice(index, index + 2);
    if (!hexPair || hexPair === "00") {
      break;
    }

    result += String.fromCharCode(Number.parseInt(hexPair, 16));
  }

  return result.trim().toLowerCase();
}

export function weiToEthDecimalString(
  value: bigint | number | string,
  fractionDigits = 6,
) {
  const normalized = normalizeBigInt(value);
  const whole = normalized / WEI_PER_ETH;
  const fraction = normalized % WEI_PER_ETH;
  const rawFraction = fraction
    .toString()
    .padStart(18, "0")
    .slice(0, fractionDigits)
    .replace(/0+$/, "");

  return rawFraction ? `${whole.toString()}.${rawFraction}` : whole.toString();
}

export function unixSecondsToIsoString(
  value?: bigint | number | string | null,
) {
  if (value === null || value === undefined) {
    return null;
  }

  const seconds = normalizeBigInt(value);
  if (seconds <= 0n) {
    return null;
  }

  return new Date(Number(seconds) * 1000).toISOString();
}

export function deriveFundingSourceFromRequiredSplit(
  walletRequiredWei: bigint | number | string,
  subsidyRequiredWei: bigint | number | string,
  feeWei: bigint | number | string = SESSION_FEE_WEI,
): SessionFundingSource {
  const walletRequired = normalizeBigInt(walletRequiredWei);
  const subsidyRequired = normalizeBigInt(subsidyRequiredWei);
  const fee = normalizeBigInt(feeWei);

  if (walletRequired <= 0n && subsidyRequired == fee) {
    return "subsidy";
  }

  if (subsidyRequired <= 0n && walletRequired == fee) {
    return "wallet";
  }

  return "mixed";
}

export function buildSyncMetadata(input: {
  contractAddress: string;
  chainId?: number;
  eventName: MindPassEscrowEventName;
  txHash?: string | null;
  blockNumber?: bigint | number | null;
  syncError?: string | null;
}): MindPassSessionSyncPatch {
  return {
    contract_address: normalizeOnchainAddress(input.contractAddress),
    chain_id: input.chainId ?? SEPOLIA_CHAIN_ID,
    settlement_source: "contract",
    last_onchain_event: input.eventName,
    last_synced_block:
      input.blockNumber === null || input.blockNumber === undefined
        ? undefined
        : Number(normalizeBigInt(input.blockNumber)),
    last_synced_tx_hash: input.txHash ?? undefined,
    last_synced_at: new Date().toISOString(),
    sync_error: input.syncError ?? null,
  };
}

export function getTxHashFieldForEvent(
  eventName: MindPassEscrowEventName,
): MindPassEscrowTxHashField | null {
  return ESCROW_EVENT_TO_TX_HASH_FIELD[eventName] ?? null;
}

export function getDbStatusForEscrowEvent(
  eventName: MindPassEscrowEventName,
): DbSessionStatus | null {
  return ESCROW_EVENT_TO_DB_STATUS[eventName] ?? null;
}

function buildSharedFeeFields(
  feeWei: bigint | number | string = SESSION_FEE_WEI,
): MindPassSessionSyncPatch {
  const fee = weiToEthDecimalString(feeWei);
  return {
    amount_eth: fee,
    session_fee_eth: fee,
    escrow_amount: fee,
  };
}

export function buildBookingRequestedPatch(input: {
  onchainSessionId: bigint | number | string;
  patient: string;
  therapist: string;
  walletRequiredWei: bigint | number | string;
  subsidyRequiredWei: bigint | number | string;
  sessionMode: string;
  contractAddress: string;
  chainId?: number;
  txHash?: string | null;
  blockNumber?: bigint | number | null;
}): MindPassSessionSyncPatch {
  const walletRequiredWei = normalizeBigInt(input.walletRequiredWei);
  const subsidyRequiredWei = normalizeBigInt(input.subsidyRequiredWei);

  return {
    ...buildSharedFeeFields(),
    ...buildSyncMetadata({
      contractAddress: input.contractAddress,
      chainId: input.chainId,
      eventName: "BookingRequested",
      txHash: input.txHash,
      blockNumber: input.blockNumber,
    }),
    onchain_session_id: normalizeOnchainSessionId(input.onchainSessionId),
    patient_wallet: normalizeOnchainAddress(input.patient),
    therapist_wallet: normalizeOnchainAddress(input.therapist),
    status: "requested",
    session_mode: input.sessionMode,
    patient_wallet_choice_eth: weiToEthDecimalString(walletRequiredWei),
    patient_subsidy_choice_eth: weiToEthDecimalString(subsidyRequiredWei),
    wallet_required_eth: weiToEthDecimalString(walletRequiredWei),
    subsidy_applied_eth: weiToEthDecimalString(subsidyRequiredWei),
    funding_source: deriveFundingSourceFromRequiredSplit(
      walletRequiredWei,
      subsidyRequiredWei,
    ),
    create_booking_tx_hash: input.txHash ?? undefined,
  };
}

export function buildBookingAcceptedPatch(input: {
  acceptedAt: bigint | number | string;
  paymentDueAt: bigint | number | string;
  contractAddress: string;
  chainId?: number;
  txHash?: string | null;
  blockNumber?: bigint | number | null;
}): MindPassSessionSyncPatch {
  return {
    ...buildSyncMetadata({
      contractAddress: input.contractAddress,
      chainId: input.chainId,
      eventName: "BookingAccepted",
      txHash: input.txHash,
      blockNumber: input.blockNumber,
    }),
    status: "accepted_awaiting_payment",
    provider_accepted_at: unixSecondsToIsoString(input.acceptedAt) ?? undefined,
    payment_due_at: unixSecondsToIsoString(input.paymentDueAt) ?? undefined,
    accept_booking_tx_hash: input.txHash ?? undefined,
  };
}

export function buildBookingRejectedPatch(input: {
  contractAddress: string;
  chainId?: number;
  txHash?: string | null;
  blockNumber?: bigint | number | null;
}): MindPassSessionSyncPatch {
  return {
    ...buildSyncMetadata({
      contractAddress: input.contractAddress,
      chainId: input.chainId,
      eventName: "BookingRejected",
      txHash: input.txHash,
      blockNumber: input.blockNumber,
    }),
    status: "rejected",
    settlement_status: "cancelled",
    reject_booking_tx_hash: input.txHash ?? undefined,
  };
}

export function buildPatientFundingPatch(input: {
  amountWei: bigint | number | string;
  contractAddress: string;
  chainId?: number;
  txHash?: string | null;
  blockNumber?: bigint | number | null;
}): MindPassSessionSyncPatch {
  return {
    ...buildSyncMetadata({
      contractAddress: input.contractAddress,
      chainId: input.chainId,
      eventName: "PatientPortionFunded",
      txHash: input.txHash,
      blockNumber: input.blockNumber,
    }),
    wallet_funded_eth: weiToEthDecimalString(input.amountWei),
    fund_patient_tx_hash: input.txHash ?? undefined,
  };
}

export function buildSubsidyFundingPatch(input: {
  amountWei: bigint | number | string;
  contractAddress: string;
  chainId?: number;
  txHash?: string | null;
  blockNumber?: bigint | number | null;
}): MindPassSessionSyncPatch {
  return {
    ...buildSyncMetadata({
      contractAddress: input.contractAddress,
      chainId: input.chainId,
      eventName: "SubsidyPortionFunded",
      txHash: input.txHash,
      blockNumber: input.blockNumber,
    }),
    subsidy_funded_eth: weiToEthDecimalString(input.amountWei),
    fund_subsidy_tx_hash: input.txHash ?? undefined,
  };
}

export function buildSessionFundedPatch(input: {
  walletFundedWei: bigint | number | string;
  subsidyFundedWei: bigint | number | string;
  fundedAt: bigint | number | string;
  noShowDeadlineAt: bigint | number | string;
  contractAddress: string;
  chainId?: number;
  txHash?: string | null;
  blockNumber?: bigint | number | null;
}): MindPassSessionSyncPatch {
  return {
    ...buildSharedFeeFields(),
    ...buildSyncMetadata({
      contractAddress: input.contractAddress,
      chainId: input.chainId,
      eventName: "SessionFunded",
      txHash: input.txHash,
      blockNumber: input.blockNumber,
    }),
    status: "funded",
    wallet_funded_eth: weiToEthDecimalString(input.walletFundedWei),
    subsidy_funded_eth: weiToEthDecimalString(input.subsidyFundedWei),
    funded_at: unixSecondsToIsoString(input.fundedAt) ?? undefined,
    no_show_deadline_at:
      unixSecondsToIsoString(input.noShowDeadlineAt) ?? undefined,
    settlement_status: "held_in_escrow",
  };
}

export function buildPatientCheckedInPatch(input: {
  checkedInAt: bigint | number | string;
  contractAddress: string;
  chainId?: number;
  txHash?: string | null;
  blockNumber?: bigint | number | null;
}): MindPassSessionSyncPatch {
  return {
    ...buildSyncMetadata({
      contractAddress: input.contractAddress,
      chainId: input.chainId,
      eventName: "PatientCheckedIn",
      txHash: input.txHash,
      blockNumber: input.blockNumber,
    }),
    patient_joined_at: unixSecondsToIsoString(input.checkedInAt) ?? undefined,
    patient_checkin_tx_hash: input.txHash ?? undefined,
  };
}

export function buildTherapistCheckedInPatch(input: {
  checkedInAt: bigint | number | string;
  contractAddress: string;
  chainId?: number;
  txHash?: string | null;
  blockNumber?: bigint | number | null;
}): MindPassSessionSyncPatch {
  return {
    ...buildSyncMetadata({
      contractAddress: input.contractAddress,
      chainId: input.chainId,
      eventName: "TherapistCheckedIn",
      txHash: input.txHash,
      blockNumber: input.blockNumber,
    }),
    therapist_joined_at: unixSecondsToIsoString(input.checkedInAt) ?? undefined,
    therapist_checkin_tx_hash: input.txHash ?? undefined,
  };
}

export function buildSessionStartedPatch(input: {
  sessionStartedAt: bigint | number | string;
  contractAddress: string;
  chainId?: number;
  txHash?: string | null;
  blockNumber?: bigint | number | null;
}): MindPassSessionSyncPatch {
  return {
    ...buildSyncMetadata({
      contractAddress: input.contractAddress,
      chainId: input.chainId,
      eventName: "SessionStarted",
      txHash: input.txHash,
      blockNumber: input.blockNumber,
    }),
    status: "in_session",
    session_started_at:
      unixSecondsToIsoString(input.sessionStartedAt) ?? undefined,
    session_started_tx_hash: input.txHash ?? undefined,
  };
}

export function buildPaymentTimeoutPatch(input: {
  patientRefundWei: bigint | number | string;
  vaultRefundWei: bigint | number | string;
  paymentTimeoutAt: bigint | number | string;
  contractAddress: string;
  chainId?: number;
  txHash?: string | null;
  blockNumber?: bigint | number | null;
}): MindPassSessionSyncPatch {
  const patientRefundWei = normalizeBigInt(input.patientRefundWei);
  const vaultRefundWei = normalizeBigInt(input.vaultRefundWei);
  const totalRefundWei = patientRefundWei + vaultRefundWei;

  return {
    ...buildSyncMetadata({
      contractAddress: input.contractAddress,
      chainId: input.chainId,
      eventName: "PaymentTimedOut",
      txHash: input.txHash,
      blockNumber: input.blockNumber,
    }),
    status: "payment_timeout",
    payment_timeout_at: unixSecondsToIsoString(input.paymentTimeoutAt) ?? undefined,
    patient_refund_eth: weiToEthDecimalString(patientRefundWei),
    vault_refund_eth: weiToEthDecimalString(vaultRefundWei),
    total_refund_eth: weiToEthDecimalString(totalRefundWei),
    refund_amount_eth: weiToEthDecimalString(totalRefundWei),
    settlement_status: "cancelled",
    resolve_payment_timeout_tx_hash: input.txHash ?? undefined,
  };
}

export function buildCancelledUnstartedPatch(input: {
  patientRefundWei: bigint | number | string;
  vaultRefundWei: bigint | number | string;
  contractAddress: string;
  chainId?: number;
  txHash?: string | null;
  blockNumber?: bigint | number | null;
}): MindPassSessionSyncPatch {
  const patientRefundWei = normalizeBigInt(input.patientRefundWei);
  const vaultRefundWei = normalizeBigInt(input.vaultRefundWei);
  const totalRefundWei = patientRefundWei + vaultRefundWei;

  return {
    ...buildSyncMetadata({
      contractAddress: input.contractAddress,
      chainId: input.chainId,
      eventName: "SessionCancelledUnstarted",
      txHash: input.txHash,
      blockNumber: input.blockNumber,
    }),
    status: "cancelled_unstarted",
    patient_refund_eth: weiToEthDecimalString(patientRefundWei),
    vault_refund_eth: weiToEthDecimalString(vaultRefundWei),
    total_refund_eth: weiToEthDecimalString(totalRefundWei),
    refund_amount_eth: weiToEthDecimalString(totalRefundWei),
    settlement_status: "cancelled",
    cancel_unstarted_tx_hash: input.txHash ?? undefined,
  };
}

export function buildPatientNoShowPatch(input: {
  therapistPayoutWei: bigint | number | string;
  patientRefundWei: bigint | number | string;
  vaultRefundWei: bigint | number | string;
  penaltyFeeWei: bigint | number | string;
  contractAddress: string;
  chainId?: number;
  txHash?: string | null;
  blockNumber?: bigint | number | null;
}): MindPassSessionSyncPatch {
  const patientRefundWei = normalizeBigInt(input.patientRefundWei);
  const vaultRefundWei = normalizeBigInt(input.vaultRefundWei);
  const totalRefundWei = patientRefundWei + vaultRefundWei;

  return {
    ...buildSyncMetadata({
      contractAddress: input.contractAddress,
      chainId: input.chainId,
      eventName: "PatientNoShowResolved",
      txHash: input.txHash,
      blockNumber: input.blockNumber,
    }),
    status: "patient_no_show",
    therapist_payout_eth: weiToEthDecimalString(input.therapistPayoutWei),
    penalty_fee_eth: weiToEthDecimalString(input.penaltyFeeWei),
    patient_refund_eth: weiToEthDecimalString(patientRefundWei),
    vault_refund_eth: weiToEthDecimalString(vaultRefundWei),
    total_refund_eth: weiToEthDecimalString(totalRefundWei),
    refund_amount_eth: weiToEthDecimalString(totalRefundWei),
    settlement_status: "penalty_paid_to_therapist",
    resolve_no_show_tx_hash: input.txHash ?? undefined,
  };
}

export function buildTherapistNoShowPatch(input: {
  patientRefundWei: bigint | number | string;
  vaultRefundWei: bigint | number | string;
  contractAddress: string;
  chainId?: number;
  txHash?: string | null;
  blockNumber?: bigint | number | null;
}): MindPassSessionSyncPatch {
  const patientRefundWei = normalizeBigInt(input.patientRefundWei);
  const vaultRefundWei = normalizeBigInt(input.vaultRefundWei);
  const totalRefundWei = patientRefundWei + vaultRefundWei;

  return {
    ...buildSyncMetadata({
      contractAddress: input.contractAddress,
      chainId: input.chainId,
      eventName: "TherapistNoShowResolved",
      txHash: input.txHash,
      blockNumber: input.blockNumber,
    }),
    status: "therapist_no_show",
    patient_refund_eth: weiToEthDecimalString(patientRefundWei),
    vault_refund_eth: weiToEthDecimalString(vaultRefundWei),
    total_refund_eth: weiToEthDecimalString(totalRefundWei),
    refund_amount_eth: weiToEthDecimalString(totalRefundWei),
    settlement_status: "refunded_to_patient",
    resolve_no_show_tx_hash: input.txHash ?? undefined,
  };
}

export function buildSessionCompletedPatch(input: {
  therapistPayoutWei: bigint | number | string;
  protocolFeeWei: bigint | number | string;
  completedAt: bigint | number | string;
  contractAddress: string;
  chainId?: number;
  txHash?: string | null;
  blockNumber?: bigint | number | null;
}): MindPassSessionSyncPatch {
  return {
    ...buildSyncMetadata({
      contractAddress: input.contractAddress,
      chainId: input.chainId,
      eventName: "SessionCompleted",
      txHash: input.txHash,
      blockNumber: input.blockNumber,
    }),
    status: "completed",
    completed_at: unixSecondsToIsoString(input.completedAt) ?? undefined,
    therapist_payout_eth: weiToEthDecimalString(input.therapistPayoutWei),
    protocol_fee_eth: weiToEthDecimalString(input.protocolFeeWei),
    refund_amount_eth: "0",
    total_refund_eth: "0",
    settlement_status: "released_to_therapist",
    complete_session_tx_hash: input.txHash ?? undefined,
  };
}

export function buildWithdrawalPatch(input: {
  beneficiary: "patient" | "therapist" | "vault" | "protocol";
  txHash: string;
}): MindPassSessionSyncPatch {
  if (input.beneficiary === "patient") {
    return { patient_withdrawal_tx_hash: input.txHash };
  }
  if (input.beneficiary === "therapist") {
    return { therapist_withdrawal_tx_hash: input.txHash };
  }
  if (input.beneficiary === "vault") {
    return { vault_withdrawal_tx_hash: input.txHash };
  }

  return { protocol_withdrawal_tx_hash: input.txHash };
}
