-- Schema source for remote migration add_month_end_recurrence.
-- Already installed after applying through the Supabase migration API.
set lock_timeout = '5s';
set statement_timeout = '30s';

alter table public.cash_flows
  drop constraint cash_flows_repeat_unit_check,
  add constraint cash_flows_repeat_unit_check
    check (repeat_unit in ('day', 'week', 'month', 'month_end', 'year'));

comment on column public.cash_flows.repeat_unit is
  'NULL for one-time events; otherwise used with repeat_every. month_end follows the last calendar day of each scheduled month.';
comment on column public.cash_flows.start_date is
  'One-time date or first recurring occurrence. The app normalizes month_end schedules to the last day of the selected month.';
