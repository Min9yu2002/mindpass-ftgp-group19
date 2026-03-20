BEGIN;

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'sessions'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%settlement_status%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.sessions DROP CONSTRAINT %I',
      constraint_name
    );
  END LOOP;
END;
$$;

ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_settlement_status_chk CHECK (
    settlement_status IS NULL OR settlement_status IN (
      'pending',
      'awaiting_patient_payment',
      'held_in_escrow',
      'released_to_therapist',
      'cancelled',
      'penalty_paid_to_therapist',
      'refunded_to_patient',
      'mutual_unstarted_platform_fee'
    )
  );

COMMIT;
