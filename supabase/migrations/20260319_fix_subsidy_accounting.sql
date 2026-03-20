BEGIN;

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS subsidy_refunded_eth numeric(18, 18);

ALTER TABLE public.sessions
  ALTER COLUMN subsidy_refunded_eth SET DEFAULT 0;

UPDATE public.sessions
SET subsidy_refunded_eth = 0
WHERE subsidy_refunded_eth IS NULL;

ALTER TABLE public.sessions
  ALTER COLUMN subsidy_refunded_eth SET NOT NULL;

COMMENT ON COLUMN public.sessions.subsidy_funded_eth IS
  'Actual subsidy amount consumed from the patient subsidy balance once funding is finalized.';
COMMENT ON COLUMN public.sessions.subsidy_refunded_eth IS
  'Subsidy amount refunded back to the patient balance for refund-eligible terminal outcomes.';

CREATE OR REPLACE FUNCTION public.sync_session_subsidy_accounting()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  deduction_amount numeric(18, 18) := coalesce(NEW.subsidy_applied_eth, 0);
  effective_funded_amount numeric(18, 18) := coalesce(NEW.subsidy_funded_eth, 0);
  refundable_amount numeric(18, 18);
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Deduct subsidy only once real funding has happened. Request creation and queued
  -- planning metadata must not consume patient subsidy balance.
  IF deduction_amount > 0
     AND NEW.funded_at IS NOT NULL
     AND coalesce(NEW.subsidy_funded_eth, 0) = 0 THEN
    UPDATE public.patients
    SET subsidy_balance = coalesce(subsidy_balance, 0) - deduction_amount
    WHERE lower(wallet_address) = lower(NEW.patient_wallet)
      AND coalesce(subsidy_balance, 0) >= deduction_amount;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'Unable to deduct subsidy %. Session %, patient % has insufficient or missing subsidy balance.',
        deduction_amount,
        NEW.id,
        NEW.patient_wallet;
    END IF;

    UPDATE public.sessions
    SET subsidy_funded_eth = deduction_amount
    WHERE id = NEW.id
      AND coalesce(subsidy_funded_eth, 0) = 0;

    effective_funded_amount := deduction_amount;
  END IF;

  refundable_amount := greatest(
    0::numeric,
    effective_funded_amount - coalesce(NEW.subsidy_refunded_eth, 0)
  );

  -- Refund subsidy only for terminal outcomes that unwind a funded session.
  -- Completed sessions keep subsidy consumed, and patient_no_show is intentionally
  -- treated as consumed / not refunded in this patch.
  IF refundable_amount > 0
     AND NEW.status IN (
       'rejected',
       'payment_timeout',
       'therapist_no_show',
       'patient_cancelled_waiting',
       'cancelled_unstarted'
     ) THEN
    UPDATE public.patients
    SET subsidy_balance = coalesce(subsidy_balance, 0) + refundable_amount
    WHERE lower(wallet_address) = lower(NEW.patient_wallet);

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'Unable to refund subsidy %. Session %, patient % row is missing.',
        refundable_amount,
        NEW.id,
        NEW.patient_wallet;
    END IF;

    UPDATE public.sessions
    SET subsidy_refunded_eth = coalesce(subsidy_refunded_eth, 0) + refundable_amount
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sessions_sync_subsidy_accounting ON public.sessions;
CREATE TRIGGER trg_sessions_sync_subsidy_accounting
AFTER INSERT OR UPDATE ON public.sessions
FOR EACH ROW
EXECUTE FUNCTION public.sync_session_subsidy_accounting();

COMMIT;
