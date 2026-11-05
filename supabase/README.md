# Supabase database

Configured project: **Student-Finance-Planner** (`djnsqqyakevmkvvhvmvb`).

Dashboard: https://supabase.com/dashboard/project/djnsqqyakevmkvvhvmvb

## Database setup

`schema.sql` records the SQL applied through Supabase's migration API as
`create_user_profiles`. `cash_flows.sql` records the subsequent
`create_cash_flows` migration. These are SQL sources, not CLI-generated migration
files. Both are already installed on the project; do not run them again there. Before using
the Supabase CLI for future changes, link the project and pull the remote schema
and migration history so that local and remote histories agree.

Supabase Auth owns identities, email addresses, credentials, and sessions.
`public.profiles` stores the following app data:

| Column | Default | Purpose |
| --- | --- | --- |
| `id` | Auth user ID | Primary key and reference to `auth.users(id)` |
| `display_name` | Google `full_name` or `name`, when supplied | Optional, at most 200 characters |
| `default_currency` | `CAD` | Three uppercase letters; confirm supported currency during onboarding |
| `timezone` | `UTC` | Validated against Postgres timezone names; confirm during onboarding |
| `onboarding_completed_at` | `null` | Set when the user finishes setup |
| `created_at` | Current timestamp | Managed by the database |
| `updated_at` | Current timestamp | Maintained on every profile update |

An Auth insert trigger creates the matching profile automatically, including
for Google signups. Metadata provides a display label only; it never determines
access. Existing Auth users are also backfilled by the initial migration.

Authenticated users can select their own profile and update only display name,
currency, timezone, and onboarding completion time. RLS denies access to other
profiles. Anonymous visitors have no access. Clients cannot insert or delete
profiles, change identity, or write timestamps. Deleting an Auth user cascades
to their profile. Account deletion should use a protected server-side flow.

Internal trigger helpers are in the unexposed `private` schema, use a fixed empty
search path, and have no client execution grants. The signup helper runs with
definer privileges only to create the profile from the inserted Auth row.

## Simple financial events

`public.cash_flows` stores one row per user-defined income or expense. It has
no fixed event count per user. More events mean more rows, subject to the
project's storage and usage limits. This is a one-to-many relationship:
one Auth user can own many cash flows, linked by `user_id`.

| Column | Purpose |
| --- | --- |
| `id` | Automatically generated event UUID |
| `user_id` | Auth owner UUID, defaults to the signed-in user |
| `label` | Required name, up to 200 characters |
| `kind` | `income` or `expense` |
| `amount` | Positive decimal amount, stored to two decimal places |
| `currency` | Three uppercase letters; defaults to `CAD` |
| `start_date` | Event date or first recurring occurrence |
| `repeat_unit` | `null` for once; otherwise `day`, `week`, `month`, or `year` |
| `repeat_every` | `null` for once; positive interval for a recurring event |
| `end_date` | Optional inclusive cutoff for a recurring event |
| `is_active` | Defaults to `true`; set to `false` to exclude a paused rule |
| `created_at`, `updated_at` | Database-managed timestamps |

A $450 paycheque every two weeks is one row with `kind = 'income'`,
`amount = 450`, `repeat_unit = 'week'`, and `repeat_every = 2`.
A one-time payment has all three scheduling fields (`repeat_unit`,
`repeat_every`, `end_date`) set to `null`. Fixed interest credits can be ordinary
income events. Percentage-based interest calculations can be added separately.

RLS restricts select, insert, update, and delete to the signed-in owner. An
explicitly forged `user_id` on insert is rejected. Clients cannot reassign
ownership, set their own event IDs, or change timestamps. Removing an Auth user
also removes their events. An index on `(user_id, start_date)` supports fetching
one user's events.

Example with a session-bound Supabase client:

```ts
const { data: event, error } = await supabase
  .from('cash_flows')
  .insert({
    label: 'Part-time pay',
    kind: 'income',
    amount: 450,
    currency: 'CAD',
    start_date: '2026-11-06',
    repeat_unit: 'week',
    repeat_every: 2,
  })
  .select()
  .single()
```

Check `error` before using the result. Supply the user's chosen currency;
the database default does not automatically track their profile preference.
For listing, filter by `user_id`, use a stable order, and paginate as data grows
rather than assuming one API response contains every event.

The future forecast engine will expand each active rule only over the requested
date range. Recurrences are inputs, not stored future occurrences or payments
that run automatically. The forecast implementation should use calendar date
arithmetic, preserve the original day anchor, clamp month/year dates to the last
valid day when needed, and respect the inclusive end date. No forecast engine
has been implemented yet. Account balances, per-account links, individual
occurrence exceptions, and percentage interest are intentionally deferred.

## Next.js integration

Use `@supabase/supabase-js` and `@supabase/ssr` with the project's publishable key
and the user's session. Secret/service-role keys bypass RLS and must never be
included in browser code. The signup trigger means the client does not need to
insert a profile after login.

After validating the session server-side, read a profile with the user's client:

```ts
const { data: profile, error } = await supabase
  .from('profiles')
  .select('*')
  .eq('id', user.id)
  .single()
```

Update preferences using the same session-bound client:

```ts
const { data: profile, error } = await supabase
  .from('profiles')
  .update({
    display_name: 'Matt',
    default_currency: 'CAD',
    timezone: 'America/Vancouver',
  })
  .eq('id', user.id)
  .select()
  .single()
```

Handle `error` before using the result. Google OAuth provider credentials,
redirect configuration, and a Next.js callback route are separate from this
database setup. No Google credentials or application code were configured here.

## Verification

`tests/profiles.sql` was run against the hosted database as an administrator.
It creates two synthetic Auth users inside one transaction, switches to actual
`authenticated` and `anon` database roles, and verifies:

- Automatic profiles with and without name metadata.
- Own-profile reads and edits, and isolation in both directions.
- Rejection of invalid timezone and currency format.
- Denial of client identity/timestamp changes and direct inserts/deletes.
- Denial of anonymous reads and client execution of internal helpers.
- Profile removal when its Auth user is deleted.

All test changes are rolled back. These are database tests; they do not verify
the browser's Google OAuth flow.

`tests/cash_flows.sql` was also run against the hosted database. It verifies
creation, reads, updates, and deletion as the authenticated owner; insertion of
25 recurring events without schema changes; isolation in both user directions;
rejection of forged ownership; protected IDs and timestamps; invalid amounts
and schedules; anonymous denial; and Auth deletion cascading only to that user's
events. All synthetic users and financial rows are rolled back.

References:

- https://supabase.com/docs/guides/auth/managing-user-data
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/auth/server-side/creating-a-client
- https://supabase.com/docs/guides/auth/social-sign-in/auth-google
