import Link from "next/link";
import FeatureCard from "../components/FeatureCard";
import GlassCard from "../components/GlassCard";
import SectionHeading from "../components/SectionHeading";
import { createServerSupabaseClient } from "../lib/supabase-server";
import {
  getTherapistDisplayName,
  getTherapistDisplaySpecialty,
} from "../lib/therapist-display";

const features = [
  {
    eyebrow: "Privacy",
    title: "Privacy-preserving support",
    description:
      "Guide intake and access checks through a calmer workflow that keeps sensitive coordination structured without over-claiming what the MVP already automates.",
  },
  {
    eyebrow: "Matching",
    title: "Therapist matching",
    description:
      "Preview therapist fit by specialty, language, and session mode so patients can move from uncertainty to a clearer next step.",
  },
  {
    eyebrow: "Records",
    title: "Verifiable access records",
    description:
      "Prepare a path toward auditable approval and verification flows that can later connect to encrypted storage and on-chain proofs.",
  },
];

const steps = [
  {
    title: "Verify access",
    description:
      "Start with a support code or referral flow before exposing more sensitive information.",
  },
  {
    title: "Find a therapist",
    description:
      "Browse qualified profiles and availability windows designed for early-stage intake.",
  },
  {
    title: "Begin a protected support session",
    description:
      "Move into a calmer care workflow with structured handoff points for booking and verification.",
  },
];

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

function deriveModeLabel(supportedModes: ("Voice" | "Text")[]) {
  if (supportedModes.includes("Voice") && supportedModes.includes("Text")) {
    return "Hybrid";
  }

  if (supportedModes.includes("Voice")) {
    return "Voice";
  }

  if (supportedModes.includes("Text")) {
    return "Text";
  }

  return "Not Available";
}

function summarizeBio(value: unknown) {
  const bio = typeof value === "string" ? value.trim() : "";

  if (!bio) {
    return "A verified therapist profile is being prepared for this care directory.";
  }

  return bio.length > 120 ? `${bio.slice(0, 117).trimEnd()}...` : bio;
}

export default async function Home() {
  let verifiedTherapistCount = 0;
  let onlineTherapistCount = 0;
  let therapistPreviewCards: Array<{
    id: string;
    name: string;
    specialty: string;
    bio: string;
    languages: string[];
    mode: string;
    availability: string;
    isOnline: boolean;
  }> = [];
  let recommendedTherapist = {
    name: "Anonymous Provider",
    specialty: "General Specialist",
    bio: "Verified therapist profiles will appear here once the directory is populated.",
    languages: [] as string[],
    mode: "Text",
    availability: "Availability syncing",
  };
  let didTherapistPreviewFail = false;

  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("therapists")
      .select(
        "id, wallet_address, full_name, legal_name, specialty, clinical_specialty, bio, languages, ekyc_status, sbt_minted, is_online, rating, supported_modes",
      )
      .order("is_online", { ascending: false })
      .order("rating", { ascending: false });

    if (!error) {
      const therapists = (data ?? []).filter((therapist) => {
        const ekycStatus = String(therapist.ekyc_status ?? "").toLowerCase();
        const sbtMinted =
          therapist.sbt_minted === true ||
          String(therapist.sbt_minted ?? "").toLowerCase() === "true";

        return ekycStatus === "verified" && sbtMinted;
      });

      verifiedTherapistCount = therapists.length;
      onlineTherapistCount = therapists.filter((therapist) =>
        Boolean(therapist.is_online),
      ).length;
      therapistPreviewCards = therapists.map((therapist, index) => {
        const supportedModes = normalizeSupportedModes(therapist.supported_modes);
        const languages = normalizeLanguages(therapist.languages);
        const isOnline = Boolean(therapist.is_online);
        const displayName = getTherapistDisplayName(therapist);
        const displaySpecialty = getTherapistDisplaySpecialty(therapist);

        return {
          id: String(
            therapist.id ?? therapist.wallet_address ?? `therapist-${index}`,
          ),
          name: displayName,
          specialty: displaySpecialty,
          bio: summarizeBio(therapist.bio),
          languages: languages.length > 0 ? languages.slice(0, 3) : [],
          mode: deriveModeLabel(supportedModes),
          availability: isOnline ? "Available now" : "Currently offline",
          isOnline,
        };
      });

      const topTherapist = therapists[0];
      if (topTherapist) {
        const supportedModes = normalizeSupportedModes(topTherapist.supported_modes);
        const isOnline = Boolean(topTherapist.is_online);
        const displayName = getTherapistDisplayName(topTherapist);
        const displaySpecialty = getTherapistDisplaySpecialty(topTherapist);
        recommendedTherapist = {
          name: displayName,
          specialty: displaySpecialty,
          bio: summarizeBio(topTherapist.bio),
          languages: normalizeLanguages(topTherapist.languages).slice(0, 3),
          mode: deriveModeLabel(supportedModes),
          availability: isOnline ? "Available now" : "Currently offline",
        };
      }
    } else {
      didTherapistPreviewFail = true;
    }
  } catch {
    verifiedTherapistCount = 0;
    onlineTherapistCount = 0;
    didTherapistPreviewFail = true;
  }

  return (
    <main className="app-shell page-canvas page-canvas-violet relative overflow-hidden pt-32 md:pt-36">
      <div className="mx-auto w-full max-w-7xl px-6 py-8 lg:px-10">
        <section className="grid gap-10 pb-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <p className="text-sm uppercase tracking-[0.28em] text-[var(--text-faint)]">
              Calm, privacy-aware intake
            </p>
            <h1 className="mt-6 max-w-3xl text-5xl font-semibold tracking-tight text-white sm:text-6xl">
              Start mental health support in a calmer, more privacy-aware way.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--text-muted)]">
              MindPass is an MVP-stage platform for navigating therapist access,
              intake verification, and protected care coordination through a
              simpler product experience.
            </p>

            <GlassCard className="glass-panel mt-8 max-w-2xl p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="liquid-glass-soft glass-input flex-1">
                  <label
                    htmlFor="support-code"
                    className="mb-2 block text-xs uppercase tracking-[0.18em] text-[var(--text-faint)]"
                  >
                    GOV SUBSIDY ENTRY
                  </label>
                  <input
                    id="support-code"
                    type="text"
                    placeholder="Enter Gov Support Code (e.g., NHS-2026)"
                    className="w-full bg-transparent text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                  />
                </div>
                <button
                  type="button"
                  className="button-primary rounded-[22px] px-5 py-4 text-sm font-medium"
                >
                  Verify & Claim
                </button>
              </div>
              <div className="mt-4 flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href="/therapists"
                    className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white/5 px-6 py-3 text-sm font-medium text-[var(--text-primary)] transition hover:bg-white/10"
                  >
                    Browse Therapists
                  </Link>
                  <Link
                    href="/auth"
                    className="button-primary inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-medium"
                  >
                    Get Started
                  </Link>
                </div>
                <p className="text-sm text-[var(--text-muted)]">
                  Need a code?{" "}
                  <a
                    href="#"
                    className="transition hover:text-[var(--text-primary)]"
                  >
                    Claim from Gov Portal ↗
                  </a>
                </p>
              </div>
            </GlassCard>

            <div id="therapists" className="section-anchor mt-10 grid gap-4 sm:grid-cols-3">
              <div className="liquid-glass-soft rounded-[24px] px-4 py-4">
                <p className="text-sm text-[var(--text-muted)]">Therapists</p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {verifiedTherapistCount}
                </p>
              </div>
              <div className="liquid-glass-soft rounded-[24px] px-4 py-4">
                <p className="text-sm text-[var(--text-muted)]">Session flow</p>
                <p className="mt-2 text-2xl font-semibold text-white">Protected</p>
              </div>
              <div className="liquid-glass-soft rounded-[24px] px-4 py-4">
                <p className="text-sm text-[var(--text-muted)]">Platform status</p>
                <p className="mt-2 text-2xl font-semibold text-white">MVP Stage</p>
              </div>
            </div>
          </div>

          <GlassCard className="glass-panel p-5 sm:p-6">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--text-faint)]">
                  Care Portal Preview
                </p>
                <h2 className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
                  A clearer care entry surface
                </h2>
              </div>
              <div className="glass-chip px-3 py-1 text-xs text-[var(--preview-badge-text)]">
                Preview
              </div>
            </div>

            <div className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
                <div className="liquid-glass-soft rounded-[24px] p-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm text-[var(--text-muted)]">Recommended fit</p>
                    </div>
                    <Link
                      href="/therapists"
                      className="glass-chip-muted px-3 py-1 text-xs text-[var(--chip-text-muted)] transition hover:text-[var(--text-primary)]"
                    >
                      View all
                    </Link>
                  </div>

                  {therapistPreviewCards.length > 0 ? (
                    <div className="preview-scrollbar -mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-5 pr-6">
                      {therapistPreviewCards.map((therapist) => (
                        <article
                          key={therapist.id}
                          className="liquid-glass-soft flex min-h-[232px] min-w-[252px] snap-start flex-col rounded-[22px] p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-base font-semibold text-[var(--text-primary)]">
                                {therapist.name}
                              </p>
                              <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                                {therapist.specialty}
                              </p>
                            </div>
                            <span
                              className={`glass-chip shrink-0 px-3 py-1 text-xs ${
                                therapist.isOnline
                                  ? "text-[var(--status-online-text)]"
                                  : "text-[var(--status-offline-text)]"
                              }`}
                            >
                              {therapist.isOnline ? "Online" : "Offline"}
                            </span>
                          </div>

                          <p className="mt-4 min-h-[66px] text-sm leading-6 text-[var(--text-secondary)]">
                            {therapist.bio}
                          </p>

                          <div className="mt-4 flex min-h-[32px] flex-wrap gap-2">
                            {therapist.languages.length > 0 ? (
                              therapist.languages.map((language) => (
                                <span
                                  key={`${therapist.id}-${language}`}
                                  className="glass-chip-muted px-3 py-1 text-xs text-[var(--chip-text-muted)]"
                                >
                                  {language}
                                </span>
                              ))
                            ) : (
                              <span className="glass-chip-muted px-3 py-1 text-xs text-[var(--chip-text-muted)]">
                                Language syncing
                              </span>
                            )}
                          </div>

                          <div className="mt-auto flex items-center justify-between gap-3 pt-4 text-sm">
                            <span className="glass-chip-muted px-3 py-1 text-xs text-[var(--chip-text)]">
                              {therapist.mode}
                            </span>
                            <span className="text-right text-[var(--text-muted)]">
                              {therapist.availability}
                            </span>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="liquid-glass-soft rounded-[22px] px-4 py-6">
                      <p className="text-sm font-medium text-[var(--text-primary)]">
                        {didTherapistPreviewFail
                          ? "Unable to load therapist preview."
                          : "No verified therapists are available yet."}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                        {didTherapistPreviewFail
                          ? "Please refresh in a moment while the directory reconnects to Supabase."
                          : "Verified therapist cards will appear here once providers complete onboarding."}
                      </p>
                    </div>
                  )}
                </div>

                <div className="liquid-glass-soft rounded-[24px] p-4">
                  <p className="text-sm text-[var(--text-muted)]">Current flow</p>
                  <div className="mt-4 space-y-3">
                    {[
                      `${verifiedTherapistCount} verified therapists indexed`,
                      `${onlineTherapistCount} therapists currently online`,
                      `${recommendedTherapist.mode} sessions ready for booking`,
                    ].map((item) => (
                      <div
                        key={item}
                        className="liquid-glass-soft rounded-2xl px-3 py-3"
                      >
                        <div className="flex items-center gap-3">
                          <span className="h-2.5 w-2.5 rounded-full bg-violet-300 shadow-[0_0_18px_rgba(180,170,255,0.8)]" />
                          <span className="text-sm text-[var(--text-secondary)]">{item}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="liquid-glass-soft rounded-[26px] p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-[var(--text-muted)]">Session preview</p>
                    <p className="mt-2 text-lg font-semibold text-[var(--text-primary)]">
                      Protected support session
                    </p>
                  </div>
                  <div className="glass-highlight rounded-full px-3 py-1 text-xs text-[var(--preview-badge-text)]">
                    Intake-ready
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="liquid-glass-soft rounded-2xl px-3 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">
                      Mode
                    </p>
                    <p className="mt-2 text-sm text-[var(--text-primary)]">{recommendedTherapist.mode} session</p>
                  </div>
                  <div className="liquid-glass-soft rounded-2xl px-3 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">
                      Access
                    </p>
                    <p className="mt-2 text-sm text-[var(--text-primary)]">Wallet verified</p>
                  </div>
                  <div className="liquid-glass-soft rounded-2xl px-3 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">
                      Next step
                    </p>
                    <p className="mt-2 text-sm text-[var(--text-primary)]">{recommendedTherapist.availability}</p>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-6 text-[var(--text-muted)]">
                  {recommendedTherapist.bio}
                </p>
              </div>
            </div>
          </GlassCard>
        </section>

        <section id="features" className="section-anchor pb-18">
          <SectionHeading
            eyebrow="Features"
            title="Designed for careful, privacy-first support flows"
          />
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {features.map((feature) => (
              <FeatureCard
                key={feature.title}
                eyebrow={feature.eyebrow}
                title={feature.title}
                description={feature.description}
              />
            ))}
          </div>
        </section>

        <section
          id="how-it-works"
          className="section-anchor grid gap-6 pb-10 lg:grid-cols-[0.95fr_1.05fr]"
        >
          <SectionHeading
            eyebrow="How it works"
            title="A straightforward path from entry to support."
            description="This MVP focuses on making the early care journey more readable and less fragmented, while leaving room for stronger verification and storage layers later."
          />

          <div className="space-y-4">
            {steps.map((step, index) => (
              <GlassCard key={step.title} className="glass-panel p-5">
                <div className="flex items-start gap-4">
                  <div className="glass-highlight flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-semibold text-violet-100">
                    0{index + 1}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      {step.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                      {step.description}
                    </p>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
