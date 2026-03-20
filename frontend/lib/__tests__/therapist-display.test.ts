import test from "node:test";
import assert from "node:assert/strict";

import {
  getTherapistDisplayName,
  getTherapistDisplaySpecialty,
} from "../therapist-display.ts";
import {
  legacyTherapistFixture,
  verifiedTherapistFixture,
} from "../../tests/fixtures/therapists.ts";

test("therapist display prefers full_name and specialty when present", () => {
  assert.equal(getTherapistDisplayName(verifiedTherapistFixture), "Dr. Eliana Park");
  assert.equal(
    getTherapistDisplaySpecialty(verifiedTherapistFixture),
    "Anxiety Specialist",
  );
});

test("therapist display falls back to legal_name and clinical_specialty for legacy rows", () => {
  assert.equal(getTherapistDisplayName(legacyTherapistFixture), "Mingyu_test");
  assert.equal(getTherapistDisplaySpecialty(legacyTherapistFixture), "Anxiety");
});

test("therapist display ends at safe defaults when all name/specialty fields are empty", () => {
  assert.equal(getTherapistDisplayName({}), "Anonymous Provider");
  assert.equal(getTherapistDisplaySpecialty({}), "General Specialist");
});
