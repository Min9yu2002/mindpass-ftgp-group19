export type FixtureFundingSource = "wallet" | "subsidy" | "mixed";

export type FixtureSessionStatus =
  | "requested"
  | "accepted_awaiting_payment"
  | "funded"
  | "in_session"
  | "completed"
  | "payment_timeout"
  | "patient_no_show"
  | "therapist_no_show"
  | "mutual_unstarted"
  | "rejected";

export type SessionFixture = {
  id: string;
  patient_wallet: string;
  therapist_wallet: string;
  status: FixtureSessionStatus;
  amount_eth: number;
  session_fee_eth: number;
  escrow_amount: number;
  funding_source: FixtureFundingSource;
  subsidy_applied_eth: number;
  wallet_required_eth: number;
  wallet_funded_eth: number;
  patient_subsidy_choice_eth: number;
  patient_wallet_choice_eth: number;
  settlement_status: string;
  payment_due_at: string | null;
  funded_at: string | null;
  no_show_deadline_at: string | null;
  patient_joined_at: string | null;
  therapist_joined_at: string | null;
  session_started_at: string | null;
  completed_at: string | null;
  payment_timeout_at: string | null;
  penalty_fee_eth: number;
  refund_amount_eth: number;
  therapist_payout_eth: number;
  protocol_fee_eth: number;
  created_at: string;
  updated_at: string;
  session_mode: "text" | "voice";
};

const BASE_CREATED_AT = "2026-03-18T10:00:00.000Z";
const BASE_UPDATED_AT = "2026-03-18T10:00:00.000Z";

export const FIXTURE_PATIENT_WALLET =
  "0x60ecc43eb6d34aff650ee3ba18299db4916fbd39";
export const FIXTURE_THERAPIST_WALLET =
  "0x8Ec7F2F349111B2443A6C68691344B7d53d5B2cD";

type CreateSessionFixtureOptions = Partial<SessionFixture> & {
  id: string;
  status: FixtureSessionStatus;
};

export function createSessionFixture(
  options: CreateSessionFixtureOptions,
): SessionFixture {
  return {
    id: options.id,
    patient_wallet: options.patient_wallet ?? FIXTURE_PATIENT_WALLET,
    therapist_wallet: options.therapist_wallet ?? FIXTURE_THERAPIST_WALLET,
    status: options.status,
    amount_eth: options.amount_eth ?? 0.005,
    session_fee_eth: options.session_fee_eth ?? 0.005,
    escrow_amount: options.escrow_amount ?? 0.005,
    funding_source: options.funding_source ?? "mixed",
    subsidy_applied_eth: options.subsidy_applied_eth ?? 0.002,
    wallet_required_eth: options.wallet_required_eth ?? 0.003,
    wallet_funded_eth: options.wallet_funded_eth ?? 0,
    patient_subsidy_choice_eth: options.patient_subsidy_choice_eth ?? 0.002,
    patient_wallet_choice_eth: options.patient_wallet_choice_eth ?? 0.003,
    settlement_status: options.settlement_status ?? "pending",
    payment_due_at: options.payment_due_at ?? null,
    funded_at: options.funded_at ?? null,
    no_show_deadline_at: options.no_show_deadline_at ?? null,
    patient_joined_at: options.patient_joined_at ?? null,
    therapist_joined_at: options.therapist_joined_at ?? null,
    session_started_at: options.session_started_at ?? null,
    completed_at: options.completed_at ?? null,
    payment_timeout_at: options.payment_timeout_at ?? null,
    penalty_fee_eth: options.penalty_fee_eth ?? 0,
    refund_amount_eth: options.refund_amount_eth ?? 0,
    therapist_payout_eth: options.therapist_payout_eth ?? 0,
    protocol_fee_eth: options.protocol_fee_eth ?? 0,
    created_at: options.created_at ?? BASE_CREATED_AT,
    updated_at: options.updated_at ?? BASE_UPDATED_AT,
    session_mode: options.session_mode ?? "text",
  };
}

export const walletFundingSession = createSessionFixture({
  id: "session-wallet",
  status: "accepted_awaiting_payment",
  funding_source: "wallet",
  subsidy_applied_eth: 0,
  wallet_required_eth: 0.005,
  patient_subsidy_choice_eth: 0,
  patient_wallet_choice_eth: 0.005,
  settlement_status: "awaiting_patient_payment",
  payment_due_at: "2026-03-18T10:03:00.000Z",
});

export const subsidyFundingSession = createSessionFixture({
  id: "session-subsidy",
  status: "funded",
  funding_source: "subsidy",
  subsidy_applied_eth: 0.005,
  wallet_required_eth: 0,
  wallet_funded_eth: 0,
  patient_subsidy_choice_eth: 0.005,
  patient_wallet_choice_eth: 0,
  settlement_status: "held_in_escrow",
  funded_at: "2026-03-18T10:05:00.000Z",
  no_show_deadline_at: "2026-03-18T10:10:00.000Z",
});

export const mixedFundingSession = createSessionFixture({
  id: "session-mixed",
  status: "funded",
  funding_source: "mixed",
  subsidy_applied_eth: 0.0025,
  wallet_required_eth: 0.0025,
  wallet_funded_eth: 0.0025,
  patient_subsidy_choice_eth: 0.0025,
  patient_wallet_choice_eth: 0.0025,
  settlement_status: "held_in_escrow",
  funded_at: "2026-03-18T10:05:00.000Z",
  no_show_deadline_at: "2026-03-18T10:10:00.000Z",
});

export const inSessionFixture = createSessionFixture({
  id: "session-live",
  status: "in_session",
  funding_source: "mixed",
  subsidy_applied_eth: 0.0025,
  wallet_required_eth: 0.0025,
  wallet_funded_eth: 0.0025,
  patient_subsidy_choice_eth: 0.0025,
  patient_wallet_choice_eth: 0.0025,
  settlement_status: "held_in_escrow",
  funded_at: "2026-03-18T10:05:00.000Z",
  no_show_deadline_at: "2026-03-18T10:10:00.000Z",
  patient_joined_at: "2026-03-18T10:07:00.000Z",
  therapist_joined_at: "2026-03-18T10:08:00.000Z",
  session_started_at: "2026-03-18T10:08:00.000Z",
});

export const completedSession = createSessionFixture({
  id: "session-completed",
  status: "completed",
  funding_source: "mixed",
  subsidy_applied_eth: 0.0025,
  wallet_required_eth: 0.0025,
  wallet_funded_eth: 0.0025,
  patient_subsidy_choice_eth: 0.0025,
  patient_wallet_choice_eth: 0.0025,
  settlement_status: "released_to_therapist",
  therapist_payout_eth: 0.00475,
  protocol_fee_eth: 0.00025,
  completed_at: "2026-03-18T10:45:00.000Z",
});

export const paymentTimeoutSession = createSessionFixture({
  id: "session-payment-timeout",
  status: "payment_timeout",
  funding_source: "wallet",
  subsidy_applied_eth: 0,
  wallet_required_eth: 0.005,
  patient_subsidy_choice_eth: 0,
  patient_wallet_choice_eth: 0.005,
  settlement_status: "cancelled",
  payment_due_at: "2026-03-18T10:03:00.000Z",
  payment_timeout_at: "2026-03-18T10:04:00.000Z",
});

export const patientNoShowSession = createSessionFixture({
  id: "session-patient-no-show",
  status: "patient_no_show",
  funding_source: "mixed",
  subsidy_applied_eth: 0.002,
  wallet_required_eth: 0.003,
  wallet_funded_eth: 0.003,
  patient_subsidy_choice_eth: 0.002,
  patient_wallet_choice_eth: 0.003,
  settlement_status: "penalty_paid_to_therapist",
  penalty_fee_eth: 0.0025,
  refund_amount_eth: 0.0025,
  therapist_payout_eth: 0.0025,
  therapist_joined_at: "2026-03-18T10:10:00.000Z",
  no_show_deadline_at: "2026-03-18T10:10:00.000Z",
});

export const therapistNoShowSession = createSessionFixture({
  id: "session-therapist-no-show",
  status: "therapist_no_show",
  funding_source: "mixed",
  subsidy_applied_eth: 0.002,
  wallet_required_eth: 0.003,
  wallet_funded_eth: 0.003,
  patient_subsidy_choice_eth: 0.002,
  patient_wallet_choice_eth: 0.003,
  settlement_status: "refunded_to_patient",
  refund_amount_eth: 0.005,
  patient_joined_at: "2026-03-18T10:10:00.000Z",
  no_show_deadline_at: "2026-03-18T10:10:00.000Z",
});

export const mutualUnstartedSession = createSessionFixture({
  id: "session-mutual-unstarted",
  status: "mutual_unstarted",
  funding_source: "mixed",
  subsidy_applied_eth: 0.002,
  wallet_required_eth: 0.003,
  wallet_funded_eth: 0.003,
  patient_subsidy_choice_eth: 0.002,
  patient_wallet_choice_eth: 0.003,
  settlement_status: "mutual_unstarted_platform_fee",
  refund_amount_eth: 0.004,
  protocol_fee_eth: 0.001,
  no_show_deadline_at: "2026-03-18T10:10:00.000Z",
});

export const rejectedSession = createSessionFixture({
  id: "session-rejected",
  status: "rejected",
  settlement_status: "cancelled",
});

export const sessionFixtures = {
  walletFundingSession,
  subsidyFundingSession,
  mixedFundingSession,
  inSessionFixture,
  completedSession,
  paymentTimeoutSession,
  patientNoShowSession,
  therapistNoShowSession,
  mutualUnstartedSession,
  rejectedSession,
};
