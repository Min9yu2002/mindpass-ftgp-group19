"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import VoiceCallControls from "../../components/VoiceCallControls";
import { supabase } from "../../lib/supabase";

type Message = {
  id: string;
  role: "system" | "therapist" | "patient";
  content: string;
  time: string;
};

type EndSessionPhase = "confirm" | "awaiting" | "success";

type TherapistProfile = {
  name: string;
  specialty: string;
  walletAddress: string;
};

type VoiceCallStatus = "idle" | "ringing" | "connected";

type StoredProfile = {
  walletAddress?: string;
};

const initialMessages: Message[] = [
  {
    id: "sys-1",
    role: "system",
    content:
      "Smart Contract Escrow Locked. 0.005 ETH is secured. Session started at 14:00.",
    time: "14:00",
  },
  {
    id: "th-1",
    role: "therapist",
    content:
      "Hello, I've received your anonymized intake form. How are you feeling today?",
    time: "14:01",
  },
  {
    id: "pt-1",
    role: "patient",
    content:
      "I've been feeling mentally exhausted for a few weeks and I haven't been able to reset properly.",
    time: "14:02",
  },
  {
    id: "th-2",
    role: "therapist",
    content:
      "Thank you for sharing that. We can take this slowly and look at what has been draining most of your energy.",
    time: "14:03",
  },
];

const mockReplies = [
  "I understand. Let's explore that further.",
  "That sounds difficult. When do you notice it becoming most intense?",
  "We can slow this down and focus on one part of it first.",
];

const formatTime = () =>
  new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

const formatCountdown = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(
    remainingSeconds,
  ).padStart(2, "0")}`;
};

function AttachmentIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path
        d="M8.5 12.5 14.86 6.14a3 3 0 1 1 4.24 4.24l-8.49 8.48a5 5 0 1 1-7.07-7.07l8.13-8.13"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path
        d="M4 11.5 20 4l-4.5 16-3.5-6-8-2.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChatRoomPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isTherapist = searchParams.get("role") === "therapist";
  const therapistAddress = searchParams.get("address")?.toLowerCase() ?? "";
  const sessionIdParam = searchParams.get("sessionId") ?? "";
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(50 * 60);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [showEndSessionModal, setShowEndSessionModal] = useState(false);
  const [endSessionPhase, setEndSessionPhase] =
    useState<EndSessionPhase>("confirm");
  const [therapistProfile, setTherapistProfile] = useState<TherapistProfile>({
    name: "Dr. Eliana Park",
    specialty: "Anxiety and burnout recovery",
    walletAddress: therapistAddress,
  });
  const [isLoadingTherapist, setIsLoadingTherapist] = useState(false);
  const [therapistError, setTherapistError] = useState("");
  const [voiceCallStatus, setVoiceCallStatus] =
    useState<VoiceCallStatus>("idle");
  const [activeSessionId, setActiveSessionId] = useState(sessionIdParam);
  const [currentWallet, setCurrentWallet] = useState("");
  const [incomingCallerWallet, setIncomingCallerWallet] = useState("");
  const [callError, setCallError] = useState("");
  const [isCallActionLoading, setIsCallActionLoading] = useState(false);
  const timeoutsRef = useRef<number[]>([]);
  const hasShownWarningRef = useRef(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    const storageKey = isTherapist
      ? "mindpass-therapist-profile"
      : "mindpass-patient-profile";

    try {
      const storedProfile = window.localStorage.getItem(storageKey);
      if (!storedProfile) {
        return;
      }

      const parsedProfile = JSON.parse(storedProfile) as StoredProfile;
      setCurrentWallet(parsedProfile.walletAddress?.toLowerCase() ?? "");
    } catch {
      setCurrentWallet("");
    }
  }, [isTherapist]);

  useEffect(() => {
    let isCancelled = false;

    const fetchTherapistProfile = async () => {
      if (!therapistAddress || !supabase) {
        return;
      }

      setIsLoadingTherapist(true);
      setTherapistError("");

      const { data, error } = await supabase
        .from("therapists")
        .select("*")
        .eq("wallet_address", therapistAddress)
        .maybeSingle();

      if (isCancelled) {
        return;
      }

      if (error) {
        setTherapistError(error.message);
        setIsLoadingTherapist(false);
        return;
      }

      if (data) {
        setTherapistProfile({
          name:
            data.legal_name ??
            data.name ??
            data.full_name ??
            data.display_name ??
            "Dr. Eliana Park",
          specialty:
            data.specialty ??
            data.clinical_specialty ??
            "Anxiety and burnout recovery",
          walletAddress:
            data.wallet_address ?? therapistAddress,
        });
      }

      setIsLoadingTherapist(false);
    };

    fetchTherapistProfile();

    return () => {
      isCancelled = true;
    };
  }, [therapistAddress]);

  const clearRegisteredTimeouts = () => {
    timeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
  };

  const registerTimeout = (callback: () => void, delay: number) => {
    const timeoutId = window.setTimeout(callback, delay);
    timeoutsRef.current.push(timeoutId);
    return timeoutId;
  };

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 0) {
          window.clearInterval(intervalId);
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
      clearRegisteredTimeouts();
    };
  }, []);

  const stopLocalAudio = () => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
  };

  const startLocalAudio = async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      throw new Error("Audio devices are unavailable in this browser.");
    }

    if (localStreamRef.current) {
      return localStreamRef.current;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    localStreamRef.current = stream;
    return stream;
  };

  useEffect(() => {
    if (secondsLeft === 10 * 60 && !hasShownWarningRef.current) {
      hasShownWarningRef.current = true;
      registerTimeout(() => {
        setShowWarningModal(true);
      }, 0);
    }
  }, [secondsLeft]);

  useEffect(() => {
    return () => {
      stopLocalAudio();
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const resolveSession = async () => {
      if (!supabase || !currentWallet) {
        return;
      }

      setCallError("");

      if (sessionIdParam) {
        const { data, error } = await supabase
          .from("sessions")
          .select("id, call_status, caller_wallet")
          .eq("id", sessionIdParam)
          .maybeSingle();

        if (isCancelled) {
          return;
        }

        if (error) {
          setCallError(error.message);
          return;
        }

        if (data) {
          setActiveSessionId(data.id);
          setVoiceCallStatus((data.call_status as VoiceCallStatus) ?? "idle");
          setIncomingCallerWallet(data.caller_wallet?.toLowerCase() ?? "");
        }

        return;
      }

      if (!therapistAddress) {
        return;
      }

      const query = isTherapist
        ? supabase
            .from("sessions")
            .select("id, call_status, caller_wallet")
            .eq("therapist_wallet", currentWallet)
            .in("status", ["requested", "active", "initiated"])
            .order("updated_at", { ascending: false })
            .limit(1)
        : supabase
            .from("sessions")
            .select("id, call_status, caller_wallet")
            .eq("therapist_wallet", therapistAddress)
            .eq("patient_wallet", currentWallet)
            .in("status", ["requested", "active", "initiated"])
            .order("updated_at", { ascending: false })
            .limit(1);

      const { data, error } = await query.maybeSingle();

      if (isCancelled) {
        return;
      }

      if (error) {
        setCallError(error.message);
        return;
      }

      if (data) {
        setActiveSessionId(data.id);
        setVoiceCallStatus((data.call_status as VoiceCallStatus) ?? "idle");
        setIncomingCallerWallet(data.caller_wallet?.toLowerCase() ?? "");
      }
    };

    resolveSession();

    return () => {
      isCancelled = true;
    };
  }, [currentWallet, isTherapist, sessionIdParam, therapistAddress]);

  useEffect(() => {
    if (!supabase || !activeSessionId) {
      return;
    }

    const handleRemoteState = async (
      nextStatus: VoiceCallStatus,
      callerWallet?: string | null,
    ) => {
      setVoiceCallStatus(nextStatus);
      setIncomingCallerWallet(callerWallet?.toLowerCase() ?? "");

      if (nextStatus === "connected") {
        try {
          await startLocalAudio();
          setCallError("");
        } catch (error) {
          setCallError(
            error instanceof Error ? error.message : "Unable to access microphone.",
          );
        }
      }

      if (nextStatus === "idle") {
        stopLocalAudio();
      }
    };

    const channel = supabase.channel(`voice-session:${activeSessionId}`);
    channelRef.current = channel;

    channel
      .on("broadcast", { event: "call-status" }, async ({ payload }) => {
        if (payload?.sessionId !== activeSessionId) {
          return;
        }

        await handleRemoteState(
          payload.callStatus as VoiceCallStatus,
          payload.callerWallet as string | null | undefined,
        );
      })
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sessions",
          filter: `id=eq.${activeSessionId}`,
        },
        async (payload) => {
          const next = payload.new as {
            call_status?: VoiceCallStatus | null;
            caller_wallet?: string | null;
          };
          await handleRemoteState(
            next.call_status ?? "idle",
            next.caller_wallet ?? "",
          );
        },
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [activeSessionId]);

  const updateCallState = async (
    nextStatus: VoiceCallStatus,
    callerWallet?: string | null,
  ) => {
    if (!supabase || !activeSessionId) {
      throw new Error("Session is not ready for voice calling.");
    }

    const normalizedCaller = callerWallet?.toLowerCase() ?? null;
    const { error } = await supabase
      .from("sessions")
      .update({
        call_status: nextStatus,
        caller_wallet: normalizedCaller,
      })
      .eq("id", activeSessionId);

    if (error) {
      throw error;
    }

    setVoiceCallStatus(nextStatus);
    setIncomingCallerWallet(normalizedCaller ?? "");

    await channelRef.current?.send({
      type: "broadcast",
      event: "call-status",
      payload: {
        sessionId: activeSessionId,
        callStatus: nextStatus,
        callerWallet: normalizedCaller,
      },
    });
  };

  const handleSend = (event: React.FormEvent) => {
    event.preventDefault();

    const trimmedDraft = draft.trim();
    if (!trimmedDraft) {
      return;
    }

    const senderRole: Message["role"] = isTherapist ? "therapist" : "patient";
    const replyRole: Message["role"] = isTherapist ? "patient" : "therapist";

    setMessages((current) => [
      ...current,
      {
        id: `patient-${Date.now()}`,
        role: senderRole,
        content: trimmedDraft,
        time: formatTime(),
      },
    ]);
    setDraft("");

    registerTimeout(() => {
      const reply =
        mockReplies[Math.floor(Math.random() * mockReplies.length)];
      setMessages((current) => [
        ...current,
        {
          id: `therapist-${Date.now()}`,
          role: replyRole,
          content: reply,
          time: formatTime(),
        },
      ]);
    }, 1500);
  };

  const handleStartVoiceCall = async () => {
    if (!currentWallet) {
      setCallError("Connect your wallet profile before starting a voice call.");
      return;
    }

    try {
      setIsCallActionLoading(true);
      setCallError("");
      await updateCallState("ringing", currentWallet);
    } catch (error) {
      setCallError(
        error instanceof Error ? error.message : "Unable to start voice call.",
      );
    } finally {
      setIsCallActionLoading(false);
    }
  };

  const handleAcceptIncomingCall = async () => {
    try {
      setIsCallActionLoading(true);
      setCallError("");
      await startLocalAudio();
      await updateCallState("connected", incomingCallerWallet || currentWallet);
    } catch (error) {
      stopLocalAudio();
      setCallError(
        error instanceof Error ? error.message : "Unable to accept voice call.",
      );
    } finally {
      setIsCallActionLoading(false);
    }
  };

  const handleDeclineIncomingCall = async () => {
    try {
      setIsCallActionLoading(true);
      setCallError("");
      stopLocalAudio();
      await updateCallState("idle", null);
    } catch (error) {
      setCallError(
        error instanceof Error ? error.message : "Unable to decline voice call.",
      );
    } finally {
      setIsCallActionLoading(false);
    }
  };

  const handleHangUpVoiceCall = async () => {
    try {
      setIsCallActionLoading(true);
      setCallError("");
      stopLocalAudio();
      await updateCallState("idle", null);
    } catch (error) {
      setCallError(
        error instanceof Error ? error.message : "Unable to end voice call.",
      );
    } finally {
      setIsCallActionLoading(false);
    }
  };

  const handleEndSession = () => {
    setEndSessionPhase("confirm");
    setShowEndSessionModal(true);
  };

  const handleApproveEscrow = () => {
    window.alert("Signing transaction...");
    registerTimeout(() => {
      window.alert("0.005 ETH Claimed!");
      router.push("/therapist-portal");
    }, 1200);
  };

  const handleConfirmEndSession = () => {
    if (endSessionPhase !== "confirm") {
      return;
    }

    setEndSessionPhase("awaiting");

    registerTimeout(() => {
      setEndSessionPhase("success");

      registerTimeout(() => {
        router.push("/dashboard");
      }, 1500);
    }, 3000);
  };

  const isIncomingCall =
    voiceCallStatus === "ringing" &&
    Boolean(incomingCallerWallet) &&
    Boolean(currentWallet) &&
    incomingCallerWallet !== currentWallet;

  return (
    <main className="app-shell-subtle page-canvas page-canvas-violet relative overflow-hidden bg-background text-foreground">
      <div className="fixed left-1/2 top-6 z-50 w-[calc(100%-2rem)] max-w-6xl -translate-x-1/2">
        <header className="liquid-glass-floating flex items-center justify-between gap-4 rounded-full border border-black/[0.05] bg-white/70 px-5 py-3 backdrop-blur-[40px] backdrop-saturate-[1.8] dark:border-white/[0.08] dark:bg-[#1d1d1f]/70 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_16px_rgba(74,222,128,0.85)]" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--text-primary)] sm:text-base">
                  {isTherapist
                    ? "Patient: calm_ocean_22"
                    : therapistProfile.name}
                </p>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-[var(--text-muted)]">
                    {isTherapist
                      ? "Online"
                      : isLoadingTherapist
                        ? "Loading therapist..."
                        : therapistProfile.specialty}
                  </p>
                  {isTherapist ? (
                    <span className="glass-chip-muted px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      Anonymous
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="hidden items-center gap-2 rounded-full border border-black/[0.05] bg-black/5 px-4 py-2 text-sm text-[var(--text-secondary)] dark:border-white/[0.08] dark:bg-white/10 md:flex">
            <Lock className="h-4 w-4" />
            <span>End-to-End Encrypted (XMTP)</span>
          </div>

          <div className="flex items-center gap-2">
            <div className="rounded-full bg-black/5 px-3 py-1 font-mono text-sm text-[var(--text-secondary)] dark:bg-white/10">
              {formatCountdown(secondsLeft)}
            </div>
            <VoiceCallControls
              status={isIncomingCall ? "idle" : voiceCallStatus}
              onAccept={handleStartVoiceCall}
              onHangUp={handleHangUpVoiceCall}
              ringingLabel={isTherapist ? "Calling patient..." : "Calling therapist..."}
            />
            {isTherapist ? (
              <button
                type="button"
                onClick={handleApproveEscrow}
                className="button-primary inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium"
              >
                <span className="hidden sm:inline">Approve Escrow Release</span>
                <span className="sm:hidden">Approve</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleEndSession}
                className="inline-flex items-center gap-2 rounded-full bg-red-500 px-4 py-2 text-sm font-medium text-white shadow-[0_14px_32px_rgba(239,68,68,0.28)] transition hover:bg-red-400 disabled:cursor-wait disabled:opacity-80"
              >
                <span className="hidden sm:inline">
                  End Session &amp; Release 0.005 ETH
                </span>
                <span className="sm:hidden">End</span>
              </button>
            )}
          </div>
        </header>
      </div>

      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 pb-36 pt-32 md:px-8 md:pb-40 md:pt-36">
        <div className="flex-1 overflow-y-auto pb-6">
        <div className="mx-auto flex w-full flex-col gap-4">
            {callError ? (
              <div className="flex justify-center">
                <div className="liquid-glass-soft max-w-2xl rounded-full px-5 py-3 text-center text-sm text-red-600 dark:text-red-300">
                  {callError}
                </div>
              </div>
            ) : null}
            {!isTherapist && therapistError ? (
              <div className="flex justify-center">
                <div className="liquid-glass-soft max-w-2xl rounded-full px-5 py-3 text-center text-sm text-red-600 dark:text-red-300">
                  {therapistError}
                </div>
              </div>
            ) : null}
            {messages.map((message) => {
              if (message.role === "system") {
                return (
                  <div key={message.id} className="flex justify-center">
                    <div className="glass-chip max-w-2xl rounded-full px-5 py-3 text-center text-sm text-[var(--text-secondary)]">
                      {message.content}
                    </div>
                  </div>
                );
              }

              const isOwnMessage = isTherapist
                ? message.role === "therapist"
                : message.role === "patient";
              const authorLabel = message.role === "therapist" ? "Therapist" : "Patient";

              return (
                <div
                  key={message.id}
                  className={`flex ${isOwnMessage ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[min(82%,38rem)] rounded-[28px] px-5 py-4 shadow-lg ${
                      isOwnMessage
                        ? "bg-[linear-gradient(135deg,var(--accent-primary-strong),var(--accent-primary))] text-[var(--bg-primary)] shadow-[0_18px_36px_color-mix(in_srgb,var(--accent-primary)_24%,transparent)] dark:bg-[linear-gradient(135deg,#8f7aff,#7b61ff)]"
                        : "liquid-glass-soft text-[var(--text-primary)]"
                    }`}
                  >
                    {!isOwnMessage ? (
                      <p className="mb-2 text-xs uppercase tracking-[0.18em] text-[var(--text-faint)]">
                        {authorLabel}
                      </p>
                    ) : null}
                    <p className="text-sm leading-7">{message.content}</p>
                    <p
                      className={`mt-3 text-[11px] uppercase tracking-[0.18em] ${
                        isOwnMessage
                          ? "text-white/72 dark:text-white/70"
                          : "text-[var(--text-faint)]"
                      }`}
                    >
                      {message.time}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
        </div>
      </div>

      <div className="fixed bottom-6 left-1/2 z-50 w-[calc(100%-2rem)] max-w-5xl -translate-x-1/2">
        <form
          onSubmit={handleSend}
          className="liquid-glass-floating flex items-center gap-3 rounded-full border border-black/[0.05] bg-white/70 px-4 py-3 backdrop-blur-[40px] backdrop-saturate-[1.8] dark:border-white/[0.08] dark:bg-[#1d1d1f]/70 sm:px-5"
        >
          <button
            type="button"
            className="glass-chip-muted inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
            aria-label="Send anonymized record"
          >
            <AttachmentIcon />
          </button>
          <input
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Send an encrypted message..."
            className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="button-primary inline-flex h-11 w-11 items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-55"
            aria-label="Send message"
          >
            <SendIcon />
          </button>
        </form>
      </div>

      {showWarningModal ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-6 py-8 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[32px] border border-black/[0.05] bg-white/70 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-[40px] dark:border-white/[0.08] dark:bg-[#1d1d1f]/70 dark:shadow-[0_12px_40px_rgba(0,0,0,0.5)] sm:p-7">
            <p className="text-sm uppercase tracking-[0.24em] text-[var(--text-faint)]">
              Session Notice
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
              Session Wrapping Up
            </h2>
            <p className="mt-4 text-sm leading-7 text-[var(--text-muted)]">
              You have 10 minutes remaining in this session. Please begin
              summarizing your thoughts.
            </p>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setShowWarningModal(false)}
                className="button-primary rounded-full px-5 py-3 text-sm font-medium"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isIncomingCall ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-6 py-8 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[32px] border border-black/[0.05] bg-white/70 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-[40px] dark:border-white/[0.08] dark:bg-[#1d1d1f]/70 dark:shadow-[0_12px_40px_rgba(0,0,0,0.5)] sm:p-7">
            <p className="text-sm uppercase tracking-[0.24em] text-[var(--text-faint)]">
              Secure Voice Call
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
              Incoming Voice Call
            </h2>
            <p className="mt-4 text-sm leading-7 text-[var(--text-muted)]">
              {isTherapist
                ? "Your patient is requesting an encrypted voice call."
                : `${therapistProfile.name} is requesting an encrypted voice call.`}
            </p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={handleDeclineIncomingCall}
                disabled={isCallActionLoading}
                className="button-secondary rounded-full px-5 py-3 text-sm font-medium disabled:cursor-wait disabled:opacity-70"
              >
                Decline
              </button>
              <button
                type="button"
                onClick={handleAcceptIncomingCall}
                disabled={isCallActionLoading}
                className="button-primary rounded-full px-5 py-3 text-sm font-medium disabled:cursor-wait disabled:opacity-70"
              >
                {isCallActionLoading ? "Connecting..." : "Accept"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {!isTherapist && showEndSessionModal ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-6 py-8 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[32px] border border-black/[0.05] bg-white/70 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-[40px] dark:border-white/[0.08] dark:bg-[#1d1d1f]/70 dark:shadow-[0_12px_40px_rgba(0,0,0,0.5)] sm:p-7">
            {endSessionPhase === "confirm" ? (
              <>
                <p className="text-sm uppercase tracking-[0.24em] text-[var(--text-faint)]">
                  Escrow Release
                </p>
                <h2 className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
                  End Session &amp; Release Funds
                </h2>
                <p className="mt-4 text-sm leading-7 text-[var(--text-muted)]">
                  Are you sure you want to end this session? This will
                  permanently close the chat and authorize the smart contract to
                  release 0.005 ETH to {therapistProfile.name}.
                </p>
                <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setShowEndSessionModal(false)}
                    className="button-secondary rounded-full px-5 py-3 text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmEndSession}
                    className="rounded-full bg-red-500 px-5 py-3 text-sm font-medium text-white shadow-[0_14px_32px_rgba(239,68,68,0.28)] transition hover:bg-red-400"
                  >
                    Confirm &amp; Sign
                  </button>
                </div>
              </>
            ) : null}

            {endSessionPhase === "awaiting" ? (
              <div className="py-4 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-black/5 dark:bg-white/10">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--text-primary)] border-t-transparent" />
                </div>
                <h2 className="mt-5 text-2xl font-semibold text-[var(--text-primary)]">
                  Awaiting Therapist Approval...
                </h2>
                <p className="mt-3 text-sm leading-7 text-[var(--text-muted)]">
                  The therapist must also sign to finalize the session and
                  release the escrow.
                </p>
              </div>
            ) : null}

            {endSessionPhase === "success" ? (
              <div className="py-4 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
                  <Lock className="h-4 w-4" />
                </div>
                <h2 className="mt-5 text-2xl font-semibold text-[var(--text-primary)]">
                  Success! Therapist approved.
                </h2>
                <p className="mt-3 text-sm leading-7 text-[var(--text-muted)]">
                  0.005 ETH has been released.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <ChatRoomPage />
    </Suspense>
  );
}
