"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import GlassCard from "../../components/GlassCard";
import SectionHeading from "../../components/SectionHeading";
import StatusBadge from "../../components/StatusBadge";

export default function ProviderLobbyPage() {
  const router = useRouter();
  const [isOnline, setIsOnline] = useState(true);
  const [isOpeningChat, setIsOpeningChat] = useState(false);

  const completedSessions = [
    {
      id: "done-001",
      patientId: "Anonymous_88",
      time: "Yesterday, 10:00 AM",
      amount: "0.05 ETH claimed",
    },
    {
      id: "done-002",
      patientId: "blue_sky_99",
      time: "Mar 14, 16:00 PM",
      amount: "0.01 ETH penalty settled",
    },
  ];

  const handleAccept = () => {
    setIsOpeningChat(true);

    setTimeout(() => {
      setIsOpeningChat(false);
      router.push("/chat?role=therapist");
    }, 1000);
  };

  return (
    <main className="app-shell-subtle page-canvas page-canvas-provider relative min-h-screen overflow-hidden bg-background pt-32 text-foreground md:pt-36">
      <div className="relative mx-auto w-full max-w-7xl px-6 py-8 lg:px-10">
        <header className="liquid-glass-strong glass-panel mb-10 flex flex-col gap-5 rounded-[30px] px-5 py-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className="text-sm uppercase tracking-[0.26em] text-emerald-300/70">
              Provider Dashboard
            </span>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">
              Incoming Session Lobby
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--text-muted)]">
              Manage your live status, review escrow-backed requests, and move
              accepted patients into secure chat.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/therapist-portal"
              className="button-secondary rounded-full px-5 py-3 text-sm font-medium"
            >
              Open Full Portal
            </Link>
            <div className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-5 py-3">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-sm font-medium text-emerald-100">
                SBT Verified (0xDr...8A)
              </span>
            </div>
          </div>
        </header>

        <GlassCard className="glass-panel mb-8 p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <SectionHeading
                eyebrow="Status Toggle"
                title="Control request availability"
              />
              <p className="mt-3 text-sm text-[var(--text-muted)]">
                Toggle your provider status to accept or pause incoming session
                requests.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div
                className={`glass-chip flex items-center gap-2 px-4 py-2 text-sm ${
                  isOnline
                    ? "text-emerald-100"
                    : "text-white/60"
                }`}
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    isOnline ? "animate-pulse bg-emerald-400" : "bg-white/30"
                  }`}
                />
                {isOnline ? "Online (Accepting Requests)" : "Offline (Busy/Unavailable)"}
              </div>
              <div className="liquid-glass-soft flex rounded-full p-1">
                <button
                  type="button"
                  onClick={() => setIsOnline(true)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    isOnline ? "button-primary text-white" : "text-white/60"
                  }`}
                >
                  Online
                </button>
                <button
                  type="button"
                  onClick={() => setIsOnline(false)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    !isOnline ? "glass-chip-muted text-white" : "text-white/60"
                  }`}
                >
                  Offline
                </button>
              </div>
            </div>
          </div>
        </GlassCard>

        <section className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
          <div className="space-y-4">
            <GlassCard className="glass-panel p-6">
              <div className="mb-6 flex items-center justify-between gap-4">
                <SectionHeading
                  eyebrow="Incoming Requests"
                  title="Anonymous patient waiting for response"
                />
                <StatusBadge
                  label={isOnline ? "Accepting Requests" : "Paused"}
                  tone={isOnline ? "success" : "neutral"}
                />
              </div>

              <div className="liquid-glass-soft rounded-[24px] px-5 py-5">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-faint)]">
                      Patient
                    </p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      calm_ocean_22
                    </p>
                    <p className="mt-4 text-sm text-[var(--text-muted)]">
                      Requested 2 min ago
                    </p>
                    <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs uppercase tracking-[0.18em] text-amber-100">
                      <span className="h-2 w-2 rounded-full bg-amber-300" />
                      0.05 ETH Escrow Locked
                    </div>
                  </div>

                  <div className="flex min-w-[220px] flex-col gap-3">
                    <button
                      type="button"
                      disabled={!isOnline}
                      className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-5 py-3 text-sm font-medium text-rose-100 transition hover:bg-rose-400/16 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Decline
                    </button>
                    <button
                      type="button"
                      disabled={!isOnline || isOpeningChat}
                      onClick={handleAccept}
                      className="rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isOpeningChat
                        ? "Opening P2P Node..."
                        : "Accept & Enter Chat"}
                    </button>
                  </div>
                </div>
              </div>
            </GlassCard>
          </div>

          <div className="space-y-4">
            <GlassCard className="glass-panel p-6">
              <SectionHeading
                eyebrow="Financials & History"
                title="Earnings and completed sessions"
              />

              <div className="liquid-glass-soft mt-5 rounded-[24px] p-5">
                <p className="text-sm text-[var(--text-muted)]">
                  Total Earnings
                </p>
                <p className="mt-2 text-3xl font-semibold text-white">
                  1.25 Sepolia ETH
                </p>
              </div>

              <div className="mt-5 space-y-3">
                {completedSessions.map((session) => (
                  <div
                    key={session.id}
                    className="liquid-glass-soft rounded-[22px] border border-white/5 px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium text-white">
                          {session.patientId}
                        </p>
                        <p className="mt-1 text-sm text-[var(--text-muted)]">
                          {session.time}
                        </p>
                      </div>
                      <StatusBadge label="Settled" tone="success" />
                    </div>
                    <p className="mt-4 text-sm text-[var(--text-muted)]">
                      {session.amount}
                    </p>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>
        </section>
      </div>
    </main>
  );
}
