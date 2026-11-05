import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { SignOutButton } from "@/components/sign-out-button";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";

type Profile = { display_name: string | null; default_currency: string; timezone: string };

export default async function DashboardPage({ searchParams }: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!getSupabaseConfig()) redirect("/login?error=unavailable");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile, error: profileError }, params] = await Promise.all([
    supabase.from("profiles").select("display_name, default_currency, timezone")
      .eq("id", user.id).maybeSingle<Profile>(),
    searchParams,
  ]);
  const name = profile?.display_name?.trim().split(/\s+/)[0];

  return (
    <div className="dashboard-page">
      <header className="site-header">
        <Brand /><span className="header-note">Your space to look ahead.</span>
        <form action={signOut}><SignOutButton /></form>
      </header>
      <main id="main" className="dashboard-main">
        <div className="dashboard-topline"><span className="eyebrow"><span className="status-dot" />YOUR PERSONAL SPACE</span><span className="beta-badge">EARLY ACCESS</span></div>
        <h1>You’re in{name ? `, ${name}` : ""}.<br /><em>Let’s make room.</em></h1>
        <p className="dashboard-intro">Your account is ready. This is the beginning of your Buffer — a place to bring your finances into focus.</p>
        {params.error === "signout_failed" && <p className="auth-error" role="alert">We couldn’t sign you out. Please try again.</p>}
        <section className="welcome-panel" aria-labelledby="dashboard-heading">
          <div className="plant-mark" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none"><path d="M32 50V24m0 14C15 40 12 26 12 26s20-5 20 12Zm0-8c0-16 19-18 19-18s2 18-19 18Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M21 51h22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></div>
          <div><span className="small-label">GOOD THINGS TAKE A LITTLE TIME</span><h2 id="dashboard-heading">A clearer picture is on its way.</h2><p>We’re building your account overview, recurring income and expenses, and balance forecasts. They’ll live right here.</p><span className="coming-badge"><span className="status-dot" />More to come</span></div>
        </section>
        <section className="account-details" aria-labelledby="account-heading">
          <h2 id="account-heading">Your account</h2>
          <dl><div><dt>Signed in as</dt><dd>{user.email ?? "Google account"}</dd></div><div><dt>Currency</dt><dd>{profile?.default_currency ?? "—"}</dd></div><div><dt>Timezone</dt><dd>{profile?.timezone ?? "—"}</dd></div></dl>
          {(profileError || !profile) && <p className="profile-note" role="status">Your account is signed in, but we couldn’t load your profile details. Please refresh in a moment.</p>}
        </section>
      </main>
      <footer className="site-footer"><span>A little progress is still progress.</span><span>buffer. / early access</span></footer>
    </div>
  );
}
