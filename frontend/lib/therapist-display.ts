type TherapistDisplaySource = {
  full_name?: string | null;
  legal_name?: string | null;
  specialty?: string | null;
  clinical_specialty?: string | null;
};

function pickDisplayValue(
  ...values: Array<string | null | undefined>
) {
  for (const value of values) {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

export function getTherapistDisplayName(therapist: TherapistDisplaySource) {
  return (
    pickDisplayValue(
      therapist.full_name,
      therapist.legal_name,
      "Anonymous Provider",
    ) || "Anonymous Provider"
  );
}

export function getTherapistDisplaySpecialty(
  therapist: TherapistDisplaySource,
) {
  return (
    pickDisplayValue(
      therapist.specialty,
      therapist.clinical_specialty,
      "General Specialist",
    ) || "General Specialist"
  );
}
