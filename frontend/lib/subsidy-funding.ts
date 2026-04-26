import { MINDPASS_ESCROW_STATUS } from "./mindpassEscrow";

export type SubsidyFundingChainOutcome =
  | "no_subsidy_needed"
  | "already_funded"
  | "ready_to_fund"
  | "invalid_status";

export function getRemainingSubsidyWei(input: {
  subsidyRequiredWei: bigint;
  subsidyFundedWei: bigint;
}) {
  if (input.subsidyFundedWei >= input.subsidyRequiredWei) {
    return 0n;
  }

  return input.subsidyRequiredWei - input.subsidyFundedWei;
}

export function resolveSubsidyFundingChainOutcome(input: {
  status: number;
  subsidyRequiredWei: bigint;
  subsidyFundedWei: bigint;
}) {
  const remainingSubsidyWei = getRemainingSubsidyWei({
    subsidyRequiredWei: input.subsidyRequiredWei,
    subsidyFundedWei: input.subsidyFundedWei,
  });

  if (input.subsidyRequiredWei <= 0n) {
    return "no_subsidy_needed" as const;
  }

  if (remainingSubsidyWei === 0n) {
    return "already_funded" as const;
  }

  if (input.status === MINDPASS_ESCROW_STATUS.AcceptedAwaitingPayment) {
    return "ready_to_fund" as const;
  }

  return "invalid_status" as const;
}

export function needsWalletFunding(input: {
  walletRequiredEth: number;
  walletFundedEth: number;
}) {
  return input.walletRequiredEth > input.walletFundedEth + 0.0000001;
}

export function needsSubsidyFunding(input: {
  subsidyAppliedEth: number;
  subsidyFundedEth: number;
}) {
  return input.subsidyAppliedEth > input.subsidyFundedEth + 0.0000001;
}
