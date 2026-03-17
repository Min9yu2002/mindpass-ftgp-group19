"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import GlassCard from "../../components/GlassCard";
import SectionHeading from "../../components/SectionHeading";
import StatusBadge from "../../components/StatusBadge";

type IncomingRequest = {
  id: string;
  patientAlias: string;
  escrowStatus: string;
  intakeSummary: string;
};

const mockCompletedSessions = [
  {
    id: "sess-001",
    patientAlias: "aurora_field_12",
    amount: "0.45 ETH",
    txHash: "0x1a2b...7c91",
  },
  {
    id: "sess-002",
    patientAlias: "still_river_88",
    amount: "0.35 ETH",
    txHash: "0x8f13...d24a",
  },
  {
    id: "sess-003",
    patientAlias: "ember_pine_04",
    amount: "0.45 ETH",
    txHash: "0x4b92...91de",
  },
];

export default function TherapistPortalPage() {
  const router = useRouter();
  const [isOnline, setIsOnline] = useState(true);
  const [incomingRequest, setIncomingRequest] = useState<IncomingRequest | null>(
    null,
  );
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      return;
    }

    if (incomingRequest) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIncomingRequest({
        id: "req-001",
        patientAlias: "calm_ocean_22",
        escrowStatus: "0.05 ETH Locked in Contract",
        intakeSummary:
          "Patient reports high anxiety and career burnout. Shared 1 encrypted file.",
      });
    }, 2000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [incomingRequest, isOnline]);

  const updateOnlineStatus = (nextStatus: boolean) => {
    setIsOnline(nextStatus);

    if (!nextStatus) {
      setIncomingRequest(null);
      setIsConnecting(false);
    }
  };

  const handleDecline = () => {
    setIncomingRequest(null);
  };

  const handleAccept = () => {
    if (!incomingRequest || isConnecting) {
      return;
    }

    setIsConnecting(true);

    window.setTimeout(() => {
      router.push("/chat?role=therapist");
    }, 1600);
  };

  return (
    <main className="app-shell-subtle page-canvas page-canvas-provider relative min-h-screen overflow-hidden bg-background pt-32 text-foreground md:pt-36">
      <div className="relative mx-auto w-full max-w-7xl px-6 py-8 lg:px-10">
        <section className="glass-panel liquid-glass-strong mb-8 rounded-[32px] px-5 py-6 sm:px-6">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.26em] text-[var(--text-faint)]">
                Provider Access
              </p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-[var(--text-primary)]">
                Provider Command Center
              </h1>
              <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--text-muted)]">
                SBT Verified • 0x8F2...3A1
              </p>
            </div>

            <div className="liquid-glass-soft flex flex-col gap-4 rounded-[28px] p-4 sm:min-w-[24rem]">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      isOnline
                        ? "bg-emerald-400 shadow-[0_0_18px_rgba(74,222,128,0.85)]"
                        : "bg-black/20 dark:bg-white/20"
                    } ${isOnline ? "animate-pulse" : ""}`}
                  />
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                      Status: {isOnline ? "Accepting Requests" : "Offline"}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {isOnline
                        ? "Secure queue is open for anonymous patients."
                        : "New requests are paused while you are unavailable."}
                    </p>
                  </div>
                </div>
                <StatusBadge
                  label={isOnline ? "Live Queue" : "Paused"}
                  tone={isOnline ? "success" : "neutral"}
                />
              </div>

              <div className="liquid-glass-soft grid grid-cols-2 rounded-full p-1">
                <button
                  type="button"
                  onClick={() => updateOnlineStatus(true)}
                  className={`rounded-full px-4 py-3 text-sm font-medium transition ${
                    isOnline
                      ? "button-primary"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  Online
                </button>
                <button
                  type="button"
                  onClick={() => updateOnlineStatus(false)}
                  className={`rounded-full px-4 py-3 text-sm font-medium transition ${
                    !isOnline
                      ? "button-secondary text-[var(--text-primary)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  Offline
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
          <GlassCard className="glass-panel p-6">
            <div className="mb-6 flex items-center justify-between gap-4">
              <SectionHeading
                eyebrow="Incoming Queue"
                title="Incoming Session Requests"
              />
              <StatusBadge
                label={isOnline ? "Listening" : "Offline"}
                tone={isOnline ? "success" : "neutral"}
              />
            </div>

            {!isOnline ? (
              <div className="liquid-glass-soft rounded-[28px] p-6 text-center">
                <p className="text-lg font-semibold text-[var(--text-primary)]">
                  Queue paused
                </p>
                <p className="mt-3 text-sm leading-7 text-[var(--text-muted)]">
                  Switch back online when you are ready to accept new anonymous
                  requests.
                </p>
              </div>
            ) : null}

            {isOnline && !incomingRequest ? (
              <div className="liquid-glass-soft rounded-[28px] p-6 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-black/5 dark:bg-white/10">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--text-primary)] border-t-transparent" />
                </div>
                <p className="mt-5 text-lg font-semibold text-[var(--text-primary)]">
                  Waiting for secure session requests...
                </p>
                <p className="mt-3 text-sm leading-7 text-[var(--text-muted)]">
                  Verified patient requests will appear here after escrow is
                  locked on-chain.
                </p>
              </div>
            ) : null}

            {incomingRequest ? (
              <div className="liquid-glass-soft rounded-[28px] p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-sm uppercase tracking-[0.2em] text-[var(--text-faint)]">
                      Patient Alias
                    </p>
                    <h2 className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
                      {incomingRequest.patientAlias}
                    </h2>
                  </div>
                  <StatusBadge label="New Request" tone="success" />
                </div>

                <div className="mt-6 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-faint)]">
                    Escrow Status
                  </p>
                  <p className="mt-2 text-lg font-semibold text-emerald-600 dark:text-emerald-300">
                    {incomingRequest.escrowStatus}
                  </p>
                </div>

                <div className="mt-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-faint)]">
                    Intake Summary
                  </p>
                  <p className="mt-3 text-sm leading-7 text-[var(--text-muted)]">
                    {incomingRequest.intakeSummary}
                  </p>
                </div>

                <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={handleDecline}
                    className="button-secondary rounded-full px-5 py-3 text-sm font-medium text-red-500 dark:text-red-300"
                  >
                    Decline &amp; Refund
                  </button>
                  <button
                    type="button"
                    onClick={handleAccept}
                    disabled={isConnecting}
                    className="button-primary inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium disabled:cursor-wait disabled:opacity-80"
                  >
                    {isConnecting ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        Establishing secure P2P node...
                      </>
                    ) : (
                      "Accept & Enter Chat"
                    )}
                  </button>
                </div>
              </div>
            ) : null}
          </GlassCard>

          <GlassCard className="glass-panel p-6">
            <div className="mb-6 flex items-center justify-between gap-4">
              <SectionHeading
                eyebrow="Financials"
                title="Earnings & Escrow"
              />
              <StatusBadge label="Wallet Synced" tone="success" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="liquid-glass-soft rounded-[24px] p-5">
                <p className="text-sm text-[var(--text-muted)]">Pending Escrow</p>
                <p className="mt-3 text-3xl font-semibold text-[var(--text-primary)]">
                  0.05 ETH
                </p>
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  Locked for the active incoming session request.
                </p>
              </div>
              <div className="liquid-glass-soft rounded-[24px] p-5">
                <p className="text-sm text-[var(--text-muted)]">
                  Available to Claim
                </p>
                <p className="mt-3 text-3xl font-semibold text-[var(--text-primary)]">
                  1.25 ETH
                </p>
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  Ready to withdraw after therapist-side confirmation.
                </p>
              </div>
            </div>

            <button
              type="button"
              className="button-primary mt-5 w-full rounded-full px-5 py-3 text-sm font-medium"
            >
              Claim Funds
            </button>

            <div className="mt-8">
              <p className="text-sm uppercase tracking-[0.22em] text-[var(--text-faint)]">
                Recent Completed Sessions
              </p>
              <div className="mt-4 space-y-3">
                {mockCompletedSessions.map((session) => (
                  <div
                    key={session.id}
                    className="liquid-glass-soft flex items-center justify-between gap-4 rounded-[24px] px-4 py-4"
                  >
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">
                        {session.patientAlias}
                      </p>
                      <p className="mt-1 font-mono text-xs text-[var(--text-muted)]">
                        Tx: {session.txHash} successful
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">
                        {session.amount}
                      </p>
                      <p className="mt-1 text-xs text-[var(--text-faint)]">
                        Claimed
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </GlassCard>
        </section>
      </div>
    </main>
  );
}
