import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { before, after, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

const origin = "http://127.0.0.1:3101";
let server;
let output = "";

before(async () => {
  server = spawn(process.execPath, [
    "node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3101",
  ], { stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", (chunk) => { output += chunk.toString(); });
  server.stderr.on("data", (chunk) => { output += chunk.toString(); });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`Preview failed: ${output}`);
    try {
      const response = await fetch(origin);
      if (response.ok) return;
    } catch { /* Wait for the production server to listen. */ }
    await delay(100);
  }
  throw new Error(`Preview did not start: ${output}`);
});

after(async () => {
  if (server && server.exitCode === null) {
    const exited = once(server, "exit");
    server.kill("SIGTERM");
    await exited;
  }
});

test("welcome, login, and signup screens are reachable", async () => {
  for (const path of ["/", "/login", "/login?mode=signup"]) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Continue with Google/);
  }
  const response = await fetch(`${origin}/signup`, { redirect: "manual" });
  assert.equal(response.status, 307);
  assert.equal(new URL(response.headers.get("location"), origin).pathname, "/login");
});

test("signed-out visitors cannot read the dashboard", async () => {
  for (const path of ["/dashboard", "/dashboard/ask", "/dashboard/connections"]) {
    const response = await fetch(`${origin}${path}`, { redirect: "manual" });
    assert.equal(response.status, 307);
    assert.equal(new URL(response.headers.get("location"), origin).pathname, "/login");
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.doesNotMatch(await response.text(), /Signed in as/);
  }
});

test("Ask Buffer requires a browser session and rejects cross-site requests", async () => {
  const request = { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" };
  const signedOut = await fetch(`${origin}/api/ask`, request);
  assert.ok([401, 503].includes(signedOut.status));
  assert.match(signedOut.headers.get("cache-control"), /no-store/);
  const quota = await fetch(`${origin}/api/ask`);
  assert.equal(quota.status, signedOut.status);
  assert.match(quota.headers.get("cache-control"), /no-store/);
  const crossSite = await fetch(`${origin}/api/ask`, {
    ...request, headers: { ...request.headers, "Sec-Fetch-Site": "cross-site" },
  });
  assert.equal(crossSite.status, 403);
});

test("MCP requests without a key are rejected", async () => {
  const response = await fetch(`${origin}/api/mcp`, { method: "POST" });
  assert.ok([401, 404].includes(response.status));
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.equal(await response.text(), "");
});

test("a forged session cookie cannot unlock the dashboard", async () => {
  const token = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const jwt = `${token({ alg: "HS256", typ: "JWT" })}.${token({
    sub: "00000000-0000-4000-8000-000000000001", aud: "authenticated",
    role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600,
  })}.forged-signature`;
  const session = `base64-${token({
    access_token: jwt, refresh_token: "not-a-real-refresh-token", token_type: "bearer",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: "00000000-0000-4000-8000-000000000001" },
  })}`;
  const response = await fetch(`${origin}/dashboard`, {
    redirect: "manual",
    headers: { Cookie: `sb-djnsqqyakevmkvvhvmvb-auth-token=${session}` },
  });
  assert.equal(response.status, 307);
  assert.equal(new URL(response.headers.get("location"), origin).pathname, "/login");
});

test("failed OAuth callbacks stay on this site and never expose provider text", async () => {
  for (const query of [
    "",
    "?error=access_denied&error_description=untrusted-provider-text",
    "?code=not-a-real-auth-code&next=https://example.invalid",
  ]) {
    const response = await fetch(`${origin}/auth/callback${query}`, { redirect: "manual" });
    assert.equal(response.status, 307);
    const destination = new URL(response.headers.get("location"), origin);
    // Next.js canonicalizes loopback request URLs to localhost in route handlers.
    assert.ok(["127.0.0.1", "localhost"].includes(destination.hostname));
    assert.equal(destination.port, new URL(origin).port);
    assert.equal(destination.protocol, "http:");
    assert.equal(destination.pathname, "/login");
    assert.ok(destination.searchParams.has("error"));
    assert.ok(!destination.href.includes("untrusted-provider-text"));
    assert.match(response.headers.get("cache-control"), /no-store/);
  }
});

test("unknown pages have a useful 404", async () => {
  const response = await fetch(`${origin}/does-not-exist`);
  assert.equal(response.status, 404);
  assert.match(await response.text(), /Back to Buffer/);
});
