# MindPass Contract Field Mapping

This document is the precise field-level mapping between `MindPassEscrow` and `public.sessions`.

It is review material only. It does not mean on-chain settlement is active today.

## Session struct -> `public.sessions`

| Solidity field | Supabase column(s) | Notes |
| --- | --- | --- |
| `id` | `onchain_session_id` | `uint256` stored as `numeric(78,0)` |
| `patient` | `patient_wallet` | Lowercase before write |
| `therapist` | `therapist_wallet` | Lowercase before write |
| `status` | `status` | Enum normalized into current string statuses |
| `feeWei` | `amount_eth`, `session_fee_eth`, `escrow_amount` | Keep all three in sync during transition period |
| `walletRequiredWei` | `patient_wallet_choice_eth`, `wallet_required_eth` | Required self-pay portion |
| `subsidyRequiredWei` | `patient_subsidy_choice_eth`, `subsidy_applied_eth` | Required subsidy portion |
| `walletFundedWei` | `wallet_funded_eth` | Actual patient-funded amount observed on-chain |
| `subsidyFundedWei` | `subsidy_funded_eth` | Actual vault-funded amount observed on-chain |
| `providerAcceptedAt` | `provider_accepted_at` | Event-driven later |
| `paymentDueAt` | `payment_due_at` | Event-driven later |
| `fundedAt` | `funded_at` | Event-driven later |
| `patientJoinedAt` | `patient_joined_at` | Event-driven later |
| `therapistJoinedAt` | `therapist_joined_at` | Event-driven later |
| `sessionStartedAt` | `session_started_at` | Event-driven later |
| `completedAt` | `completed_at` | Event-driven later |
| `paymentTimeoutAt` | `payment_timeout_at` | Event-driven later |
| `noShowDeadlineAt` | `no_show_deadline_at` | Event-driven later |
| `penaltyFeeWei` | `penalty_fee_eth` | Patient no-show penalty |
| `refundAmountWei` | `refund_amount_eth`, `total_refund_eth` | `refund_amount_eth` remains product-facing; `total_refund_eth` is sync-explicit |
| `protocolFeeWei` | `protocol_fee_eth` | Completion only |
| `therapistPayoutWei` | `therapist_payout_eth` | Completion and patient no-show |
| `sessionMode` | `session_mode` | `bytes32` decoded to current `text` / `voice` style values |

## Event -> status / tx hash mapping

| Contract event | Status patch | Tx hash column |
| --- | --- | --- |
| `BookingRequested` | `requested` | `create_booking_tx_hash` |
| `BookingAccepted` | `accepted_awaiting_payment` | `accept_booking_tx_hash` |
| `BookingRejected` | `rejected` | `reject_booking_tx_hash` |
| `PatientPortionFunded` | none by itself | `fund_patient_tx_hash` |
| `SubsidyPortionFunded` | none by itself | `fund_subsidy_tx_hash` |
| `SessionFunded` | `funded` | no dedicated extra tx column; reuse sync metadata |
| `SessionCancelledUnstarted` | `cancelled_unstarted` | `cancel_unstarted_tx_hash` |
| `PaymentTimedOut` | `payment_timeout` | `resolve_payment_timeout_tx_hash` |
| `PatientCheckedIn` | none by itself | `patient_checkin_tx_hash` |
| `TherapistCheckedIn` | none by itself | `therapist_checkin_tx_hash` |
| `SessionStarted` | `in_session` | `session_started_tx_hash` |
| `PatientNoShowResolved` | `patient_no_show` | `resolve_no_show_tx_hash` |
| `TherapistNoShowResolved` | `therapist_no_show` | `resolve_no_show_tx_hash` |
| `SessionCompleted` | `completed` | `complete_session_tx_hash` |
| `Withdrawal` | no session status change | `patient_withdrawal_tx_hash`, `therapist_withdrawal_tx_hash`, `vault_withdrawal_tx_hash`, or `protocol_withdrawal_tx_hash` |

## Refund / payout mapping

| Outcome | Supabase financial fields |
| --- | --- |
| `payment_timeout` | `refund_amount_eth`, `patient_refund_eth`, `vault_refund_eth`, `total_refund_eth`, `settlement_status = cancelled` |
| `cancelled_unstarted` | `refund_amount_eth`, `patient_refund_eth`, `vault_refund_eth`, `total_refund_eth`, `settlement_status = cancelled` |
| `patient_no_show` | `penalty_fee_eth`, `therapist_payout_eth`, `refund_amount_eth`, `patient_refund_eth`, `vault_refund_eth`, `total_refund_eth`, `settlement_status = penalty_paid_to_therapist` |
| `therapist_no_show` | `refund_amount_eth`, `patient_refund_eth`, `vault_refund_eth`, `total_refund_eth`, `settlement_status = refunded_to_patient` |
| `completed` | `protocol_fee_eth`, `therapist_payout_eth`, `refund_amount_eth = 0`, `total_refund_eth = 0`, `settlement_status = released_to_therapist` |

## DB-only fields that stay off-chain

These remain product metadata and should not be inferred from the contract:

- browser auth/session state
- patient subsidy eligibility inputs
- therapist onboarding document fields
- activity feed rows
- dashboard-only display summaries
- manual support / reconciliation notes

## Event-sync metadata columns

The additive migration introduces lightweight sync observability:

- `settlement_source`
- `last_onchain_event`
- `last_synced_block`
- `last_synced_log_index`
- `last_synced_tx_hash`
- `last_synced_at`
- `sync_error`

These are intended for an indexer/relayer, not for end-user product logic.
