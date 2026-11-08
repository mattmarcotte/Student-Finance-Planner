create function ask_buffer_private.remaining_turns()
returns integer language sql stable security definer set search_path = '' as $$
  select 20 - coalesce((
    select turns from ask_buffer_private.usage
    where user_id = caller.id and used_on = (now() at time zone 'UTC')::date
  ), 0)
  from (select auth.uid() as id) as caller
  where caller.id is not null;
$$;
revoke all on function ask_buffer_private.remaining_turns() from public, anon, authenticated;
grant execute on function ask_buffer_private.remaining_turns() to authenticated;

create function public.ask_buffer_remaining()
returns integer language sql stable security invoker set search_path = '' as $$
  select ask_buffer_private.remaining_turns();
$$;
revoke all on function public.ask_buffer_remaining() from public, anon, authenticated;
grant execute on function public.ask_buffer_remaining() to authenticated;
