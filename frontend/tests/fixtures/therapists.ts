export type TherapistFixture = {
  id: string;
  wallet_address: string;
  full_name: string | null;
  legal_name: string | null;
  specialty: string | null;
  clinical_specialty: string | null;
  bio: string | null;
  languages: string[];
  supported_modes: string[];
  is_online: boolean;
  ekyc_status: "verified" | "pending";
  sbt_minted: boolean;
};

export const verifiedTherapistFixture: TherapistFixture = {
  id: "therapist-eliana",
  wallet_address: "0x8Ec7F2F349111B2443A6C68691344B7d53d5B2cD",
  full_name: "Dr. Eliana Park",
  legal_name: null,
  specialty: "Anxiety Specialist",
  clinical_specialty: null,
  bio: "Professional Web3 Therapist",
  languages: ["English", "Mandarin"],
  supported_modes: ["voice", "text"],
  is_online: true,
  ekyc_status: "verified",
  sbt_minted: true,
};

export const legacyTherapistFixture: TherapistFixture = {
  id: "therapist-legacy",
  wallet_address: "0xc9f33cfe9676bb67397b8688991b02f865353485",
  full_name: null,
  legal_name: "Mingyu_test",
  specialty: null,
  clinical_specialty: "Anxiety",
  bio: "Legacy therapist profile",
  languages: ["Mandarin", "Japanese"],
  supported_modes: ["text"],
  is_online: false,
  ekyc_status: "verified",
  sbt_minted: true,
};
