BEGIN;

COMMENT ON COLUMN public.sessions.no_show_deadline_at IS
  'Local testing override: no-show deadline anchored to funded_at + 2 minutes while waiting for first valid participant interactions.';

CREATE OR REPLACE FUNCTION public.enforce_session_arrival_deadline_semantics()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.status NOT IN ('queued_waiting_for_provider', 'patient_cancelled_waiting') THEN
    IF OLD.patient_joined_at IS NOT NULL
       AND NEW.patient_joined_at IS DISTINCT FROM OLD.patient_joined_at THEN
      NEW.patient_joined_at := OLD.patient_joined_at;
    END IF;

    IF OLD.therapist_joined_at IS NOT NULL
       AND NEW.therapist_joined_at IS DISTINCT FROM OLD.therapist_joined_at THEN
      NEW.therapist_joined_at := OLD.therapist_joined_at;
    END IF;
  END IF;

  IF NEW.funded_at IS NOT NULL THEN
    NEW.no_show_deadline_at := NEW.funded_at + interval '2 minutes';
  ELSIF NEW.status IN (
    'requested',
    'accepted_awaiting_payment',
    'queued_waiting_for_provider',
    'patient_cancelled_waiting'
  ) THEN
    NEW.no_show_deadline_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

UPDATE public.sessions
SET no_show_deadline_at = funded_at + interval '2 minutes'
WHERE funded_at IS NOT NULL
  AND status IN ('funded', 'in_session')
  AND no_show_deadline_at IS DISTINCT FROM funded_at + interval '2 minutes';

COMMIT;
