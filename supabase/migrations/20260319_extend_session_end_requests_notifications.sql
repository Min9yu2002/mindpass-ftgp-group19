BEGIN;

ALTER TABLE public.session_end_requests
  ADD COLUMN IF NOT EXISTS receiver_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS modal_presented_at timestamptz,
  ADD COLUMN IF NOT EXISTS notification_sent_at timestamptz;

COMMENT ON COLUMN public.session_end_requests.receiver_seen_at IS
  'When the target participant first viewed the end-session request.';
COMMENT ON COLUMN public.session_end_requests.modal_presented_at IS
  'When the responder modal was first auto-presented in chat.';
COMMENT ON COLUMN public.session_end_requests.notification_sent_at IS
  'Reserved marker for cross-page notification surfacing.';

CREATE INDEX IF NOT EXISTS session_end_requests_target_unread_idx
  ON public.session_end_requests (target_wallet, status, receiver_seen_at, created_at DESC);

COMMIT;
