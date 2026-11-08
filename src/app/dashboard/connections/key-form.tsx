"use client";

import { useActionState, useState } from "react";
import { manageMcpKey } from "./actions";

export function McpKeyForm({ canIssue, hasKey }: { canIssue: boolean; hasKey: boolean }) {
  const [state, action, pending] = useActionState(manageMcpKey, {});
  const [copyStatus, setCopyStatus] = useState<{ token: string; success: boolean }>();
  const token = state.token;

  return (
    <>
      <form action={action} className="connection-form">
        {canIssue && <label><input type="checkbox" name="allow_edits" /> Allow account edits</label>}
        <div className="connection-actions">
          {canIssue && <button className="solid-button" name="intent" value="issue" disabled={pending}>{hasKey ? "Replace key" : "Create key"}</button>}
          {hasKey && <button className="outline-button" name="intent" value="revoke" disabled={pending}>Revoke key</button>}
        </div>
        {state.error && <p className="auth-error" role="alert">{state.error}</p>}
      </form>
      {token && hasKey && <div className="connection-key">
        <label htmlFor="buffer-mcp-key">Copy this key now. It’s shown once.</label>
        <input id="buffer-mcp-key" type="password" readOnly value={token} autoComplete="off" />
        <button className="outline-button" type="button" onClick={async () => {
          try {
            await navigator.clipboard.writeText(token);
            setCopyStatus({ token, success: true });
          } catch {
            setCopyStatus({ token, success: false });
          }
        }}>Copy key</button>
        {copyStatus?.token === token && <p role="status">{copyStatus.success ? "Key copied." : "Couldn’t copy the key. Select the field to copy it manually."}</p>}
      </div>}
    </>
  );
}
