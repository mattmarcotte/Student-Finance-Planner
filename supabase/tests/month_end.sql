-- Administrator-only integration test; all synthetic data is rolled back.
begin;
select set_config('app.owner', gen_random_uuid()::text, true);
select set_config('app.other', gen_random_uuid()::text, true);
select set_config('app.account', gen_random_uuid()::text, true);
insert into auth.users(id) values (current_setting('app.owner')::uuid), (current_setting('app.other')::uuid);
insert into public.accounts(id,user_id,name,kind,currency,opening_balance,balance_date)
values(current_setting('app.account')::uuid,current_setting('app.owner')::uuid,'Month-end test','checking','CAD',1000,'2028-01-01');

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('app.owner'), true);
select set_config('request.jwt.claims', jsonb_build_object('sub',current_setting('app.owner'),'role','authenticated')::text, true);
do $$ begin
  insert into public.cash_flows(account_id,label,kind,amount,currency,start_date,repeat_unit,repeat_every)
  values(current_setting('app.account')::uuid,'Month-end debit','expense',25,'CAD','2028-02-29','month_end',1);
  if not exists(select 1 from public.cash_flows where account_id=current_setting('app.account')::uuid and repeat_unit='month_end' and start_date='2028-02-29') then
    raise exception 'Month-end save/read failed';
  end if;
  update public.cash_flows set repeat_every=2 where account_id=current_setting('app.account')::uuid;
  if not exists(select 1 from public.cash_flows where account_id=current_setting('app.account')::uuid and repeat_unit='month_end' and repeat_every=2) then
    raise exception 'Month-end update failed';
  end if;
  begin
    insert into public.cash_flows(account_id,label,kind,amount,currency,start_date,repeat_unit,repeat_every)
    values(current_setting('app.account')::uuid,'Invalid frequency','expense',25,'CAD','2028-02-29','invalid',1);
    raise exception 'Invalid recurrence accepted';
  exception when check_violation then null;
  end;
end; $$;

select set_config('request.jwt.claim.sub', current_setting('app.other'), true);
select set_config('request.jwt.claims', jsonb_build_object('sub',current_setting('app.other'),'role','authenticated')::text, true);
do $$ begin
  if exists(select 1 from public.cash_flows where account_id=current_setting('app.account')::uuid) then
    raise exception 'Month-end event visible to another user';
  end if;
end; $$;
reset role;
rollback;
select 'passed: authenticated month-end insert/read/update, invalid frequency rejection, cross-user isolation; all synthetic data rolled back' as verification;
