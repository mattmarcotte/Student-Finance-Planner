-- Schema source for remote migrations add_manual_accounts and
-- cover_owned_account_foreign_key. Already installed; do not re-run there.
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  kind text not null check (kind in ('checking', 'savings', 'cash', 'other')),
  currency text not null default 'CAD' check (currency in ('CAD', 'USD', 'EUR', 'GBP')),
  opening_balance numeric(14,2) not null default 0
    check (opening_balance between -999999999999.99 and 999999999999.99),
  balance_date date not null default current_date
    check (balance_date between date '0001-01-01' and date '9999-12-31'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id, currency)
);

comment on column public.accounts.opening_balance is
  'Manual balance at the start of balance_date, before any planned events on that date.';
create index accounts_user_id_idx on public.accounts(user_id);
alter table public.accounts enable row level security;
revoke all on public.accounts from public, anon, authenticated;
grant select, delete on public.accounts to authenticated;
grant insert (user_id, name, kind, currency, opening_balance, balance_date)
  on public.accounts to authenticated;
grant update (name, kind, opening_balance, balance_date)
  on public.accounts to authenticated;
grant all on public.accounts to service_role;

create policy accounts_select_own on public.accounts for select to authenticated
  using ((select auth.uid()) = user_id);
create policy accounts_insert_own on public.accounts for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy accounts_update_own on public.accounts for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy accounts_delete_own on public.accounts for delete to authenticated
  using ((select auth.uid()) = user_id);

create function private.set_account_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.set_account_updated_at() from public, anon, authenticated;
create trigger accounts_set_updated_at before update on public.accounts
  for each row execute function private.set_account_updated_at();

-- Existing schedules remain intact; unassigned events can be assigned in the UI.
alter table public.cash_flows add column account_id uuid;
alter table public.cash_flows add constraint cash_flows_owned_account_fkey
  foreign key (account_id, user_id, currency)
  references public.accounts(id, user_id, currency) on delete cascade;
create index cash_flows_owned_account_idx on public.cash_flows(account_id, user_id, currency);
grant insert (account_id), update (account_id) on public.cash_flows to authenticated;
