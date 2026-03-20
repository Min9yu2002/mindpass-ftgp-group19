"use client";

import { useEffect, useMemo, useState } from "react";
import GlassCard from "./GlassCard";
import StatusBadge from "./StatusBadge";
import {
  PAYMENT_WINDOW_MS,
  SESSION_FEE_ETH,
} from "../lib/booking";
import { formatSessionMode } from "../lib/session-formatting";
import {
  normalizeSessionMode,
  normalizeSessionStatus,
  type SessionMode,
} from "../lib/session-status";
import { supabase } from "../lib/supabase";

export const PROVIDER_REQUEST_UPDATED_EVENT =
  "mindpass-provider-request-updated";

type ProviderIncomingRequest = {
  id: string;
  patientWallet: string;
  createdAt: string;
  sessionMode: SessionMode;
  amountEth: number;
};

type GlobalProviderIncomingRequestCardProps = {
  therapistWallet?: string | null;
  visible: boolean;
};

const GLOBAL_PROVIDER_REQUEST_SELECT =
  "id, therapist_wallet, patient_wallet, status, created_at, session_mode, session_fee_eth, escrow_amount, amount_eth";

function truncateWallet(value: string) {
  if (!value) {
    return "Unknown wallet";
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatRelativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }

  const diffMinutes = Math.round((date.getTime() - Date.now()) / 60000);
  const diffHours = Math.round((date.getTime() - Date.now()) / 3600000);
  const diffDays = Math.round((date.getTime() - Date.now()) / 86400000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (Math.abs(diffMinutes) < 60) {
    return rtf.format(diffMinutes, "minute");
  }

  if (Math.abs(diffHours) < 24) {
    return rtf.format(diffHours, "hour");
  }

  return rtf.format(diffDays, "day");
}

function formatEth(value: number) {
  return `${value.toFixed(3)} ETH`;
}

function normalizeIncomingRequest(
  row: Record<string, unknown> | null,
): ProviderIncomingRequest | null {
  if (!row || normalizeSessionStatus(row.status) !== "requested") {
    return null;
  }

  return {
    id: String(row.id ?? ""),
    patientWallet: String(row.patient_wallet ?? "").toLowerCase(),
    createdAt: String(row.created_at ?? ""),
    sessionMode: normalizeSessionMode(row.session_mode),
    amountEth: Number(
      row.session_fee_eth ?? row.escrow_amount ?? row.amount_eth ?? SESSION_FEE_ETH,
    ),
  };
}

export default function GlobalProviderIncomingRequestCard({
  therapistWallet,
  visible,
}: GlobalProviderIncomingRequestCardProps) {
  const normalizedTherapistWallet = useMemo(
    () => String(therapistWallet ?? "").trim().toLowerCase(),
    [therapistWallet],
  );
  const shouldShow = visible && Boolean(normalizedTherapistWallet && supabase);
  const [request, setRequest] = useState<ProviderIncomingRequest | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [actionState, setActionState] = useState<"accept" | "decline" | "">("");
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    if (!shouldShow) {
      return;
    }

    let isCancelled = false;

    const loadLatestRequest = async () => {
      setErrorMessage("");

      const { data, error } = await supabase!
        .from("sessions")
        .select(GLOBAL_PROVIDER_REQUEST_SELECT)
        .ilike("therapist_wallet", normalizedTherapistWallet)
        .eq("status", "requested")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (isCancelled) {
        return;
      }

      if (error) {
        setErrorMessage(error.message);
        setRequest(null);
        return;
      }

      setRequest(normalizeIncomingRequest(data as Record<string, unknown> | null));
    };

    void loadLatestRequest();

    return () => {
      isCancelled = true;
    };
  }, [normalizedTherapistWallet, refreshNonce, shouldShow]);

  useEffect(() => {
    if (!shouldShow) {
      return;
    }

    const channel = supabase!.channel(
      `global-provider-request-card:${normalizedTherapistWallet}`,
    );
    const refresh = (payload?: { new?: Record<string, unknown>; old?: Record<string, unknown> }) => {
      const nextWallet = String(
        payload?.new?.therapist_wallet ?? payload?.old?.therapist_wallet ?? "",
      ).toLowerCase();

      if (nextWallet && nextWallet !== normalizedTherapistWallet) {
        return;
      }

      setRefreshNonce((current) => current + 1);
    };

    channel
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "sessions",
          filter: `therapist_wallet=eq.${normalizedTherapistWallet}`,
        },
        (payload) => refresh(payload as { new?: Record<string, unknown> }),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sessions",
          filter: `therapist_wallet=eq.${normalizedTherapistWallet}`,
        },
        (payload) =>
          refresh(payload as { new?: Record<string, unknown>; old?: Record<string, unknown> }),
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "sessions",
          filter: `therapist_wallet=eq.${normalizedTherapistWallet}`,
        },
        (payload) => refresh(payload as { old?: Record<string, unknown> }),
      )
      .subscribe();

    return () => {
      void channel.unsubscribe();
    };
  }, [normalizedTherapistWallet, shouldShow]);

  const handleDecision = async (nextStatus: "accepted" | "rejected") => {
    if (!supabase || !request || actionState) {
      return;
    }

    const now = new Date();
    const updatePayload =
      nextStatus === "accepted"
        ? {
            status: "accepted_awaiting_payment",
            provider_accepted_at: now.toISOString(),
            payment_due_at: new Date(
              now.getTime() + PAYMENT_WINDOW_MS,
            ).toISOString(),
            settlement_status: "awaiting_patient_payment",
          }
        : {
            status: "rejected",
            rejected_at: now.toISOString(),
            settlement_status: "cancelled",
          };

    setActionState(nextStatus === "accepted" ? "accept" : "decline");
    setErrorMessage("");

    const { error } = await supabase
      .from("sessions")
      .update(updatePayload)
      .eq("id", request.id)
      .eq("status", "requested");

    if (error) {
      setErrorMessage(error.message);
      setActionState("");
      return;
    }

    setRequest(null);
    setActionState("");
    window.dispatchEvent(new Event(PROVIDER_REQUEST_UPDATED_EVENT));
    setRefreshNonce((current) => current + 1);
  };

  if (!shouldShow || !request) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed left-1/2 top-28 z-40 w-[calc(100%-2rem)] max-w-6xl -translate-x-1/2">
      <div className="flex justify-end">
        <GlassCard className="pointer-events-auto liquid-glass-floating glass-panel w-full max-w-[30rem] border border-black/10 px-5 py-4 shadow-[0_18px_42px_rgba(15,23,42,0.18)] dark:border-white/[0.08] dark:shadow-[0_16px_40px_rgba(0,0,0,0.42)]">
          <div className="flex items-stretch gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase leading-none tracking-[0.24em] text-[var(--text-faint)] sm:whitespace-nowrap">
                Incoming Session Request
              </p>

              <h2 className="mt-3 truncate text-[1.35rem] font-semibold tracking-tight text-slate-950 dark:text-white">
                {truncateWallet(request.patientWallet)}
              </h2>

              <div className="mt-3">
                <StatusBadge label="Requested" tone="warning" />
              </div>

              <div className="mt-4 flex flex-wrap gap-2 sm:flex-nowrap">
                <span className="inline-flex items-center rounded-full border border-sky-400/26 bg-sky-400/10 px-3 py-1 text-xs font-medium whitespace-nowrap text-sky-700 backdrop-blur-xl dark:border-sky-300/24 dark:bg-sky-300/10 dark:text-sky-100">
                  {formatSessionMode(request.sessionMode)}
                </span>
                <span className="inline-flex items-center rounded-full border border-emerald-400/26 bg-emerald-400/10 px-3 py-1 text-xs font-medium whitespace-nowrap text-emerald-700 backdrop-blur-xl dark:border-emerald-300/24 dark:bg-emerald-300/10 dark:text-emerald-100">
                  50 min
                </span>
                <span className="inline-flex items-center rounded-full border border-yellow-300/40 bg-yellow-300/18 px-3 py-1 text-xs font-semibold whitespace-nowrap text-amber-800 shadow-[0_0_16px_rgba(253,224,71,0.2)] backdrop-blur-xl dark:border-yellow-200/36 dark:bg-yellow-300/16 dark:text-yellow-100 dark:shadow-[0_0_18px_rgba(253,224,71,0.24)]">
                  {formatEth(request.amountEth)} fee
                </span>
              </div>

              <p className="mt-3 text-sm text-slate-700 sm:whitespace-nowrap dark:text-[var(--text-muted)]">
                Requested {formatRelativeTime(request.createdAt)}
              </p>
            </div>

            <div className="flex w-[8.5rem] shrink-0 flex-col gap-3">
              <button
                type="button"
                onClick={() => void handleDecision("accepted")}
                disabled={Boolean(actionState)}
                className="flex-1 rounded-[1.15rem] border border-emerald-300/35 bg-emerald-500 px-4 py-3 text-sm font-bold text-slate-950 shadow-[0_0_24px_rgba(16,185,129,0.34)] transition hover:-translate-y-px hover:bg-emerald-400 hover:shadow-[0_0_28px_rgba(16,185,129,0.42)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {actionState === "accept" ? "Updating..." : "Accept"}
              </button>
              <button
                type="button"
                onClick={() => void handleDecision("rejected")}
                disabled={Boolean(actionState)}
                className="flex-1 rounded-[1.15rem] border border-rose-500/48 bg-rose-500/34 px-4 py-3 text-sm font-semibold text-rose-950 shadow-[0_0_20px_rgba(244,63,94,0.2)] transition hover:-translate-y-px hover:bg-rose-500/40 hover:shadow-[0_0_24px_rgba(244,63,94,0.26)] dark:border-rose-300/38 dark:bg-rose-400/30 dark:text-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {actionState === "decline" ? "Updating..." : "Decline"}
              </button>
            </div>
          </div>

          {errorMessage ? (
            <p className="mt-3 text-sm text-red-600 dark:text-red-300">
              {errorMessage}
            </p>
          ) : null}
        </GlassCard>
      </div>
    </div>
  );
}
