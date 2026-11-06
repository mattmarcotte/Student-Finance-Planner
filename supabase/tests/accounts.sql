-- Administrator-only integration test. No persistent users or money data remain.
begin;
select set_config('app.owner', gen_random_uuid()::text, true);
select set_config('app.other', gen_random_uuid()::text, true);
select set_config('app.owner_account', gen_random_uuid()::text, true);
select set_config('app.other_account', gen_random_uuid()::text, true);
insert into auth.users(id) values (current_setting('app.owner')::uuid), (current_setting('app.other')::uuid);
insert into public.accounts(id,user_id,name,kind,currency,opening_balance,balance_date) values
  (current_setting('app.owner_account')::uuid,current_setting('app.owner')::uuid,'Test chequing','checking','CAD',1000,'2026-11-05'),
  (current_setting('app.other_account')::uuid,current_setting('app.other')::uuid,'Other savings','savings','CAD',2000,'2026-11-05');

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('app.owner'), true);
select set_config('request.jwt.claims', jsonb_build_object('sub',current_setting('app.owner'),'role','authenticated')::text, true);

do $$
declare affected integer;
begin
  if (select count(*) from public.accounts) <> 1 then raise exception 'Cross-user account visibility'; end if;
  insert into public.accounts(name,kind,currency,opening_balance,balance_date)
  select 'Extra account ' || n,'savings','CAD',-5.01,'2026-11-05'::date from generate_series(1,25) n;
  if (select count(*) from public.accounts) <> 26 then raise exception 'Multiple account insertion failed'; end if;

  update public.accounts set opening_balance=1200.01 where id=current_setting('app.owner_account')::uuid;
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'Own-account update failed'; end if;
  update public.accounts set opening_balance=0 where id=current_setting('app.other_account')::uuid;
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'Cross-user update succeeded'; end if;

  begin
    insert into public.accounts(user_id,name,kind) values(current_setting('app.other')::uuid,'Forged','cash');
    raise exception 'Forged account ownership succeeded';
  exception when insufficient_privilege then null;
  end;

  insert into public.cash_flows(account_id,label,kind,amount,currency,start_date,repeat_unit,repeat_every)
  values(current_setting('app.owner_account')::uuid,'Rent','expense',900,'CAD','2026-11-06','month',1);

  begin
    insert into public.cash_flows(account_id,label,kind,amount,currency,start_date)
    values(current_setting('app.other_account')::uuid,'Forged link','expense',5,'CAD','2026-11-06');
    raise exception 'Linked another user account';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.cash_flows(account_id,label,kind,amount,currency,start_date)
    values(current_setting('app.owner_account')::uuid,'Wrong currency','expense',5,'USD','2026-11-06');
    raise exception 'Mismatched currency accepted';
  exception when foreign_key_violation then null;
  end;

  begin
    update public.cash_flows set account_id=current_setting('app.other_account')::uuid;
    raise exception 'Event reassigned to another user account';
  exception when foreign_key_violation then null;
  end;

  begin
    update public.accounts set user_id=current_setting('app.other')::uuid;
    raise exception 'Account ownership reassigned';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.accounts set currency='USD';
    raise exception 'Account currency changed';
  exception when insufficient_privilege then null;
  end;

end;
$$;

reset role;
set local role anon;
do $$ begin
  begin perform 1 from public.accounts; raise exception 'Anonymous account read succeeded';
  exception when insufficient_privilege then null; end;
end; $$;
reset role;
do $$ begin
  if not exists(select 1 from pg_constraint where conname='cash_flows_owned_account_fkey' and confdeltype='c') then raise exception 'Event cascade not configured'; end if;
  if not exists(select 1 from pg_constraint where conname='accounts_user_id_fkey' and confdeltype='c') then raise exception 'Auth cascade not configured'; end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='accounts' and cmd='DELETE' and qual='(( SELECT auth.uid() AS uid) = user_id)') then raise exception 'Owner-scoped delete policy not configured'; end if;
end; $$;
rollback;
select 'passed: 25 added accounts, owner create/read/update, cross-user isolation, account/event ownership and currency constraints, anonymous denial, cascade definitions and owner-scoped delete policy; all test data rolled back' as verification;
