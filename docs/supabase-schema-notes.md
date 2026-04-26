# Supabase Schema Notes

This document summarizes the Supabase tables currently used by the MindPass frontend. It is a frontend-facing reference only, not a complete database contract.

## Tables Used by the Frontend

### `patients`
Frontend purpose:
- patient profile lookup
- patient vault initialization
- subsidy balance display
- wallet snapshot display

Common frontend fields:
- `wallet_address`
- `total_deposits`
- `support_code`
- `subsidy_balance`
- `created_at`

Used in:
- `/auth`
- `/dashboard`

### `therapists`
Frontend purpose:
- therapist verification
- therapist onboarding
- patient-side therapist directory rendering
- provider lobby profile and availability state

Common frontend fields:
- `wallet_address`
- `full_name`
- `legal_name`
- `specialty`
- `clinical_specialty`
- `bio`
- `languages`
- `ekyc_status`
- `sbt_minted`
- `is_online`
- `supported_modes`
- `total_earned_eth`

Current display fallback rules:
- display name: `full_name || legal_name || "Anonymous Provider"`
- display specialty: `specialty || clinical_specialty || "General Specialist"`

Used in:
- `/therapist-login`
- `/therapist-onboarding`
- `/`
- `/therapists`
- `/dashboard`
- `/provider-lobby`

### `sessions`
Frontend purpose:
- patient booking request creation
- provider request queue
- provider request popup and accept / reject flow
- patient active escrow counts

Relevant current columns:
- `id`
- `patient_wallet`
- `therapist_wallet`
- `status`
- `escrow_amount`
- `created_at`
- `session_mode`
- `session_fee_eth`
- `funding_source`
- `subsidy_applied_eth`
- `wallet_required_eth`
- `wallet_funded_eth`

Common status values currently used by frontend:
- `requested`
- `accepted_awaiting_payment`
- `in_session`
- `rejected`
- `funded`
- `payment_timeout`
- `patient_no_show`
- `therapist_no_show`
- `completed`

Used in:
- `/dashboard`
- `/provider-lobby`

Future on-chain preparation:
- a nullable additive migration has been prepared at [supabase/migrations/20260318121500_mindpass_onchain_prep.sql](/Users/yu/Documents/Postgrad/FTwDS/FTGP-GP/mindpass-ftgp-group19/supabase/migrations/20260318121500_mindpass_onchain_prep.sql)
- the integration design and field/event mapping are documented in [docs/mindpass-onchain-integration-plan.md](/Users/yu/Documents/Postgrad/FTwDS/FTGP-GP/mindpass-ftgp-group19/docs/mindpass-onchain-integration-plan.md)
- the exact field-level mapping is documented in [docs/mindpass-contract-field-mapping.md](/Users/yu/Documents/Postgrad/FTwDS/FTGP-GP/mindpass-ftgp-group19/docs/mindpass-contract-field-mapping.md)

### `redeem_codes`
Frontend purpose:
- support code validation
- subsidy crediting during patient vault initialization

Relevant frontend fields:
- `code`
- `eth_value`
- `is_used`
- `used_by_wallet`

Used in:
- `/auth`

### `therapist_auth_logs`
Frontend purpose:
- therapist login audit log
- therapist logout audit log

Relevant frontend fields:
- `therapist_wallet`
- `action`
- `user_agent`

Used in:
- `/therapist-login`
- global sign-out flow

### `activities`
Frontend purpose:
- recent patient dashboard activity feed

The UI reads this table defensively because field names may vary across environments. The dashboard maps available values into:
- title
- description
- status
- timestamp

Used in:
- `/dashboard`

## Wallet Matching Rules
Current frontend conventions:
- frontend session wallet comparisons are case-insensitive
- Supabase wallet lookups should use `ilike(...)` when matching wallet-address columns
- write-side storage typically normalizes wallet addresses to lowercase for consistency

## Current Frontend Caveats
- not every table is treated as a strict typed schema in the UI yet
- some display layers still normalize mixed legacy data into current UI-safe shapes
- this document should be updated whenever session, booking, or onboarding tables change
