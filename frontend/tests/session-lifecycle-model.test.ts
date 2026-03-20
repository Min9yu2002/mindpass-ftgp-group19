import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPatientBookingFeedback,
  getPatientSessionPrimaryAction,
  getProviderQueueActionModel,
  isFocusedPatientDashboardState,
  shouldAutoOpenPatientSessionReadyModal,
  shouldAutoOpenProviderSessionReadyModal,
} from "../lib/session-view.ts";
import {
  completedSession,
  inSessionFixture,
  mixedFundingSession,
  patientNoShowSession,
  paymentTimeoutSession,
  rejectedSession,
  subsidyFundingSession,
  therapistNoShowSession,
  walletFundingSession,
} from "./fixtures/sessions.ts";

test("patient booking flow model progresses from requested to payment to funded chat prompt", () => {
  assert.equal(getPatientSessionPrimaryAction("requested"), null);
  assert.equal(
    getPatientSessionPrimaryAction(walletFundingSession.status),
    "open_payment",
  );
  assert.equal(
    getPatientSessionPrimaryAction(subsidyFundingSession.status),
    "open_chat_prompt",
  );
  assert.equal(
    getPatientSessionPrimaryAction(inSessionFixture.status),
    "enter_chat",
  );
});

test("funded and live sessions switch the patient dashboard into focused mode", () => {
  assert.equal(isFocusedPatientDashboardState(mixedFundingSession.status), true);
  assert.equal(isFocusedPatientDashboardState(inSessionFixture.status), true);
  assert.equal(isFocusedPatientDashboardState(walletFundingSession.status), false);
  assert.equal(isFocusedPatientDashboardState(completedSession.status), false);
});

test("patient ready modal auto-opens only once per funded session id", () => {
  assert.equal(
    shouldAutoOpenPatientSessionReadyModal(
      { id: mixedFundingSession.id, status: mixedFundingSession.status },
      null,
    ),
    true,
  );
  assert.equal(
    shouldAutoOpenPatientSessionReadyModal(
      { id: mixedFundingSession.id, status: mixedFundingSession.status },
      mixedFundingSession.id,
    ),
    false,
  );
  assert.equal(
    shouldAutoOpenPatientSessionReadyModal(
      { id: inSessionFixture.id, status: inSessionFixture.status },
      null,
    ),
    false,
  );
});

test("provider queue model shows accept/reject only for requested and chat for funded/live", () => {
  assert.deepEqual(getProviderQueueActionModel("requested"), {
    showDecisionButtons: true,
    showEnterChat: false,
  });
  assert.deepEqual(getProviderQueueActionModel("funded"), {
    showDecisionButtons: false,
    showEnterChat: true,
  });
  assert.deepEqual(getProviderQueueActionModel("in_session"), {
    showDecisionButtons: false,
    showEnterChat: true,
  });
});

test("provider ready modal also dedupes by funded session id", () => {
  assert.equal(
    shouldAutoOpenProviderSessionReadyModal(
      { id: subsidyFundingSession.id, status: subsidyFundingSession.status },
      null,
    ),
    true,
  );
  assert.equal(
    shouldAutoOpenProviderSessionReadyModal(
      { id: subsidyFundingSession.id, status: subsidyFundingSession.status },
      subsidyFundingSession.id,
    ),
    false,
  );
});

test("terminal feedback model renders patient_no_show and therapist_no_show differently", () => {
  assert.deepEqual(buildPatientBookingFeedback(patientNoShowSession.status), {
    message:
      "You did not arrive within 2 minutes. 50% of the session fee was refunded and 50% was paid to the therapist.",
    tone: "warning",
  });
  assert.deepEqual(buildPatientBookingFeedback(therapistNoShowSession.status), {
    message: "The therapist did not arrive within 2 minutes. You have received a full refund.",
    tone: "success",
  });
});

test("payment timeout, rejected, and completed remain non-focused terminal states", () => {
  assert.equal(isFocusedPatientDashboardState(paymentTimeoutSession.status), false);
  assert.equal(isFocusedPatientDashboardState(rejectedSession.status), false);
  assert.equal(isFocusedPatientDashboardState(completedSession.status), false);
});
