# MindPass MVP Scope

## Project Goal
MindPass is currently focused on a privacy-first mental health support MVP that combines:
- wallet-based identity
- patient and therapist role-specific entry points
- subsidy-aware booking
- provider request review workflows
- Supabase-backed session and profile state

## What the Current MVP Does
- lets patients initialize a zero-PII vault through `/auth`
- lets existing patients re-enter through wallet verification
- lets therapists verify their wallet through `/therapist-login`
- keeps one active browser role at a time using `mindpass-active-session`
- protects `/dashboard` and `/provider-lobby` with role-aware route guards
- shows verified therapist listings across landing, dashboard, and directory pages
- validates redeem codes and credits subsidy balance
- creates booking requests in `sessions`
- lets providers accept or reject incoming requests
- uses Supabase Realtime to surface new provider-side requests

## What the Current MVP Does Not Yet Do
- perform real on-chain escrow locking or release
- complete end-to-end XMTP / chat session production flow
- automatically settle wallet funding after a mixed or wallet-only booking
- provide full scheduling and calendar management
- provide production-grade healthcare compliance workflows

## Current Demo Focus
The current demo is strongest when showing:
- wallet-first patient login
- wallet-first therapist login
- strict role-isolated browser sessions
- therapist directory browsing
- subsidy-aware booking request creation
- provider request popup and decision workflow

## Current Core Flows
1. Patient connects wallet and initializes or re-enters a vault
2. Patient browses verified therapists
3. Patient books a session request from the dashboard
4. Session request is written to `sessions`
5. Therapist sees the request in `/provider-lobby`
6. Therapist accepts or rejects the request
7. Session status moves into the next funding / review state

## Scope Notes
- the browser session model is intentionally strict even if a wallet exists in both `patients` and `therapists`
- Supabase is currently the main workflow backend for profiles, sessions, subsidy handling, and audit logs
- on-chain treasury logic exists in the repo but is not the primary booking settlement path in the current UI flow
