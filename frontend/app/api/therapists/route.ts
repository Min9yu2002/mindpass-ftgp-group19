import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../lib/supabase-server";

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

export async function GET() {
  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("therapists")
      .select("*")
      .order("is_online", { ascending: false })
      .order("rating", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const therapists = (data ?? []).map((therapist) => ({
      id: therapist.id,
      name:
        therapist.name ??
        therapist.full_name ??
        therapist.display_name ??
        "Unknown therapist",
      specialty:
        therapist.specialty ?? therapist.clinical_specialty ?? "General support",
      languages: normalizeLanguages(therapist.languages),
      bio: therapist.bio ?? therapist.description ?? "",
      isOnline: Boolean(therapist.is_online ?? therapist.isOnline),
      rating: Number(therapist.rating ?? 0),
      availability:
        therapist.availability ??
        therapist.availability_text ??
        "Availability unavailable",
      mode: therapist.mode ?? therapist.session_mode ?? "Video",
      walletAddress:
        therapist.wallet_address ?? therapist.walletAddress ?? "",
    }));

    return NextResponse.json({ data: therapists });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error." },
      { status: 500 },
    );
  }
}
