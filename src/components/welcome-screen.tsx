import Link from "next/link";
import { Brand } from "./brand";
import { AuthCard } from "./auth-card";

export function WelcomeScreen({ mode, errorCode }: {
  mode?: "login" | "signup";
  errorCode?: string;
}) {
  return (
    <div className="welcome-page">
      <header className="site-header">
        <Brand />
        <span className="header-note">A little foresight. A lot less guesswork.</span>
        <Link className="header-link" href={mode === "login" ? "/login?mode=signup" : "/login"}>
          {mode === "login" ? "Create an account" : "Log in"}<span aria-hidden="true">↗</span>
        </Link>
      </header>
      <main id="main" className="welcome-main">
        <div className="welcome-copy">
          <p className="eyebrow"><span className="status-dot" />FOR LIFE BETWEEN PAYDAYS</p>
          <h1>Big plans.<br />A little more<br /><em>breathing room.</em></h1>
          <p className="hero-description">Student life doesn’t run on a regular paycheque. Get a little clarity on what’s coming in, what’s going out, and what comes next.</p>
          <div className="preview-note">
            <span className="preview-icon" aria-hidden="true">↗</span>
            <div><strong>Your next chapter starts here.</strong><span>We’re building a simpler way to plan ahead.</span></div>
          </div>
          <div className="hero-tags"><span>Made for students</span><span>Built around real life</span></div>
        </div>
        <div className="welcome-form"><AuthCard key={mode} initialMode={mode} errorCode={errorCode} /></div>
      </main>
      <footer className="site-footer"><span>Make a little room for your future.</span><span>buffer. / early access</span></footer>
    </div>
  );
}
