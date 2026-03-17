"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import GlassCard from "../../components/GlassCard";
import RoleIsolationBlocker from "../../components/RoleIsolationBlocker";
import SectionHeading from "../../components/SectionHeading";
import WalletConnectButton from "../../components/WalletConnectButton";
import { supabase } from "../../lib/supabase";

type TherapistRecord = {
  wallet_address?: string | null;
  legal_name?: string | null;
};

export default function TherapistLoginPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const lastHandledAddressRef = useRef("");

  useEffect(() => {
    const supabaseClient = supabase;

    if (!isConnected || !address || !supabaseClient) {
      if (!isConnected) {
        lastHandledAddressRef.current = "";
      }
      return;
    }

    const normalizedAddress = address.toLowerCase();
    if (lastHandledAddressRef.current === normalizedAddress) {
      return;
    }

    lastHandledAddressRef.current = normalizedAddress;
    let isCancelled = false;

    const authenticateTherapist = async () => {
      setIsAuthenticating(true);
      setErrorMessage("");

      const { data, error } = await supabaseClient
        .from("therapists")
        .select("wallet_address, legal_name")
        .ilike("wallet_address", address)
        .maybeSingle();

      if (isCancelled) {
        return;
      }

      if (error) {
        setErrorMessage(error.message);
        setIsAuthenticating(false);
        lastHandledAddressRef.current = "";
        return;
      }

      const therapist = data as TherapistRecord | null;
      if (therapist) {
        window.localStorage.setItem(
          "mindpass-therapist-profile",
          JSON.stringify({
            walletAddress: normalizedAddress,
            legalName: therapist.legal_name ?? "",
          }),
        );
        window.localStorage.removeItem("mindpass-patient-profile");
        window.localStorage.setItem("mindpass-active-session", "therapist");
        window.dispatchEvent(new Event("mindpass-session-changed"));

        try {
          await supabaseClient.from("therapist_auth_logs").insert({
            therapist_wallet: normalizedAddress,
            action: "login",
            user_agent: navigator.userAgent,
          });
        } catch (err) {
          console.error("Failed to log login action", err);
        }

        setIsAuthenticating(false);
        router.replace("/provider-lobby");
        return;
      }

      console.warn("Unregistered therapist wallet connected.");
      setIsAuthenticating(false);
      router.replace("/therapist-onboarding");
    };

    authenticateTherapist();

    return () => {
      isCancelled = true;
    };
  }, [address, isConnected, router]);

  const visibleErrorMessage = isConnected ? errorMessage : "";
  const showAuthenticating = isConnected && isAuthenticating;

  return (
    <main className="app-shell page-canvas page-canvas-soft relative overflow-hidden bg-background pt-32 text-foreground md:pt-36">
      <div className="relative mx-auto w-full max-w-6xl px-6 py-10 lg:px-10">
        <section className="grid gap-8 lg:grid-cols-[1.02fr_0.98fr] lg:items-start">
          <div>
            <SectionHeading
              eyebrow="Therapist Access"
              title="Verify your SBT and enter the provider network."
              description="Connect the wallet that holds your therapist credential. We will verify your on-chain identity and route you to the correct workspace."
            />

            <div className="mt-8">
              <RoleIsolationBlocker
                forbiddenProfileKey="mindpass-patient-profile"
                title="Access Denied: You are currently logged in as a Patient."
                description="Please sign out before accessing the Provider portal."
              >
                <GlassCard className="glass-panel p-6 sm:p-8">
                  <div className="mb-8 flex flex-col gap-5">
                    <div className="glass-chip-muted w-fit px-4 py-2 text-xs uppercase tracking-[0.24em] text-[var(--text-faint)]">
                      Web3 Auth Gateway
                    </div>
                    <div>
                      <h1 className="text-3xl font-semibold text-[var(--text-primary)]">
                        Connect Wallet &amp; Verify
                      </h1>
                      <p className="mt-3 max-w-xl text-base leading-7 text-[var(--text-muted)]">
                        MindPass checks your connected wallet against the verified
                        therapist registry in Supabase. If a profile exists, you
                        will enter the provider lobby immediately.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-5">
                    <div className="liquid-glass-soft rounded-[24px] border border-[var(--glass-border-soft)] px-5 py-5">
                      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                        <div>
                          <p className="text-sm font-medium text-[var(--text-primary)]">
                            Therapist Wallet
                          </p>
                          <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
                            Use the same wallet that received your therapist SBT.
                          </p>
                        </div>
                        <WalletConnectButton />
                      </div>
                    </div>

                    {showAuthenticating ? (
                      <div className="liquid-glass-soft flex items-center gap-3 rounded-[24px] border border-[var(--glass-border-soft)] px-5 py-4">
                        <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--text-primary)] border-t-transparent" />
                        <p className="text-sm font-medium text-[var(--text-primary)]">
                          Authenticating your SBT...
                        </p>
                      </div>
                    ) : null}

                    {visibleErrorMessage ? (
                      <div className="liquid-glass-soft rounded-[24px] border border-red-500/20 px-5 py-4 text-sm text-red-600 dark:text-red-300">
                        {visibleErrorMessage}
                      </div>
                    ) : null}
                  </div>
                </GlassCard>
              </RoleIsolationBlocker>
            </div>
          </div>

          <div className="space-y-4">
            <GlassCard className="glass-panel p-6">
              <div className="mb-6">
                <p className="text-sm uppercase tracking-[0.24em] text-[var(--text-faint)]">
                  What happens next
                </p>
                <h2 className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
                  Wallet-first provider verification
                </h2>
              </div>

              <div className="space-y-3">
                {[
                  {
                    title: "1. Connect your credential wallet",
                    description:
                      "RainbowKit links the wallet that holds your therapist credential without exposing additional personal details.",
                  },
                  {
                    title: "2. We verify the registry",
                    description:
                      "MindPass checks Supabase for a therapist profile whose wallet address matches your connected account.",
                  },
                  {
                    title: "3. We route you instantly",
                    description:
                      "Verified therapists go to the provider lobby. New providers go to onboarding to complete eKYC and profile setup.",
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="liquid-glass-soft rounded-[24px] border border-[var(--glass-border-soft)] px-4 py-4"
                  >
                    <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                      {item.description}
                    </p>
                  </div>
                ))}
              </div>
            </GlassCard>

            <GlassCard className="glass-panel glass-highlight p-6">
              <div className="flex items-start gap-3">
                <div className="liquid-glass-soft flex h-11 w-11 items-center justify-center rounded-full text-[var(--accent-primary-strong)]">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm uppercase tracking-[0.24em] text-[var(--text-faint)]">
                    Privacy-first routing
                  </p>
                  <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
                    Your wallet address is used as the provider identity anchor.
                    No username or email is required at login, and we only
                    branch into onboarding if we cannot find a matching
                    therapist record.
                  </p>
                </div>
              </div>
            </GlassCard>
          </div>
        </section>
      </div>
    </main>
  );
}
