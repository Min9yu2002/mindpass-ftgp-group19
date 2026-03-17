"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import EscrowModal from "../../components/EscrowModal";
import GlassCard from "../../components/GlassCard";
import QuickActionCard from "../../components/QuickActionCard";
import SectionHeading from "../../components/SectionHeading";
import StatusBadge from "../../components/StatusBadge";
import SummaryCard from "../../components/SummaryCard";
import { mockActivity } from "../../lib/mock-activity";
import { mockTherapists, type Therapist } from "../../lib/mock-therapists";

type SummaryTone = "neutral" | "success" | "warning";

type DashboardSummaryCard = {
  label: string;
  value: string;
  detail: string;
  badge: string;
  tone: SummaryTone;
};

export default function DashboardPage() {
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [isLoadingTherapists, setIsLoadingTherapists] = useState(true);
  const [therapistsError, setTherapistsError] = useState("");
  const [selectedTherapist, setSelectedTherapist] = useState<Therapist | null>(
    null,
  );
  const [patientProfile, setPatientProfile] = useState<{
    username: string;
    walletAddress: string;
  } | null>(null);

  useEffect(() => {
    const storedProfile = window.localStorage.getItem("mindpass-patient-profile");
    if (storedProfile) {
      try {
        setPatientProfile(JSON.parse(storedProfile));
      } catch {
        window.localStorage.removeItem("mindpass-patient-profile");
      }
    }
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const fetchTherapists = async () => {
      setIsLoadingTherapists(true);
      setTherapistsError("");

      try {
        const response = await fetch("/api/therapists");
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error ?? "Unable to load therapists.");
        }

        if (!isCancelled) {
          setTherapists(result.data ?? []);
        }
      } catch (error) {
        if (!isCancelled) {
          setTherapistsError(
            error instanceof Error
              ? error.message
              : "Unable to load therapists.",
          );
          setTherapists(mockTherapists);
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingTherapists(false);
        }
      }
    };

    fetchTherapists();

    return () => {
      isCancelled = true;
    };
  }, []);

  const therapistCount = therapists.length || mockTherapists.length;

  // 將卡片數據替換成病患視角的 Web3 狀態
  const summaryCards: DashboardSummaryCard[] = useMemo(() => [
    {
      label: "Subsidy Balance",
      value: "0.005 Sepolia ETH",
      detail: "Native ETH allocated securely from your Gov code flow.",
      badge: "Funded",
      tone: "success",
    },
    {
      label: "Active Escrows",
      value: "1 Session",
      detail: "Funds locked safely in smart contract for upcoming sessions.",
      badge: "Locked",
      tone: "warning", // 用 warning 顏色(通常是黃色/橘色)表示資金被鎖定中
    },
    {
      label: "Available Therapists",
      value: String(therapistCount),
      detail: "Professionals currently verified via on-chain SBT.",
      badge: "Verified",
      tone: "success",
    },
    {
      label: "Privacy Level",
      value: "Zero-Knowledge",
      detail: "P2P nodes active. No chat data is stored on our servers.",
      badge: "Secured",
      tone: "neutral",
    },
  ], [therapistCount]);

  return (
    <main className="app-shell-subtle page-canvas page-canvas-violet relative overflow-hidden bg-background pt-32 text-foreground md:pt-36">
      <div className="relative mx-auto w-full max-w-7xl px-6 py-8 lg:px-10">
        <header className="liquid-glass-strong glass-panel mb-10 flex flex-col gap-5 rounded-[30px] px-5 py-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className="text-sm uppercase tracking-[0.26em] text-[var(--accent-primary-strong)]">
              Patient Vault
            </span>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">
              Anonymous Dashboard
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--text-muted)]">
              Manage your Sepolia ETH balance, browse verified therapists, and enter your secure P2P sessions without exposing your identity.
            </p>
            {patientProfile ? (
              <p className="mt-3 text-sm text-[var(--text-faint)]">
                Signed in as {patientProfile.username}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/"
              className="button-secondary rounded-full px-5 py-3 text-sm font-medium"
            >
              Sign Out
            </Link>
            <button
              className="button-primary rounded-full px-5 py-3 text-sm font-medium"
            >
              0x71C...9E3A (Connected)
            </button>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => (
            <SummaryCard
              key={card.label}
              label={card.label}
              value={card.value}
              detail={card.detail}
              badge={card.badge}
              tone={card.tone}
            />
          ))}
        </section>

        <section className="mt-8 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-4">
            
            {/* 諮商師列表 */}
            <GlassCard className="glass-panel p-6">
              <div className="mb-6 flex items-center justify-between gap-4">
                <SectionHeading
                  eyebrow="Therapist Directory"
                  title="Available Verified Therapists"
                />
                <StatusBadge label="SBT Checked" tone="success" />
              </div>

              <div className="space-y-3">
                {isLoadingTherapists ? (
                  <div className="liquid-glass-soft rounded-[24px] px-4 py-6">
                    <p className="text-sm text-[var(--text-muted)]">
                      Loading verified therapists...
                    </p>
                  </div>
                ) : null}

                {therapistsError ? (
                  <div className="liquid-glass-soft rounded-[24px] border border-red-400/20 bg-red-500/8 px-4 py-4">
                    <p className="text-sm text-red-600 dark:text-red-300">
                      {therapistsError}
                    </p>
                  </div>
                ) : null}

                {(therapists.length ? therapists : mockTherapists).map((therapist) => (
                  <div
                    key={therapist.id}
                    className="liquid-glass-soft rounded-[24px] px-4 py-4 border border-white/5"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium text-white">
                          {therapist.name}
                        </p>
                        <p className="mt-1 text-sm text-[var(--text-muted)]">
                          {therapist.specialty}
                        </p>
                      </div>
                      <div className="glass-highlight rounded-full px-3 py-1 text-xs text-[var(--accent-primary-strong)]">
                        {therapist.mode}
                      </div>
                    </div>
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
                    <div className="mt-5 flex items-center justify-between border-t border-white/5 pt-4">
                      <span className="text-sm text-[var(--text-muted)]">{therapist.availability}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedTherapist(therapist)}
                        className="button-primary rounded-full px-4 py-2 text-sm font-medium"
                      >
                        Book & Lock 0.005 ETH
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>

            {/* 歷史活動紀錄 */}
            <GlassCard className="glass-panel p-6">
              <div className="mb-6 flex items-center justify-between gap-4">
                <SectionHeading
                  eyebrow="On-Chain Activity"
                  title="Your Recent Transactions"
                />
                <StatusBadge label="Private Ledger" tone="neutral" />
              </div>

              <div className="space-y-3">
                {mockActivity.map((item) => (
                  <div
                    key={item.id}
                    className="liquid-glass-soft rounded-[24px] px-4 py-4 border border-white/5"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium text-white">{item.title}</p>
                        <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
                          {item.detail}
                        </p>
                      </div>
                      <StatusBadge
                        label={item.status}
                        tone={item.status === "Completed" ? "success" : "neutral"}
                      />
                    </div>
                    <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[var(--text-faint)]">
                      {item.time}
                    </p>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>

          <div className="space-y-4">
            
            {/* 快速操作區 */}
            <GlassCard className="glass-panel p-6">
              <SectionHeading eyebrow="Quick Actions" title="Manage Session" />
              <div className="mt-5 space-y-4">
                <QuickActionCard
                  href="/chat?role=patient"
                  title="Enter P2P Chat Room"
                  description="Join your scheduled session. End-to-end encryption will be established."
                  tag="Active"
                />
                <QuickActionCard
                  href="#"
                  title="Claim More Subsidy"
                  description="Submit a new government code to request additional Sepolia ETH."
                  tag="Fund"
                />
                <QuickActionCard
                  href="#"
                  title="Download Decrypted Records"
                  description="Export your chat history locally using your wallet signature."
                  tag="Data"
                />
              </div>
            </GlassCard>

            {/* 把原本的 Supabase 換成 Web3 節點與合約狀態 */}
            <GlassCard className="glass-panel glass-highlight p-6">
              <div className="mb-5 flex items-center justify-between">
                <SectionHeading eyebrow="Infrastructure" title="Node Connection" />
                <StatusBadge label="Secured" tone="success" />
              </div>

              <div className="space-y-3">
                <div className="liquid-glass-soft rounded-[22px] px-4 py-3 border border-white/5">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-faint)]">
                    Blockchain Network
                  </p>
                  <p className="mt-2 text-lg text-white flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
                    Base Sepolia Testnet
                  </p>
                </div>
                <div className="liquid-glass-soft rounded-[22px] px-4 py-3 border border-white/5">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-faint)]">
                    Escrow Smart Contract
                  </p>
                  <p className="mt-2 text-lg text-white font-mono text-sm text-[var(--accent-primary-strong)]">
                    0x8a9C...3b1F
                  </p>
                </div>
                <div className="liquid-glass-soft rounded-[22px] px-4 py-3 border border-white/5">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-faint)]">
                    XMTP Comm Protocol
                  </p>
                  <p className="mt-2 text-lg text-white">Connected</p>
                </div>
              </div>
            </GlassCard>
          </div>
        </section>
      </div>
      {selectedTherapist ? (
        <EscrowModal
          therapist={selectedTherapist}
          onClose={() => setSelectedTherapist(null)}
          onSuccess={async () => {
            if (patientProfile?.walletAddress && selectedTherapist.walletAddress) {
              await fetch("/api/sessions", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  patient_wallet: patientProfile.walletAddress,
                  therapist_wallet: selectedTherapist.walletAddress,
                  amount_eth: 0.005,
                  status: "initiated",
                }),
              });
            }

            window.alert("Escrow Locked! Routing to Chat...");
            setSelectedTherapist(null);
          }}
        />
      ) : null}
    </main>
  );
}
