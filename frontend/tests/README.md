# Frontend Tests

This folder now contains executable Node-based test coverage for workflow fixtures and UI-state models.

## Run

```bash
cd frontend
npm test
```

The current suite uses the built-in Node test runner with `--experimental-strip-types`, so it does not require Jest or Vitest.

## Current Coverage

### Executable coverage
- `frontend/lib/__tests__/booking.test.ts`
- `frontend/lib/__tests__/session-outcome.test.ts`
- `frontend/lib/__tests__/onchain-session-mapping.test.ts`
- `frontend/tests/session-lifecycle-model.test.ts`

### Fixture support
- `frontend/tests/fixtures/sessions.ts`
- `frontend/tests/fixtures/therapists.ts`

## Still Not Covered by Browser Automation

Playwright is still not installed in this workspace, so these remain manual:
- wallet connect/disconnect behavior
- realtime subscription timing
- route redirects involving real browser hydration
- full end-to-end booking flow against a real Supabase project

Use:
- [docs/manual-qa-checklist.md](/Users/yu/Documents/Postgrad/FTwDS/FTGP-GP/mindpass-ftgp-group19/docs/manual-qa-checklist.md)
- [docs/mindpass-testing-guide.md](/Users/yu/Documents/Postgrad/FTwDS/FTGP-GP/mindpass-ftgp-group19/docs/mindpass-testing-guide.md)

## Recommended Future Expansion

If Playwright is added later, expand into:

```text
frontend/tests/
  playwright/
    auth-session.spec.ts
    dashboard-guard.spec.ts
    provider-lobby-guard.spec.ts
    therapist-display.spec.ts
    booking-flow.spec.ts
```
