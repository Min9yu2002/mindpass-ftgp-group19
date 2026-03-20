# MindPass

MindPass is a privacy-first mental health support MVP built as an FTGP group project. The current product combines wallet-based identity, patient and therapist role-specific portals, subsidy-aware booking, and a protected provider request workflow.

## Team
- Mingyu Wang
- Zhengchi Zhang
- Haizhi Jiang
- Haoyuan Wu

## Current MVP Scope
The current frontend MVP focuses on:
- patient onboarding and wallet-based vault access
- therapist wallet verification and provider lobby access
- strict single-role browser sessions using `mindpass-active-session`
- protected patient and therapist route guards
- therapist directory browsing on the landing page, dashboard, and directory page
- subsidy-aware patient booking requests
- provider request review with accept / reject workflow
- provider wait queue handling with estimated ready time
- no-show / mutual_unstarted terminal outcome handling
- subsidy and mixed-funding refund accounting
- outcome notice acknowledgement and support-request flow
- Supabase-backed profile, booking, and audit log integration

The MVP does not yet implement:
- real on-chain escrow settlement
- production-grade chat / XMTP workflow completion
- advanced scheduling or therapist matching logic
- automated wallet funding settlement after booking
- full healthcare-grade compliance and record lifecycle controls

## Authentication and Session Model
MindPass currently uses a strict single-role browser session model:
- one wallet may exist in both `patients` and `therapists` in the database
- the browser may only hold one active role at a time
- the active role is determined only by the portal the user successfully logged in through

The active session is stored in local storage:
- `mindpass-active-session`
- `mindpass-patient-profile`
- `mindpass-therapist-profile`
- `mindpass-xmtp-connected`

The frontend session states are:
- `guest`
- `unscoped`
- `patient`
- `therapist`

See [docs/auth-session-flow.md](docs/auth-session-flow.md) for the detailed state model and route guard behaviour.

## Patient Login Flow
Patient access is handled through `/auth`.

`Initialize Vault`:
- patient connects wallet
- optional government support code can be redeemed
- frontend writes / upserts the patient row in Supabase first
- only after successful DB write does the browser store `mindpass-patient-profile`
- active session is set to `patient`
- user is routed to `/dashboard`

`Quick Access`:
- patient connects the same wallet
- frontend checks Supabase for an existing patient row using case-insensitive wallet matching
- if found, local storage is refreshed, active session is set to `patient`, and the user is routed to `/dashboard`
- if not found, the user is told to initialize a vault first

## Therapist Login Flow
Therapist access is handled through `/therapist-login`.

Current behaviour:
- therapist connects wallet
- frontend verifies the wallet against the `therapists` table using case-insensitive wallet matching
- if found, browser stores `mindpass-therapist-profile`
- active session is set to `therapist`
- therapist login is recorded in `therapist_auth_logs`
- user is routed to `/provider-lobby`
- if no therapist row exists, the user is routed to therapist onboarding

## Patient and Provider Surfaces
`/dashboard` currently supports:
- patient vault overview
- wallet and subsidy balance display
- verified online therapist listing
- subsidy-aware booking requests
- patient activity display
- wait queue visibility and leave-queue flow
- terminal outcome notices and acknowledgement handling

`/provider-lobby` currently supports:
- therapist status toggle
- supported session mode toggle
- incoming session requests from `sessions`
- realtime popup for new requests
- accept / reject actions that update session status
- provider wait-queue-aware request handling
- terminal outcome notices and acknowledgement handling
- earnings summary and recent completed session history

## Supabase Tables Used by the Frontend
The frontend currently reads from or writes to:
- `patients`
- `therapists`
- `sessions`
- `redeem_codes`
- `therapist_auth_logs`
- `activities`

See [docs/supabase-schema-notes.md](docs/supabase-schema-notes.md) for the frontend-facing schema notes and table purposes.

## Repository Structure
- `frontend/` — Next.js frontend and UI logic
- `contracts/` — smart contract files and related config
- `docs/` — project documentation
- `meeting-notes/` — planning and meeting notes
- `slides/` — presentation material

## Manual QA Checklist
Use this checklist after auth/session or dashboard/provider changes.

### Auth and Session
- open the app with no wallet connected and confirm the navbar shows only `Therapist Portal` and `Login / Join`
- connect a wallet without logging in through either portal and confirm the navbar shows only the wallet pill and `Sign Out`
- initialize a patient vault and confirm `mindpass-active-session` becomes `patient`
- log in as a therapist and confirm `mindpass-active-session` becomes `therapist`
- sign out and confirm all MindPass session keys are removed from local storage
- open a second tab, sign out in the first tab, and confirm the second tab syncs out of the session

### Patient Dashboard
- verify patient route guard redirects unauthenticated / unscoped users to `/auth`
- verify therapist active sessions are blocked from the patient dashboard
- confirm therapist cards render a valid provider name and specialty even for older records using `legal_name` / `clinical_specialty`
- click `Book & Lock 0.005 ETH` and confirm a `sessions` row is created with the expected funding fields

### Provider Lobby
- verify provider route guard redirects unauthenticated / unscoped users to `/therapist-login`
- verify patient active sessions are blocked from the provider lobby
- confirm realtime popup appears for a new session request targeting the logged-in therapist wallet
- accept a request and confirm the `sessions.status` changes according to funding logic
- reject a request and confirm the row is removed from the active incoming list

### No-show / Outcome / Refund Accounting
- verify `mutual_unstarted` settles with the expected refund and platform fee
- verify `therapist_no_show` refunds the patient correctly
- verify `patient_no_show` applies therapist compensation correctly
- verify subsidy-only refund accounting is written correctly
- verify mixed-funding refund breakdown fields are written correctly
- verify acknowledged outcome modals do not reopen repeatedly on refresh
- verify acknowledged outcome banners disappear correctly after refresh

## Related Docs
- [docs/auth-session-flow.md](docs/auth-session-flow.md)
- [docs/supabase-schema-notes.md](docs/supabase-schema-notes.md)
- [docs/mvp-scope.md](docs/mvp-scope.md)

## Implementation & Testing Progress

### Implemented
- Session lifecycle and no-show logic now use first valid in-session interaction as the arrival signal; opening chat alone no longer writes arrival, and funded sessions now resolve against a no-show deadline with terminal outcomes `mutual_unstarted`, `therapist_no_show`, and `patient_no_show`.
- Subsidy accounting now deducts at funding time and aligns terminal refund handling with outcome policy. The `mutual_unstarted` and `patient_no_show` subsidy refund paths were fixed, `therapist_no_show` was verified, and `subsidy_refunded_eth` now stays consistent with patient subsidy balance updates.
- Mixed-funding accounting now records subsidy-funded and wallet-funded refund components separately. `patient_refund_eth`, `vault_refund_eth`, and `total_refund_eth` were corrected to reflect component-level refund breakdowns.
- Provider wait queue support was added with `queued_waiting_for_provider`, queue position and estimated ready time fields, patient leave-queue handling, and queue promotion when a therapist becomes available.
- Terminal outcome UX now includes a role-aware outcome modal, a DB-backed `support_requests` Contact Us flow, modal acknowledgement persistence, banner acknowledgement suppression, and viewer-role-specific acknowledgement behavior.
- Therapist reliability tracking now increments `no_show_flag_count` for `therapist_no_show` and `mutual_unstarted_flag_count` for `mutual_unstarted`.
- The wallet badge hover popover was restored, moved into a true floating portal layer, and updated to use real app state where available instead of placeholder-only status text.

### Verified
- `subsidy + mutual_unstarted`
- `subsidy + therapist_no_show`
- `subsidy + patient_no_show`
- `mixed + mutual_unstarted`
- `mixed + therapist_no_show`
- `mixed + patient_no_show`
- Outcome modal acknowledgement no longer reopens repeatedly on refresh.
- Acknowledged outcome banner disappears correctly after refresh.

### Next Steps
- Connect the real escrow contract deployment wiring and complete the on-chain settlement / sync path so the current DB-first accounting aligns with live contract execution.

Recent work log by M1n9yu

**Last updated:** 2026-03-20
