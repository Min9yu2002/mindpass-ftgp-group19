"use client";

import { Mic, MicOff, PhoneCall, PhoneOff } from "lucide-react";
import { useEffect, useState } from "react";

interface VoiceCallProps {
  status: "idle" | "ringing" | "connected";
  onAccept: () => void;
  onHangUp: () => void;
  ringingLabel?: string;
}

function formatCallTimer(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

export default function VoiceCallControls({
  status,
  onAccept,
  onHangUp,
  ringingLabel,
}: VoiceCallProps) {
  const [isMuted, setIsMuted] = useState(false);
  const [callSeconds, setCallSeconds] = useState(260);

  useEffect(() => {
    if (status !== "connected") {
      return;
    }

    const intervalId = window.setInterval(() => {
      setCallSeconds((current) => current + 1);
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [status]);
  const effectiveMuted = status === "idle" ? false : isMuted;
  const effectiveCallSeconds = status === "idle" ? 260 : callSeconds;

  if (status === "idle") {
    return (
      <button
        type="button"
        onClick={onAccept}
        className="group relative flex h-11 w-11 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/15 text-emerald-600 transition hover:bg-emerald-500 hover:text-black dark:text-emerald-300"
        aria-label="Start voice call"
      >
        <PhoneCall size={18} />
        <span className="absolute -top-10 scale-0 rounded-full bg-black/80 px-2 py-1 text-[11px] text-white transition-all group-hover:scale-100">
          Start Voice Call
        </span>
      </button>
    );
  }

  return (
    <div className="liquid-glass-soft flex items-center gap-3 rounded-full border border-black/[0.05] px-3 py-2 shadow-2xl dark:border-white/[0.08] sm:gap-4 sm:px-4">
      <button
        type="button"
        onClick={() => setIsMuted((current) => !current)}
        className={`flex h-10 w-10 items-center justify-center rounded-full transition ${
          effectiveMuted
            ? "bg-red-500/18 text-red-500 dark:text-red-300"
            : "bg-black/5 text-[var(--text-primary)] hover:bg-black/8 dark:bg-white/10 dark:hover:bg-white/16"
        }`}
        aria-label={effectiveMuted ? "Unmute microphone" : "Mute microphone"}
      >
        {effectiveMuted ? <MicOff size={18} /> : <Mic size={18} />}
      </button>

      <div className="flex flex-col items-center px-1 sm:px-2">
        <span className="text-[10px] uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">
          {status === "ringing"
            ? ringingLabel ?? "Incoming Call..."
            : "Live Voice Encrypted"}
        </span>
        <span className="font-mono text-sm text-[var(--text-primary)]">
          {formatCallTimer(effectiveCallSeconds)}
        </span>
      </div>

      <button
        type="button"
        onClick={onHangUp}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)] transition hover:scale-110 hover:bg-red-600"
        aria-label="End voice call"
      >
        <PhoneOff size={18} />
      </button>
    </div>
  );
}
