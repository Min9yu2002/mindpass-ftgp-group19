type TherapistDisplaySource = {
  full_name?: string | null;
  legal_name?: string | null;
  specialty?: string | null;
  clinical_specialty?: string | null;
};

export function getTherapistDisplayName(therapist: TherapistDisplaySource) {
  return (
    String(
      therapist.full_name ?? therapist.legal_name ?? "Anonymous Provider",
    ) || "Anonymous Provider"
  );
}

export function getTherapistDisplaySpecialty(
  therapist: TherapistDisplaySource,
) {
  return (
    String(
      therapist.specialty ??
        therapist.clinical_specialty ??
        "General Specialist",
    ) || "General Specialist"
  );
}
