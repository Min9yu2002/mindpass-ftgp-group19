BEGIN;

CREATE OR REPLACE FUNCTION public.sync_session_subsidy_accounting()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  deduction_amount numeric(18, 18) := coalesce(NEW.subsidy_applied_eth, 0);
  effective_funded_amount numeric(18, 18) := coalesce(NEW.subsidy_funded_eth, 0);
  effective_wallet_funded_amount numeric(18, 18) := coalesce(NEW.wallet_funded_eth, 0);
  target_subsidy_refund_total numeric(18, 18) := 0;
  target_wallet_refund_total numeric(18, 18) := 0;
  target_total_refund_total numeric(18, 18) := 0;
  refundable_subsidy_amount numeric(18, 18);
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

  IF NEW.status = 'mutual_unstarted' THEN
    target_subsidy_refund_total := round(effective_funded_amount * 0.8, 18);
    target_wallet_refund_total := round(effective_wallet_funded_amount * 0.8, 18);
  ELSIF NEW.status = 'patient_no_show' THEN
    target_subsidy_refund_total := round(effective_funded_amount * 0.5, 18);
    target_wallet_refund_total := round(effective_wallet_funded_amount * 0.5, 18);
  ELSIF NEW.status IN (
    'rejected',
    'payment_timeout',
    'therapist_no_show',
    'patient_cancelled_waiting',
    'cancelled_unstarted'
  ) THEN
    target_subsidy_refund_total := effective_funded_amount;
    target_wallet_refund_total := effective_wallet_funded_amount;
  END IF;

  target_total_refund_total := target_subsidy_refund_total + target_wallet_refund_total;

  refundable_subsidy_amount := greatest(
    0::numeric,
    target_subsidy_refund_total - coalesce(NEW.subsidy_refunded_eth, 0)
  );

  IF refundable_subsidy_amount > 0 THEN
    UPDATE public.patients
    SET subsidy_balance = coalesce(subsidy_balance, 0) + refundable_subsidy_amount
    WHERE lower(wallet_address) = lower(NEW.patient_wallet);

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'Unable to refund subsidy %. Session %, patient % row is missing.',
        refundable_subsidy_amount,
        NEW.id,
        NEW.patient_wallet;
    END IF;
  END IF;

  IF refundable_subsidy_amount > 0
     OR target_wallet_refund_total IS DISTINCT FROM coalesce(NEW.patient_refund_eth, 0)
     OR target_subsidy_refund_total IS DISTINCT FROM coalesce(NEW.vault_refund_eth, 0)
     OR target_total_refund_total IS DISTINCT FROM coalesce(NEW.total_refund_eth, 0) THEN
    UPDATE public.sessions
    SET
      subsidy_refunded_eth = coalesce(subsidy_refunded_eth, 0) + refundable_subsidy_amount,
      patient_refund_eth = target_wallet_refund_total,
      vault_refund_eth = target_subsidy_refund_total,
      total_refund_eth = target_total_refund_total
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

WITH refund_targets AS (
  SELECT
    s.id,
    CASE
      WHEN s.status = 'mutual_unstarted' THEN round(coalesce(s.wallet_funded_eth, 0) * 0.8, 18)
      WHEN s.status = 'patient_no_show' THEN round(coalesce(s.wallet_funded_eth, 0) * 0.5, 18)
      WHEN s.status IN (
        'rejected',
        'payment_timeout',
        'therapist_no_show',
        'patient_cancelled_waiting',
        'cancelled_unstarted'
      ) THEN coalesce(s.wallet_funded_eth, 0)
      ELSE 0::numeric
    END AS target_wallet_refund_total,
    CASE
      WHEN s.status = 'mutual_unstarted' THEN round(coalesce(s.subsidy_funded_eth, 0) * 0.8, 18)
      WHEN s.status = 'patient_no_show' THEN round(coalesce(s.subsidy_funded_eth, 0) * 0.5, 18)
      WHEN s.status IN (
        'rejected',
        'payment_timeout',
        'therapist_no_show',
        'patient_cancelled_waiting',
        'cancelled_unstarted'
      ) THEN coalesce(s.subsidy_funded_eth, 0)
      ELSE 0::numeric
    END AS target_subsidy_refund_total
  FROM public.sessions s
  WHERE s.status IN (
    'mutual_unstarted',
    'patient_no_show',
    'rejected',
    'payment_timeout',
    'therapist_no_show',
    'patient_cancelled_waiting',
    'cancelled_unstarted'
  )
)
UPDATE public.sessions s
SET
  patient_refund_eth = refund_targets.target_wallet_refund_total,
  vault_refund_eth = refund_targets.target_subsidy_refund_total,
  total_refund_eth = refund_targets.target_wallet_refund_total + refund_targets.target_subsidy_refund_total
FROM refund_targets
WHERE s.id = refund_targets.id
  AND (
    coalesce(s.patient_refund_eth, 0) IS DISTINCT FROM refund_targets.target_wallet_refund_total
    OR coalesce(s.vault_refund_eth, 0) IS DISTINCT FROM refund_targets.target_subsidy_refund_total
    OR coalesce(s.total_refund_eth, 0) IS DISTINCT FROM refund_targets.target_wallet_refund_total + refund_targets.target_subsidy_refund_total
  );

COMMIT;
