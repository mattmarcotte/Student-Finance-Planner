-- Rollback-backed test using two synthetic accounts.
begin;
select set_config('test.ask_owner', gen_random_uuid()::text, true);
select set_config('test.ask_other', gen_random_uuid()::text, true);
insert into auth.users(id) values
  (current_setting('test.ask_owner')::uuid), (current_setting('test.ask_other')::uuid);

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.ask_owner'), true);
select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('test.ask_owner'), 'role', 'authenticated')::text, true);
do $$ begin
  if public.ask_buffer_remaining() is distinct from 20 then raise exception 'New user should have 20 turns remaining'; end if;
  for attempt in 1..20 loop
    if not public.consume_ask_buffer_turn() then raise exception 'Turn % rejected', attempt; end if;
    if public.ask_buffer_remaining() is distinct from (20 - attempt) then raise exception 'Incorrect remaining count after turn %', attempt; end if;
  end loop;
  if public.consume_ask_buffer_turn() then raise exception 'Daily quota exceeded'; end if;
  begin
    update ask_buffer_private.usage set turns = 1;
    raise exception 'Authenticated caller reset quota';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', current_setting('test.ask_other'), true);
select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('test.ask_other'), 'role', 'authenticated')::text, true);
do $$ begin
  if public.ask_buffer_remaining() is distinct from 20 then raise exception 'First user changed other user remaining count'; end if;
  if not public.consume_ask_buffer_turn() then raise exception 'First user consumed other user quota'; end if;
end $$;

reset role;
update ask_buffer_private.usage set used_on = used_on - 1 where user_id = current_setting('test.ask_owner')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.ask_owner'), true);
select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('test.ask_owner'), 'role', 'authenticated')::text, true);
do $$ begin
  if public.ask_buffer_remaining() is distinct from 20 then raise exception 'Remaining count did not reset on a new UTC day'; end if;
  if not public.consume_ask_buffer_turn() then raise exception 'Quota did not reset on a new UTC day'; end if;
end $$;

set local role anon;
do $$ begin
  begin
    perform public.consume_ask_buffer_turn();
    raise exception 'Anonymous caller could reserve a turn';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.ask_buffer_remaining();
    raise exception 'Anonymous caller could read remaining turns';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
select 'passed: 20-turn limit, separate user quotas, daily reset, anonymous and direct updates denied' as verification;
