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
    target_subsidy_refund_total := round(effective_funded_amount * 0.8, 18);
    target_wallet_refund_total := round(effective_wallet_funded_amount * 0.8, 18);
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

WITH patient_no_show_refund_targets AS (
  SELECT
    s.id,
    round(coalesce(s.wallet_funded_eth, 0) * 0.8, 18) AS target_wallet_refund_total,
    round(coalesce(s.subsidy_funded_eth, 0) * 0.8, 18) AS target_subsidy_refund_total
  FROM public.sessions s
  WHERE s.status = 'patient_no_show'
)
UPDATE public.sessions s
SET
  patient_refund_eth = patient_no_show_refund_targets.target_wallet_refund_total,
  vault_refund_eth = patient_no_show_refund_targets.target_subsidy_refund_total,
  total_refund_eth = patient_no_show_refund_targets.target_wallet_refund_total + patient_no_show_refund_targets.target_subsidy_refund_total
FROM patient_no_show_refund_targets
WHERE s.id = patient_no_show_refund_targets.id
  AND (
    coalesce(s.patient_refund_eth, 0) IS DISTINCT FROM patient_no_show_refund_targets.target_wallet_refund_total
    OR coalesce(s.vault_refund_eth, 0) IS DISTINCT FROM patient_no_show_refund_targets.target_subsidy_refund_total
    OR coalesce(s.total_refund_eth, 0) IS DISTINCT FROM patient_no_show_refund_targets.target_wallet_refund_total + patient_no_show_refund_targets.target_subsidy_refund_total
  );

WITH eligible_refunds AS (
  SELECT
    s.id,
    lower(s.patient_wallet) AS patient_wallet_key,
    greatest(
      0::numeric,
      round(coalesce(s.subsidy_funded_eth, 0) * 0.8, 18) - coalesce(s.subsidy_refunded_eth, 0)
    ) AS refund_increment
  FROM public.sessions s
  WHERE s.status = 'patient_no_show'
    AND coalesce(s.subsidy_funded_eth, 0) > 0
),
patient_refunds AS (
  SELECT
    patient_wallet_key,
    sum(refund_increment) AS total_refund_increment
  FROM eligible_refunds
  WHERE refund_increment > 0
  GROUP BY patient_wallet_key
)
UPDATE public.patients p
SET subsidy_balance = coalesce(p.subsidy_balance, 0) + patient_refunds.total_refund_increment
FROM patient_refunds
WHERE lower(p.wallet_address) = patient_refunds.patient_wallet_key;

WITH eligible_refunds AS (
  SELECT
    s.id,
    greatest(
      0::numeric,
      round(coalesce(s.subsidy_funded_eth, 0) * 0.8, 18) - coalesce(s.subsidy_refunded_eth, 0)
    ) AS refund_increment
  FROM public.sessions s
  WHERE s.status = 'patient_no_show'
    AND coalesce(s.subsidy_funded_eth, 0) > 0
)
UPDATE public.sessions s
SET subsidy_refunded_eth = coalesce(s.subsidy_refunded_eth, 0) + eligible_refunds.refund_increment
FROM eligible_refunds
WHERE s.id = eligible_refunds.id
  AND eligible_refunds.refund_increment > 0;

COMMIT;
