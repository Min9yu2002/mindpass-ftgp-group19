# MindPass Manual QA Checklist

This checklist focuses on the current auth, session, dashboard, provider-lobby, therapist display, and booking flows.

## Test Environment
Before starting:
- confirm the frontend runs locally
- confirm Supabase environment variables are configured
- confirm at least one patient wallet and one therapist wallet exist for testing
- confirm at least one therapist record is verified and SBT-enabled in Supabase
- confirm browser local storage can be cleared between runs

Recommended test wallets:
- one patient-only wallet
- one therapist-only wallet
- one dual-role wallet if available
- one unregistered wallet

## 1. Guest State
Initial condition:
- disconnect wallet
- clear:
  - `mindpass-patient-profile`
  - `mindpass-therapist-profile`
  - `mindpass-active-session`
  - `mindpass-xmtp-connected`

Expected:
- homepage navbar shows `Therapist Portal`
- homepage navbar shows `Login / Join`
- navbar does not show `Dashboard`
- navbar does not show `Provider Lobby`
- navbar does not show wallet address pill

## 2. Unscoped Connected State
Initial condition:
- connect a wallet in MetaMask
- do not log in through `/auth` or `/therapist-login`
- ensure no MindPass session keys exist in local storage

Expected:
- navbar shows wallet address pill
- navbar shows `Sign Out`
- navbar does not show `Dashboard`
- navbar does not show `Provider Lobby`
- navbar does not show `Login / Join`

## 3. Patient Login Flow
Route:
- `/auth`

### 3.1 Initialize Vault
Steps:
1. connect a patient wallet
2. optionally enter a support code
3. click `Initialize Vault`

Expected:
- patient row is created or updated in `patients`
- local storage contains:
  - `mindpass-patient-profile`
  - `mindpass-active-session = patient`
- `mindpass-therapist-profile` is removed
- user is routed to `/dashboard`
- navbar shows `Dashboard`

### 3.2 Quick Access
Steps:
1. clear browser tab state but keep patient row in Supabase
2. visit `/auth`
3. switch to `Quick Access`
4. connect the same wallet

Expected:
- patient is routed to `/dashboard`
- local storage contains valid patient profile
- active session is `patient`

### 3.3 Invalid Quick Access
Steps:
1. visit `/auth`
2. switch to `Quick Access`
3. connect a wallet that does not exist in `patients`

Expected:
- user stays on `/auth`
- error message clearly says no vault exists and initialization is required
- no patient session should be established

## 4. Therapist Login Flow
Route:
- `/therapist-login`

### 4.1 Verified Therapist Login
Steps:
1. connect a wallet that exists in `therapists`
2. wait for verification to complete

Expected:
- local storage contains:
  - `mindpass-therapist-profile`
  - `mindpass-active-session = therapist`
- `mindpass-patient-profile` is removed
- user is routed to `/provider-lobby`
- navbar shows `Provider Lobby`
- `therapist_auth_logs` receives a `login` record

### 4.2 Unregistered Therapist Wallet
Steps:
1. connect a wallet not found in `therapists`

Expected:
- user is routed to `/therapist-onboarding`
- therapist session is not established until onboarding succeeds

## 5. Role Isolation

### 5.1 Patient Portal Blocked for Therapist Session
Steps:
1. log in as therapist
2. visit `/auth`

Expected:
- patient auth UI is blocked
- clear provider-specific blocker message is shown
- patient wallet initialization UI is not rendered

### 5.2 Therapist Portal Blocked for Patient Session
Steps:
1. log in as patient
2. visit `/therapist-login`

Expected:
- therapist login UI is blocked
- clear patient-specific blocker message is shown

### 5.3 Book Session Blocked for Active Therapist Session
Steps:
1. log in as therapist
2. visit `/therapists`
3. click `Book Session`

Expected:
- alert warns the user to sign out first
- no route change
- no `sessions` row is created

## 6. Dashboard Guard
Route:
- `/dashboard`

### 6.1 Guest Redirect
Steps:
1. disconnect wallet
2. clear session keys
3. visit `/dashboard`

Expected:
- user is redirected to `/auth`
- patient vault UI does not briefly flash

### 6.2 Unscoped Redirect
Steps:
1. connect a wallet
2. ensure `mindpass-active-session` is missing
3. visit `/dashboard`

Expected:
- user is redirected to `/auth`

### 6.3 Therapist Blocker
Steps:
1. log in as therapist
2. visit `/dashboard`

Expected:
- dashboard content is blocked
- provider-specific access denied message is shown

## 7. Provider Lobby Guard
Route:
- `/provider-lobby`

### 7.1 Guest Redirect
Steps:
1. disconnect wallet
2. clear session keys
3. visit `/provider-lobby`

Expected:
- user is redirected to `/therapist-login`

### 7.2 Unscoped Redirect
Steps:
1. connect a wallet
2. ensure no active session exists
3. visit `/provider-lobby`

Expected:
- user is redirected to `/therapist-login`

### 7.3 Patient Blocker
Steps:
1. log in as patient
2. visit `/provider-lobby`

Expected:
- provider UI is blocked
- patient-specific access denied message is shown

## 8. Therapist Display Fallback
Targets:
- homepage preview
- `/therapists`
- patient dashboard therapist directory

### 8.1 Name Fallback
Prepare data:
- one therapist row with `full_name = null` and `legal_name` populated

Expected:
- UI shows `legal_name`
- UI does not show blank or `null`

### 8.2 Specialty Fallback
Prepare data:
- one therapist row with `specialty = null` and `clinical_specialty` populated

Expected:
- UI shows `clinical_specialty`
- UI does not show blank or `null`

### 8.3 Final Default
Prepare data:
- one therapist row missing both name fields or both specialty fields

Expected:
- name falls back to `Anonymous Provider`
- specialty falls back to `General Specialist`

## 9. Booking Button Basic Behaviour
Target:
- patient dashboard therapist cards

### 9.1 Patient Booking Success
Steps:
1. log in as patient
2. visit `/dashboard`
3. click `Book & Lock 0.005 ETH`

Expected:
- clicked button becomes disabled
- button label changes to `Booking...`
- new row is created in `sessions`
- inserted row includes:
  - `patient_wallet`
  - `therapist_wallet`
  - `status = requested`
  - `session_mode = text`
  - `session_fee_eth = 0.005`
  - `escrow_amount = 0.005`
- patient remains on `/dashboard`

### 9.2 Provider Request Visibility
Steps:
1. with a matching therapist logged in, open `/provider-lobby`
2. create a booking request from patient dashboard

Expected:
- incoming request appears in provider lobby list
- realtime popup appears for the therapist if the page is open

### 9.3 Accept / Reject
Steps:
1. click `Accept`
2. repeat with another request and click `Reject`

Expected:
- accept updates `sessions.status` into the next workflow state used by the current build
- reject updates `sessions.status = rejected`
- popup closes after action
- list refreshes accordingly

## 10. Session Safety

### 10.1 Sign Out
Steps:
1. sign out from navbar or dashboard

Expected:
- all MindPass local storage session keys are removed
- wagmi disconnect occurs
- user is routed to `/`

### 10.2 Cross-Tab Sync
Steps:
1. open two tabs in the same browser
2. log in on one tab
3. sign out on the other tab

Expected:
- second tab reloads / syncs out of session
- stale dashboard/provider UI is not left behind

### 10.3 Wallet Account Switch
Steps:
1. log in with a valid session
2. switch MetaMask to a different account

Expected:
- session is cleared
- user is sent back to `/`
- navbar does not keep stale role buttons
