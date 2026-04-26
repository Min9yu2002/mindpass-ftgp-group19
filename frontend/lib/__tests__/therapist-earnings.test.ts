import test from "node:test";
import assert from "node:assert/strict";

import {
  getOutstandingTherapistPayoutEstimateEth,
  isRecordedTherapistPayoutRow,
} from "../therapist-earnings.ts";

test("recorded therapist payout rows include completed and patient no-show payouts", () => {
  assert.equal(
    isRecordedTherapistPayoutRow({
      status: "completed",
      therapist_payout_eth: "0.00475",
    }),
    true,
  );
  assert.equal(
    isRecordedTherapistPayoutRow({
      status: "patient_no_show",
      therapist_payout_eth: "0.001",
    }),
    true,
  );
  assert.equal(
    isRecordedTherapistPayoutRow({
      status: "therapist_no_show",
      therapist_payout_eth: "0.001",
    }),
    false,
  );
  assert.equal(
    isRecordedTherapistPayoutRow({
      status: "completed",
      therapist_payout_eth: "0",
    }),
    false,
  );
});

test("outstanding therapist payout estimate excludes already withdrawn rows", () => {
  const estimate = getOutstandingTherapistPayoutEstimateEth([
    {
      status: "completed",
      therapist_payout_eth: "0.00475",
      therapist_withdrawal_tx_hash: null,
    },
    {
      status: "patient_no_show",
      therapist_payout_eth: "0.001",
      therapist_withdrawal_tx_hash: null,
    },
    {
      status: "completed",
      therapist_payout_eth: "0.00475",
      therapist_withdrawal_tx_hash: "0xwithdrawn",
    },
  ]);

  assert.equal(estimate, 0.00575);
});
