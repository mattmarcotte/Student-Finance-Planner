create schema ask_buffer_private;
revoke all on schema ask_buffer_private from public, anon, authenticated;
grant usage on schema ask_buffer_private to authenticated;

create table ask_buffer_private.usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  used_on date not null,
  turns integer not null check (turns between 1 and 20)
);
alter table ask_buffer_private.usage enable row level security;
revoke all on ask_buffer_private.usage from public, anon, authenticated;

-- Reserve one turn atomically. Clients can consume their own quota but cannot
-- read or reset the counter or pass an arbitrary user ID or date.
create function ask_buffer_private.consume_turn()
returns boolean language sql security definer set search_path = '' as $$
  with reservation as (
    insert into ask_buffer_private.usage as usage (user_id, used_on, turns)
    select owner, (now() at time zone 'UTC')::date, 1
    from (select auth.uid() as owner) as caller
    where owner is not null
    on conflict (user_id) do update
    set used_on = excluded.used_on,
        turns = case when usage.used_on = excluded.used_on then usage.turns + 1 else 1 end
    where usage.used_on < excluded.used_on
      or (usage.used_on = excluded.used_on and usage.turns < 20)
    returning 1
  )
  select exists (select 1 from reservation);
$$;
revoke all on function ask_buffer_private.consume_turn() from public, anon, authenticated;
grant execute on function ask_buffer_private.consume_turn() to authenticated;

create function public.consume_ask_buffer_turn()
returns boolean language sql security invoker set search_path = '' as $$
  select ask_buffer_private.consume_turn();
$$;
revoke all on function public.consume_ask_buffer_turn() from public, anon, authenticated;
grant execute on function public.consume_ask_buffer_turn() to authenticated;
