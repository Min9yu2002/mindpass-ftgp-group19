"use client";

import { useEffect, useMemo, useState } from "react";
import { readSessionContext, type SessionContext } from "./session";

export type RequiredSessionRole = "patient" | "therapist";
export type WagmiAuthStatus =
  | "connecting"
  | "reconnecting"
  | "connected"
  | "disconnected";
export type AuthResolutionState =
  | "pending"
  | "authorized"
  | "blocked"
  | "redirect";

export type StoredSessionSnapshot = {
  activeSession: RequiredSessionRole | null;
  patientWallet: string;
  therapistWallet: string;
  hasPatientProfile: boolean;
  hasTherapistProfile: boolean;
};

export type PageSessionGuard = {
  hasClientHydrated: boolean;
  hasReadLocalSession: boolean;
  authResolutionState: AuthResolutionState;
  resolvedWalletAddress: string;
  sessionContext: SessionContext | null;
  storedSession: StoredSessionSnapshot;
};

export const SESSION_RECONNECT_GRACE_MS = 5000;

const EMPTY_STORED_SESSION: StoredSessionSnapshot = {
  activeSession: null,
  patientWallet: "",
  therapistWallet: "",
  hasPatientProfile: false,
  hasTherapistProfile: false,
};

function normalizeWalletAddress(value?: string | null) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeActiveSession(value?: string | null): RequiredSessionRole | null {
  return value === "patient" || value === "therapist" ? value : null;
}

function readStoredWallet(
  profileKey: "mindpass-patient-profile" | "mindpass-therapist-profile",
) {
  if (typeof window === "undefined") {
    return "";
  }

  const storedProfile = window.localStorage.getItem(profileKey);
  if (!storedProfile) {
    return "";
  }

  try {
    const parsedProfile = JSON.parse(storedProfile) as { walletAddress?: string };
    return normalizeWalletAddress(parsedProfile.walletAddress);
  } catch {
    return "";
  }
}

export function readStoredSessionSnapshot(): StoredSessionSnapshot {
  if (typeof window === "undefined") {
    return EMPTY_STORED_SESSION;
  }

  const activeSession = normalizeActiveSession(
    window.localStorage.getItem("mindpass-active-session"),
  );
  const patientWallet = readStoredWallet("mindpass-patient-profile");
  const therapistWallet = readStoredWallet("mindpass-therapist-profile");

  return {
    activeSession,
    patientWallet,
    therapistWallet,
    hasPatientProfile: Boolean(patientWallet),
    hasTherapistProfile: Boolean(therapistWallet),
  };
}

function isTransientWagmiStatus(status: WagmiAuthStatus) {
  return status === "connecting" || status === "reconnecting";
}

export function usePageSessionGuard(options: {
  requiredRole: RequiredSessionRole;
  address?: string | null;
  wagmiStatus: WagmiAuthStatus;
}): PageSessionGuard {
  const [snapshotState, setSnapshotState] = useState(() => ({
    hasClientHydrated: false,
    hasReadLocalSession: false,
    storedSession: EMPTY_STORED_SESSION,
  }));
  const [expiredGraceKey, setExpiredGraceKey] = useState("");

  useEffect(() => {
    const syncStoredSession = () => {
      setSnapshotState({
        hasClientHydrated: true,
        hasReadLocalSession: true,
        storedSession: readStoredSessionSnapshot(),
      });
    };
    const frameId = window.requestAnimationFrame(syncStoredSession);

    const handleStorage = (event: StorageEvent) => {
      if (
        event.key === null ||
        event.key === "mindpass-active-session" ||
        event.key === "mindpass-patient-profile" ||
        event.key === "mindpass-therapist-profile"
      ) {
        syncStoredSession();
      }
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(
      "mindpass-session-changed",
      syncStoredSession as EventListener,
    );

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(
        "mindpass-session-changed",
        syncStoredSession as EventListener,
      );
    };
  }, []);

  const hasClientHydrated = snapshotState.hasClientHydrated;
  const hasReadLocalSession = snapshotState.hasReadLocalSession;
  const storedSession = snapshotState.storedSession;

  const hasRelevantStoredSession =
    options.requiredRole === "patient"
      ? storedSession.activeSession === "patient" &&
        storedSession.hasPatientProfile
      : storedSession.activeSession === "therapist" &&
        storedSession.hasTherapistProfile;

  const hasCrossRoleStoredSession =
    options.requiredRole === "patient"
      ? storedSession.activeSession === "therapist" &&
        storedSession.hasTherapistProfile
      : storedSession.activeSession === "patient" &&
        storedSession.hasPatientProfile;

  const reconnectGraceKey =
    hasRelevantStoredSession &&
    !options.address &&
    options.wagmiStatus === "disconnected"
      ? [
          options.requiredRole,
          storedSession.activeSession ?? "",
          storedSession.patientWallet,
          storedSession.therapistWallet,
        ].join(":")
      : "";

  useEffect(() => {
    if (!reconnectGraceKey) {
      return;
    }

    if (expiredGraceKey === reconnectGraceKey) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setExpiredGraceKey(reconnectGraceKey);
    }, SESSION_RECONNECT_GRACE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    expiredGraceKey,
    reconnectGraceKey,
  ]);

  const disconnectedGraceExpired = !reconnectGraceKey || expiredGraceKey === reconnectGraceKey;

  const sessionContext = useMemo(() => {
    if (!hasReadLocalSession || !options.address) {
      return null;
    }

    return readSessionContext(options.address);
  }, [hasReadLocalSession, options.address]);

  const authResolutionState = useMemo<AuthResolutionState>(() => {
    if (!hasClientHydrated || !hasReadLocalSession) {
      return "pending";
    }

    if (hasCrossRoleStoredSession) {
      return "blocked";
    }

    if (isTransientWagmiStatus(options.wagmiStatus)) {
      return "pending";
    }

    if (hasRelevantStoredSession && !options.address && !disconnectedGraceExpired) {
      return "pending";
    }

    if (sessionContext?.userRole === options.requiredRole) {
      return "authorized";
    }

    if (hasRelevantStoredSession) {
      return "redirect";
    }

    return "redirect";
  }, [
    disconnectedGraceExpired,
    hasClientHydrated,
    hasCrossRoleStoredSession,
    hasReadLocalSession,
    hasRelevantStoredSession,
    options.address,
    options.requiredRole,
    options.wagmiStatus,
    sessionContext,
  ]);

  const resolvedWalletAddress =
    authResolutionState === "authorized"
      ? options.requiredRole === "patient"
        ? sessionContext?.patientWallet ?? ""
        : sessionContext?.therapistWallet ?? ""
      : "";

  return {
    hasClientHydrated,
    hasReadLocalSession,
    authResolutionState,
    resolvedWalletAddress,
    sessionContext,
    storedSession,
  };
}
