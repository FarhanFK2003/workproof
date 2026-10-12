-- WorkProof Milestone 2A: work records, client confirmation requests, and the
-- two database functions that are the only way to change a record's status.
--
-- Access model
--   * anon / authenticated (publishable key): no table or function access.
--     RLS is enabled with no policies, and all grants are revoked.
--   * service_role (secret key, server-only): SELECT on both tables, INSERT of
--     content columns on work_records, and EXECUTE on the two functions below.
--     No direct UPDATE or DELETE, so status transitions cannot skip the checks.
--   * Raw confirmation tokens are never stored; only their SHA-256 hex digests.
--
-- Run once in the Supabase SQL Editor. The editor runs the whole script in a
-- single implicit transaction, so a failure leaves nothing half-applied.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.work_records (
  id uuid primary key default gen_random_uuid(),

  title text not null
    constraint work_records_title_length check (char_length(btrim(title)) between 1 and 120),
  category text not null
    constraint work_records_category_valid check (
      category in ('Design', 'Development', 'Writing & content', 'Marketing', 'Consulting', 'Other')
    ),
  summary text not null
    constraint work_records_summary_length check (char_length(btrim(summary)) between 30 and 1000),
  deliverables text[] not null default '{}'
    constraint work_records_deliverables_count check (cardinality(deliverables) <= 20),
  start_date date not null,
  end_date date not null,

  -- Private client details: never public, never written on-chain.
  client_name text not null
    constraint work_records_client_name_length check (char_length(btrim(client_name)) between 1 and 120),
  client_organization text
    constraint work_records_client_org_length check (
      client_organization is null or char_length(btrim(client_organization)) between 1 and 160
    ),
  client_email text not null
    constraint work_records_client_email_format check (
      char_length(client_email) <= 254 and client_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ),

  -- Private. Stated by the freelancer; confirmation does not prove payment.
  amount numeric(12, 2)
    constraint work_records_amount_range check (amount is null or (amount > 0 and amount <= 100000000)),
  currency text
    constraint work_records_currency_valid check (currency is null or currency in ('USD', 'EUR', 'GBP')),

  status text not null default 'draft'
    constraint work_records_status_valid check (status in ('draft', 'pending', 'confirmed', 'disputed')),

  -- Client decision metadata, set only by submit_confirmation_decision().
  decided_by_name text
    constraint work_records_decided_by_length check (
      decided_by_name is null or char_length(btrim(decided_by_name)) between 1 and 120
    ),
  decision_note text
    constraint work_records_decision_note_length check (
      decision_note is null or char_length(decision_note) <= 1000
    ),
  decided_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint work_records_dates_ordered check (end_date >= start_date),
  constraint work_records_amount_has_currency check ((amount is null) = (currency is null)),
  constraint work_records_decision_complete check (
    (status in ('confirmed', 'disputed')) = (decided_at is not null and decided_by_name is not null)
  ),
  constraint work_records_dispute_has_reason check (
    status <> 'disputed' or char_length(btrim(coalesce(decision_note, ''))) >= 10
  )
);

comment on table public.work_records is
  'Freelancer work claims. Status changes only via issue_confirmation_request / submit_confirmation_decision.';

create index work_records_created_at_idx on public.work_records (created_at desc);

create table public.confirmation_requests (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.work_records (id) on delete cascade,
  -- SHA-256 hex digest of the raw token. The raw token is never stored.
  token_hash text not null unique
    constraint confirmation_requests_token_hash_format check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),

  constraint confirmation_requests_expiry_after_creation check (expires_at > created_at),
  constraint confirmation_requests_consumed_after_creation check (
    consumed_at is null or consumed_at >= created_at
  )
);

comment on table public.confirmation_requests is
  'Single-use client confirmation links. Stores only token hashes.';

-- Supports the foreign key (cascades, embedded selects) and per-record lookups.
create index confirmation_requests_record_id_idx on public.confirmation_requests (record_id);

-- At most one unused link per record at any time.
create unique index confirmation_requests_one_open_per_record
  on public.confirmation_requests (record_id)
  where consumed_at is null;

-- ---------------------------------------------------------------------------
-- Row Level Security and least-privilege grants
-- ---------------------------------------------------------------------------

alter table public.work_records enable row level security;
alter table public.confirmation_requests enable row level security;
-- No policies on purpose: anon and authenticated get no rows. service_role
-- bypasses RLS, so its access is limited by the grants below instead.

revoke all on table public.work_records, public.confirmation_requests
  from public, anon, authenticated, service_role;

grant select on table public.work_records, public.confirmation_requests to service_role;

-- Content columns only: new records always start as 'draft' with no decision.
grant insert (
  title, category, summary, deliverables, start_date, end_date,
  client_name, client_organization, client_email, amount, currency
) on table public.work_records to service_role;

-- ---------------------------------------------------------------------------
-- Functions (the only write paths for status and confirmation requests)
-- ---------------------------------------------------------------------------

-- Creates a new confirmation link for a draft or pending record, replacing any
-- unused previous link, and moves the record to 'pending'.
-- Returns 'issued' | 'not_found' | 'already_decided'.
create function public.issue_confirmation_request(
  p_record_id uuid,
  p_token_hash text,
  p_expires_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if p_record_id is null then
    raise exception 'record id is required' using errcode = '22023';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'token hash must be a SHA-256 hex digest' using errcode = '22023';
  end if;
  if p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + interval '30 days' then
    raise exception 'expiry must be in the future and within 30 days' using errcode = '22023';
  end if;

  -- Lock order everywhere: work_records row, then confirmation_requests rows.
  select status into v_status
  from public.work_records
  where id = p_record_id
  for update;

  if not found then
    return 'not_found';
  end if;
  if v_status not in ('draft', 'pending') then
    return 'already_decided';
  end if;

  delete from public.confirmation_requests
  where record_id = p_record_id and consumed_at is null;

  insert into public.confirmation_requests (record_id, token_hash, expires_at)
  values (p_record_id, p_token_hash, p_expires_at);

  update public.work_records
  set status = 'pending', updated_at = now()
  where id = p_record_id;

  return 'issued';
end;
$$;

-- Atomically consumes a valid token and records the client's decision.
-- Concurrent submissions for the same record serialize on the record row lock;
-- later ones see the consumed token and get 'already_used'.
-- outcome: 'recorded' | 'invalid' | 'expired' | 'already_used' | 'not_pending'.
create function public.submit_confirmation_decision(
  p_token_hash text,
  p_decision text,
  p_decided_by text,
  p_note text default null
)
returns table (outcome text, work_record_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_decided_by, ''));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_record_id uuid;
  v_request public.confirmation_requests%rowtype;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'token hash must be a SHA-256 hex digest' using errcode = '22023';
  end if;
  if p_decision is null or p_decision not in ('confirmed', 'disputed') then
    raise exception 'decision must be confirmed or disputed' using errcode = '22023';
  end if;
  if char_length(v_name) not between 1 and 120 then
    raise exception 'decided_by must be 1-120 characters' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'note must be at most 1000 characters' using errcode = '22023';
  end if;
  if p_decision = 'disputed' and char_length(coalesce(v_note, '')) < 10 then
    raise exception 'a dispute needs a reason of at least 10 characters' using errcode = '22023';
  end if;

  select cr.record_id into v_record_id
  from public.confirmation_requests cr
  where cr.token_hash = p_token_hash;

  if not found then
    return query select 'invalid'::text, null::uuid;
    return;
  end if;

  -- Same lock order as issue_confirmation_request: record first, then request.
  perform 1 from public.work_records wr where wr.id = v_record_id for update;

  select * into v_request
  from public.confirmation_requests cr
  where cr.token_hash = p_token_hash
  for update;

  if not found then
    -- Replaced by a newer link while we waited for the lock.
    return query select 'invalid'::text, null::uuid;
    return;
  end if;
  if v_request.consumed_at is not null then
    return query select 'already_used'::text, v_request.record_id;
    return;
  end if;
  if v_request.expires_at <= now() then
    return query select 'expired'::text, v_request.record_id;
    return;
  end if;

  update public.work_records wr
  set status = p_decision,
      decided_by_name = v_name,
      decision_note = v_note,
      decided_at = now(),
      updated_at = now()
  where wr.id = v_request.record_id and wr.status = 'pending';

  if not found then
    return query select 'not_pending'::text, v_request.record_id;
    return;
  end if;

  update public.confirmation_requests cr
  set consumed_at = now()
  where cr.id = v_request.id;

  return query select 'recorded'::text, v_request.record_id;
end;
$$;

-- Functions are executable by PUBLIC by default; restrict to service_role.
revoke all on function public.issue_confirmation_request(uuid, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.submit_confirmation_decision(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.issue_confirmation_request(uuid, text, timestamptz) to service_role;
grant execute on function public.submit_confirmation_decision(text, text, text, text) to service_role;
