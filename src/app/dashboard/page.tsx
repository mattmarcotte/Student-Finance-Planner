import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SignOutButton } from "@/components/sign-out-button";
import { FinanceWorkspace } from "@/components/finance-workspace";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { todayInZone } from "@/lib/finance";
import { accountFields, eventFields, profileFields } from "@/lib/finance-fields";
import { getAskBufferConfig } from "@/lib/ask-buffer";
import { mcpSecret } from "@/lib/mcp-access";
import type { Account, CashFlow } from "@/lib/finance-types";
import { signOut } from "@/app/auth/actions";
import { saveAccount, deleteAccount, saveEvent, deleteEvent } from "./workspace-actions";

type Profile = { display_name: string | null; default_currency: string; timezone: string };

export default async function DashboardPage({ searchParams }: {
  searchParams: Promise<{ error?: string; ask?: string }>;
}) {
  if (!getSupabaseConfig()) redirect("/login?error=unavailable");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Paginate instead of silently truncating at the Data API's row limit.
  async function allRows<T>(table: "accounts" | "cash_flows", fields: string): Promise<T[]> {
    const rows: T[] = [];
    for (let offset = 0; ;) {
      const { data, error, count } = await supabase.from(table).select(fields, { count: "exact" }).eq("user_id", user!.id).order("created_at").order("id").range(offset, offset + 999).returns<T[]>();
      if (error) throw new Error("Could not load your financial workspace.");
      rows.push(...data);
      if (!data.length || (count !== null && rows.length >= count)) return rows;
      offset += data.length;
    }
  }

  const [{ data: profile, error: profileError }, accounts, events, params] = await Promise.all([
    supabase.from("profiles").select(profileFields).eq("id", user.id).maybeSingle<Profile>(),
    allRows<Account>("accounts", accountFields),
    allRows<CashFlow>("cash_flows", eventFields),
    searchParams,
  ]);
  const timezone = profile?.timezone ?? "UTC";
  return (
    <FinanceWorkspace initialAccounts={accounts} initialEvents={events} today={todayInZone(timezone)}
      currency={profile?.default_currency ?? "CAD"} timezone={timezone} userId={user.id}
      actions={{ saveAccount, deleteAccount, saveEvent, deleteEvent }}
      chat={{ enabled: Boolean(getAskBufferConfig()), externalEnabled: Boolean(mcpSecret()), startOpen: params.ask === "1" }}>
      <SiteHeader workspace><form action={signOut}><SignOutButton /></form></SiteHeader>
      {params.error === "signout_failed" && <p className="auth-error workspace-page-error" role="alert">We couldn’t sign you out. Please try again.</p>}
      {profileError && <p className="auth-error workspace-page-error" role="status">Profile preferences could not be loaded. Using CAD and UTC for now.</p>}
    </FinanceWorkspace>
  );
}
