# Buffer — Student Finance Planner

A small Next.js App Router starter for the student finance planner. It includes
a responsive welcome/signup page, a Google login page, and a protected placeholder
dashboard. **Buffer** is the working name and can be changed in the brand component
and page metadata.

## Run locally

Use Node.js 22 and npm.

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

## Routes and authentication

| Route | Behavior |
| --- | --- |
| `/` | Welcome and Google signup |
| `/login` | Google login; signed-in users go to `/dashboard` |
| `/signup` | Redirects to signup mode on `/login` |
| `/auth/callback` | Exchanges the OAuth code and saves session cookies |
| `/dashboard` | Verifies the Auth user server-side and reads their own profile |

`src/proxy.ts` refreshes auth cookies on login and dashboard requests, and sets
private/no-store cache headers. The dashboard verifies the user with `getUser()`;
it does not trust session data merely because a browser sent a cookie. Profile
reads use the user's session and the database's existing RLS policies. Sign-out
uses a POST Server Action and clears this browser's session. OAuth success always
redirects to `/dashboard`; arbitrary redirect destinations are not accepted.

If Supabase environment variables are missing, public pages still render with
Google sign-in disabled, and the dashboard remains inaccessible.

The dashboard is intentionally a placeholder. It displays the signed-in account
and profile preferences. Account balances, event editing, and forecasts are not
implemented in the interface yet. Existing database setup is documented in
[`supabase/README.md`](supabase/README.md).

## Checks

```sh
npm run build
npm run typecheck
npm test
```

`npm test` starts a production server on `127.0.0.1:3101`, verifies public pages,
signed-out and forged-session rejection, failed/cancelled OAuth callbacks, safe
redirects, and the 404 page, then stops it. Build first. Successful Google login,
session refresh, and sign-out should also be tested in a browser with your real
Google account after configuring the provider and allowed redirects.

References: [Supabase Next.js SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
and [Google sign-in](https://supabase.com/docs/guides/auth/social-sign-in/auth-google).
