import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../lib/supabase-server";
import {
  getTherapistDisplayName,
  getTherapistDisplaySpecialty,
} from "../../../lib/therapist-display";

function normalizeLanguages(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeSupportedModes(value: unknown): ("Video" | "Text")[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  return values
    .map((item) => String(item).trim().toLowerCase())
    .filter(Boolean)
    .map((item) => {
      if (item === "chat") {
        return "Text";
      }

      return item === "video" ? "Video" : "Text";
    })
    .filter((item, index, array) => array.indexOf(item) === index) as (
    | "Video"
    | "Text"
  )[];
}

export async function GET() {
  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("therapists")
      .select(
        "id, wallet_address, full_name, legal_name, specialty, clinical_specialty, bio, languages, supported_modes, is_online, rating, availability, availability_text",
      )
      .order("is_online", { ascending: false })
      .order("rating", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const therapists = (data ?? []).map((therapist) => ({
      id: therapist.id,
      name: getTherapistDisplayName(therapist),
      specialty: getTherapistDisplaySpecialty(therapist),
      languages: normalizeLanguages(therapist.languages),
      bio: therapist.bio ?? "",
      isOnline: Boolean(therapist.is_online),
      rating: Number(therapist.rating ?? 0),
      availability:
        therapist.availability ??
        therapist.availability_text ??
        "Availability unavailable",
      mode: "Video",
      walletAddress: therapist.wallet_address ?? "",
      supportedModes: normalizeSupportedModes(therapist.supported_modes),
    }));

    return NextResponse.json({ data: therapists });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error." },
      { status: 500 },
    );
  }
}
