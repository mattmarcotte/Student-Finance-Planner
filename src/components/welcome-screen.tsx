import Link from "next/link";
import { SiteHeader } from "./site-header";
import { AuthCard } from "./auth-card";

export function WelcomeScreen({ mode, errorCode }: {
  mode?: "login" | "signup";
  errorCode?: string;
}) {
  return (
    <div className="welcome-page">
      <SiteHeader>
        <Link className="header-link" href={mode === "login" ? "/login?mode=signup" : "/login"}>
          {mode === "login" ? "Sign up" : "Log in"}<span aria-hidden="true">↗</span>
        </Link>
      </SiteHeader>
      <main id="main" className="welcome-main">
        <div className="welcome-copy">
          <h1>Accounts.<br />Events.<br /><em>Forecasts.</em></h1>
          <p className="hero-description">Track account balances and schedule income and expenses. Select a calendar date to see your projected balance.</p>
          <div className="outlook-preview">
            <div className="outlook-heading"><span>BALANCE FORECAST</span><span>EXAMPLE</span></div>
            <svg className="outlook-chart" viewBox="0 0 440 78" fill="none" aria-hidden="true">
              <path className="chart-guide" d="M0 65h440M0 33h440" />
              <path className="chart-history" d="m0 57 31-5 24 7 35-19 26 8 29-13 29 5 27-15 23 10 22-9" />
              <path className="chart-projection" d="m246 26 24 8 30-15 25 10 33-18 31 6 31-13 20 3" />
              <circle className="chart-point" cx="246" cy="26" r="3.5" />
            </svg>
            <div className="outlook-caption"><span>STARTING BALANCE</span><span>PROJECTED BALANCE</span></div>
          </div>
        </div>
        <div className="welcome-form"><AuthCard key={mode} initialMode={mode} errorCode={errorCode} /></div>
      </main>
    </div>
  );
}
