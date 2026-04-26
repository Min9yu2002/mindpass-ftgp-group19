import test from "node:test";
import assert from "node:assert/strict";
import { encodeAbiParameters, encodeEventTopics } from "viem";

import {
  findMindPassEscrowEvent,
  MINDPASS_ESCROW_ABI,
  MINDPASS_ESCROW_WRITE_FUNCTIONS,
  encodeSessionModeBytes32,
  prepareConfirmSessionEnd,
  prepareCreateBookingRequest,
  prepareFundPatientPortion,
  prepareRequestSessionEnd,
} from "../mindpassEscrow.ts";

test("wagmi integration skeleton exposes the supported write surface", () => {
  assert.deepEqual(MINDPASS_ESCROW_WRITE_FUNCTIONS, [
    "createBookingRequest",
    "acceptBooking",
    "rejectBooking",
    "fundPatientPortion",
    "fundSubsidyPortion",
    "resolvePaymentTimeout",
    "checkInAsPatient",
    "checkInAsTherapist",
    "resolveNoShow",
    "requestSessionEnd",
    "confirmSessionEnd",
    "withdraw",
  ]);
});

test("frontend escrow abi exposes the claimable balance getter", () => {
  const claimableBalanceAbi = MINDPASS_ESCROW_ABI.find(
    (item) => item.type === "function" && item.name === "claimableBalance",
  );

  assert.ok(claimableBalanceAbi);
  assert.equal(claimableBalanceAbi?.stateMutability, "view");
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

test("prepareRequestSessionEnd builds the on-chain end request call", () => {
  const request = prepareRequestSessionEnd({
    address: "0x0000000000000000000000000000000000000001",
    sessionId: 42n,
  });

  assert.equal(request.functionName, "requestSessionEnd");
  assert.equal(request.args[0], 42n);
});

test("prepareConfirmSessionEnd builds the on-chain end confirmation call", () => {
  const request = prepareConfirmSessionEnd({
    address: "0x0000000000000000000000000000000000000001",
    sessionId: 42n,
  });

  assert.equal(request.functionName, "confirmSessionEnd");
  assert.equal(request.args[0], 42n);
});

test("findMindPassEscrowEvent decodes matching receipt logs", () => {
  const bookingRequestedAbi = MINDPASS_ESCROW_ABI.find(
    (item) => item.type === "event" && item.name === "BookingRequested",
  );

  assert.ok(bookingRequestedAbi);

  const topics = encodeEventTopics({
    abi: [bookingRequestedAbi],
    eventName: "BookingRequested",
    args: {
      sessionId: 42n,
      patient: "0x0000000000000000000000000000000000000001",
      therapist: "0x0000000000000000000000000000000000000002",
    },
  });
  const data = encodeAbiParameters(
    [
      { name: "walletRequiredWei", type: "uint256" },
      { name: "subsidyRequiredWei", type: "uint256" },
      { name: "sessionMode", type: "bytes32" },
    ],
    [3_000_000_000_000_000n, 2_000_000_000_000_000n, encodeSessionModeBytes32("text")],
  );

  const event = findMindPassEscrowEvent(
    [
      {
        topics,
        data,
      },
    ],
    "BookingRequested",
  );

  assert.ok(event);
  assert.equal(event?.eventName, "BookingRequested");
  assert.equal(event?.args.sessionId, 42n);
});
