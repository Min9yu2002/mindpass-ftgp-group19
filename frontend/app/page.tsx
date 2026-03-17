import Link from "next/link";
import FeatureCard from "../components/FeatureCard";
import GlassCard from "../components/GlassCard";
import SectionHeading from "../components/SectionHeading";
import { mockTherapists } from "../lib/mock-therapists";

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

export default function Home() {
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
                    Secure entry
                  </label>
                  <input
                    id="support-code"
                    type="text"
                    placeholder="Enter support code"
                    className="w-full bg-transparent text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                  />
                </div>
                <button
                  type="button"
                  className="button-primary rounded-[22px] px-5 py-4 text-sm font-medium"
                >
                  Verify Access
                </button>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <Link
                  href="/dashboard"
                  className="text-sm font-medium text-violet-200 transition hover:text-violet-100"
                >
                  Browse Therapists
                </Link>
                <Link
                  href="/auth"
                  className="text-sm text-[var(--text-muted)] transition hover:text-white"
                >
                  Create an account
                </Link>
              </div>
            </GlassCard>

            <div id="therapists" className="section-anchor mt-10 grid gap-4 sm:grid-cols-3">
              <div className="liquid-glass-soft rounded-[24px] px-4 py-4">
                <p className="text-sm text-[var(--text-muted)]">Therapists in demo</p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {mockTherapists.length}
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
                <h2 className="mt-3 text-2xl font-semibold text-white">
                  A clearer care entry surface
                </h2>
              </div>
              <div className="glass-chip px-3 py-1 text-xs text-violet-100/85">
                Preview
              </div>
            </div>

            <div className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-[1fr_0.9fr]">
                <div className="liquid-glass-soft rounded-[24px] p-4">
                  <p className="text-sm text-[var(--text-muted)]">Recommended fit</p>
                  <p className="mt-3 text-xl font-semibold text-white">
                    {mockTherapists[0]?.name}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                    {mockTherapists[0]?.specialty}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {mockTherapists[0]?.languages.map((language) => (
                      <span
                        key={language}
                        className="glass-chip-muted px-3 py-1 text-xs text-white/68"
                      >
                        {language}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="liquid-glass-soft rounded-[24px] p-4">
                  <p className="text-sm text-[var(--text-muted)]">Current flow</p>
                  <div className="mt-4 space-y-3">
                    {[
                      "Access code reviewed",
                      "Therapist shortlist prepared",
                      "Protected booking handoff ready",
                    ].map((item) => (
                      <div
                        key={item}
                        className="liquid-glass-soft rounded-2xl px-3 py-3"
                      >
                        <div className="flex items-center gap-3">
                          <span className="h-2.5 w-2.5 rounded-full bg-violet-300 shadow-[0_0_18px_rgba(180,170,255,0.8)]" />
                          <span className="text-sm text-white/74">{item}</span>
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
                    <p className="mt-2 text-lg font-semibold text-white">
                      Protected support session
                    </p>
                  </div>
                  <div className="glass-highlight rounded-full px-3 py-1 text-xs text-violet-100">
                    Intake-ready
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="liquid-glass-soft rounded-2xl px-3 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">
                      Mode
                    </p>
                    <p className="mt-2 text-sm text-white">Video session</p>
                  </div>
                  <div className="liquid-glass-soft rounded-2xl px-3 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">
                      Access
                    </p>
                    <p className="mt-2 text-sm text-white">Code verified</p>
                  </div>
                  <div className="liquid-glass-soft rounded-2xl px-3 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">
                      Next step
                    </p>
                    <p className="mt-2 text-sm text-white">Confirm booking</p>
                  </div>
                </div>
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
