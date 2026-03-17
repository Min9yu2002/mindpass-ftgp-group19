export type UserRole = "guest" | "unscoped" | "patient" | "therapist";

export type SessionContext = {
  userRole: UserRole;
  activeSession: string | null;
  patientWallet: string;
  therapistWallet: string;
};

function readStoredWallet(profileKey: "mindpass-patient-profile" | "mindpass-therapist-profile") {
  if (typeof window === "undefined") {
    return "";
  }

  const storedProfile = window.localStorage.getItem(profileKey);
  if (!storedProfile) {
    return "";
  }

  try {
    const parsedProfile = JSON.parse(storedProfile) as {
      walletAddress?: string;
    };

    return String(parsedProfile.walletAddress ?? "").trim();
  } catch {
    return "";
  }
}

export function readSessionContext(address?: string | null): SessionContext {
  const patientWallet = readStoredWallet("mindpass-patient-profile");
  const therapistWallet = readStoredWallet("mindpass-therapist-profile");

  if (typeof window === "undefined") {
    return {
      userRole: "guest",
      activeSession: null,
      patientWallet,
      therapistWallet,
    };
  }

  const activeSession = window.localStorage.getItem("mindpass-active-session");

  if (!address) {
    return {
      userRole: "guest",
      activeSession,
      patientWallet,
      therapistWallet,
    };
  }

  const normalizedAddress = address.toLowerCase();

  if (
    activeSession === "patient" &&
    patientWallet &&
    patientWallet.toLowerCase() === normalizedAddress
  ) {
    return {
      userRole: "patient",
      activeSession,
      patientWallet,
      therapistWallet,
    };
  }

  if (
    activeSession === "therapist" &&
    therapistWallet &&
    therapistWallet.toLowerCase() === normalizedAddress
  ) {
    return {
      userRole: "therapist",
      activeSession,
      patientWallet,
      therapistWallet,
    };
  }

  return {
    userRole: "unscoped",
    activeSession,
    patientWallet,
    therapistWallet,
  };
}
