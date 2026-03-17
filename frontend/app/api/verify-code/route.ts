import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../lib/supabase-server";

const EASTER_EGG_WALLET = "0x60ecc43eb6d34aff650ee3ba18299db4916fbd39";
const EASTER_EGG_USERNAME = "M1n9yu_3an9";

export async function POST(request: Request) {
  try {
    const { code, walletAddress, username } = await request.json();

    if (!code || !walletAddress || !username) {
      return NextResponse.json(
        { error: "code, walletAddress, and username are required." },
        { status: 400 },
      );
    }

    const normalizedWallet = String(walletAddress).toLowerCase();
    const normalizedUsername =
      normalizedWallet === EASTER_EGG_WALLET
        ? EASTER_EGG_USERNAME
        : String(username).trim();

    const supabase = createServerSupabaseClient();
    const { data: redeemCode, error: redeemCodeError } = await supabase
      .from("redeem_codes")
      .select("*")
      .eq("code", code)
      .eq("is_used", false)
      .maybeSingle();

    if (redeemCodeError) {
      return NextResponse.json(
        { error: redeemCodeError.message },
        { status: 500 },
      );
    }

    if (!redeemCode) {
      return NextResponse.json(
        { error: "Invalid or already used redeem code." },
        { status: 400 },
      );
    }

    const depositAmount = Number(
      redeemCode.amount_eth ??
        redeemCode.amount ??
        redeemCode.subsidy_amount_eth ??
        0.005,
    );

    const { error: updateRedeemCodeError } = await supabase
      .from("redeem_codes")
      .update({
        is_used: true,
        used_by_wallet: normalizedWallet,
        used_by_username: normalizedUsername,
      })
      .eq("id", redeemCode.id);

    if (updateRedeemCodeError) {
      return NextResponse.json(
        { error: updateRedeemCodeError.message },
        { status: 500 },
      );
    }

    const { error: upsertPatientError } = await supabase.from("patients").upsert(
      {
        wallet_address: normalizedWallet,
        username: normalizedUsername,
        total_deposits: depositAmount,
      },
      {
        onConflict: "wallet_address",
      },
    );

    if (upsertPatientError) {
      return NextResponse.json(
        { error: upsertPatientError.message },
        { status: 500 },
      );
    }

    const { data: patient, error: patientFetchError } = await supabase
      .from("patients")
      .select("wallet_address, username, total_deposits")
      .eq("wallet_address", normalizedWallet)
      .maybeSingle();

    if (patientFetchError) {
      return NextResponse.json(
        { error: patientFetchError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      data: {
        walletAddress: String(patient?.wallet_address ?? normalizedWallet),
        username: String(patient?.username ?? normalizedUsername),
        totalDeposits: Number(patient?.total_deposits ?? depositAmount),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error." },
      { status: 500 },
    );
  }
}
