BEGIN;

ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_status_chk;

ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_status_chk CHECK (
    status IN (
      'requested',
      'accepted_awaiting_payment',
      'funded',
      'in_session',
      'completed',
      'rejected',
      'payment_timeout',
      'patient_no_show',
      'therapist_no_show',
      'queued_waiting_for_provider',
      'patient_cancelled_waiting',
      'mutual_unstarted'
    )
  );

COMMIT;
