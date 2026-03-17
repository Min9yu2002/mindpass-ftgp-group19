"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatEther } from "viem";
import { useAccount, useBalance, useDisconnect } from "wagmi";
import EscrowModal from "../../components/EscrowModal";
import GlassCard from "../../components/GlassCard";
import QuickActionCard from "../../components/QuickActionCard";
import SectionHeading from "../../components/SectionHeading";
import StatusBadge from "../../components/StatusBadge";
import SummaryCard from "../../components/SummaryCard";
import { readSessionContext } from "../../lib/session";
import {
  getTherapistDisplayName,
  getTherapistDisplaySpecialty,
} from "../../lib/therapist-display";
import { supabase } from "@/lib/supabase";
import type { Therapist } from "../../lib/mock-therapists";

type SummaryTone = "neutral" | "success" | "warning" | "brand";

type DashboardSummaryCard = {
  label: string;
  value: string;
  detail: string;
  badge: string;
  tone: SummaryTone;
};

type PatientProfile = {
  walletAddress: string;
  totalDeposits: number;
  subsidyBalance: number;
};

type ActivityItem = {
  id: string;
  title: string;
  description: string;
  status: string;
  timeLabel: string;
};

function deriveModeLabel(supportedModes: ("Voice" | "Text")[]) {
  if (supportedModes.includes("Voice") && supportedModes.includes("Text")) {
    return "Hybrid" as const;
  }

  if (supportedModes.includes("Voice")) {
    return "Voice" as const;
  }

  if (supportedModes.includes("Text")) {
    return "Text" as const;
  }

  return "Not Available" as const;
}

function formatEth(value: number) {
  return `${value.toFixed(3)} ETH`;
}

function formatRelativeTime(value?: string | null) {
  if (!value) {
    return "Recently";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const diffMs = date.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);
  const diffHours = Math.round(diffMs / 3600000);
  const diffDays = Math.round(diffMs / 86400000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (Math.abs(diffMinutes) < 60) {
    return rtf.format(diffMinutes, "minute");
  }

  if (Math.abs(diffHours) < 24) {
    return rtf.format(diffHours, "hour");
  }

  return rtf.format(diffDays, "day");
}

function mapActivityStatus(value: unknown) {
  const status = String(value ?? "Logged").trim();
  return status || "Logged";
}

function mapActivityTitle(row: Record<string, unknown>) {
  return (
    String(
      row.title ??
        row.action_title ??
        row.activity_type ??
        row.type ??
        "Wallet activity",
    ) || "Wallet activity"
  );
}

function mapActivityDescription(row: Record<string, unknown>) {
  return String(
    row.description ??
      row.detail ??
      row.notes ??
      row.metadata_summary ??
      "Session-related activity synced from Supabase.",
  );
}

function formatShortAddress(address?: string | null) {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "";
}

function normalizeLanguages(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeSupportedModes(value: unknown): ("Voice" | "Text")[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  return values
    .map((item) => String(item).trim().toLowerCase())
    .filter(Boolean)
    .map((item) => (item === "voice" || item === "video" ? "Voice" : "Text"))
    .filter((item, index, array) => array.indexOf(item) === index) as (
    | "Voice"
    | "Text"
  )[];
}

export default function DashboardPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { data: balanceData } = useBalance({
    address,
    query: {
      enabled: Boolean(address && isConnected),
    },
  });
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState("");
  const [selectedTherapist, setSelectedTherapist] = useState<Therapist | null>(
    null,
  );
  const [patientProfile, setPatientProfile] = useState<PatientProfile | null>(
    null,
  );
  const [activeEscrowCount, setActiveEscrowCount] = useState(0);
  const [availableTherapistCount, setAvailableTherapistCount] = useState(0);
  const [lastActiveTherapistAddress, setLastActiveTherapistAddress] = useState("");
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const [isProviderBlocked, setIsProviderBlocked] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedTherapistProfile = window.localStorage.getItem("mindpass-therapist-profile");
    const activeSession = window.localStorage.getItem("mindpass-active-session");

    if (activeSession === "therapist" && storedTherapistProfile) {
      setIsProviderBlocked(true);
      setSessionHydrated(true);
      return;
    }

    setIsProviderBlocked(false);
    const sessionContext = readSessionContext(isConnected ? address : null);
    if (sessionContext.userRole !== "patient") {
      router.replace("/auth");
      return;
    }

    setSessionHydrated(true);
  }, [address, isConnected, router]);

  useEffect(() => {
    let isCancelled = false;

    const hydrateDashboard = async () => {
      if (!sessionHydrated || isProviderBlocked) {
        return;
      }

      const storedProfile = window.localStorage.getItem("mindpass-patient-profile");
      if (!storedProfile) {
        if (!isCancelled) {
          setDashboardError("No patient profile found. Please verify access again.");
          setIsLoading(false);
        }
        return;
      }

      let parsedProfile: {
        walletAddress?: string;
        totalDeposits?: number;
        subsidyBalance?: number;
      };
      try {
        parsedProfile = JSON.parse(storedProfile);
      } catch {
        window.localStorage.removeItem("mindpass-patient-profile");
        if (!isCancelled) {
          setDashboardError("Stored patient profile is invalid. Please sign in again.");
          setIsLoading(false);
        }
        return;
      }

      const walletAddress = String(parsedProfile.walletAddress ?? "").trim();
      if (!walletAddress) {
        if (!isCancelled) {
          setDashboardError("Wallet address is missing from the patient profile.");
          setIsLoading(false);
        }
        return;
      }

      setPatientProfile({
        walletAddress,
        totalDeposits: Number(parsedProfile.totalDeposits ?? 0),
        subsidyBalance: Number(parsedProfile.subsidyBalance ?? 0),
      });

      if (!supabase) {
        if (!isCancelled) {
          setDashboardError("Supabase client is unavailable.");
          setIsLoading(false);
        }
        return;
      }

      try {
        const patientQuery = supabase
          .from("patients")
          .select("wallet_address, total_deposits, subsidy_balance")
          .ilike("wallet_address", walletAddress)
          .maybeSingle();

        const activeSessionsQuery = supabase
          .from("sessions")
          .select("id", { count: "exact", head: true })
          .eq("patient_wallet", walletAddress)
          .in("status", ["active", "initiated"]);

        const latestActiveSessionQuery = supabase
          .from("sessions")
          .select("therapist_wallet")
          .eq("patient_wallet", walletAddress)
          .eq("status", "active")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const activitiesQuery = supabase
          .from("activities")
          .select("*")
          .ilike("wallet_address", walletAddress)
          .order("created_at", { ascending: false })
          .limit(5);

        const therapistsQuery = supabase
          .from("therapists")
          .select(
            "id, wallet_address, full_name, legal_name, specialty, clinical_specialty, bio, languages, is_online, supported_modes, ekyc_status, sbt_minted",
          )
          .eq("ekyc_status", "verified")
          .eq("sbt_minted", true)
          .eq("is_online", true)
          .order("full_name", { ascending: true });

        const [
          patientResult,
          activeSessionsResult,
          latestActiveSessionResult,
          activitiesResult,
          therapistsResult,
        ] = await Promise.all([
          patientQuery,
          activeSessionsQuery,
          latestActiveSessionQuery,
          activitiesQuery,
          therapistsQuery,
        ]);

        if (isCancelled) {
          return;
        }

        if (patientResult.error) {
          throw patientResult.error;
        }

        if (activeSessionsResult.error) {
          throw activeSessionsResult.error;
        }

        if (latestActiveSessionResult.error) {
          throw latestActiveSessionResult.error;
        }

        const patientRow = patientResult.data;
        if (!patientRow) {
          console.warn(
            "Ghost profile detected. DB record missing. Clearing local storage.",
          );
          window.localStorage.removeItem("mindpass-patient-profile");
          window.localStorage.removeItem("mindpass-xmtp-connected");
          if (window.localStorage.getItem("mindpass-active-session") === "patient") {
            window.localStorage.removeItem("mindpass-active-session");
          }
          window.dispatchEvent(new Event("mindpass-session-changed"));
          router.replace("/auth");
          return;
        }

        setPatientProfile({
          walletAddress,
          totalDeposits: Number(patientRow?.total_deposits ?? 0),
          subsidyBalance: Number(patientRow?.subsidy_balance ?? 0),
        });
        window.localStorage.setItem(
          "mindpass-patient-profile",
          JSON.stringify({
            walletAddress,
            totalDeposits: Number(patientRow?.total_deposits ?? 0),
            subsidyBalance: Number(patientRow?.subsidy_balance ?? 0),
          }),
        );

        let normalizedTherapists: Therapist[] = [];
        if (therapistsResult.error) {
          console.error("Therapist query failed on dashboard:", therapistsResult.error);
          setDashboardError("Unable to fetch therapists.");
        } else {
          normalizedTherapists = (therapistsResult.data ?? []).map((therapist) => {
            const supportedModes = normalizeSupportedModes(therapist.supported_modes);
            const displayName = getTherapistDisplayName(therapist);
            const displaySpecialty = getTherapistDisplaySpecialty(therapist);

            return {
              id: String(therapist.id ?? therapist.wallet_address ?? crypto.randomUUID()),
              name: displayName,
              specialty: displaySpecialty,
              languages: normalizeLanguages(therapist.languages),
              bio:
                String(
                  therapist.bio ??
                    "A verified therapist profile is being prepared for this care directory.",
                ) ||
                "A verified therapist profile is being prepared for this care directory.",
              isOnline: Boolean(therapist.is_online),
              availability: "Available now",
              rating: 0,
              mode: deriveModeLabel(supportedModes),
              walletAddress: String(therapist.wallet_address ?? ""),
              supportedModes,
            };
          });
          setDashboardError("");
        }

        setTherapists(normalizedTherapists);
        setActiveEscrowCount(activeSessionsResult.count ?? 0);
        setLastActiveTherapistAddress(
          String(latestActiveSessionResult.data?.therapist_wallet ?? ""),
        );
        setAvailableTherapistCount(normalizedTherapists.length);
        setActivities(
          (activitiesResult.error ? [] : activitiesResult.data ?? []).map((row) => ({
            id: String(row.id ?? crypto.randomUUID()),
            title: mapActivityTitle(row as Record<string, unknown>),
            description: mapActivityDescription(row as Record<string, unknown>),
            status: mapActivityStatus((row as Record<string, unknown>).status),
            timeLabel: formatRelativeTime(
              String(
                row.created_at ??
                  row.updated_at ??
                  row.timestamp ??
                  "",
              ),
            ),
          })),
        );
      } catch (error) {
        if (!isCancelled) {
          setDashboardError(
            error instanceof Error
              ? error.message
              : "Unable to load dashboard data.",
          );
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    hydrateDashboard();

    return () => {
      isCancelled = true;
    };
  }, [isProviderBlocked, router, sessionHydrated]);

  const handleSignOut = () => {
    window.localStorage.removeItem("mindpass-patient-profile");
    window.localStorage.removeItem("mindpass-therapist-profile");
    window.localStorage.removeItem("mindpass-xmtp-connected");
    window.localStorage.removeItem("mindpass-active-session");
    window.dispatchEvent(new Event("mindpass-session-changed"));
    disconnect();
    router.replace("/");
  };

  const summaryCards: DashboardSummaryCard[] = useMemo(
    () => [
      {
        label: "Subsidy Balance",
        value: patientProfile ? formatEth(patientProfile.subsidyBalance) : "0.000 ETH",
        detail: "Government funded session voucher for your care.",
        badge: "Voucher",
        tone: "brand",
      },
      {
        label: "Wallet Balance",
        value: balanceData
          ? formatEth(Number(formatEther(balanceData.value)))
          : patientProfile
            ? formatEth(patientProfile.totalDeposits)
            : "0.000 ETH",
        detail: "Live on-chain balance from your connected wallet.",
        badge: "Live",
        tone: "success",
      },
      {
        label: "Available Therapists",
        value: String(availableTherapistCount),
        detail: "Therapists online and ready to accept secure requests.",
        badge: "Online",
        tone: "success",
      },
      {
        label: "Active Escrows",
        value: String(activeEscrowCount),
        detail: "Sessions currently initiated or active for your wallet.",
        badge: activeEscrowCount > 0 ? "Locked" : "Idle",
        tone: activeEscrowCount > 0 ? "warning" : "neutral",
      },
    ],
    [
      activeEscrowCount,
      availableTherapistCount,
      balanceData,
      patientProfile,
    ],
  );

  const quickChatHref = selectedTherapist?.walletAddress
    ? `/chat?role=patient&address=${encodeURIComponent(selectedTherapist.walletAddress)}`
    : lastActiveTherapistAddress
      ? `/chat?role=patient&address=${encodeURIComponent(lastActiveTherapistAddress)}`
      : "/chat?role=patient";
  const shortAddress = formatShortAddress(patientProfile?.walletAddress);

  if (!sessionHydrated) {
    return null;
  }

  if (isProviderBlocked) {
    return (
      <main className="app-shell page-canvas page-canvas-soft relative overflow-hidden bg-background pt-32 text-foreground md:pt-36">
        <div className="relative mx-auto w-full max-w-7xl px-6 py-10 lg:px-10">
          <GlassCard className="glass-panel p-6 sm:p-8">
            <div className="space-y-4">
              <div className="glass-chip-muted w-fit px-4 py-2 text-xs uppercase tracking-[0.24em] text-[var(--text-faint)]">
                Role Isolation
              </div>
              <div>
                <h1 className="text-3xl font-semibold text-[var(--text-primary)]">
                  Access Denied: You are currently logged in as a Provider.
                </h1>
                <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--text-muted)]">
                  You cannot access the Patient Vault. Please use the navigation
                  bar to return to the Provider Lobby, or Sign Out.
                </p>
              </div>
            </div>
          </GlassCard>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell-subtle page-canvas page-canvas-violet relative overflow-hidden bg-background pt-32 text-foreground md:pt-36">
      <div className="relative mx-auto w-full max-w-7xl px-6 py-8 lg:px-10">
        <header className="liquid-glass-strong glass-panel mb-10 flex flex-col gap-5 rounded-[30px] px-5 py-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className="text-sm uppercase tracking-[0.26em] text-[var(--accent-primary-strong)]">
              Patient Vault
            </span>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-[var(--text-primary)]">
              {shortAddress ? `${shortAddress}'s Vault` : "Anonymous Vault"}
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--text-muted)]">
              Manage your Sepolia ETH balance, browse verified therapists, and enter your secure P2P sessions without exposing your identity.
            </p>
            {shortAddress ? (
              <p className="mt-3 text-sm text-[var(--text-faint)]">
                Connected Wallet: {shortAddress}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleSignOut}
              className="button-secondary rounded-full px-5 py-3 text-sm font-medium"
            >
              Sign Out
            </button>
            <button className="button-primary rounded-full px-5 py-3 text-sm font-medium">
              {shortAddress || "Wallet Unavailable"}
            </button>
          </div>
        </header>

        {dashboardError ? (
          <div className="liquid-glass-soft mb-6 rounded-[24px] border border-red-400/20 bg-red-500/8 px-4 py-4">
            <p className="text-sm text-red-600 dark:text-red-300">
              {dashboardError}
            </p>
          </div>
        ) : null}

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
            <GlassCard className="glass-panel p-6">
              <div className="mb-6 flex items-center justify-between gap-4">
                <SectionHeading
                  eyebrow="Therapist Directory"
                  title="Available Verified Therapists"
                />
                <StatusBadge label="SBT Checked" tone="success" />
              </div>

              <div className="space-y-3">
                {isLoading ? (
                  <div className="liquid-glass-soft rounded-[24px] px-4 py-6">
                    <p className="text-sm text-[var(--text-muted)]">
                      Loading verified therapists...
                    </p>
                  </div>
                ) : null}

                {therapists.length === 0 && !isLoading ? (
                  <div className="liquid-glass-soft rounded-[24px] px-4 py-6">
                    <p className="text-sm text-[var(--text-muted)]">
                      No therapists are currently available.
                    </p>
                  </div>
                ) : null}

                {therapists.map((therapist) => (
                  <div
                    key={therapist.id}
                    className="liquid-glass-soft rounded-[24px] border border-white/5 px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium text-[var(--text-primary)]">
                          {therapist.name}
                        </p>
                        <p className="mt-1 text-sm text-[var(--text-muted)]">
                          {therapist.specialty}
                        </p>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        {therapist.mode !== "Not Available" ? (
                          <div className="glass-highlight rounded-full px-3 py-1 text-xs text-[var(--accent-primary-strong)]">
                            {therapist.mode}
                          </div>
                        ) : null}
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
                      <span className="text-sm text-[var(--text-muted)]">
                        {therapist.availability}
                      </span>
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

            <GlassCard className="glass-panel p-6">
              <div className="mb-6 flex items-center justify-between gap-4">
                <SectionHeading
                  eyebrow="On-Chain Activity"
                  title="Your Recent Transactions"
                />
                <StatusBadge label="Private Ledger" tone="neutral" />
              </div>

              <div className="space-y-3">
                {activities.length === 0 && !isLoading ? (
                  <div className="liquid-glass-soft rounded-[24px] border border-white/5 px-4 py-4">
                    <p className="text-sm text-[var(--text-muted)]">
                      No recent activity has been recorded for this wallet.
                    </p>
                  </div>
                ) : null}

                {activities.map((item) => (
                  <div
                    key={item.id}
                    className="liquid-glass-soft rounded-[24px] border border-white/5 px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium text-[var(--text-primary)]">
                          {item.title}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
                          {item.description}
                        </p>
                      </div>
                      <StatusBadge
                        label={item.status}
                        tone={item.status === "Completed" ? "success" : "neutral"}
                      />
                    </div>
                    <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[var(--text-faint)]">
                      {item.timeLabel}
                    </p>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>

          <div className="space-y-4">
            <GlassCard className="glass-panel p-6">
              <SectionHeading eyebrow="Quick Actions" title="Manage Session" />
              <div className="mt-5 space-y-4">
                <QuickActionCard
                  href={quickChatHref}
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

            const therapistAddress = selectedTherapist.walletAddress;
            setSelectedTherapist(null);
            if (therapistAddress) {
              router.push(
                `/chat?role=patient&address=${encodeURIComponent(therapistAddress)}`,
              );
              return;
            }

            window.alert("Escrow Locked! Routing to Chat...");
          }}
        />
      ) : null}
    </main>
  );
}
