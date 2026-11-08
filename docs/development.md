# Developing Buffer

[Back to Buffer](../README.md)

## Run locally

Use Node.js 22.18 or newer in the 22.x series. Keep any existing `.env.local`
instead of overwriting it.

```sh
npm ci
test -f .env.local || cp .env.example .env.local
```

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in
`.env.local` to match your Supabase project. The example points to the existing
Buffer project. For a fresh project, follow the
[database guide](../supabase/README.md).

Run `npm run dev` and open [localhost:3000](http://localhost:3000).

### Google sign-in

Enable Google in Supabase Auth and add your Google OAuth Web client ID and
secret there. In the Google client settings, authorize the Supabase callback
at `https://<project-ref>.supabase.co/auth/v1/callback` and add the app origins
you use, such as `http://localhost:3000`. If the Google OAuth client is in
Testing mode, add the accounts you’ll sign in with as test users.

In Supabase Auth URL Configuration, set the Site URL to the app’s main origin
and allow the app’s callback URL, such as
`http://localhost:3000/auth/callback`. The first successful Google sign-in
creates the Auth user, and a database trigger creates their profile.

## Deploy on Vercel

Import the repository and use the detected Next.js framework. Set the two
public Supabase variables before building. In Supabase, allow
`https://<app-host>/auth/callback` for the production host and any preview
hosts that need Google sign-in. Use the production origin as the production
project’s Site URL and configure the Google client for that origin.

Keep Google OAuth credentials in Supabase and the optional Gemini and MCP
secrets in the server environment. Use the Supabase publishable key in the app.

## Optional AI features

### Ask Buffer

Set `GEMINI_API_KEY` and optionally `GEMINI_MODEL` in the server environment.
See [the environment example](../.env.example) for the default model. On a
fresh database, apply the [usage migration](../supabase/migrations/20261108065123_ask_buffer_usage.sql)
followed by the [remaining-count migration](../supabase/migrations/20261108070815_ask_buffer_remaining.sql).

After opt-in, chat sends recent messages and relevant tool results to Gemini.
The app keeps the conversation in the open page and limits each user to 20
submitted questions per day, resetting at midnight UTC.

### External MCP clients

Apply the [MCP migration](../supabase/migrations/20261108061607_buffer_mcp_access.sql)
if it hasn’t been applied to your database. Set `BUFFER_MCP_SECRET` in the
server environment to a value generated with `openssl rand -hex 32`. Restart
the dev server or redeploy after changing server environment variables.

In the dashboard, open **Ask Buffer → External MCP connection** and create a
key. Keep **Allow account edits** unchecked for read-only access. Each user has
one key at a time, expiring after 30 days. You can replace or revoke it from the
same screen. Use the key with the deployment that issued it.

Connect a Streamable HTTP MCP client to `/api/mcp` with the key as a bearer token.
For example, set `BUFFER_MCP_TOKEN` in Codex’s environment and configure the
server as follows. Substitute `http://localhost:3000/api/mcp` for local testing.

```toml
[mcp_servers.buffer]
url = "https://bufferfinanceplanner.vercel.app/api/mcp"
bearer_token_env_var = "BUFFER_MCP_TOKEN"
default_tools_approval_mode = "writes"
```

## Checks

```sh
npm run build
npm run typecheck
npm test
```

The test suite covers forecast arithmetic, input validation, and route behavior.
Build first so the route tests can start a production server on port 3101.
With Google OAuth configured, verify successful sign-in and sign-out in a browser.
See the [database guide](../supabase/README.md) for SQL policy tests.
