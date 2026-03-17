"use client";

import { useRouter } from "next/navigation";

export default function TherapistDirectoryCta() {
  const router = useRouter();

  const handleClick = () => {
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
      router.push("/dashboard");
      return;
    }

    router.push("/auth");
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="button-primary inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-medium"
    >
      Book Session
    </button>
  );
}
