export type ActivityItem = {
  id: string;
  title: string;
  detail: string;
  time: string;
  status: "Completed" | "Queued" | "In Review";
};

export const mockActivity: ActivityItem[] = [
  {
    id: "act-001",
    title: "Session escrow prepared",
    detail: "Patient deposit request staged for counselor payout split.",
    time: "5 min ago",
    status: "Completed",
  },
  {
    id: "act-002",
    title: "Therapist profile verified",
    detail: "Identity and specialty metadata passed internal review checks.",
    time: "22 min ago",
    status: "Completed",
  },
  {
    id: "act-003",
    title: "Gov code validation request",
    detail: "Document hash queued for verification workflow.",
    time: "1 hr ago",
    status: "Queued",
  },
  {
    id: "act-004",
    title: "Appointment intake synced",
    detail: "Mock request captured and waiting for counselor confirmation.",
    time: "Today",
    status: "In Review",
  },
];
