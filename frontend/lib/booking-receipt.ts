export const PENDING_BOOKING_TX_HASH_KEY = "mindpass-pending-booking-tx-hash";

export function isPendingReceiptLookupError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("transaction receipt") &&
    message.includes("could not be found")
  ) || (
    message.includes("transaction may not be processed on a block yet")
  );
}

export function storePendingBookingTxHash(txHash: `0x${string}`) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(PENDING_BOOKING_TX_HASH_KEY, txHash);
}

export function getPendingBookingTxHash() {
  if (typeof window === "undefined") {
    return null;
  }

  const value = window.localStorage.getItem(PENDING_BOOKING_TX_HASH_KEY)?.trim();
  if (!value || !/^0x[a-fA-F0-9]{64}$/.test(value)) {
    return null;
  }

  return value as `0x${string}`;
}

export function clearPendingBookingTxHash() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(PENDING_BOOKING_TX_HASH_KEY);
}

export async function trySyncBookingByTxHash(txHash: `0x${string}`) {
  const response = await fetch("/api/escrow/sync-booking", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ txHash }),
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        ok?: boolean;
        error?: string;
        session?: Record<string, unknown> | null;
      }
    | null;

  return {
    ok: Boolean(response.ok && payload?.ok),
    error: payload?.error ?? null,
    session: payload?.session ?? null,
  };
}
