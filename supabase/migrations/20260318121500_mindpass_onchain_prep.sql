begin;

-- Review-only migration for future contract sync.
-- This is additive and nullable by design so the current DB-first flow keeps working.

alter table if exists public.sessions
  add column if not exists onchain_session_id numeric(78, 0),
  add column if not exists contract_address text,
  add column if not exists chain_id bigint,
  add column if not exists create_booking_tx_hash text,
  add column if not exists accept_booking_tx_hash text,
  add column if not exists reject_booking_tx_hash text,
  add column if not exists fund_patient_tx_hash text,
  add column if not exists fund_subsidy_tx_hash text,
  add column if not exists cancel_unstarted_tx_hash text,
  add column if not exists patient_checkin_tx_hash text,
  add column if not exists therapist_checkin_tx_hash text,
  add column if not exists session_started_tx_hash text,
  add column if not exists complete_session_tx_hash text,
  add column if not exists resolve_payment_timeout_tx_hash text,
  add column if not exists resolve_no_show_tx_hash text,
  add column if not exists patient_withdrawal_tx_hash text,
  add column if not exists therapist_withdrawal_tx_hash text,
  add column if not exists vault_withdrawal_tx_hash text,
  add column if not exists protocol_withdrawal_tx_hash text,
  add column if not exists subsidy_funded_eth numeric(20, 18),
  add column if not exists patient_refund_eth numeric(20, 18),
  add column if not exists vault_refund_eth numeric(20, 18),
  add column if not exists total_refund_eth numeric(20, 18),
  add column if not exists settlement_source text,
  add column if not exists last_onchain_event text,
  add column if not exists last_synced_block bigint,
  add column if not exists last_synced_log_index integer,
  add column if not exists last_synced_tx_hash text,
  add column if not exists last_synced_at timestamptz,
  add column if not exists sync_error text;

update public.sessions
set settlement_source = 'database'
where settlement_source is null;

alter table if exists public.sessions
  alter column settlement_source set default 'database';

create index if not exists sessions_onchain_session_id_idx
  on public.sessions (onchain_session_id);

create index if not exists sessions_chain_contract_idx
  on public.sessions (chain_id, contract_address);

create index if not exists sessions_last_onchain_event_idx
  on public.sessions (last_onchain_event);

comment on column public.sessions.onchain_session_id is
  'Future uint256 session id emitted by MindPassEscrow. Stored as numeric(78,0) for uint256-safe range.';
comment on column public.sessions.contract_address is
  'Future deployed MindPassEscrow address for the session lifecycle.';
comment on column public.sessions.chain_id is
  'Future chain id for the escrow contract. Planned target is Sepolia (11155111).';
comment on column public.sessions.create_booking_tx_hash is
  'Tx hash for createBookingRequest when booking creation moves on-chain.';
comment on column public.sessions.accept_booking_tx_hash is
  'Tx hash for acceptBooking.';
comment on column public.sessions.reject_booking_tx_hash is
  'Tx hash for rejectBooking.';
comment on column public.sessions.fund_patient_tx_hash is
  'Tx hash for fundPatientPortion.';
comment on column public.sessions.fund_subsidy_tx_hash is
  'Tx hash for fundSubsidyPortion.';
comment on column public.sessions.cancel_unstarted_tx_hash is
  'Tx hash for cancelUnstartedSession.';
comment on column public.sessions.patient_checkin_tx_hash is
  'Tx hash for checkInAsPatient.';
comment on column public.sessions.therapist_checkin_tx_hash is
  'Tx hash for checkInAsTherapist.';
comment on column public.sessions.session_started_tx_hash is
  'Optional convenience tx hash for the check-in transaction that also emitted SessionStarted.';
comment on column public.sessions.complete_session_tx_hash is
  'Tx hash for completeSession.';
comment on column public.sessions.resolve_payment_timeout_tx_hash is
  'Tx hash for resolvePaymentTimeout.';
comment on column public.sessions.resolve_no_show_tx_hash is
  'Tx hash for resolveNoShow.';
comment on column public.sessions.patient_withdrawal_tx_hash is
  'Optional denormalized reference to the withdrawal tx that delivered refund value to the patient.';
comment on column public.sessions.therapist_withdrawal_tx_hash is
  'Optional denormalized reference to the withdrawal tx that delivered payout value to the therapist.';
comment on column public.sessions.vault_withdrawal_tx_hash is
  'Optional denormalized reference to the withdrawal tx that returned subsidy refund value to the vault.';
comment on column public.sessions.protocol_withdrawal_tx_hash is
  'Optional denormalized reference to the withdrawal tx that withdrew protocol fees.';
comment on column public.sessions.subsidy_funded_eth is
  'Actual subsidy-funded portion observed on-chain from fundSubsidyPortion.';
comment on column public.sessions.patient_refund_eth is
  'Refund amount attributable to the patient-funded portion.';
comment on column public.sessions.vault_refund_eth is
  'Refund amount attributable to the subsidy-funded vault portion.';
comment on column public.sessions.total_refund_eth is
  'Total refund for the session across patient and vault sources.';
comment on column public.sessions.settlement_source is
  'Source of truth for settlement state. Expected values later include database, contract, or mixed.';
comment on column public.sessions.last_onchain_event is
  'Most recent MindPassEscrow event successfully synced into this row.';
comment on column public.sessions.last_synced_block is
  'Last chain block number processed for this session row.';
comment on column public.sessions.last_synced_log_index is
  'Last event log index applied for this session row. Useful for replay-safe indexing within the same block.';
comment on column public.sessions.last_synced_tx_hash is
  'Last transaction hash applied during event synchronization.';
comment on column public.sessions.last_synced_at is
  'Timestamp when the row was most recently synchronized from on-chain data.';
comment on column public.sessions.sync_error is
  'Last recoverable indexing or reconciliation error for manual inspection.';

commit;
