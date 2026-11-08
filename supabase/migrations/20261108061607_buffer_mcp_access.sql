set local lock_timeout = '5s';

create table public.mcp_keys (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  proof_digest text not null unique check (proof_digest ~ '^[0-9a-f]{64}$'),
  allow_edits boolean not null default false,
  expires_at timestamptz not null default now() + interval '30 days'
);

alter table public.mcp_keys enable row level security;
revoke all on public.mcp_keys from public, anon, authenticated;
grant select (user_id, allow_edits, expires_at), delete on public.mcp_keys to authenticated;
grant insert (user_id, proof_digest, allow_edits), update (proof_digest, allow_edits) on public.mcp_keys to authenticated;
grant select (allow_edits) on public.mcp_keys to anon;

create policy mcp_keys_manage_own on public.mcp_keys for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Use the arguments in both branches so rotation doesn't need SELECT on the digest.
create function public.set_buffer_mcp_key(key_digest text, edits boolean)
returns void language sql security invoker set search_path = '' as $$
  insert into public.mcp_keys (proof_digest, allow_edits) values (key_digest, edits)
  on conflict (user_id) do update set proof_digest = key_digest, allow_edits = edits;
$$;
revoke all on function public.set_buffer_mcp_key(text, boolean) from public, anon, authenticated;
grant execute on function public.set_buffer_mcp_key(text, boolean) to authenticated;

create function private.refresh_mcp_key_expiry()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.expires_at := now() + interval '30 days';
  return new;
end;
$$;
revoke all on function private.refresh_mcp_key_expiry() from public, anon, authenticated;
create trigger mcp_keys_refresh_expiry before insert or update on public.mcp_keys
  for each row execute function private.refresh_mcp_key_expiry();

-- The Next.js server derives this proof using its private HMAC key. A client's
-- bearer token cannot authorize requests directly against the Supabase API.
create function private.mcp_owner(needs_edit boolean)
returns uuid language sql stable security definer set search_path = '' as $$
  select user_id from public.mcp_keys
  where proof_digest = encode(sha256(convert_to(
    nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-buffer-mcp-proof', 'UTF8'
  )), 'hex')
    and expires_at > now()
    and (not needs_edit or allow_edits);
$$;
revoke all on function private.mcp_owner(boolean) from public, anon, authenticated;
grant execute on function private.mcp_owner(boolean) to anon;

create policy mcp_keys_check_proof on public.mcp_keys for select to anon
  using (user_id = (select private.mcp_owner(false)));

-- Only these columns are exposed to a valid MCP proof. Existing signed-in
-- dashboard policies still use auth.uid(). No key grants insert or delete.
grant select (display_name, default_currency, timezone) on public.profiles to anon;
grant select (id, name, kind, currency, opening_balance, balance_date, annual_interest_rate, updated_at)
  on public.accounts to anon;
grant update (name, kind, opening_balance, balance_date, annual_interest_rate) on public.accounts to anon;
grant select (id, account_id, label, kind, amount, currency, start_date, repeat_unit, repeat_every, end_date, is_active)
  on public.cash_flows to anon;

create policy profiles_mcp_read on public.profiles for select to anon
  using (id = (select private.mcp_owner(false)));
create policy accounts_mcp_read on public.accounts for select to anon
  using (user_id = (select private.mcp_owner(false)));
create policy accounts_mcp_update on public.accounts for update to anon
  using (user_id = (select private.mcp_owner(true))) with check (user_id = (select private.mcp_owner(true)));
create policy cash_flows_mcp_read on public.cash_flows for select to anon
  using (user_id = (select private.mcp_owner(false)));
