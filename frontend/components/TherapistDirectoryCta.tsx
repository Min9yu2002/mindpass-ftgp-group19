"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { resolveFunding, SESSION_FEE_ETH } from "../lib/funding";
import { supabase } from "../lib/supabase";

type TherapistDirectoryCtaProps = {
  therapistWallet: string;
};

export default function TherapistDirectoryCta({
  therapistWallet,
}: TherapistDirectoryCtaProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClick = async () => {
    if (typeof window === "undefined") {
      return;
    }

    const activeSession = window.localStorage.getItem("mindpass-active-session");

    if (activeSession === "therapist") {
      alert(
        "You are currently logged in as a Provider. Please sign out first to book a session as a patient.",
      );
      return;
    }

    if (activeSession === "patient") {
      const storedProfile = window.localStorage.getItem("mindpass-patient-profile");

      if (!storedProfile || !supabase || !therapistWallet || isSubmitting) {
        router.push("/auth");
        return;
      }

      let patientWallet = "";
      let subsidyBalance = 0;
      try {
        const parsedProfile = JSON.parse(storedProfile) as {
          walletAddress?: string;
          subsidyBalance?: number;
        };
        patientWallet = String(parsedProfile.walletAddress ?? "").trim().toLowerCase();
        subsidyBalance = Number(parsedProfile.subsidyBalance ?? 0);
      } catch {
        patientWallet = "";
        subsidyBalance = 0;
      }

      if (!patientWallet) {
        router.push("/auth");
        return;
      }

      setIsSubmitting(true);
      const funding = resolveFunding(subsidyBalance, SESSION_FEE_ETH);

      try {
        const { data, error } = await supabase
          .from("sessions")
          .insert({
            patient_wallet: patientWallet,
            therapist_wallet: therapistWallet.toLowerCase(),
            status: "requested",
            session_mode: "text",
            session_fee_eth: SESSION_FEE_ETH,
            escrow_amount: SESSION_FEE_ETH,
            funding_source: funding.fundingSource,
            subsidy_applied_eth: funding.subsidyApplied,
            wallet_required_eth: funding.walletRequired,
            wallet_funded_eth: 0,
          })
          .select()
          .single();

        if (error) {
          console.error("Failed to create booking session", error);
          alert("Unable to book this session right now. Please try again.");
          setIsSubmitting(false);
          return;
        }

        console.log("Created booking session", data);
        router.push("/dashboard");
      } catch (error) {
        console.error("Failed to create booking session", error);
        alert("Unable to book this session right now. Please try again.");
        setIsSubmitting(false);
      }
      return;
    }

    router.push("/auth");
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isSubmitting}
      className="button-primary inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-medium"
    >
      {isSubmitting ? "Booking..." : "Book Session"}
    </button>
  );
}
