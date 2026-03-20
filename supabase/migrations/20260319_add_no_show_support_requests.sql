BEGIN;

ALTER TABLE public.therapists
  ADD COLUMN IF NOT EXISTS no_show_flag_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mutual_unstarted_flag_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.therapists.no_show_flag_count IS
  'Count of therapist-side no-show outcomes recorded for this provider.';
COMMENT ON COLUMN public.therapists.mutual_unstarted_flag_count IS
  'Count of mutual-unstarted outcomes recorded for this provider.';

CREATE TABLE IF NOT EXISTS public.support_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  reporter_wallet text NOT NULL,
  reporter_role text NOT NULL CHECK (reporter_role IN ('patient', 'therapist')),
  issue_type text NOT NULL,
  message text,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.support_requests IS
  'Support request intake records submitted from session outcome and contact-us flows.';
COMMENT ON COLUMN public.support_requests.issue_type IS
  'Frontend-selected support issue category.';
COMMENT ON COLUMN public.support_requests.status IS
  'MVP support workflow state. Defaults to open.';

CREATE INDEX IF NOT EXISTS support_requests_session_idx
  ON public.support_requests (session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS support_requests_reporter_idx
  ON public.support_requests (reporter_wallet, created_at DESC);

CREATE OR REPLACE FUNCTION public.sync_therapist_reliability_flags()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'therapist_no_show' THEN
    UPDATE public.therapists
    SET no_show_flag_count = coalesce(no_show_flag_count, 0) + 1
    WHERE lower(wallet_address) = lower(NEW.therapist_wallet);
  ELSIF NEW.status = 'mutual_unstarted' THEN
    UPDATE public.therapists
    SET mutual_unstarted_flag_count = coalesce(mutual_unstarted_flag_count, 0) + 1
    WHERE lower(wallet_address) = lower(NEW.therapist_wallet);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sessions_sync_therapist_reliability_flags ON public.sessions;
CREATE TRIGGER trg_sessions_sync_therapist_reliability_flags
AFTER UPDATE OF status ON public.sessions
FOR EACH ROW
EXECUTE FUNCTION public.sync_therapist_reliability_flags();

COMMIT;
