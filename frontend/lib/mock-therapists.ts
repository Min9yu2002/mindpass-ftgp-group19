export type Therapist = {
  id: string;
  name: string;
  specialty: string;
  languages: string[];
  bio: string;
  isOnline: boolean;
  availability: string;
  rating: number;
  mode: "Voice" | "Text" | "Hybrid" | "Not Available";
  walletAddress?: string;
  supportedModes?: ("Voice" | "Text")[];
};

export const mockTherapists: Therapist[] = [
  {
    id: "th-001",
    name: "Dr. Eliana Park",
    specialty: "Anxiety and burnout recovery",
    languages: ["English", "Korean"],
    bio: "Warm, structured support for anxiety, burnout, and emotional overload. Focuses on calm pacing and practical coping tools for high-pressure routines.",
    isOnline: true,
    availability: "Next opening in 2 hours",
    rating: 4.9,
    mode: "Hybrid",
    walletAddress: "0x8Ec7F2F349111B2443A6C68691344B7d53d5B2cD",
    supportedModes: ["Voice", "Text"],
  },
  {
    id: "th-002",
    name: "Marcus Lin, LPC",
    specialty: "Career stress and transition support",
    languages: ["English", "Mandarin"],
    bio: "Works with patients navigating work stress, identity shifts, and major life transitions using grounded reflection and short-term strategy work.",
    isOnline: false,
    availability: "Open tomorrow morning",
    rating: 4.8,
    mode: "Voice",
    walletAddress: "0x4f7d28c3A25B3bbCea4A2B30dD4811aE6cD27191",
    supportedModes: ["Voice"],
  },
  {
    id: "th-003",
    name: "Dr. Sofia Alvarez",
    specialty: "Trauma-informed counseling",
    languages: ["English", "Spanish"],
    bio: "Trauma-informed therapist with a gentle, consent-first style. Helps patients rebuild emotional safety before moving into deeper support work.",
    isOnline: true,
    availability: "Weekend slots available",
    rating: 4.95,
    mode: "Text",
    walletAddress: "0x5e5D2A6fa4E988a4D4280A4cbC147F5c98b97D7A",
    supportedModes: ["Text"],
  },
];
