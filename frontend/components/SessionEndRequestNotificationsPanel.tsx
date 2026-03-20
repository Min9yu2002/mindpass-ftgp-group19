"use client";

import GlassCard from "./GlassCard";
import SectionHeading from "./SectionHeading";
import StatusBadge from "./StatusBadge";
import type { SessionEndRequestNotification } from "../lib/session-end-request-notifications";

type SessionEndRequestNotificationsPanelProps = {
  eyebrow: string;
  title: string;
  roleLabel: string;
  notifications: SessionEndRequestNotification[];
  unreadCount: number;
  isLoading?: boolean;
  errorMessage?: string;
  emptyMessage: string;
  onOpenChat: (notification: SessionEndRequestNotification) => void;
};

function formatRelativeTime(value?: string | null) {
  if (!value) {
    return "Recently";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }

  const diffMinutes = Math.round((date.getTime() - Date.now()) / 60000);
  const diffHours = Math.round((date.getTime() - Date.now()) / 3600000);
  const diffDays = Math.round((date.getTime() - Date.now()) / 86400000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (Math.abs(diffMinutes) < 60) {
    return rtf.format(diffMinutes, "minute");
  }

  if (Math.abs(diffHours) < 24) {
    return rtf.format(diffHours, "hour");
  }

  return rtf.format(diffDays, "day");
}

function formatShortSessionId(value: string) {
  if (!value) {
    return "Unknown session";
  }

  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

export default function SessionEndRequestNotificationsPanel({
  eyebrow,
  title,
  roleLabel,
  notifications,
  unreadCount,
  isLoading = false,
  errorMessage = "",
  emptyMessage,
  onOpenChat,
}: SessionEndRequestNotificationsPanelProps) {
  const badgeLabel =
    unreadCount > 0 ? `${unreadCount} unread` : notifications.length > 0 ? "Seen" : "Clear";

  return (
    <GlassCard className="glass-panel border border-black/10 p-6 shadow-[0_14px_36px_rgba(15,23,42,0.14)] dark:border-white/[0.08] dark:shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
      <div className="mb-6 flex items-center justify-between gap-4">
        <SectionHeading eyebrow={eyebrow} title={title} />
        <StatusBadge
          label={badgeLabel}
          tone={unreadCount > 0 ? "warning" : notifications.length > 0 ? "neutral" : "success"}
        />
      </div>

      {errorMessage ? (
        <div className="liquid-glass-soft mb-4 rounded-[22px] border border-red-400/20 bg-red-500/8 px-4 py-4">
          <p className="text-sm text-red-600 dark:text-red-300">{errorMessage}</p>
        </div>
      ) : null}

      {isLoading ? (
        <div className="liquid-glass-soft rounded-[22px] px-4 py-4">
          <p className="text-sm text-slate-700 dark:text-[var(--text-muted)]">
            Loading end-session notifications...
          </p>
        </div>
      ) : null}

      {!isLoading && notifications.length === 0 ? (
        <div className="liquid-glass-soft rounded-[22px] px-4 py-4">
          <p className="text-sm text-slate-700 dark:text-[var(--text-muted)]">
            {emptyMessage}
          </p>
        </div>
      ) : null}

      <div className="space-y-3">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className="liquid-glass-soft rounded-[22px] border border-white/5 px-4 py-4"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-faint)]">
                  Session {formatShortSessionId(notification.sessionId)}
                </p>
                <p className="mt-2 text-base font-semibold text-slate-900 dark:text-white">
                  {notification.requestedByRole === "therapist"
                    ? "Therapist requested session end"
                    : "Patient requested session end"}
                </p>
                <p className="mt-2 text-sm text-slate-700 dark:text-[var(--text-muted)]">
                  Pending for the {roleLabel}. Created {formatRelativeTime(notification.createdAt)}.
                </p>
              </div>

              <div className="flex min-w-[180px] flex-col items-start gap-3 sm:items-end">
                <StatusBadge
                  label={notification.receiverSeenAt ? "Seen" : "Unread"}
                  tone={notification.receiverSeenAt ? "neutral" : "warning"}
                />
                <button
                  type="button"
                  onClick={() => onOpenChat(notification)}
                  className="button-primary rounded-full px-5 py-3 text-sm font-medium"
                >
                  Open chat
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
