import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";

export type SessionEndRequestParticipantRole = "patient" | "therapist";
export type SessionEndRequestStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "cancelled"
  | "expired";

export type SessionEndRequestNotification = {
  id: string;
  sessionId: string;
  requestedByWallet: string;
  requestedByRole: SessionEndRequestParticipantRole;
  targetWallet: string;
  targetRole: SessionEndRequestParticipantRole;
  status: SessionEndRequestStatus;
  receiverSeenAt: string | null;
  modalPresentedAt: string | null;
  notificationSentAt: string | null;
  targetRespondedAt: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
  targetResponseText: string | null;
  requesterNote: string | null;
  createdAt: string | null;
};

const SESSION_END_REQUEST_SELECT =
  "id, session_id, requested_by_wallet, requested_by_role, target_wallet, target_role, status, receiver_seen_at, modal_presented_at, notification_sent_at, target_responded_at, accepted_at, declined_at, target_response_text, requester_note, created_at";

function normalizeParticipantRole(
  value: unknown,
  fallback: SessionEndRequestParticipantRole = "patient",
): SessionEndRequestParticipantRole {
  if (value === "patient" || value === "therapist") {
    return value;
  }

  return fallback;
}

function normalizeSessionEndRequestStatus(
  value: unknown,
): SessionEndRequestStatus {
  switch (value) {
    case "accepted":
    case "declined":
    case "cancelled":
    case "expired":
      return value;
    default:
      return "pending";
  }
}

export function normalizeSessionEndRequestNotification(
  row: Record<string, unknown>,
): SessionEndRequestNotification {
  return {
    id: String(row.id ?? ""),
    sessionId: String(row.session_id ?? ""),
    requestedByWallet: String(row.requested_by_wallet ?? "").toLowerCase(),
    requestedByRole: normalizeParticipantRole(row.requested_by_role, "patient"),
    targetWallet: String(row.target_wallet ?? "").toLowerCase(),
    targetRole: normalizeParticipantRole(row.target_role, "therapist"),
    status: normalizeSessionEndRequestStatus(row.status),
    receiverSeenAt:
      typeof row.receiver_seen_at === "string" ? row.receiver_seen_at : null,
    modalPresentedAt:
      typeof row.modal_presented_at === "string" ? row.modal_presented_at : null,
    notificationSentAt:
      typeof row.notification_sent_at === "string"
        ? row.notification_sent_at
        : null,
    targetRespondedAt:
      typeof row.target_responded_at === "string" ? row.target_responded_at : null,
    acceptedAt: typeof row.accepted_at === "string" ? row.accepted_at : null,
    declinedAt: typeof row.declined_at === "string" ? row.declined_at : null,
    targetResponseText:
      typeof row.target_response_text === "string" ? row.target_response_text : null,
    requesterNote:
      typeof row.requester_note === "string" ? row.requester_note : null,
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
  };
}

function upsertNotificationInList(
  current: SessionEndRequestNotification[],
  nextNotification: SessionEndRequestNotification,
) {
  const nextNotifications = current.filter(
    (notification) => notification.id !== nextNotification.id,
  );
  nextNotifications.unshift(nextNotification);
  return nextNotifications.sort((left, right) => {
    return (
      new Date(right.createdAt ?? 0).getTime() -
      new Date(left.createdAt ?? 0).getTime()
    );
  });
}

export async function fetchPendingSessionEndRequestsForWallet(walletAddress: string) {
  if (!supabase) {
    throw new Error("Supabase client is unavailable.");
  }

  const normalizedWallet = walletAddress.trim().toLowerCase();
  if (!normalizedWallet) {
    return [];
  }

  const { data, error } = await supabase
    .from("session_end_requests")
    .select(SESSION_END_REQUEST_SELECT)
    .eq("status", "pending")
    .eq("target_wallet", normalizedWallet)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) =>
    normalizeSessionEndRequestNotification(row as Record<string, unknown>),
  );
}

export async function markSessionEndRequestSeen(
  notification: SessionEndRequestNotification,
  options?: {
    includeModalPresented?: boolean;
    includeNotificationSent?: boolean;
  },
) {
  if (!supabase || notification.status !== "pending") {
    return notification;
  }

  const updates: Record<string, string> = {};
  const now = new Date().toISOString();

  if (!notification.receiverSeenAt) {
    updates.receiver_seen_at = now;
  }

  if (options?.includeModalPresented && !notification.modalPresentedAt) {
    updates.modal_presented_at = now;
  }

  if (options?.includeNotificationSent && !notification.notificationSentAt) {
    updates.notification_sent_at = now;
  }

  if (Object.keys(updates).length === 0) {
    return notification;
  }

  const { data, error } = await supabase
    .from("session_end_requests")
    .update(updates)
    .eq("id", notification.id)
    .eq("status", "pending")
    .select(SESSION_END_REQUEST_SELECT)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data
    ? normalizeSessionEndRequestNotification(data as Record<string, unknown>)
    : notification;
}

export async function markSessionEndRequestNotificationSurfaced(
  notification: SessionEndRequestNotification,
) {
  if (
    !supabase ||
    notification.status !== "pending" ||
    notification.notificationSentAt
  ) {
    return notification;
  }

  const { data, error } = await supabase
    .from("session_end_requests")
    .update({
      notification_sent_at: new Date().toISOString(),
    })
    .eq("id", notification.id)
    .eq("status", "pending")
    .is("notification_sent_at", null)
    .select(SESSION_END_REQUEST_SELECT)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data
    ? normalizeSessionEndRequestNotification(data as Record<string, unknown>)
    : notification;
}

export function buildSessionEndRequestChatHref(
  notification: Pick<SessionEndRequestNotification, "sessionId">,
  role: SessionEndRequestParticipantRole,
) {
  return `/chat?role=${encodeURIComponent(role)}&sessionId=${encodeURIComponent(
    notification.sessionId,
  )}`;
}

export function useSessionEndRequestNotifications(params: {
  walletAddress?: string | null;
  enabled?: boolean;
}) {
  const normalizedWallet = String(params.walletAddress ?? "").trim().toLowerCase();
  const enabled = Boolean(params.enabled && normalizedWallet && supabase);
  const [notifications, setNotifications] = useState<
    SessionEndRequestNotification[]
  >([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    if (!enabled || !normalizedWallet) {
      setNotifications([]);
      setErrorMessage("");
      setIsLoading(false);
      return;
    }

    let isCancelled = false;

    const loadNotifications = async () => {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const nextNotifications = await fetchPendingSessionEndRequestsForWallet(
          normalizedWallet,
        );

        if (isCancelled) {
          return;
        }

        setNotifications(nextNotifications);

        const unsentNotifications = nextNotifications.filter(
          (notification) => !notification.notificationSentAt,
        );

        if (unsentNotifications.length > 0) {
          void Promise.all(
            unsentNotifications.map(async (notification) => {
              try {
                const updatedNotification =
                  await markSessionEndRequestNotificationSurfaced(notification);

                if (!isCancelled) {
                  setNotifications((current) =>
                    current.map((currentNotification) =>
                      currentNotification.id === updatedNotification.id
                        ? updatedNotification
                        : currentNotification,
                    ),
                  );
                }
              } catch (error) {
                console.error(
                  "Failed to mark session end request notification as surfaced",
                  error,
                );
              }
            }),
          );
        }
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to load session end notifications.",
          );
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadNotifications();

    return () => {
      isCancelled = true;
    };
  }, [enabled, normalizedWallet, refreshNonce]);

  useEffect(() => {
    if (!enabled || !supabase || !normalizedWallet) {
      return;
    }

    const channel = supabase.channel(
      `session-end-request-notifications:${normalizedWallet}`,
    );
    const refreshNotifications = () => {
      setRefreshNonce((current) => current + 1);
    };

    channel
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "session_end_requests",
          filter: `target_wallet=eq.${normalizedWallet}`,
        },
        refreshNotifications,
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "session_end_requests",
          filter: `target_wallet=eq.${normalizedWallet}`,
        },
        refreshNotifications,
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "session_end_requests",
          filter: `target_wallet=eq.${normalizedWallet}`,
        },
        refreshNotifications,
      )
      .subscribe();

    return () => {
      void channel.unsubscribe();
    };
  }, [enabled, normalizedWallet]);

  const unreadCount = useMemo(
    () =>
      notifications.filter(
        (notification) =>
          notification.status === "pending" && !notification.receiverSeenAt,
      ).length,
    [notifications],
  );

  const markNotificationSeen = async (
    notification: SessionEndRequestNotification,
    options?: {
      includeModalPresented?: boolean;
      includeNotificationSent?: boolean;
    },
  ) => {
    try {
      const updatedNotification = await markSessionEndRequestSeen(
        notification,
        options,
      );

      setNotifications((current) =>
        current.map((currentNotification) =>
          currentNotification.id === updatedNotification.id
            ? updatedNotification
            : currentNotification,
        ),
      );

      return updatedNotification;
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to update session end notification state.",
      );
      return notification;
    }
  };

  const upsertNotification = (notification: SessionEndRequestNotification) => {
    setNotifications((current) =>
      upsertNotificationInList(current, notification),
    );
  };

  return {
    notifications,
    unreadCount,
    isLoading,
    errorMessage,
    markNotificationSeen,
    upsertNotification,
  };
}
