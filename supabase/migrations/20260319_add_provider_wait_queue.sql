BEGIN;

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS queue_entered_at timestamptz,
  ADD COLUMN IF NOT EXISTS estimated_ready_at timestamptz,
  ADD COLUMN IF NOT EXISTS queue_position integer,
  ADD COLUMN IF NOT EXISTS patient_cancelled_waiting_at timestamptz;

COMMENT ON COLUMN public.sessions.queue_entered_at IS
  'When the patient entered the provider wait queue.';
COMMENT ON COLUMN public.sessions.estimated_ready_at IS
  'First-pass estimate for when the provider should be ready to review or start this queued request.';
COMMENT ON COLUMN public.sessions.queue_position IS
  'Current queue position among waiting requests for the same provider.';
COMMENT ON COLUMN public.sessions.patient_cancelled_waiting_at IS
  'When the patient explicitly left the provider wait queue without penalty.';

CREATE INDEX IF NOT EXISTS sessions_provider_wait_queue_idx
  ON public.sessions (therapist_wallet, status, queue_position, queue_entered_at);

CREATE INDEX IF NOT EXISTS sessions_patient_wait_queue_idx
  ON public.sessions (patient_wallet, status, queue_entered_at DESC);

CREATE OR REPLACE FUNCTION public.provider_wait_queue_anchor(
  p_therapist_wallet text
)
RETURNS timestamptz
LANGUAGE plpgsql
AS $$
DECLARE
  ready_anchor timestamptz;
BEGIN
  SELECT
    CASE
      WHEN s.status = 'in_session' AND s.session_started_at IS NOT NULL THEN
        greatest(now(), s.session_started_at + interval '50 minutes')
      WHEN s.status = 'funded' AND s.no_show_deadline_at IS NOT NULL THEN
        greatest(now(), s.no_show_deadline_at)
      WHEN s.status = 'funded' AND s.funded_at IS NOT NULL THEN
        greatest(now(), s.funded_at + interval '50 minutes')
      ELSE
        now() + interval '50 minutes'
    END
  INTO ready_anchor
  FROM public.sessions s
  WHERE lower(s.therapist_wallet) = lower(p_therapist_wallet)
    AND s.status IN ('funded', 'in_session')
  ORDER BY
    CASE WHEN s.status = 'in_session' THEN 0 ELSE 1 END,
    coalesce(s.session_started_at, s.funded_at, s.no_show_deadline_at, s.created_at) ASC
  LIMIT 1;

  RETURN ready_anchor;
END;
$$;

CREATE OR REPLACE FUNCTION public.rebuild_provider_wait_queue(
  p_therapist_wallet text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  has_busy_session boolean;
  ready_anchor timestamptz;
  promoted_session_id uuid;
  queue_index integer := 0;
  queued_session record;
  next_estimated_ready_at timestamptz;
BEGIN
  IF coalesce(trim(p_therapist_wallet), '') = '' THEN
    RETURN;
  END IF;

  ready_anchor := public.provider_wait_queue_anchor(p_therapist_wallet);
  has_busy_session := ready_anchor IS NOT NULL;

  IF NOT has_busy_session THEN
    SELECT s.id
    INTO promoted_session_id
    FROM public.sessions s
    WHERE lower(s.therapist_wallet) = lower(p_therapist_wallet)
      AND s.status = 'queued_waiting_for_provider'
    ORDER BY coalesce(s.queue_entered_at, s.created_at) ASC, s.created_at ASC
    LIMIT 1;

    IF promoted_session_id IS NOT NULL THEN
      UPDATE public.sessions
      SET
        status = 'requested',
        queue_position = NULL,
        estimated_ready_at = NULL,
        updated_at = now()
      WHERE id = promoted_session_id
        AND status = 'queued_waiting_for_provider';
    END IF;

    ready_anchor := now();
  END IF;

  FOR queued_session IN
    SELECT s.id, s.queue_position, s.estimated_ready_at, s.queue_entered_at
    FROM public.sessions s
    WHERE lower(s.therapist_wallet) = lower(p_therapist_wallet)
      AND s.status = 'queued_waiting_for_provider'
    ORDER BY coalesce(s.queue_entered_at, s.created_at) ASC, s.created_at ASC
  LOOP
    queue_index := queue_index + 1;
    next_estimated_ready_at :=
      ready_anchor + make_interval(mins => CASE
        WHEN has_busy_session THEN (queue_index - 1) * 50
        ELSE queue_index * 50
      END);

    UPDATE public.sessions
    SET
      queue_position = queue_index,
      estimated_ready_at = next_estimated_ready_at,
      queue_entered_at = coalesce(queue_entered_at, created_at, now()),
      updated_at = now()
    WHERE id = queued_session.id
      AND (
        queue_position IS DISTINCT FROM queue_index
        OR estimated_ready_at IS DISTINCT FROM next_estimated_ready_at
        OR queue_entered_at IS NULL
      );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_provider_wait_queue_session()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  provider_is_busy boolean := false;
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

  IF NEW.status = 'queued_waiting_for_provider' THEN
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
  ELSIF NEW.status = 'patient_cancelled_waiting' THEN
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
  ELSE
    NEW.queue_position := NULL;
    NEW.estimated_ready_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_provider_wait_queue()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  new_wallet text := '';
  old_wallet text := '';
BEGIN
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    new_wallet := lower(coalesce(NEW.therapist_wallet, ''));
  END IF;

  IF TG_OP <> 'INSERT' THEN
    old_wallet := lower(coalesce(OLD.therapist_wallet, ''));
  END IF;

  IF old_wallet <> '' THEN
    PERFORM public.rebuild_provider_wait_queue(old_wallet);
  END IF;

  IF new_wallet <> '' AND new_wallet IS DISTINCT FROM old_wallet THEN
    PERFORM public.rebuild_provider_wait_queue(new_wallet);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prepare_provider_wait_queue_session ON public.sessions;
CREATE TRIGGER trg_prepare_provider_wait_queue_session
BEFORE INSERT OR UPDATE ON public.sessions
FOR EACH ROW
EXECUTE FUNCTION public.prepare_provider_wait_queue_session();

DROP TRIGGER IF EXISTS trg_sync_provider_wait_queue ON public.sessions;
CREATE TRIGGER trg_sync_provider_wait_queue
AFTER INSERT OR UPDATE OR DELETE ON public.sessions
FOR EACH ROW
EXECUTE FUNCTION public.sync_provider_wait_queue();

COMMIT;
