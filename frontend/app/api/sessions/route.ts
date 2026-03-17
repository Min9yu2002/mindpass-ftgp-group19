import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../lib/supabase-server";

const DEFAULT_SESSION_AMOUNT = 0.005;

export async function GET(request: NextRequest) {
  try {
    const patientWallet = request.nextUrl.searchParams.get("patient_wallet");
    const therapistWallet = request.nextUrl.searchParams.get("therapist_wallet");

    if (!patientWallet && !therapistWallet) {
      return NextResponse.json(
        { error: "patient_wallet or therapist_wallet query param is required." },
        { status: 400 },
      );
    }

    const supabase = createServerSupabaseClient();
    let query = supabase
      .from("sessions")
      .select("*")
      .order("created_at", { ascending: false });

    if (patientWallet) {
      query = query.eq("patient_wallet", patientWallet.toLowerCase());
    }

    if (therapistWallet) {
      query = query.eq("therapist_wallet", therapistWallet.toLowerCase());
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const {
      patient_wallet,
      therapist_wallet,
      status = "initiated",
      amount_eth = DEFAULT_SESSION_AMOUNT,
    } = await request.json();

    if (!patient_wallet || !therapist_wallet) {
      return NextResponse.json(
        { error: "patient_wallet and therapist_wallet are required." },
        { status: 400 },
      );
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("sessions")
      .insert({
        patient_wallet: String(patient_wallet).toLowerCase(),
        therapist_wallet: String(therapist_wallet).toLowerCase(),
        amount_eth,
        status,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error." },
      { status: 500 },
    );
  }
}
