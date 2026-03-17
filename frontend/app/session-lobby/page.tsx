"use client";

import { useState } from "react";
import Link from "next/link";
import GlassCard from "../../components/GlassCard";
import SectionHeading from "../../components/SectionHeading";
import StatusBadge from "../../components/StatusBadge";
import { mockTherapists } from "../../lib/mock-therapists";

export default function SessionLobbyPage() {
  const [requestingId, setRequestingId] = useState<string | null>(null);

  const handleRequest = (therapistId: string, therapistName: string) => {
    setRequestingId(therapistId);

    setTimeout(() => {
      setRequestingId(null);
      alert(`Request sent to ${therapistName}. 0.05 ETH has been locked in escrow.`);
    }, 2000);
  };

  return (
    <main className="app-shell-subtle page-canvas page-canvas-violet relative min-h-screen overflow-hidden bg-background pt-32 text-foreground md:pt-36">
      <div className="relative mx-auto w-full max-w-7xl px-6 py-8 lg:px-10">
        <header className="liquid-glass-strong glass-panel mb-10 flex flex-col gap-5 rounded-[30px] px-5 py-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className="text-sm uppercase tracking-[0.26em] text-violet-200/72">
              Patient Access
            </span>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">
              Session Lobby
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--text-muted)]">
              Browse verified therapists who are currently available, review
              their care style, and request an instant protected session.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/dashboard"
              className="button-secondary rounded-full px-5 py-3 text-sm font-medium"
            >
              Open Full Dashboard
            </Link>
            <div className="button-primary rounded-full px-5 py-3 text-sm font-medium">
              Balance: 0.05 Sepolia ETH
            </div>
          </div>
        </header>

        <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-4">
            <GlassCard className="glass-panel p-6">
              <div className="mb-6 flex items-center justify-between gap-4">
                <SectionHeading
                  eyebrow="Live Directory"
                  title="Verified therapists available now"
                />
                <StatusBadge label="Anonymous Access" tone="neutral" />
              </div>

              <div className="space-y-4">
                {mockTherapists.map((therapist) => (
                  <div
                    key={therapist.id}
                    className="liquid-glass-soft rounded-[24px] border border-white/5 px-5 py-5"
                  >
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex items-center gap-3">
                          <span
                            className={`h-2.5 w-2.5 rounded-full ${
                              therapist.isOnline ? "animate-pulse bg-emerald-400" : "bg-white/30"
                            }`}
                          />
                          <p className="text-lg font-semibold text-white">
                            {therapist.name}
                          </p>
                          <span className="glass-chip-muted px-3 py-1 text-xs text-white/65">
                            {therapist.rating.toFixed(1)}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-violet-200/85">
                          {therapist.specialty}
                        </p>
                        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-muted)]">
                          {therapist.bio}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {therapist.languages.map((language) => (
                            <span
                              key={language}
                              className="glass-chip-muted px-3 py-1 text-xs text-white/65"
                            >
                              {language}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="flex min-w-[250px] flex-col gap-3">
                        <StatusBadge
                          label={therapist.isOnline ? "Online" : "Offline"}
                          tone={therapist.isOnline ? "success" : "neutral"}
                        />
                        <button
                          type="button"
                          disabled={!therapist.isOnline || requestingId === therapist.id}
                          onClick={() => handleRequest(therapist.id, therapist.name)}
                          className={`rounded-2xl px-4 py-3 text-sm font-medium transition ${
                            therapist.isOnline
                              ? "button-primary"
                              : "glass-chip-muted cursor-not-allowed text-white/35"
                          } ${requestingId === therapist.id ? "opacity-80" : ""}`}
                        >
                          {requestingId === therapist.id
                            ? "Locking Escrow & Requesting..."
                            : therapist.isOnline
                              ? "Request Instant Session (Lock 0.05 ETH)"
                              : "Currently Offline"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>

          <div className="space-y-4">
            <GlassCard className="glass-panel glass-highlight p-6">
              <div className="mb-5 flex items-center justify-between">
                <SectionHeading
                  eyebrow="Escrow Security"
                  title="Protected instant-session flow"
                />
                <StatusBadge label="Refund Safe" tone="success" />
              </div>

              <div className="space-y-3 text-sm leading-7 text-[var(--text-muted)]">
                <p className="liquid-glass-soft rounded-[22px] border border-white/5 px-4 py-4">
                  When you request a session, <span className="font-semibold text-white">0.05 ETH</span>{" "}
                  is locked in a decentralized escrow.
                </p>
                <p className="liquid-glass-soft rounded-[22px] border border-white/5 px-4 py-4">
                  If the therapist declines or <span className="font-semibold text-white">5 minutes</span>{" "}
                  pass, your funds are instantly refunded.
                </p>
                <div className="liquid-glass-soft rounded-[22px] border border-white/5 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-faint)]">
                    Active Network
                  </p>
                  <p className="mt-2 flex items-center gap-2 text-white">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    Sepolia Testnet
                  </p>
                </div>
              </div>
            </GlassCard>
          </div>
        </section>
      </div>
    </main>
  );
}
