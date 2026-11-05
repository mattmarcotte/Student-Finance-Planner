"use client";

import { useFormStatus } from "react-dom";

export function SignOutButton() {
  const { pending } = useFormStatus();
  return <button className="signout-button" type="submit" disabled={pending}>{pending ? "Signing out…" : "Sign out"}<span aria-hidden="true">↗</span></button>;
}
