import test from "node:test";
import assert from "node:assert/strict";

import {
  MINDPASS_ESCROW_WRITE_FUNCTIONS,
  encodeSessionModeBytes32,
  prepareCreateBookingRequest,
  prepareFundPatientPortion,
} from "../mindpassEscrow.ts";

test("wagmi integration skeleton exposes the supported write surface", () => {
  assert.deepEqual(MINDPASS_ESCROW_WRITE_FUNCTIONS, [
    "createBookingRequest",
    "acceptBooking",
    "rejectBooking",
    "fundPatientPortion",
    "fundSubsidyPortion",
    "resolvePaymentTimeout",
    "cancelUnstartedSession",
    "checkInAsPatient",
    "checkInAsTherapist",
    "resolveNoShow",
    "completeSession",
    "withdraw",
  ]);
});

test("prepareCreateBookingRequest builds a typed wagmi-ready config", () => {
  const request = prepareCreateBookingRequest({
    address: "0x0000000000000000000000000000000000000001",
    therapist: "0x0000000000000000000000000000000000000002",
    walletRequiredWei: 3_000_000_000_000_000n,
    subsidyRequiredWei: 2_000_000_000_000_000n,
    sessionMode: "text",
  });

  assert.equal(request.functionName, "createBookingRequest");
  assert.equal(request.args[0], "0x0000000000000000000000000000000000000002");
  assert.equal(request.args[3], encodeSessionModeBytes32("text"));
});

test("prepareFundPatientPortion preserves payable value for future wallet funding", () => {
  const request = prepareFundPatientPortion({
    address: "0x0000000000000000000000000000000000000001",
    sessionId: 42n,
    valueWei: 3_000_000_000_000_000n,
  });

  assert.equal(request.functionName, "fundPatientPortion");
  assert.equal(request.args[0], 42n);
  assert.equal(request.value, 3_000_000_000_000_000n);
});
