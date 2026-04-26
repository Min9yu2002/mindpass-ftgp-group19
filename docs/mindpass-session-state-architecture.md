# MindPass Session State Architecture

## Scope
This document describes the shared frontend session-state helpers that normalize booking lifecycle behavior across:

- `/dashboard`
- `/provider-lobby`
- `/chat`

It does not change the active-session auth model. It only centralizes how booking/session state is interpreted in the UI.

## Source-of-truth helpers

### `frontend/lib/session-status.ts`
Owns canonical frontend status interpretation:

- status normalization
- open/locking status detection
- terminal status detection
- funded/live detection
- provider queue status detection
- chat-allowed status detection
- session mode normalization

Use this file whenever a page needs to answer "what status is this row really in?"

### `frontend/lib/session-transition-guards.ts`
Owns pure transition/catch-up predicates:

- should this row time out for payment?
- should this funded row resolve a no-show?
- can this participant still check in?
- can a funded session auto-start?
- can this session be completed?

This file is the shared decision layer before any guarded Supabase update.

### `frontend/lib/session-outcome.ts`
Owns user-facing booking and terminal outcome messaging:

- terminal chat outcome copy
- booking feedback tone
- booking feedback message wrappers

If the product copy for a session outcome changes, update it here first.

### `frontend/lib/session-formatting.ts`
Owns small formatting helpers that are coupled to session state:

- timestamp expiry checks
- session mode labels
- provider queue status labels and tones

## Current model
MindPass is still DB-first today. The frontend reads the `sessions` table as the runtime source of truth and then:

1. normalizes raw row status
2. applies client-side catch-up rules for timeout/no-show
3. renders patient/provider/chat UX from shared helpers

That means the UI is consistent even when data arrives from:

- initial page hydration
- Supabase realtime
- stale reloads
- post-mutation refetches

## Future contract integration hook points
When contract-backed settlement is turned on later, these helpers should remain the UI interpretation layer.

Recommended future hookup:

1. On-chain events or relayer sync write canonical session state into Supabase.
2. Frontend pages continue consuming normalized rows through the shared helpers.
3. `session-transition-guards.ts` remains useful for client-side stale-state prevention, but final settlement authority should move to backend/event-driven sync.

In practice:

- Supabase remains the frontend read model
- contract events become the write/sync source
- shared helpers remain the source of truth for rendering and guarded UI actions
