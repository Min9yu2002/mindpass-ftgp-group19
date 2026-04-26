"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatEther } from "viem";
import { useAccount, useBalance } from "wagmi";
import GlassCard from "./GlassCard";
import AuthTabs from "./AuthTabs";
import WalletConnectButton from "./WalletConnectButton";
import { supabase } from "../lib/supabase";

type AuthMode = "create" | "login";

type AuthCardProps = {
  initialMode?: AuthMode;
};

export default function AuthCard({ initialMode = "create" }: AuthCardProps) {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { data: balanceData } = useBalance({ address });
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [supportCode, setSupportCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingLogin, setIsCheckingLogin] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const content = useMemo(() => {
    if (mode === "login") {
      return {
        title: "Access your existing vault",
        description:
          "Already have a vault? Just connect your wallet. Our system will securely verify your key and grant you instant access.",
        buttonLabel: "Connect Wallet",
      };
    }

    return {
      title: "Initialise your anonymous vault",
      description:
        "First time here? Connect your wallet to generate a secure vault. Enter a government support code if you are claiming a session subsidy.",
      buttonLabel: "Initialize Vault",
    };
  }, [mode]);

  useEffect(() => {
    let isCancelled = false;

    const syncWalletLogin = async () => {
      if (mode !== "login" || !isConnected || !address || !supabase) {
        return;
      }

      const normalizedAddress = address.toLowerCase();
      setIsCheckingLogin(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("patients")
        .select("wallet_address, total_deposits, subsidy_balance")
        .ilike("wallet_address", address)
        .maybeSingle();

      if (isCancelled) {
        return;
      }

      if (error) {
        setErrorMessage(error.message);
        setIsCheckingLogin(false);
        return;
      }

      if (!data) {
        setErrorMessage("No vault found for this wallet. Please go to 'Initialize Vault' to set up.");
        setIsCheckingLogin(false);
        return;
      }

      window.localStorage.setItem(
        "mindpass-patient-profile",
        JSON.stringify({
          walletAddress: normalizedAddress,
          totalDeposits: Number(data.total_deposits ?? 0),
          subsidyBalance: Number(data.subsidy_balance ?? 0),
        }),
      );
      window.localStorage.removeItem("mindpass-therapist-profile");
      window.localStorage.setItem("mindpass-active-session", "patient");
      window.dispatchEvent(new Event("mindpass-session-changed"));
      router.replace("/dashboard");
    };

    syncWalletLogin();

    return () => {
      isCancelled = true;
    };
  }, [address, isConnected, mode, router]);

  const handleInitializeVault = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage("");

    if (!isConnected || !address) {
      setErrorMessage("Connect your wallet before completing anonymous setup.");
      return;
    }

    if (!supabase) {
      setErrorMessage("Supabase client is unavailable.");
      return;
    }

    setIsSubmitting(true);
    const normalizedAddress = address.toLowerCase();
    const currentEthBalance = balanceData
      ? Number(formatEther(balanceData.value))
      : 0;

    try {
      const trimmedSupportCode = supportCode.trim();
      let voucherValue = 0;

      if (trimmedSupportCode) {
        const { data: codeData, error: codeError } = await supabase
          .from("redeem_codes")
          .select("eth_value, is_used")
          .eq("code", trimmedSupportCode)
          .single();

        if (codeError || !codeData || codeData.is_used === true) {
          throw new Error("Invalid or already used support code.");
        }

        voucherValue = Number(codeData.eth_value || 0.005);
      }

      const { data: existingPatient, error: existingPatientError } = await supabase
        .from("patients")
        .select("subsidy_balance")
        .ilike("wallet_address", address)
        .maybeSingle();

      if (existingPatientError) {
        throw existingPatientError;
      }

      const currentSubsidy = Number(existingPatient?.subsidy_balance || 0);
      const newSubsidyBalance = currentSubsidy + voucherValue;

      const { data, error } = await supabase
        .from("patients")
        .upsert(
          {
            wallet_address: normalizedAddress,
            support_code: trimmedSupportCode || null,
            total_deposits: currentEthBalance,
            subsidy_balance: newSubsidyBalance,
          },
          { onConflict: "wallet_address" },
        )
        .select("wallet_address, total_deposits, subsidy_balance")
        .single();

      if (error) {
        setErrorMessage(error.message);
        setIsSubmitting(false);
        return;
      }

      if (trimmedSupportCode) {
        const { error: burnCodeError } = await supabase
          .from("redeem_codes")
          .update({
            is_used: true,
            used_by_wallet: normalizedAddress,
          })
          .eq("code", trimmedSupportCode);

        if (burnCodeError) {
          throw burnCodeError;
        }
      }

      window.localStorage.setItem(
        "mindpass-patient-profile",
        JSON.stringify({
          walletAddress: normalizedAddress,
          totalDeposits: Number(data?.total_deposits ?? currentEthBalance),
          subsidyBalance: Number(data?.subsidy_balance ?? newSubsidyBalance),
        }),
      );
      window.localStorage.removeItem("mindpass-therapist-profile");
      window.localStorage.setItem("mindpass-active-session", "patient");
      window.dispatchEvent(new Event("mindpass-session-changed"));
      router.replace("/dashboard");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to complete anonymous setup.",
      );
      setIsSubmitting(false);
    }
  };

  return (
    <GlassCard className="glass-panel auth-card p-6 sm:p-8">
      <div className="mb-8 flex flex-col gap-5">
        <span className="auth-card__badge inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-medium tracking-[0.18em]">
          Gov Subsidy + Wallet Auth
        </span>
        <div>
          <h1 className="font-hero-syne text-3xl text-[var(--text-primary)]">
            {content.title}
          </h1>
          <p className="mt-3 max-w-xl text-base leading-7 text-[var(--text-muted)]">
            {content.description}
          </p>
        </div>
        <AuthTabs mode={mode} onChange={setMode} />
      </div>

      <form
        onSubmit={mode === "create" ? handleInitializeVault : (event) => event.preventDefault()}
        className={`space-y-5 ${mode === "login" ? "flex flex-col items-center text-center" : ""}`}
      >
        {mode === "create" ? (
          <label className="block">
            <span className="mb-2 flex items-center justify-between text-sm text-[var(--text-secondary)]">
              <span>Government Support Code</span>
              <span className="text-xs text-[var(--text-faint)]">Optional</span>
            </span>
            <input
              type="text"
              value={supportCode}
              onChange={(event) => setSupportCode(event.target.value)}
              className="form-input auth-card__input w-full"
              placeholder="e.g. NHS-2026"
            />
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              This code secures your session subsidy without requiring names,
              email, or other personally identifying information.
            </p>
          </label>
        ) : null}

        {mode === "create" ? (
          <div className="auth-card__surface rounded-[22px] px-4 py-5">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  Wallet as identity
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                  Connect your Web3 wallet. This is your only account identity and
                  your decryption key for protected session records.
                </p>
              </div>
              <WalletConnectButton />
            </div>
          </div>
        ) : (
          <div className="auth-card__surface flex w-full flex-col items-center justify-center gap-4 rounded-[24px] px-6 py-8 text-center">
            <p className="max-w-md text-sm leading-6 text-[var(--text-muted)]">
              Connect the wallet you used before and MindPass will verify your key automatically.
            </p>
            <WalletConnectButton />
          </div>
        )}

        {mode === "create" && isConnected && address ? (
          <button
            type="submit"
            disabled={isSubmitting}
            className={`button-primary rounded-full px-6 py-3 text-center text-sm font-medium transition-all ${
              isSubmitting ? "cursor-wait opacity-70" : ""
            }`}
          >
            {isSubmitting ? "Completing Setup..." : content.buttonLabel}
          </button>
        ) : null}

        {mode === "login" && isCheckingLogin ? (
          <div className="liquid-glass-soft flex items-center gap-3 rounded-[22px] px-4 py-4">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--text-primary)] border-t-transparent" />
            <p className="text-sm text-[var(--text-primary)]">
              Authenticating your wallet...
            </p>
          </div>
        ) : null}

        {errorMessage ? (
          <div className="liquid-glass-soft rounded-[22px] border border-red-400/20 bg-red-500/8 px-4 py-4">
            <p className="text-sm text-red-600 dark:text-red-300">{errorMessage}</p>
          </div>
        ) : null}

        <p className={`text-sm text-[var(--text-muted)] ${mode === "login" ? "max-w-md" : ""}`}>
          {mode === "create"
            ? "Your wallet and subsidy code are sufficient to initialize a zero-PII vault."
            : "If this wallet has already been registered, access will be granted automatically."}
        </p>
      </form>
    </GlassCard>
  );
}
