import test from "node:test";
import assert from "node:assert/strict";

import {
  getRemainingSubsidyWei,
  needsSubsidyFunding,
  needsWalletFunding,
  resolveSubsidyFundingChainOutcome,
} from "../subsidy-funding.ts";

test("getRemainingSubsidyWei clamps idempotent retries at zero", () => {
  assert.equal(
    getRemainingSubsidyWei({
      subsidyRequiredWei: 2n,
      subsidyFundedWei: 0n,
    }),
    2n,
  );
  assert.equal(
    getRemainingSubsidyWei({
      subsidyRequiredWei: 2n,
      subsidyFundedWei: 2n,
    }),
    0n,
  );
  assert.equal(
    getRemainingSubsidyWei({
      subsidyRequiredWei: 2n,
      subsidyFundedWei: 3n,
    }),
    0n,
  );
});

test("resolveSubsidyFundingChainOutcome returns no_subsidy_needed when no subsidy is required", () => {
  assert.equal(
    resolveSubsidyFundingChainOutcome({
      status: 2,
      subsidyRequiredWei: 0n,
      subsidyFundedWei: 0n,
    }),
    "no_subsidy_needed",
  );
});

test("resolveSubsidyFundingChainOutcome returns already_funded when the subsidy leg is complete", () => {
  assert.equal(
    resolveSubsidyFundingChainOutcome({
      status: 2,
      subsidyRequiredWei: 2n,
      subsidyFundedWei: 2n,
    }),
    "already_funded",
  );
});

test("resolveSubsidyFundingChainOutcome returns ready_to_fund only during accepted awaiting payment", () => {
  assert.equal(
    resolveSubsidyFundingChainOutcome({
      status: 2,
      subsidyRequiredWei: 2n,
      subsidyFundedWei: 0n,
    }),
    "ready_to_fund",
  );
  assert.equal(
    resolveSubsidyFundingChainOutcome({
      status: 3,
      subsidyRequiredWei: 2n,
      subsidyFundedWei: 0n,
    }),
    "invalid_status",
  );
});

test("retry guards avoid recharging a funded leg", () => {
  assert.equal(
    needsWalletFunding({
      walletRequiredEth: 0.003,
      walletFundedEth: 0.003,
    }),
    false,
  );
  assert.equal(
    needsSubsidyFunding({
      subsidyAppliedEth: 0.002,
      subsidyFundedEth: 0,
    }),
    true,
  );
});
