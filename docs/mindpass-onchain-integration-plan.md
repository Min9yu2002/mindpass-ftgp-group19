# MindPass On-Chain Integration Plan

This document describes the review-only integration preparation package for moving MindPass from the current DB-first workflow toward a future Sepolia-backed escrow model.

Nothing in this document means chain settlement is already live.

## Current Model: DB-First Product Flow

Today the product lifecycle is driven by Supabase rows in `public.sessions`.

Current frontend behavior:
- patient creates a booking request by inserting a `sessions` row
- provider accepts or rejects by updating the row
- patient payment is currently simulated by DB updates
- chat entry, timeout catch-up, no-show catch-up, and completion are all derived from the database state

This means:
- Supabase is currently the source of truth
- there is no live contract write path in the product flow yet
- there is no event indexer yet
- there is no vault relayer in production yet

## Future Model: Chain-Integrated Escrow

The future target is a hybrid model:
- frontend keeps the current UX and active-session architecture
- `public.sessions` remains the application-facing read model
- MindPassEscrow on Sepolia becomes the settlement source of truth
- an indexer or relayer writes on-chain lifecycle results back into Supabase

Planned split of responsibility:

On-chain:
- booking request id
- provider accept / reject
- patient wallet funding
- vault subsidy funding
- funded state
- check-in timestamps
- no-show resolution
- completion settlement
- withdraw flows

Off-chain:
- active-session browser role state
- therapist/patient directory browsing
- patient subsidy ledger and eligibility logic
- UI messaging and product copy
- analytics and activity feed
- manual reconciliation and sync observability

## Proposed Supabase Migration

Manual migration file:
- [supabase/migrations/20260318121500_mindpass_onchain_prep.sql](/Users/yu/Documents/Postgrad/FTwDS/FTGP-GP/mindpass-ftgp-group19/supabase/migrations/20260318121500_mindpass_onchain_prep.sql)

This migration only adds nullable future-use columns. It does not alter the current DB-first flow.

## Field-Level Mapping

Detailed field and event mapping now lives in:
- [docs/mindpass-contract-field-mapping.md](/Users/yu/Documents/Postgrad/FTwDS/FTGP-GP/mindpass-ftgp-group19/docs/mindpass-contract-field-mapping.md)

## Which Fields Stay DB-Only

These should remain database or application metadata even after chain integration:
- `support_code`
- `activities` rows
- therapist onboarding documents
- patient subsidy eligibility / voucher source
- front-end active session state
- browser-only session context (`mindpass-active-session`)
- UI-specific computed labels and dashboard summaries

## Which Fields Should Later Become Event-Driven

These session fields should ultimately be driven from contract events or read-model sync:
- `status`
- `provider_accepted_at`
- `payment_due_at`
- `funded_at`
- `patient_joined_at`
- `therapist_joined_at`
- `session_started_at`
- `completed_at`
- `payment_timeout_at`
- `no_show_deadline_at`
- `wallet_funded_eth`
- `subsidy_funded_eth`
- `refund_amount_eth`
- `patient_refund_eth`
- `vault_refund_eth`
- `protocol_fee_eth`
- `therapist_payout_eth`
- `settlement_status`

## Integration Skeleton Files

Prepared for later use:
- [frontend/lib/onchain-session-mapping.ts](/Users/yu/Documents/Postgrad/FTwDS/FTGP-GP/mindpass-ftgp-group19/frontend/lib/onchain-session-mapping.ts)
- [frontend/lib/mindpassEscrow.ts](/Users/yu/Documents/Postgrad/FTwDS/FTGP-GP/mindpass-ftgp-group19/frontend/lib/mindpassEscrow.ts)

Purpose:
- define explicit contract status and event mappings
- normalize on-chain values into DB-safe session patches
- provide a future `wagmi` contract config and write-preparation skeleton

## TODO

Remaining backend, Supabase, indexing, and rollout work now lives in:
- [docs/mindpass-onchain-todo.md](/Users/yu/Documents/Postgrad/FTwDS/FTGP-GP/mindpass-ftgp-group19/docs/mindpass-onchain-todo.md)

## Manual Apply Order

Recommended review order:
1. review the SQL migration
2. review the field/event mapping doc
3. review the TypeScript helpers
4. deploy contract and confirm ABI/address
5. wire read-model sync before swapping frontend write paths
