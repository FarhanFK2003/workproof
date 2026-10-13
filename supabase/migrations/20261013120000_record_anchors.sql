-- PROPOSED — NOT APPLIED. Review before running in the Supabase SQL Editor.
--
-- WorkProof Milestone 4: Monad testnet anchoring of client-confirmed records.
--
-- One row per anchored (or anchoring) record. work_records itself is unchanged:
-- "anchored" is derived from record_anchors.status = 'confirmed'.
--
-- Access model (same as the existing tables):
--   * anon / authenticated: no access.
--   * service_role: SELECT only. All writes go through the three functions
--     below, which enforce eligibility (record status = 'confirmed') and the
--     anchor state machine:
--
--       preparing ──submitted──▶ submitted ──confirmed──▶ confirmed (terminal)
--           │                        │
--           └────────failed◀─────────┘   failed ──submitted──▶ submitted (retry)
--
--   * The salt is random (128-bit) and private until the owner shares the
--     record's verification link. It makes the on-chain values unguessable.

create table public.record_anchors (
  record_id uuid primary key references public.work_records (id) on delete restrict,

  canonical_version text not null
    constraint record_anchors_version_valid check (canonical_version in ('workproof-record-v1')),
  salt text not null unique
    constraint record_anchors_salt_format check (salt ~ '^[0-9a-f]{32}$'),
  -- On-chain key: sha256("workproof-record-commitment-v1|" || record_id || "|" || salt).
  record_commitment text not null unique
    constraint record_anchors_commitment_format check (record_commitment ~ '^0x[0-9a-f]{64}$'),
  -- sha256 of the canonical record document (see lib/anchoring/canonical.ts).
  content_hash text not null
    constraint record_anchors_content_hash_format check (content_hash ~ '^0x[0-9a-f]{64}$'),

  status text not null default 'preparing'
    constraint record_anchors_status_valid check (status in ('preparing', 'submitted', 'confirmed', 'failed')),
  chain_id integer
    constraint record_anchors_chain_id_valid check (chain_id is null or chain_id > 0),
  contract_address text
    constraint record_anchors_contract_format check (contract_address is null or contract_address ~ '^0x[0-9a-f]{40}$'),
  tx_hash text unique
    constraint record_anchors_tx_hash_format check (tx_hash is null or tx_hash ~ '^0x[0-9a-f]{64}$'),
  block_number bigint
    constraint record_anchors_block_valid check (block_number is null or block_number >= 0),
  -- Short machine code only (e.g. 'reverted', 'rpc_timeout'); never raw RPC errors.
  failure_code text
    constraint record_anchors_failure_code_format check (failure_code is null or failure_code ~ '^[a-z_]{1,40}$'),
  attempts integer not null default 0
    constraint record_anchors_attempts_valid check (attempts between 0 and 100),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  confirmed_at timestamptz,

  constraint record_anchors_submission_complete check (
    status not in ('submitted', 'confirmed')
    or (tx_hash is not null and chain_id is not null and contract_address is not null and submitted_at is not null)
  ),
  constraint record_anchors_confirmation_complete check (
    (status = 'confirmed') = (confirmed_at is not null and block_number is not null)
  )
);

comment on table public.record_anchors is
  'Monad anchoring state for client-confirmed records. Writes only via the record anchor functions.';

alter table public.record_anchors enable row level security;
revoke all on table public.record_anchors from public, anon, authenticated, service_role;
grant select on table public.record_anchors to service_role;

-- ---------------------------------------------------------------------------
-- 1. Create the anchor row for a confirmed record, or return the existing one.
--    The primary key makes concurrent calls converge on a single salt/hash.
--    outcome: 'created' | 'exists' | 'not_found' | 'not_confirmed'
-- ---------------------------------------------------------------------------
create function public.begin_record_anchor(
  p_record_id uuid,
  p_canonical_version text,
  p_salt text,
  p_record_commitment text,
  p_content_hash text
)
returns table (
  outcome text,
  anchor_salt text,
  anchor_record_commitment text,
  anchor_content_hash text,
  anchor_status text,
  anchor_tx_hash text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_inserted boolean;
begin
  if p_record_id is null
     or p_canonical_version is distinct from 'workproof-record-v1'
     or p_salt !~ '^[0-9a-f]{32}$'
     or p_record_commitment !~ '^0x[0-9a-f]{64}$'
     or p_content_hash !~ '^0x[0-9a-f]{64}$' then
    raise exception 'invalid anchor parameters' using errcode = '22023';
  end if;

  -- Lock the record so its status cannot change while we decide.
  select wr.status into v_status from public.work_records wr where wr.id = p_record_id for share;
  if not found then
    return query select 'not_found'::text, null::text, null::text, null::text, null::text, null::text;
    return;
  end if;
  if v_status <> 'confirmed' then
    return query select 'not_confirmed'::text, null::text, null::text, null::text, null::text, null::text;
    return;
  end if;

  insert into public.record_anchors (record_id, canonical_version, salt, record_commitment, content_hash)
  values (p_record_id, p_canonical_version, p_salt, p_record_commitment, p_content_hash)
  on conflict (record_id) do nothing;
  v_inserted := found;

  return query
    select case when v_inserted then 'created' else 'exists' end,
           ra.salt, ra.record_commitment, ra.content_hash, ra.status, ra.tx_hash
    from public.record_anchors ra
    where ra.record_id = p_record_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Record a transaction hash, only after the RPC accepted the transaction.
--    Allowed from 'preparing' or 'failed' (retry). Never from 'submitted' or
--    'confirmed', so an in-flight or finished anchor is never overwritten.
--    returns: 'ok' | 'not_found' | 'invalid_state'
-- ---------------------------------------------------------------------------
create function public.mark_record_anchor_submitted(
  p_record_id uuid,
  p_tx_hash text,
  p_chain_id integer,
  p_contract_address text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if p_tx_hash !~ '^0x[0-9a-f]{64}$'
     or p_chain_id is null or p_chain_id <= 0
     or p_contract_address !~ '^0x[0-9a-f]{40}$' then
    raise exception 'invalid submission parameters' using errcode = '22023';
  end if;

  select ra.status into v_status from public.record_anchors ra where ra.record_id = p_record_id for update;
  if not found then
    return 'not_found';
  end if;
  if v_status not in ('preparing', 'failed') then
    return 'invalid_state';
  end if;

  update public.record_anchors ra
  set status = 'submitted',
      tx_hash = p_tx_hash,
      chain_id = p_chain_id,
      contract_address = p_contract_address,
      submitted_at = now(),
      failure_code = null,
      attempts = ra.attempts + 1,
      updated_at = now()
  where ra.record_id = p_record_id;
  return 'ok';
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Resolve an anchor from on-chain evidence.
--    'confirmed': from 'submitted' (same tx hash), or from 'preparing'/'failed'
--                 when reconciling an anchor found on-chain (tx details given).
--    'failed':    from 'preparing' or 'submitted'. 'confirmed' is terminal.
--    returns: 'ok' | 'not_found' | 'invalid_state'
-- ---------------------------------------------------------------------------
create function public.resolve_record_anchor(
  p_record_id uuid,
  p_outcome text,
  p_tx_hash text default null,
  p_chain_id integer default null,
  p_contract_address text default null,
  p_block_number bigint default null,
  p_failure_code text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.record_anchors%rowtype;
begin
  if p_outcome not in ('confirmed', 'failed') then
    raise exception 'outcome must be confirmed or failed' using errcode = '22023';
  end if;
  if p_outcome = 'confirmed' and (
       p_tx_hash !~ '^0x[0-9a-f]{64}$' or p_chain_id is null or p_chain_id <= 0
       or p_contract_address !~ '^0x[0-9a-f]{40}$' or p_block_number is null or p_block_number < 0) then
    raise exception 'confirmation needs tx hash, chain, contract, and block' using errcode = '22023';
  end if;
  if p_outcome = 'failed' and (p_failure_code is null or p_failure_code !~ '^[a-z_]{1,40}$') then
    raise exception 'failure needs a short failure code' using errcode = '22023';
  end if;

  select * into v_row from public.record_anchors ra where ra.record_id = p_record_id for update;
  if not found then
    return 'not_found';
  end if;
  if v_row.status = 'confirmed' then
    return 'invalid_state';
  end if;

  if p_outcome = 'confirmed' then
    if v_row.status = 'submitted' and v_row.tx_hash is distinct from p_tx_hash then
      return 'invalid_state';
    end if;
    update public.record_anchors ra
    set status = 'confirmed',
        tx_hash = p_tx_hash,
        chain_id = p_chain_id,
        contract_address = p_contract_address,
        block_number = p_block_number,
        submitted_at = coalesce(ra.submitted_at, now()),
        confirmed_at = now(),
        failure_code = null,
        updated_at = now()
    where ra.record_id = p_record_id;
  else
    if v_row.status not in ('preparing', 'submitted') then
      return 'invalid_state';
    end if;
    update public.record_anchors ra
    set status = 'failed',
        failure_code = p_failure_code,
        updated_at = now()
    where ra.record_id = p_record_id;
  end if;
  return 'ok';
end;
$$;

revoke all on function public.begin_record_anchor(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.mark_record_anchor_submitted(uuid, text, integer, text) from public, anon, authenticated;
revoke all on function public.resolve_record_anchor(uuid, text, text, integer, text, bigint, text) from public, anon, authenticated;
grant execute on function public.begin_record_anchor(uuid, text, text, text, text) to service_role;
grant execute on function public.mark_record_anchor_submitted(uuid, text, integer, text) to service_role;
grant execute on function public.resolve_record_anchor(uuid, text, text, integer, text, bigint, text) to service_role;
