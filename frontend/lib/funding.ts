export const SESSION_FEE_ETH = 0.005;

export type FundingSource = "subsidy" | "mixed" | "wallet";

export type FundingResolution = {
  fee: number;
  subsidyApplied: number;
  walletRequired: number;
  fundingSource: FundingSource;
};

export function resolveFunding(
  subsidyBalance: number,
  fee = SESSION_FEE_ETH,
): FundingResolution {
  const normalizedFee = Number.isFinite(fee) ? Math.max(0, fee) : SESSION_FEE_ETH;
  const normalizedSubsidy = Number.isFinite(subsidyBalance)
    ? Math.max(0, subsidyBalance)
    : 0;
  const subsidyApplied = Math.min(normalizedSubsidy, normalizedFee);
  const walletRequired = Math.max(0, normalizedFee - subsidyApplied);

  let fundingSource: FundingSource = "wallet";
  if (subsidyApplied >= normalizedFee) {
    fundingSource = "subsidy";
  } else if (subsidyApplied > 0 && walletRequired > 0) {
    fundingSource = "mixed";
  }

  return {
    fee: normalizedFee,
    subsidyApplied,
    walletRequired,
    fundingSource,
  };
}
