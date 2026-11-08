# Buffer — Student Finance Planner

A Next.js App Router app for student financial planning. It includes a responsive
welcome/signup page, Google login, and a protected manual-account calendar and
forecast workspace. **Buffer** is the working name and can be changed in the brand component
and page metadata.

## Run locally

Use a recent Node.js 22 release (22.18 or newer) and npm.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Set `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local` to the project's active
publishable key from Supabase **Settings → API Keys**. The Supabase URL in the
example already points to Student-Finance-Planner. A local `.env.local` may already
be present in this checkout; preserve it instead of overwriting it.

Open http://localhost:3000. Login and signup both use Google OAuth: the first
successful sign-in creates the Auth user, and the existing database trigger
creates the profile. Returning users sign into their existing account.

## Google and Supabase configuration

Enable Google under the project's Supabase **Authentication → Sign In / Providers**
settings and enter the Google OAuth Web client ID and secret there.

Google's **Authorized redirect URIs** must include this Supabase callback:

```text
https://djnsqqyakevmkvvhvmvb.supabase.co/auth/v1/callback
```

For local development, Google's **Authorized JavaScript origins** should include
`http://localhost:3000`. Keep the development and production Google OAuth clients
appropriately configured for their environments.

Under Supabase **Authentication → URL Configuration**:

- For development, set the Site URL to `http://localhost:3000`.
- Add `http://localhost:3000/auth/callback` to the redirect URL allowlist.
- For deployment, set Site URL to your production HTTPS origin and add
  `https://YOUR-APP.vercel.app/auth/callback` to the redirect URL allowlist.

The Google callback goes to Supabase; the app callback goes to Next.js.
If using Google's Testing audience, add your Google account under Test users.

## Deploy on Vercel

1. Push this folder to your Git repository, then import it into Vercel.
2. Choose the detected **Next.js** framework. Keep the repository root as the
   project root; no custom output directory or `vercel.json` is needed.
3. Add these environment variables before building:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://djnsqqyakevmkvvhvmvb.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = your active publishable key
4. Deploy, then configure the production callback URL in Supabase as above.
   Add the production origin to the appropriate Google OAuth Web client.
5. If you add or change public environment variables after deploying, redeploy;
   Next.js embeds those values in the client bundle at build time.

For Vercel preview deployments, either allow each preview's exact callback URL in
Supabase, or use a stable preview domain configured for authentication.

Only the Supabase URL and publishable key are needed by this app. The Google
client secret belongs in Supabase, not in Next.js public variables. `.env*`,
Google `client_secret*.json` files, and Vercel local state are ignored by Git.
Do not add a Supabase secret/service-role key to this frontend.

## Appearance

The interface uses a shared light/dark palette with graphite and off-white
surfaces, green accents, and monospace labels. Buffer's name and original logo
are retained. The header offers Light, Dark, and System modes. System follows
the device preference; manual choices are saved in this browser's local storage
under `buffer-theme` and restored before the page is painted. The preference
persists across routes and reloads, without writing anything to Supabase.

Theme colors are centralized as semantic variables in `src/app/globals.css`.
The same palette applies to the welcome, login, dashboard, and error pages.
No additional dependencies are required.

Interface copy uses direct labels and short status messages. The dashboard keeps
accounts, calendar controls, and forecasts prominent; forecast assumptions are
available under Calculation details.

## Routes and authentication

| Route | Behavior |
| --- | --- |
| `/` | Welcome and Google signup |
| `/login` | Google login; signed-in users go to `/dashboard` |
| `/signup` | Redirects to signup mode on `/login` |
| `/auth/callback` | Exchanges the OAuth code and saves session cookies |
| `/dashboard` | Verifies the Auth user, then loads their own accounts and event schedules |

`src/proxy.ts` refreshes auth cookies on login and dashboard requests, and sets
private/no-store cache headers. The dashboard verifies the user with `getUser()`;
it does not trust session data merely because a browser sent a cookie. Profile
reads use the user's session and the database's existing RLS policies. Sign-out
uses a POST Server Action and clears this browser's session. OAuth success always
redirects to `/dashboard`; arbitrary redirect destinations are not accepted.

If Supabase environment variables are missing, public pages still render with
Google sign-in disabled, and the dashboard remains inaccessible.

## Accounts, calendar, and forecasts

- Add any number of manual chequing/checking, savings, cash, or other accounts.
  Supported currencies are CAD, USD, EUR, and GBP; totals stay separate by currency.
- Edit an account's name, type, starting balance, and balance date. Currency stays
  fixed after creation. Deleting an account requires confirmation and also deletes
  its linked schedules.
- Enter an optional annual interest rate for each account. Forecasts add simple
  interest daily on positive closing balances after scheduled events, using the
  annual rate divided by 365. The forecast shows estimated interest separately.
- A starting balance is the balance at the **start** of its date, before that day's
  planned events. Updating it rebases the forecast. Dates before that baseline
  show an unavailable forecast rather than an invented historical balance.
- Select a calendar date to inspect the projected **end-of-day** balance, income,
  expenses, and events. Filter by account, navigate months, or jump to a date.
- Each date has a separate `+` button for adding an event. It does not change the
  selected forecast date. The date button and add button are siblings, not nested.
  Blank cell space also selects the date; event chips open the relevant schedule.
- Events support once, daily, weekly, every two weeks, monthly, yearly, and custom
  intervals, with an optional inclusive end date. End of month follows the last
  calendar day of each scheduled month, including February 29 in leap years;
  selecting it adjusts the first occurrence to that month's end. Custom intervals
  also support month ends (for example, every three months). Monthly/yearly dates clamp to
  the last valid day of shorter months while preserving the original anchor.
- Event type, account type, currency, and custom recurrence periods use visible
  radio choices with keyboard support. Account and frequency lists use dropdowns.
- Edit, pause, or delete schedules from a calendar chip, the selected-day list,
  or Schedules. Editing or deleting a recurring schedule affects the entire series;
  single-occurrence exceptions are not implemented yet.

Account and event mutations are authenticated, validated Server Actions. Database
RLS and a composite foreign key enforce ownership and account/event currency
consistency. Financial values are computed in exact integer cents. Recurrences
are counted arithmetically, without generating years of future transaction rows.
The server paginates account/event reads to avoid the Data API's per-request cap.

Data is persisted in Supabase, not local storage. Browser state updates only after
a successful save. Reloading fetches saved records; other browser tabs see changes
on reload. Calendar dates use the profile's timezone, currently UTC by default.
Plaid, automatic bank syncing, transfers, and exchange-rate
conversion are not part of this version.

Database setup is documented in [`supabase/README.md`](supabase/README.md).

## Checks

```sh
npm run build
npm run typecheck
npm test
```

`npm test` includes forecast/input-validation tests and starts a production server on `127.0.0.1:3101` to verify public pages,
signed-out and forged-session rejection, failed/cancelled OAuth callbacks, safe
redirects, and the 404 page, then stops it. Build first. Successful Google login,
session refresh, and sign-out should also be tested in a browser with your real
Google account after configuring the provider and allowed redirects.

References: [Supabase Next.js SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
and [Google sign-in](https://supabase.com/docs/guides/auth/social-sign-in/auth-google).
