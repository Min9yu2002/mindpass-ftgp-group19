import GlassCard from "../../components/GlassCard";
import SectionHeading from "../../components/SectionHeading";
import TherapistDirectoryCta from "../../components/TherapistDirectoryCta";
import { createServerSupabaseClient } from "../../lib/supabase-server";
import {
  getTherapistDisplayName,
  getTherapistDisplaySpecialty,
} from "../../lib/therapist-display";

type DirectoryTherapist = {
  id: string;
  name: string;
  specialty: string;
  bio: string;
  languages: string[];
  isOnline: boolean;
  mode: "Voice" | "Text" | "Hybrid" | "Not Available";
};

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

function getModeBadgeClass(mode: DirectoryTherapist["mode"]) {
  if (mode === "Text") {
    return "border border-sky-300/55 bg-sky-100/55 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-200";
  }

  if (mode === "Voice") {
    return "border border-emerald-300/55 bg-emerald-100/55 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200";
  }

  if (mode === "Hybrid") {
    return "border border-violet-300/55 bg-violet-100/55 text-violet-700 dark:border-violet-400/30 dark:bg-violet-400/10 dark:text-violet-200";
  }

  return "border border-slate-300/55 bg-slate-100/55 text-slate-700 dark:border-white/15 dark:bg-white/5 dark:text-white/70";
}

export default async function TherapistsPage() {
  let therapists: DirectoryTherapist[] = [];

  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("therapists")
      .select(
        "id, full_name, legal_name, specialty, clinical_specialty, bio, languages, is_online, supported_modes, ekyc_status, sbt_minted",
      )
      .order("is_online", { ascending: false })
      .order("rating", { ascending: false });

    if (!error) {
      therapists = (data ?? [])
        .filter((therapist) => {
          const ekycStatus = String(therapist.ekyc_status ?? "").toLowerCase();
          const sbtMinted =
            therapist.sbt_minted === true ||
            String(therapist.sbt_minted ?? "").toLowerCase() === "true";

          return ekycStatus === "verified" && sbtMinted;
        })
        .map((therapist) => {
          const supportedModes = normalizeSupportedModes(therapist.supported_modes);
          const displayName = getTherapistDisplayName(therapist);
          const displaySpecialty = getTherapistDisplaySpecialty(therapist);

          return {
            id: String(therapist.id),
            name: displayName,
            specialty: displaySpecialty,
            bio:
              String(
                therapist.bio ??
                  "A verified therapist profile is being prepared for this care directory.",
              ) ||
              "A verified therapist profile is being prepared for this care directory.",
            languages: normalizeLanguages(therapist.languages),
            isOnline: Boolean(therapist.is_online),
            mode: deriveModeLabel(supportedModes),
          };
        });
    }
  } catch {
    therapists = [];
  }

  return (
    <main className="app-shell page-canvas page-canvas-violet relative overflow-hidden pt-32 md:pt-36">
      <div className="mx-auto w-full max-w-7xl px-6 py-10 lg:px-10">
        <section className="pb-10">
          <SectionHeading
            eyebrow="Therapist Directory"
            title="Browse verified therapists before you start your vault."
            description="Review specialties, session modes, languages, and full bios before moving into the protected onboarding flow."
          />
        </section>

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {therapists.map((therapist) => (
            <GlassCard key={therapist.id} className="glass-panel flex h-full flex-col p-6">
              <div className="flex min-h-[112px] items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-2xl font-semibold text-[var(--text-primary)]">
                    {therapist.name}
                  </h2>
                  <p className="mt-3 text-base leading-7 text-[var(--text-muted)]">
                    {therapist.specialty}
                  </p>
                </div>
                <span
                  className={`glass-chip px-3 py-1 text-xs ${
                    therapist.isOnline
                      ? "text-[var(--status-online-text)]"
                      : "text-[var(--status-offline-text)]"
                  }`}
                >
                  {therapist.isOnline ? "Online" : "Offline"}
                </span>
              </div>

              <div className="mt-5 flex min-h-[46px] flex-wrap content-start gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${getModeBadgeClass(therapist.mode)}`}
                >
                  {therapist.mode}
                </span>
                {therapist.languages.map((language) => (
                  <span
                    key={`${therapist.id}-${language}`}
                    className="glass-chip-muted px-3 py-1 text-xs"
                  >
                    {language}
                  </span>
                ))}
              </div>

              <div className="mt-6 flex min-h-[188px] flex-1 flex-col">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-faint)]">
                  Bio
                </p>
                <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">
                  {therapist.bio}
                </p>
              </div>

              <div className="mt-6">
                <TherapistDirectoryCta />
              </div>
            </GlassCard>
          ))}

          {therapists.length === 0 ? (
            <GlassCard className="glass-panel p-6 md:col-span-2 xl:col-span-3">
              <p className="text-lg font-semibold text-[var(--text-primary)]">
                No verified therapists are available right now.
              </p>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--text-muted)]">
                The directory will populate automatically once verified therapist
                profiles are available in Supabase.
              </p>
            </GlassCard>
          ) : null}
        </section>
      </div>
    </main>
  );
}
