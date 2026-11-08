-- Schema source for the add_account_interest_rate migration.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.accounts
  add column annual_interest_rate numeric(6,3) not null default 0
    check (annual_interest_rate between 0 and 100);

grant insert (annual_interest_rate), update (annual_interest_rate)
  on public.accounts to authenticated;

comment on column public.accounts.annual_interest_rate is
  'Annual simple interest rate as a percentage, used for daily forecast accrual.';
