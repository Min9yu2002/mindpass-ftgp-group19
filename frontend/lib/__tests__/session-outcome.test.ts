import test from "node:test";
import assert from "node:assert/strict";

import { getTerminalSessionOutcome } from "../session-outcome.ts";

test("patient terminal outcome copy is refund-aware for therapist no-show", () => {
  const outcome = getTerminalSessionOutcome("therapist_no_show", false);

  assert.deepEqual(outcome, {
    title: "Therapist missed the session",
    message:
      "The therapist did not arrive within 2 minutes. You have received a full refund.",
    actionLabel: "Back to dashboard",
    href: "/dashboard",
  });
});

test("patient terminal outcome copy is penalty-aware for patient no-show", () => {
  const outcome = getTerminalSessionOutcome("patient_no_show", false);

  assert.deepEqual(outcome, {
    title: "Session closed for patient no-show",
    message:
      "You did not arrive within 2 minutes. 50% of the session fee has been refunded. The remaining 50% was paid to the therapist as compensation.",
    actionLabel: "Back to dashboard",
    href: "/dashboard",
  });
});

test("provider terminal outcome copy is role-aware for patient no-show", () => {
  const outcome = getTerminalSessionOutcome("patient_no_show", true);

  assert.deepEqual(outcome, {
    title: "Patient missed the session",
    message:
      "The patient did not arrive within 2 minutes. You received 50% of the session fee as compensation.",
    actionLabel: "Back to lobby",
    href: "/provider-lobby",
  });
});

test("provider terminal outcome copy is role-aware for mutual_unstarted", () => {
  const outcome = getTerminalSessionOutcome("mutual_unstarted", true);

  assert.deepEqual(outcome, {
    title: "Session closed as mutual unstarted",
    message:
      "Neither participant arrived within 2 minutes. The session was closed. A reliability flag was recorded.",
    actionLabel: "Back to lobby",
    href: "/provider-lobby",
  });
});
