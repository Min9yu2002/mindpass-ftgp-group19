export type TherapistPayoutSessionStatus = "completed" | "patient_no_show";

export type TherapistPayoutMirrorRow = {
  status?: unknown;
  therapist_payout_eth?: unknown;
  therapist_withdrawal_tx_hash?: unknown;
};

function parseEthAmount(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

export function isTherapistPayoutSessionStatus(
  value: unknown,
): value is TherapistPayoutSessionStatus {
  return value === "completed" || value === "patient_no_show";
}

export function isRecordedTherapistPayoutRow(
  row: TherapistPayoutMirrorRow,
): row is TherapistPayoutMirrorRow & {
  status: TherapistPayoutSessionStatus;
} {
  return (
    isTherapistPayoutSessionStatus(row.status) &&
    parseEthAmount(row.therapist_payout_eth) > 0
  );
}

export function getOutstandingTherapistPayoutEstimateEth(
  rows: TherapistPayoutMirrorRow[],
) {
  return rows
    .filter(isRecordedTherapistPayoutRow)
    .filter((row) => !row.therapist_withdrawal_tx_hash)
    .reduce((sum, row) => sum + parseEthAmount(row.therapist_payout_eth), 0);
}
