import test from "node:test";
import assert from "node:assert/strict";
import { encodeAbiParameters, encodeEventTopics } from "viem";

import { getMindPassEscrowEventNames } from "../escrow-debug.ts";
import { MINDPASS_ESCROW_ABI, encodeSessionModeBytes32 } from "../mindpassEscrow.ts";

test("getMindPassEscrowEventNames returns decoded event names in log order", () => {
  const bookingRequestedAbi = MINDPASS_ESCROW_ABI.find(
    (item) => item.type === "event" && item.name === "BookingRequested",
  );
  const sessionFundedAbi = MINDPASS_ESCROW_ABI.find(
    (item) => item.type === "event" && item.name === "SessionFunded",
  );

  assert.ok(bookingRequestedAbi);
  assert.ok(sessionFundedAbi);

  const bookingRequestedLog = {
    topics: encodeEventTopics({
      abi: [bookingRequestedAbi],
      eventName: "BookingRequested",
      args: {
        sessionId: 42n,
        patient: "0x0000000000000000000000000000000000000001",
        therapist: "0x0000000000000000000000000000000000000002",
      },
    }),
    data: encodeAbiParameters(
      [
        { name: "walletRequiredWei", type: "uint256" },
        { name: "subsidyRequiredWei", type: "uint256" },
        { name: "sessionMode", type: "bytes32" },
      ],
      [3_000_000_000_000_000n, 2_000_000_000_000_000n, encodeSessionModeBytes32("text")],
    ),
  };

  const sessionFundedLog = {
    topics: encodeEventTopics({
      abi: [sessionFundedAbi],
      eventName: "SessionFunded",
      args: {
        sessionId: 42n,
      },
    }),
    data: encodeAbiParameters(
      [
        { name: "walletFundedWei", type: "uint256" },
        { name: "subsidyFundedWei", type: "uint256" },
        { name: "fundedAt", type: "uint256" },
        { name: "noShowDeadlineAt", type: "uint256" },
      ],
      [3_000_000_000_000_000n, 2_000_000_000_000_000n, 1_763_290_180n, 1_763_290_480n],
    ),
  };

  assert.deepEqual(
    getMindPassEscrowEventNames([bookingRequestedLog, sessionFundedLog]),
    ["BookingRequested", "SessionFunded"],
  );
});
