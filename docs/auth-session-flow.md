# Auth and Session Flow

This document describes the currently implemented MindPass frontend auth and session behaviour.

## Session Principle
MindPass supports dual-role database identity but only one active browser role at a time.

A wallet may exist in:
- `patients`
- `therapists`

But the browser session may only be:
- patient
- therapist
- unscoped
- guest

The active role is determined only by the login portal the user successfully used.

## Local Storage Keys
The frontend currently uses these browser keys:
- `mindpass-active-session`
- `mindpass-patient-profile`
- `mindpass-therapist-profile`
- `mindpass-xmtp-connected`

### `mindpass-active-session`
Possible values:
- `patient`
- `therapist`

If the key is missing or invalid while a wallet is connected, the session is treated as `unscoped`.

## Session States

### Guest
Conditions:
- wagmi wallet is disconnected
- or no wallet address is available

UI:
- navbar shows `Therapist Portal`
- navbar shows `Login / Join`

### Unscoped
Conditions:
- wallet is connected
- but there is no valid active session and matching profile pair

UI:
- navbar shows wallet address pill
- navbar shows `Sign Out`
- navbar does not show `Dashboard`
- navbar does not show `Provider Lobby`

### Patient
Conditions:
- wallet is connected
- `mindpass-active-session === "patient"`
- `mindpass-patient-profile` exists
- stored patient wallet matches wagmi wallet case-insensitively

UI:
- navbar shows `Dashboard`
- navbar shows wallet address pill
- navbar shows `Sign Out`

### Therapist
Conditions:
- wallet is connected
- `mindpass-active-session === "therapist"`
- `mindpass-therapist-profile` exists
- stored therapist wallet matches wagmi wallet case-insensitively

UI:
- navbar shows `Provider Lobby`
- navbar shows wallet address pill
- navbar shows `Sign Out`

## Patient Portal Flow
Route: `/auth`

### Initialize Vault
1. User enters optional government support code.
2. User connects wallet.
3. Frontend validates / burns support code if supplied.
4. Frontend upserts the `patients` row in Supabase.
5. Only after successful DB write:
   - `mindpass-patient-profile` is written
   - `mindpass-therapist-profile` is removed
   - `mindpass-active-session` is set to `patient`
6. User is routed to `/dashboard`.

### Quick Access
1. User connects wallet.
2. Frontend queries `patients` using case-insensitive wallet matching.
3. If a row exists:
   - patient profile is refreshed in local storage
   - therapist profile is removed
   - active session is set to `patient`
   - user is routed to `/dashboard`
4. If no row exists:
   - user sees an explicit initialize-vault message

### Provider Blocker
If a therapist session is currently active, the patient auth page shows a blocker instead of the patient flow UI.

## Therapist Portal Flow
Route: `/therapist-login`

1. User connects wallet.
2. Frontend queries `therapists` using case-insensitive wallet matching.
3. If a row exists:
   - `mindpass-therapist-profile` is written
   - `mindpass-patient-profile` is removed
   - `mindpass-active-session` is set to `therapist`
   - a `login` entry is written to `therapist_auth_logs`
   - user is routed to `/provider-lobby`
4. If no row exists:
   - user is routed to therapist onboarding

### Patient Blocker
If a patient session is currently active, the therapist login page shows a blocker instead of the provider login UI.

## Route Guards

### `/dashboard`
Allowed only when:
- wallet is connected
- active session resolves to `patient`

Behaviour:
- patient session -> render dashboard
- therapist session -> show blocker UI
- guest / unscoped -> redirect to `/auth`

### `/provider-lobby`
Allowed only when:
- wallet is connected
- active session resolves to `therapist`

Behaviour:
- therapist session -> render provider lobby
- patient session -> show blocker UI
- guest / unscoped -> redirect to `/therapist-login`

## Session Safety Behaviour

### Account Mismatch Protection
If wagmi address changes and no longer matches the active profile wallet:
- session keys are cleared
- wagmi disconnect is triggered
- user is routed back to `/`

### Cross-Tab Sync
If another tab changes auth-related local storage keys:
- the current tab hard reloads to avoid stale wallet/provider state

### Same-Tab Sync
Successful login / logout flows dispatch `mindpass-session-changed` so the navbar and guards update immediately in the same tab.

### Ghost Profile Self-Healing
If the patient dashboard finds local patient state but no corresponding patient row in Supabase:
- local patient profile is cleared
- active patient session is removed
- user is routed back to `/auth`

## Current Limitations
- there is no silent database-driven session auto-restore on mount
- the browser is intentionally strict about one active role at a time
- real on-chain settlement is not part of the current auth/session layer
