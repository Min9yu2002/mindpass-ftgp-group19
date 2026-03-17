"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import GlassCard from "./GlassCard";
import AuthTabs from "./AuthTabs";
import StatusBadge from "./StatusBadge";

type AuthMode = "create" | "login" | "therapist";

type AuthCardProps = {
  initialMode?: AuthMode;
};

const DEMO_PATIENT_WALLET =
  "0x60eCc43Eb6d34AFF650ee3BA18299dB4916fbd39";
const DEMO_THERAPIST_WALLET =
  "0x8Ec7F2F349111B2443A6C68691344B7d53d5B2cD";
const EASTER_EGG_WALLET = DEMO_PATIENT_WALLET.toLowerCase();
const EASTER_EGG_USERNAME = "M1n9yu_3an9";

export default function AuthCard({ initialMode = "create" }: AuthCardProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [username, setUsername] = useState("");
  const [redeemCode, setRedeemCode] = useState(""); // 新增：政府認證碼狀態
  const [isConnecting, setIsConnecting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const router = useRouter();

  const content = useMemo(() => {
    if (mode === "login") {
      return {
        title: "Access your vault",
        description:
          "Enter your anonymous username and connect your wallet to decrypt your session history.",
        buttonLabel: "Connect Wallet to Log In",
      };
    }

    if (mode === "therapist") {
      return {
        title: "Verify SBT Credentials",
        description:
          "Therapist identities are verified exclusively via on-chain Soulbound Tokens. No username required.",
        buttonLabel: "Connect Wallet & Verify",
      };
    }

    return {
      title: "Create secure profile",
      description:
        "Enter your government support code, choose an anonymous username, and link your Web3 wallet.",
      buttonLabel: "Verify Code & Connect Wallet",
    };
  }, [mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setIsConnecting(true);

    if (mode === "therapist") {
      window.localStorage.setItem(
        "mindpass-therapist-profile",
        JSON.stringify({
          walletAddress: DEMO_THERAPIST_WALLET,
        }),
      );
      router.push("/provider-lobby");
      return;
    }

    if (mode === "login") {
      const loginUsername =
        DEMO_PATIENT_WALLET.toLowerCase() === EASTER_EGG_WALLET
          ? EASTER_EGG_USERNAME
          : username.trim();

      window.localStorage.setItem(
        "mindpass-patient-profile",
        JSON.stringify({
          walletAddress: DEMO_PATIENT_WALLET,
          username: loginUsername,
        }),
      );
      router.push("/dashboard");
      return;
    }

    try {
      const walletAddress = DEMO_PATIENT_WALLET;
      const submittedUsername =
        walletAddress.toLowerCase() === EASTER_EGG_WALLET
          ? EASTER_EGG_USERNAME
          : username.trim();

      const response = await fetch("/api/verify-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code: redeemCode,
          walletAddress,
          username: submittedUsername,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Unable to verify access code.");
      }

      window.localStorage.setItem(
        "mindpass-patient-profile",
        JSON.stringify(result.data),
      );

      router.push("/dashboard");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to verify access code.",
      );
      setIsConnecting(false);
      return;
    }
  };

  // 判斷按鈕是否該反灰停用
  const isSubmitDisabled = 
    isConnecting || 
    (mode === "create" && (!username || !redeemCode)) || // 註冊時：必須有 username 和 redeemCode
    (mode === "login" && !username);                     // 登入時：必須有 username

  return (
    <GlassCard className="glass-panel p-6 sm:p-8">
      <div className="mb-8 flex flex-col gap-5">
        <StatusBadge label="Web3 Auth Flow" tone="neutral" />
        <div>
          <h1 className="text-3xl font-semibold text-[var(--text-primary)]">{content.title}</h1>
          <p className="mt-3 max-w-xl text-base leading-7 text-[var(--text-muted)]">
            {content.description}
          </p>
        </div>
        <AuthTabs mode={mode} onChange={setMode} />
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* 病患註冊模式專屬：政府認證碼輸入框 */}
        {mode === "create" && (
          <label className="block">
            <span className="mb-2 flex items-center justify-between text-sm text-[var(--text-secondary)]">
              <span>Government Support Code</span>
              <span className="text-xs text-[var(--accent-primary-strong)]">Required</span>
            </span>
            <input
              type="text"
              required
              value={redeemCode}
              onChange={(e) => setRedeemCode(e.target.value)}
              className="form-input w-full"
              placeholder="e.g. GOV-2026-XYZ"
            />
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              This code grants you access and 0.005 Sepolia ETH for your session escrow.
            </p>
          </label>
        )}

        {/* 病患模式 (註冊與登入)：Username 輸入框 */}
        {mode !== "therapist" && (
          <label className="block">
            <span className="mb-2 block text-sm text-[var(--text-secondary)]">
              Anonymous Username
            </span>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="form-input w-full"
              placeholder="e.g. calm_ocean_22"
            />
            {mode === "create" && (
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                This name will be stored encrypted. Do not use your real name.
              </p>
            )}
          </label>
        )}

        {/* 諮商師模式提示 */}
        {mode === "therapist" && (
          <div className="liquid-glass-soft rounded-[22px] border border-[var(--accent-primary)]/15 bg-[var(--accent-primary)]/6 px-4 py-5 text-center">
            <p className="text-sm text-[var(--accent-primary-strong)]">
              Please ensure your wallet containing the verified SBT is active before connecting.
            </p>
          </div>
        )}

        {/* Web3 免責聲明 */}
        {mode === "create" && (
          <label className="liquid-glass-soft flex items-start gap-3 rounded-[22px] px-4 py-4 mt-4 cursor-pointer">
            <input 
              type="checkbox" 
              required 
              className="mt-1 h-4 w-4 accent-[var(--accent-primary)]" 
            />
            <span className="text-sm leading-6 text-[var(--text-muted)]">
              I understand that my wallet acts as my cryptographic key. If I lose access to my wallet, I lose access to my chat history.
            </span>
          </label>
        )}

        {errorMessage ? (
          <div className="liquid-glass-soft rounded-[22px] border border-red-400/20 bg-red-500/8 px-4 py-4">
            <p className="text-sm text-red-600 dark:text-red-300">{errorMessage}</p>
          </div>
        ) : null}

        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2">
            <button
              type="submit"
              disabled={isSubmitDisabled}
              className={`button-primary rounded-full px-6 py-3 text-center text-sm font-medium transition-all ${
                isConnecting ? "opacity-70 cursor-wait" : ""
              }`}
            >
              {isConnecting
                ? mode === "therapist"
                  ? "Verifying SBT..."
                  : "Verifying Access..."
                : content.buttonLabel}
            </button>

            {mode === "therapist" ? (
              <Link
                href="/therapist-onboarding"
                className="pl-1 text-xs text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
              >
                Apply to become a verified therapist
              </Link>
            ) : null}
          </div>
          
          {mode !== "therapist" ? (
            <p className="text-sm text-[var(--text-muted)]">
              Demo wallet: {DEMO_PATIENT_WALLET.slice(0, 8)}...
            </p>
          ) : null}
        </div>
      </form>
    </GlassCard>
  );
}
