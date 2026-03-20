BEGIN;

CREATE OR REPLACE FUNCTION public.prepare_provider_wait_queue_session()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  provider_is_busy boolean := false;
  entering_wait_queue boolean := false;
  entering_cancelled_waiting boolean := false;
BEGIN
  IF coalesce(trim(NEW.therapist_wallet), '') = '' THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'requested' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.sessions s
      WHERE lower(s.therapist_wallet) = lower(NEW.therapist_wallet)
        AND s.status IN ('funded', 'in_session')
        AND (TG_OP = 'INSERT' OR s.id <> NEW.id)
    )
    INTO provider_is_busy;

    IF provider_is_busy THEN
      NEW.status := 'queued_waiting_for_provider';
    END IF;
  END IF;

  entering_wait_queue :=
    NEW.status = 'queued_waiting_for_provider'
    AND (
      TG_OP = 'INSERT'
      OR OLD.status IS DISTINCT FROM 'queued_waiting_for_provider'
    );

  entering_cancelled_waiting :=
    NEW.status = 'patient_cancelled_waiting'
    AND (
      TG_OP = 'INSERT'
      OR OLD.status IS DISTINCT FROM 'patient_cancelled_waiting'
    );

  IF entering_wait_queue THEN
    NEW.queue_entered_at := coalesce(NEW.queue_entered_at, now());
    NEW.queue_position := NULL;
    NEW.estimated_ready_at := NULL;
    NEW.provider_accepted_at := NULL;
    NEW.payment_due_at := NULL;
    NEW.patient_paid_at := NULL;
    NEW.funded_at := NULL;
    NEW.no_show_deadline_at := NULL;
    NEW.patient_joined_at := NULL;
    NEW.therapist_joined_at := NULL;
    NEW.session_started_at := NULL;
    NEW.settlement_status := coalesce(nullif(NEW.settlement_status, ''), 'pending');
  ELSIF entering_cancelled_waiting THEN
    NEW.patient_cancelled_waiting_at :=
      coalesce(NEW.patient_cancelled_waiting_at, now());
    NEW.queue_position := NULL;
    NEW.estimated_ready_at := NULL;
    NEW.settlement_status := 'cancelled';
    NEW.provider_accepted_at := NULL;
    NEW.payment_due_at := NULL;
    NEW.patient_paid_at := NULL;
    NEW.funded_at := NULL;
    NEW.no_show_deadline_at := NULL;
    NEW.patient_joined_at := NULL;
    NEW.therapist_joined_at := NULL;
    NEW.session_started_at := NULL;
  ELSIF NEW.status IS DISTINCT FROM 'queued_waiting_for_provider' THEN
    NEW.queue_position := NULL;
    NEW.estimated_ready_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
