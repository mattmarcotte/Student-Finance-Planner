-- Applied remotely through the migration API as: create_cash_flows.
-- One row per user-defined income/expense rule, including one-time events.

create table public.cash_flows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  label text not null
    check (char_length(btrim(label)) between 1 and 200),
  kind text not null check (kind in ('income', 'expense')),
  amount numeric(14,2) not null
    check (amount between 0.01 and 999999999999.99),
  currency text not null default 'CAD' check (currency ~ '^[A-Z]{3}$'),
  start_date date not null check (isfinite(start_date)),
  repeat_unit text check (repeat_unit in ('day', 'week', 'month', 'year')),
  repeat_every integer,
  end_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cash_flows_valid_recurrence check (
    (repeat_unit is null and repeat_every is null and end_date is null)
    or
    (repeat_unit is not null and repeat_every is not null and repeat_every > 0)
  ),
  constraint cash_flows_valid_end_date check (
    end_date is null or (isfinite(end_date) and end_date >= start_date)
  )
);

comment on table public.cash_flows is
  'Private planned cash flow rules. Store one row per rule; expand occurrences when forecasting.';
comment on column public.cash_flows.amount is
  'Positive amount in the specified currency; kind determines its effect on balance.';
comment on column public.cash_flows.start_date is
  'One-time event date, or the first occurrence of a repeating event.';
comment on column public.cash_flows.repeat_unit is
  'NULL for one-time events; otherwise a calendar unit used with repeat_every.';
comment on column public.cash_flows.end_date is
  'Inclusive last permitted occurrence date; NULL means no scheduled end.';

-- This leading user_id also supports the ownership policy and foreign key.
create index cash_flows_user_start_date_idx
  on public.cash_flows (user_id, start_date);

alter table public.cash_flows enable row level security;

revoke all on public.cash_flows from public, anon, authenticated;
grant select, delete on public.cash_flows to authenticated;
grant insert (user_id, label, kind, amount, currency, start_date,
              repeat_unit, repeat_every, end_date, is_active)
  on public.cash_flows to authenticated;
grant update (label, kind, amount, currency, start_date,
              repeat_unit, repeat_every, end_date, is_active)
  on public.cash_flows to authenticated;
grant all on public.cash_flows to service_role;

create policy cash_flows_select_own
  on public.cash_flows for select to authenticated
  using ((select auth.uid()) = user_id);

create policy cash_flows_insert_own
  on public.cash_flows for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy cash_flows_update_own
  on public.cash_flows for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy cash_flows_delete_own
  on public.cash_flows for delete to authenticated
  using ((select auth.uid()) = user_id);

create function private.set_cash_flow_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.set_cash_flow_updated_at()
  from public, anon, authenticated;

create trigger cash_flows_set_updated_at
  before update on public.cash_flows
  for each row execute function private.set_cash_flow_updated_at();
