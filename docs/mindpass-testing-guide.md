# MindPass Testing Guide

This guide describes the current automated testing foundation for the MindPass booking and session lifecycle.

The goal of this test layer is not to replace end-to-end QA yet. It is meant to lock down the most fragile workflow rules while the product is still DB-first and heavily state-driven.

## What Is Covered

### 1. Funding and settlement helper rules

Covered by:
- [frontend/lib/__tests__/booking.test.ts](/Users/yu/Documents/Postgrad/FTwDS/FTGP-GP/mindpass-ftgp-group19/frontend/lib/__tests__/booking.test.ts)

Coverage includes:
- subsidy-first funding resolution
- mixed funding fallback
- wallet-only fallback
- booking-step clamping
- funding source derivation
- no-show settlement calculation
- settlement preview copy for key session states

### 2. Terminal outcome copy

Covered by:
- [frontend/lib/__tests__/session-outcome.test.ts](/Users/yu/Documents/Postgrad/FTwDS/FTGP-GP/mindpass-ftgp-group19/frontend/lib/__tests__/session-outcome.test.ts)

Coverage includes:
- therapist no-show patient messaging
- patient no-show penalty messaging
- provider terminal redirect copy

### 3. Future contract mapping normalization

Covered by:
- [frontend/lib/__tests__/onchain-session-mapping.test.ts](/Users/yu/Documents/Postgrad/FTwDS/FTGP-GP/mindpass-ftgp-group19/frontend/lib/__tests__/onchain-session-mapping.test.ts)

Coverage includes:
- status/funding source mapping
- booking requested payload normalization
- accepted payload normalization
- timeout / cancelled refund split normalization
- wei formatting and wallet normalization

### 4. UI/state workflow model tests

Covered by:
- [frontend/tests/session-lifecycle-model.test.ts](/Users/yu/Documents/Postgrad/FTwDS/FTGP-GP/mindpass-ftgp-group19/frontend/tests/session-lifecycle-model.test.ts)

Coverage includes:
- patient booking primary actions
- funded / in-session focused dashboard state
- patient funded ready-modal open logic
- provider queue action model
- provider funded ready-modal dedupe logic
- terminal feedback tone/message differences

### 5. Realistic session fixtures

Fixtures are stored at:
- [frontend/tests/fixtures/sessions.ts](/Users/yu/Documents/Postgrad/FTwDS/FTGP-GP/mindpass-ftgp-group19/frontend/tests/fixtures/sessions.ts)
- [frontend/tests/fixtures/therapists.ts](/Users/yu/Documents/Postgrad/FTwDS/FTGP-GP/mindpass-ftgp-group19/frontend/tests/fixtures/therapists.ts)

Included fixture coverage:
- wallet funding
- subsidy funding
- mixed funding
- in-session
- completed
- payment timeout
- patient no-show
- therapist no-show
- rejected
- therapist legacy display data

## How To Run

From the frontend workspace:

```bash
npm test
```

Lint:

```bash
npm run lint
```

## What Still Needs Manual Testing

These flows still require manual QA because they depend on browser state, wallet state, or Supabase realtime:

- guest / patient / therapist auth transitions
- wallet connect / disconnect behavior
- cross-tab auth sync
- realtime request popup behavior
- payment modal behavior after live provider acceptance
- chat attendance timing and page reload behavior
- full provider accept / reject against a real Supabase environment

Use:
- [docs/manual-qa-checklist.md](/Users/yu/Documents/Postgrad/FTwDS/FTGP-GP/mindpass-ftgp-group19/docs/manual-qa-checklist.md)

## Hardest Cases To Automate Right Now

The hardest scenarios remain:
- Supabase realtime + initial fetch dedupe
- Wagmi wallet connection changes
- route-guard timing around hydration
- funded/live chat transitions across multiple tabs

Reason:
- the current app does not yet have a dedicated component-test harness or e2e runner in-repo
- the product is still DB-first and stateful, so many flows are best simulated with controlled fixtures before adding browser-level automation

## Recommended Next Step

Once the current state model stabilizes further, add one of:
- Playwright for browser-level auth and route-guard flows
- a lightweight React component-test harness for dashboard/provider-lobby modal state

Until then, this unit/model layer is intended to catch workflow regressions before they escape into manual QA.
