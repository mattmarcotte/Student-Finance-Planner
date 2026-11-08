import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { dateLabel } from "@/lib/finance";
import { mcpSecret } from "@/lib/mcp-access";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { McpKeyForm } from "./key-form";

export default async function ConnectionsPage() {
  if (!getSupabaseConfig()) redirect("/login?error=unavailable");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: key, error } = await supabase.from("mcp_keys")
    .select("allow_edits,expires_at").eq("user_id", user.id).maybeSingle();
  const enabled = Boolean(mcpSecret());
  const active = key && new Date(key.expires_at).getTime() > Date.now();

  return <div className="dashboard-page">
    <SiteHeader workspace><Link className="outline-button" href="/dashboard">Dashboard</Link></SiteHeader>
    <main className="finance-main connections-main">
      <div className="finance-title-row"><h1>MCP connection</h1></div>
      <section className="trajectory-panel connection-panel" aria-label="MCP access key">
        <p>Connect a trusted AI client to read your profile, accounts, and scheduled events and calculate forecasts.</p>
        <p>Clients receive the data they request. A key with edit access can change account details and starting balances.</p>
        <p>MCP endpoint <code>/api/mcp</code></p>
        {!enabled && <p>MCP is disabled for this deployment.</p>}
        {error ? <p className="auth-error" role="alert">Connection settings are unavailable.</p> : <>
          <p className="connection-status">{active
            ? `${key.allow_edits ? "Read and edit" : "Read only"} · Expires ${dateLabel(key.expires_at.slice(0, 10))} UTC`
            : key ? "Key expired" : "No active key"}</p>
          <p>Keys expire after 30 days. Replacing or revoking a key disconnects the current client.</p>
          <McpKeyForm canIssue={enabled} hasKey={Boolean(key)} />
        </>}
      </section>
    </main>
  </div>;
}
