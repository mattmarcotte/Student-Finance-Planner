"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseConfig } from "@/lib/supabase/config";

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#4285F4" d="M43.6 24.5c0-1.5-.1-2.8-.4-4.2H24v8h11a9.4 9.4 0 0 1-4.1 6.2v5.2h6.7c3.9-3.6 6-8.8 6-15.2Z" />
      <path fill="#34A853" d="M24 44c5.5 0 10.2-1.8 13.6-4.9l-6.7-5.2c-1.8 1.2-4.1 2-6.9 2-5.3 0-9.8-3.6-11.4-8.4H5.7v5.3A20.5 20.5 0 0 0 24 44Z" />
      <path fill="#FBBC05" d="M12.6 27.5a12.3 12.3 0 0 1 0-7V15H5.7a20.5 20.5 0 0 0 0 18l6.9-5.5Z" />
      <path fill="#EA4335" d="M24 12.1c3 0 5.6 1 7.7 3l5.8-5.8A19.5 19.5 0 0 0 24 4 20.5 20.5 0 0 0 5.7 15l6.9 5.5C14.2 15.7 18.7 12.1 24 12.1Z" />
    </svg>
  );
}

const errors: Record<string, string> = {
  cancelled: "Sign-in was cancelled. You can try again whenever you’re ready.",
  callback_failed: "We couldn’t finish signing you in. Please try again with Google.",
  unavailable: "Sign-in isn’t available just yet. Please try again soon.",
};

export function AuthCard({
  initialMode = "signup",
  errorCode,
}: {
  initialMode?: "login" | "signup";
  errorCode?: string;
}) {
  const [mode, setMode] = useState(initialMode);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(errorCode ? errors[errorCode] ?? errors.callback_failed : null);
  const configured = Boolean(getSupabaseConfig());

  async function continueWithGoogle() {
    setPending(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
    } catch {
      setError("We couldn’t open Google sign-in. Please try again in a moment.");
      setPending(false);
    }
  }

  return (
    <section className="auth-card" aria-labelledby="auth-heading">
      <div className="auth-tabs" aria-label="Account options">
        <button type="button" aria-pressed={mode === "signup"} onClick={() => setMode("signup")}>
          Sign up
        </button>
        <button type="button" aria-pressed={mode === "login"} onClick={() => setMode("login")}>
          Log in
        </button>
      </div>
      <div className="card-content">
        <span className="small-label">A LITTLE SPACE TO PLAN</span>
        <h2 id="auth-heading">{mode === "signup" ? "Make room for what’s next." : "Good to have you back."}</h2>
        <p className="card-description">
          {mode === "signup"
            ? "Create your free account and take the first step toward a clearer financial future."
            : "Sign in to your space. Your plans will be right here as Buffer grows."}
        </p>
        <button
          className="google-button"
          type="button"
          onClick={continueWithGoogle}
          disabled={pending || !configured}
          aria-busy={pending}
        >
          {pending ? <span className="spinner" aria-hidden="true" /> : <GoogleIcon />}
          {pending ? "Taking you to Google…" : "Continue with Google"}
          {!pending && <span className="button-arrow" aria-hidden="true">↗</span>}
        </button>
        <div aria-live="polite">
          {(error || !configured) && (
            <p className="auth-error" role="alert">{error || errors.unavailable}</p>
          )}
        </div>
        <p className="google-note">One Google account. No extra password to remember.</p>
        <div className="card-divider" />
        <div className="trust-line">
          <svg width="17" height="19" viewBox="0 0 20 22" fill="none" aria-hidden="true">
            <path d="m10 2 7 3v5c0 5-7 9-7 9s-7-4-7-9V5l7-3Z" stroke="currentColor" strokeWidth="1.5" />
            <path d="m7 10 2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Your space is private. Your pace is yours.</span>
        </div>
      </div>
      <div className="card-footer"><span className="status-dot" />Free to start. Built for student life.</div>
    </section>
  );
}
