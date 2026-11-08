-- Run after the MCP migration as an administrator. All fixtures roll back.
begin;
select set_config('app.mcp_owner', gen_random_uuid()::text, true);
select set_config('app.mcp_other', gen_random_uuid()::text, true);
select set_config('app.mcp_account', gen_random_uuid()::text, true);
select set_config('app.mcp_other_account', gen_random_uuid()::text, true);

insert into auth.users(id, raw_user_meta_data) values
  (current_setting('app.mcp_owner')::uuid, '{"name":"MCP owner"}'),
  (current_setting('app.mcp_other')::uuid, '{"name":"Other user"}');
insert into public.accounts(id, user_id, name, kind) values
  (current_setting('app.mcp_account')::uuid, current_setting('app.mcp_owner')::uuid, 'MCP savings', 'savings'),
  (current_setting('app.mcp_other_account')::uuid, current_setting('app.mcp_other')::uuid, 'Other checking', 'checking');
insert into public.cash_flows(user_id, account_id, label, kind, amount, start_date) values
  (current_setting('app.mcp_owner')::uuid, current_setting('app.mcp_account')::uuid, 'Pay', 'income', 500, current_date),
  (current_setting('app.mcp_other')::uuid, current_setting('app.mcp_other_account')::uuid, 'Rent', 'expense', 900, current_date);

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('app.mcp_owner'), true);
select public.set_buffer_mcp_key(encode(sha256(convert_to('read-proof', 'UTF8')), 'hex'), false);
do $$ begin
  begin
    insert into public.mcp_keys(user_id, proof_digest) values (current_setting('app.mcp_other')::uuid, repeat('0', 64));
    raise exception 'Issued a key for another user';
  exception when insufficient_privilege then null;
  end;
end $$;

set local role anon;
select set_config('request.headers', '{}', true);
do $$ begin
  if exists (select allow_edits from public.mcp_keys) or exists (select id from public.accounts) then
    raise exception 'An unauthenticated request could access MCP data';
  end if;
end $$;

select set_config('request.headers', '{"x-buffer-mcp-proof":"read-proof"}', true);
do $$ begin
  if (select allow_edits from public.mcp_keys) is distinct from false
    or (select id from public.accounts) is distinct from current_setting('app.mcp_account')::uuid
    or (select label from public.cash_flows) is distinct from 'Pay'
    or (select display_name from public.profiles) is distinct from 'MCP owner' then
    raise exception 'Read-only key failed owner isolation';
  end if;
  update public.accounts set name = 'Unauthorized' where id = current_setting('app.mcp_account')::uuid;
  if found then raise exception 'Read-only key edited an account'; end if;
end $$;

set local role authenticated;
select public.set_buffer_mcp_key(encode(sha256(convert_to('edit-proof', 'UTF8')), 'hex'), true);

set local role anon;
do $$ begin
  if exists (select allow_edits from public.mcp_keys) then raise exception 'Replaced key still works'; end if;
end $$;
select set_config('request.headers', '{"x-buffer-mcp-proof":"edit-proof"}', true);
do $$ begin
  update public.accounts set opening_balance = 1000, annual_interest_rate = 2.5
  where id = current_setting('app.mcp_account')::uuid;
  if not found then raise exception 'Edit key could not edit own account'; end if;
  update public.accounts set opening_balance = 0 where id = current_setting('app.mcp_other_account')::uuid;
  if found then raise exception 'Edit key changed another user account'; end if;
  begin
    update public.accounts set currency = 'USD';
    raise exception 'Edit key changed currency';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.accounts;
    raise exception 'Edit key deleted an account';
  exception when insufficient_privilege then null;
  end;
  begin
    perform proof_digest from public.mcp_keys;
    raise exception 'Key digest was readable';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
alter table public.mcp_keys disable trigger mcp_keys_refresh_expiry;
update public.mcp_keys set expires_at = now() - interval '1 second';
set local role anon;
do $$ begin
  if exists (select allow_edits from public.mcp_keys) then raise exception 'Expired key still works'; end if;
end $$;
reset role;
alter table public.mcp_keys enable trigger mcp_keys_refresh_expiry;
set local role authenticated;
select public.set_buffer_mcp_key(encode(sha256(convert_to('edit-proof', 'UTF8')), 'hex'), true);
delete from public.mcp_keys where user_id = current_setting('app.mcp_owner')::uuid;
set local role anon;
do $$ begin
  if exists (select id from public.accounts) then raise exception 'Revoked key still works'; end if;
end $$;

rollback;
select 'passed: scoped reads and writes, user isolation, key rotation and revocation' as verification;
