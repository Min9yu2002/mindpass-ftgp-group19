BEGIN;

create table if not exists public.session_end_requests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,

  requested_by_wallet text not null,
  requested_by_role text not null check (requested_by_role in ('patient', 'therapist')),

  target_wallet text not null,
  target_role text not null check (target_role in ('patient', 'therapist')),

  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),

  requester_confirmed_at timestamptz not null default now(),
  target_responded_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  cancelled_at timestamptz,
  expired_at timestamptz,

  target_response_text text,
  requester_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists session_end_requests_session_idx
  on public.session_end_requests (session_id, created_at desc);

create index if not exists session_end_requests_target_idx
  on public.session_end_requests (target_wallet, status, created_at desc);

create index if not exists session_end_requests_requester_idx
  on public.session_end_requests (requested_by_wallet, status, created_at desc);

create unique index if not exists session_end_requests_one_pending_per_session_idx
  on public.session_end_requests (session_id)
  where status = 'pending';

create or replace function public.set_updated_at_session_end_requests()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_session_end_requests_set_updated_at
  on public.session_end_requests;

create trigger trg_session_end_requests_set_updated_at
before update on public.session_end_requests
for each row
execute function public.set_updated_at_session_end_requests();

COMMIT;
