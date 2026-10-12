-- Verification for migration 20261012200000_work_records_and_confirmations.sql
--
-- Run in the Supabase SQL Editor AFTER applying the migration. It checks the
-- privilege model and exercises both functions on throwaway rows, which are
-- deleted at the end. Any failed check raises an error that names the check;
-- if every check passes, the final query returns a single "passed" row.
-- Concurrency (two simultaneous submissions) cannot be simulated from one
-- session; it relies on the row locks documented in the migration.

do $$
declare
  h1 constant text := repeat('a', 64);
  h2 constant text := repeat('b', 64);
  h3 constant text := repeat('c', 64);
  v_id uuid;
  v_id2 uuid;
  v_text text;
  v_outcome text;
  v_status text;
  v_count int;
  v_raised boolean;
begin
  -- 1. RLS on, no policies -------------------------------------------------
  if not (select relrowsecurity from pg_class where oid = 'public.work_records'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.confirmation_requests'::regclass) then
    raise exception 'CHECK FAILED: RLS must be enabled on both tables';
  end if;
  select count(*) into v_count from pg_policies
  where schemaname = 'public' and tablename in ('work_records', 'confirmation_requests');
  if v_count <> 0 then
    raise exception 'CHECK FAILED: expected no RLS policies, found %', v_count;
  end if;

  -- 2. Public roles have no access -----------------------------------------
  if has_any_column_privilege('anon', 'public.work_records', 'select')
     or has_any_column_privilege('anon', 'public.work_records', 'insert')
     or has_any_column_privilege('authenticated', 'public.work_records', 'select')
     or has_any_column_privilege('anon', 'public.confirmation_requests', 'select')
     or has_any_column_privilege('authenticated', 'public.confirmation_requests', 'select') then
    raise exception 'CHECK FAILED: anon/authenticated must not have table access';
  end if;
  if has_function_privilege('anon', 'public.submit_confirmation_decision(text,text,text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.submit_confirmation_decision(text,text,text,text)', 'execute')
     or has_function_privilege('anon', 'public.issue_confirmation_request(uuid,text,timestamptz)', 'execute')
     or has_function_privilege('authenticated', 'public.issue_confirmation_request(uuid,text,timestamptz)', 'execute') then
    raise exception 'CHECK FAILED: anon/authenticated must not execute the functions';
  end if;

  -- 3. service_role is limited to the intended operations ------------------
  if not has_table_privilege('service_role', 'public.work_records', 'select')
     or not has_table_privilege('service_role', 'public.confirmation_requests', 'select')
     or not has_column_privilege('service_role', 'public.work_records', 'title', 'insert')
     or has_column_privilege('service_role', 'public.work_records', 'status', 'insert')
     or has_column_privilege('service_role', 'public.work_records', 'decided_at', 'insert')
     or has_any_column_privilege('service_role', 'public.work_records', 'update')
     or has_table_privilege('service_role', 'public.work_records', 'delete')
     or has_any_column_privilege('service_role', 'public.confirmation_requests', 'insert')
     or has_any_column_privilege('service_role', 'public.confirmation_requests', 'update')
     or has_table_privilege('service_role', 'public.confirmation_requests', 'delete') then
    raise exception 'CHECK FAILED: service_role privileges are broader or narrower than intended';
  end if;
  if not has_function_privilege('service_role', 'public.submit_confirmation_decision(text,text,text,text)', 'execute')
     or not has_function_privilege('service_role', 'public.issue_confirmation_request(uuid,text,timestamptz)', 'execute') then
    raise exception 'CHECK FAILED: service_role must execute both functions';
  end if;

  -- 4. Insert as service_role: new records start as draft ------------------
  execute 'set local role service_role';
  insert into public.work_records (title, category, summary, start_date, end_date, client_name, client_email)
  values ('VERIFY test record', 'Other', 'Verification row created by verify_20261012200000.sql',
          '2026-01-01', '2026-01-31', 'Verify Client', 'verify@example.com')
  returning id into v_id;

  v_raised := false;
  begin
    update public.work_records set status = 'confirmed' where id = v_id;
  exception when insufficient_privilege then
    v_raised := true;
  end;
  execute 'reset role';
  if not v_raised then
    raise exception 'CHECK FAILED: service_role must not update work_records directly';
  end if;

  select status into v_status from public.work_records where id = v_id;
  if v_status <> 'draft' then
    raise exception 'CHECK FAILED: new record status is %, expected draft', v_status;
  end if;

  -- 5. Table constraints -----------------------------------------------------
  v_raised := false;
  begin
    insert into public.work_records (title, category, summary, start_date, end_date, client_name, client_email)
    values ('VERIFY bad dates', 'Other', 'End date before start date should be rejected.',
            '2026-02-01', '2026-01-01', 'Verify Client', 'verify@example.com');
  exception when check_violation then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'CHECK FAILED: end_date before start_date must be rejected';
  end if;

  -- 6. Unknown token ---------------------------------------------------------
  select outcome into v_outcome from public.submit_confirmation_decision(h1, 'confirmed', 'Verify Client');
  if v_outcome <> 'invalid' then
    raise exception 'CHECK FAILED: unknown token returned %, expected invalid', v_outcome;
  end if;

  -- 7. Issue, then reissue (old link must stop working) ---------------------
  v_text := public.issue_confirmation_request(v_id, h1, now() + interval '14 days');
  select status into v_status from public.work_records where id = v_id;
  if v_text <> 'issued' or v_status <> 'pending' then
    raise exception 'CHECK FAILED: issue returned % / status %', v_text, v_status;
  end if;

  v_text := public.issue_confirmation_request(v_id, h2, now() + interval '14 days');
  select count(*) into v_count from public.confirmation_requests where record_id = v_id and consumed_at is null;
  if v_text <> 'issued' or v_count <> 1 then
    raise exception 'CHECK FAILED: reissue should leave exactly one open link (found %)', v_count;
  end if;
  select outcome into v_outcome from public.submit_confirmation_decision(h1, 'confirmed', 'Verify Client');
  if v_outcome <> 'invalid' then
    raise exception 'CHECK FAILED: replaced link returned %, expected invalid', v_outcome;
  end if;

  -- 8. Expiry beyond 30 days is rejected ------------------------------------
  v_raised := false;
  begin
    perform public.issue_confirmation_request(v_id, h3, now() + interval '31 days');
  exception when invalid_parameter_value then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'CHECK FAILED: expiry over 30 days must be rejected';
  end if;

  -- 9. Dispute without a reason is rejected ---------------------------------
  v_raised := false;
  begin
    perform public.submit_confirmation_decision(h2, 'disputed', 'Verify Client', 'short');
  exception when invalid_parameter_value then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'CHECK FAILED: dispute with a short reason must be rejected';
  end if;

  -- 10. Confirm once, then the token is spent -------------------------------
  select outcome into v_outcome from public.submit_confirmation_decision(h2, 'confirmed', '  Verify Client  ');
  if v_outcome <> 'recorded' then
    raise exception 'CHECK FAILED: valid confirmation returned %', v_outcome;
  end if;
  select status, decided_by_name into v_status, v_text from public.work_records where id = v_id;
  if v_status <> 'confirmed' or v_text <> 'Verify Client' then
    raise exception 'CHECK FAILED: record not confirmed correctly (status %, name %)', v_status, v_text;
  end if;
  if (select consumed_at from public.confirmation_requests where token_hash = h2) is null then
    raise exception 'CHECK FAILED: token was not marked consumed';
  end if;

  select outcome into v_outcome from public.submit_confirmation_decision(h2, 'disputed', 'Someone Else', 'Trying to overturn the decision');
  if v_outcome <> 'already_used' then
    raise exception 'CHECK FAILED: reused token returned %, expected already_used', v_outcome;
  end if;

  v_text := public.issue_confirmation_request(v_id, h3, now() + interval '14 days');
  if v_text <> 'already_decided' then
    raise exception 'CHECK FAILED: issuing for a decided record returned %', v_text;
  end if;

  -- 11. Expired token ---------------------------------------------------------
  insert into public.work_records (title, category, summary, start_date, end_date, client_name, client_email, status)
  values ('VERIFY expired', 'Other', 'Verification row for an expired confirmation link.',
          '2026-01-01', '2026-01-31', 'Verify Client', 'verify@example.com', 'pending')
  returning id into v_id2;
  insert into public.confirmation_requests (record_id, token_hash, expires_at, created_at)
  values (v_id2, h3, now() - interval '1 day', now() - interval '15 days');

  select outcome into v_outcome from public.submit_confirmation_decision(h3, 'confirmed', 'Verify Client');
  if v_outcome <> 'expired' then
    raise exception 'CHECK FAILED: expired token returned %, expected expired', v_outcome;
  end if;

  -- Cleanup (confirmation_requests cascade).
  delete from public.work_records where id in (v_id, v_id2);
end;
$$;

select 'passed' as verification_result;
