"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { askHistoryLimit, askQuestionLimit, type AskAccountProposal, type AskAnswer, type AskEventProposal, type AskMessage, type EventPreview } from "@/lib/ask-buffer-types";
import { dateLabel, money, recurrenceLabel, toCents } from "@/lib/finance";
import type { Account, CashFlow } from "@/lib/finance-types";
import { approveAccountEdit, approveEventChange } from "../workspace-actions";

const exampleQuestions = [
  "Summarize my recurring expenses.",
  "What’s my projected balance at the end of next month?",
];

type ChatCallbacks = {
  onAccountUpdated: (account: Account) => void;
  onEventSaved: (event: CashFlow) => void;
  onEventDeleted: (id: string) => void;
};

export function DashboardChat({ children, enabled, externalEnabled, startOpen = false, ...callbacks }: {
  children: ReactNode;
  enabled: boolean;
  externalEnabled: boolean;
  startOpen?: boolean;
} & ChatCallbacks) {
  const [open, setOpen] = useState(startOpen);
  const launcher = useRef<HTMLButtonElement>(null);
  const minimize = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) minimize.current?.focus({ preventScroll: true });
    else if (wasOpen.current) launcher.current?.focus({ preventScroll: true });
    wasOpen.current = open;
  }, [open]);

  return <div className={`dashboard-page dashboard-with-ask${open ? " ask-open" : ""}`}>
    <div className="dashboard-content">{children}</div>
    <button ref={launcher} className="solid-button ask-launcher" type="button" hidden={open}
      aria-expanded={open} aria-controls="ask-dock" onClick={() => setOpen(true)}>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l1.6-3.2A7.5 7.5 0 1 1 20 11.5Z" />
        <path strokeLinecap="round" d="M9 11.5h.01m3 0h.01m3 0h.01" />
      </svg>
      Ask Buffer
    </button>
    <aside className="ask-dock" id="ask-dock" aria-labelledby="ask-title" hidden={!open} onKeyDown={event => {
      if (event.key === "Escape") setOpen(false);
    }}>
      <header className="ask-dock-heading">
        <h2 id="ask-title">Ask Buffer</h2>
        <button ref={minimize} className="icon-button" type="button" aria-label="Minimize Ask Buffer" onClick={() => setOpen(false)}>−</button>
      </header>
      {enabled ? <AskChat open={open} externalEnabled={externalEnabled} {...callbacks} /> : <div className="ask-panel">
        <p className="ask-notice">Ask Buffer is being set up.</p>
        {externalEnabled && <Link className="inline-link" href="/dashboard/connections">External MCP connection</Link>}
      </div>}
    </aside>
  </div>;
}

function AskChat({ open, externalEnabled, onAccountUpdated, onEventSaved, onEventDeleted }: {
  open: boolean;
  externalEnabled: boolean;
} & ChatCallbacks) {
  const [messages, setMessages] = useState<AskMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [proposal, setProposal] = useState<AskAnswer["proposal"]>(undefined);
  const [saving, setSaving] = useState(false);
  const history = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const quotaRequest = useRef<AbortController | null>(null);

  const refreshRemaining = useCallback(async () => {
    quotaRequest.current?.abort();
    const controller = new AbortController();
    quotaRequest.current = controller;
    try {
      const response = await fetch("/api/ask", { cache: "no-store", signal: controller.signal });
      const data = await response.json();
      if (!controller.signal.aborted) setRemaining(response.ok && typeof data.remaining === "number" ? data.remaining : null);
    } catch {
      if (!controller.signal.aborted) setRemaining(null);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const refresh = () => { if (!activeRequest.current) void refreshRemaining(); };
    refresh();
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
    };
  }, [open, refreshRemaining]);

  useEffect(() => {
    const log = history.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages, pending, open]);

  useEffect(() => () => {
    activeRequest.current?.abort();
    quotaRequest.current?.abort();
  }, []);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = question.trim();
    if (!text || !consent || remaining === 0 || proposal || activeRequest.current) return;
    const next: AskMessage[] = [...messages, { role: "user", text }];
    const controller = new AbortController();
    activeRequest.current = controller;
    quotaRequest.current?.abort();
    setRemaining(count => count === null ? null : Math.max(0, count - 1));
    setMessages(next);
    setQuestion("");
    setError("");
    setPending(true);
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent, messages: next.slice(-askHistoryLimit) }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok || typeof data.reply !== "string") {
        setError(typeof data.error === "string" ? data.error : "Couldn’t get an answer. Try again.");
        setMessages(messages);
        setQuestion(text);
        return;
      }
      setMessages([...next, { role: "assistant", text: data.reply }]);
      setProposal(data.proposal);
    } catch {
      if (!controller.signal.aborted) {
        setError("Couldn’t get an answer. Try again.");
        setMessages(messages);
        setQuestion(text);
      }
    } finally {
      activeRequest.current = null;
      if (!controller.signal.aborted) {
        setPending(false);
        void refreshRemaining();
      }
    }
  }

  function finishProposal(text: string) {
    setProposal(undefined);
    setError("");
    setMessages(previous => [...previous.slice(0, -1), { role: "assistant", text }]);
  }

  async function approve() {
    if (!proposal || saving) return;
    setSaving(true);
    setError("");
    try {
      if (proposal.kind === "account") {
        const result = await approveAccountEdit(proposal.edit, proposal.account.updated_at);
        if (result.error) setError(result.error);
        else if (result.data) {
          onAccountUpdated(result.data);
          finishProposal(`Saved changes to ${result.data.name}.`);
        }
        return;
      }
      const result = await approveEventChange(proposal);
      if (result.error) finishProposal(result.error);
      else if (typeof result.data === "string") {
        onEventDeleted(result.data);
        finishProposal("Event removed.");
      } else if (result.data) {
        onEventSaved(result.data);
        finishProposal(`Saved ${result.data.label}.`);
      }
    } catch {
      if (proposal.kind === "event") finishProposal("Couldn’t confirm the change. Refresh and check Event schedules before trying again.");
      else setError("Couldn’t confirm the save. Check the account before trying again.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="ask-panel" aria-label="Ask Buffer chat">
    {messages.length > 0 ? <div ref={history} className="ask-history" role="log" aria-label="Conversation" tabIndex={0}>
      {messages.map((message, index) => <div className={`ask-message ask-message-${message.role}`} key={index}>
        <strong>{message.role === "user" ? "You" : "Buffer"}</strong>
        <p>{message.text}</p>
      </div>)}
      {pending && <div className="ask-message ask-typing" role="status" aria-label="Ask Buffer is typing">
        <span /><span /><span />
      </div>}
      {proposal?.kind === "account" && <AccountEditReview proposal={proposal} saving={saving} onApprove={approve}
        onDismiss={() => finishProposal("Account edit dismissed.")} />}
      {proposal?.kind === "event" && <EventChangeReview proposal={proposal} saving={saving} onApprove={approve}
        onDismiss={() => finishProposal("Event change dismissed.")} />}
    </div> : <div className="ask-examples" aria-label="Example questions">
      {exampleQuestions.map(example => <button type="button" className="outline-button" key={example} onClick={() => {
        setQuestion(example);
        input.current?.focus();
      }}>{example}</button>)}
    </div>}

    <form className="ask-form" onSubmit={send}>
      <label htmlFor="ask-question">Question</label>
      <textarea id="ask-question" ref={input} rows={2} maxLength={askQuestionLimit} value={question}
        enterKeyHint="send" disabled={pending} onChange={event => setQuestion(event.target.value)}
        onKeyDown={event => {
          if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
          event.preventDefault();
          if (!event.repeat) event.currentTarget.form?.requestSubmit();
        }} required />
      <label className="ask-consent">
        <input type="checkbox" checked={consent} disabled={pending} onChange={event => setConsent(event.target.checked)} />
        <span>Send my questions and relevant Buffer data to Google Gemini.</span>
      </label>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <div className="ask-toolbar">
        <p aria-live="polite" title="Resets at midnight UTC">{remaining === null ? "Daily limit · 20" : `${remaining} left today`}</p>
        <div className="ask-actions">
          <button className="outline-button" type="button" disabled={pending || saving || (!messages.length && !question)} onClick={() => {
            setMessages([]);
            setQuestion("");
            setError("");
            setProposal(undefined);
            input.current?.focus();
          }}>New chat</button>
          <button className="solid-button" type="submit" disabled={pending || Boolean(proposal) || !consent || remaining === 0 || !question.trim()}>Send</button>
        </div>
      </div>
    </form>
    {externalEnabled && <Link className="inline-link" href="/dashboard/connections">External MCP connection</Link>}
  </section>;
}

function eventDetails(event: EventPreview) {
  return {
    Name: event.label,
    Account: `${event.accountName} · ${event.currency}`,
    Type: event.kind === "income" ? "Income" : "Expense",
    Amount: `${money(toCents(event.amount), event.currency)} ${event.currency}`,
    Date: dateLabel(event.start_date),
    Repeats: recurrenceLabel(event),
    Ends: event.end_date ? dateLabel(event.end_date) : "—",
    Status: event.is_active ? "Active" : "Paused",
  };
}

function EventChangeReview({ proposal, saving, onApprove, onDismiss }: {
  proposal: AskEventProposal;
  saving: boolean;
  onApprove: () => void;
  onDismiss: () => void;
}) {
  const event = proposal.operation === "remove" ? proposal.before : proposal.after;
  const before = proposal.operation === "edit" ? eventDetails(proposal.before) : null;
  const details = eventDetails(event);
  const label = { create: "Add event", edit: "Save edit", remove: "Remove event" }[proposal.operation];
  const recurring = event.repeat_unit || (proposal.operation === "edit" && proposal.before.repeat_unit);

  return <div className="ask-message ask-review ask-event-review" aria-label="Review event change">
    <strong>{label}</strong>
    <dl>{(Object.keys(details) as (keyof typeof details)[]).map(field => <div key={field}>
      <dt>{field}</dt>
      <dd>{before && before[field] !== details[field] && <>{before[field]} <span aria-label="changes to">→</span> </>}{details[field]}</dd>
    </div>)}</dl>
    {recurring && proposal.operation === "remove" && <p>Removes the entire recurring schedule.</p>}
    {recurring && proposal.operation === "edit" && <p>Applies to the entire recurring schedule.</p>}
    <div className="ask-actions">
      <button className="outline-button" type="button" disabled={saving} onClick={onDismiss}>Dismiss</button>
      <button className="solid-button" type="button" disabled={saving} onClick={onApprove}>{saving ? "Saving…" : label}</button>
    </div>
  </div>;
}

const editLabels = {
  name: "Name", kind: "Account type", opening_balance: "Starting balance",
  balance_date: "Balance date", annual_interest_rate: "Annual interest rate",
};

function AccountEditReview({ proposal: { account, edit }, saving, onApprove, onDismiss }: {
  proposal: AskAccountProposal;
  saving: boolean;
  onApprove: () => void;
  onDismiss: () => void;
}) {
  const fields = (Object.keys(editLabels) as (keyof typeof editLabels)[]).filter(field => edit[field] !== undefined);
  function displayValue(field: keyof typeof editLabels, value: string | number) {
    if (field === "opening_balance") return `${money(toCents(value), account.currency)} ${account.currency}`;
    if (field === "balance_date") return dateLabel(String(value));
    if (field === "annual_interest_rate") return `${Number(value)}%`;
    if (field === "kind" && value === "checking") return "Chequing";
    return value;
  }

  return <div className="ask-message ask-review" aria-label="Review account edit">
    <strong>{account.name}</strong>
    <dl>{fields.map(field => <div key={field}>
      <dt>{editLabels[field]}</dt>
      <dd>{displayValue(field, account[field])} <span aria-label="changes to">→</span> {displayValue(field, edit[field]!)}</dd>
    </div>)}</dl>
    <div className="ask-actions">
      <button className="outline-button" type="button" disabled={saving} onClick={onDismiss}>Dismiss</button>
      <button className="solid-button" type="button" disabled={saving} onClick={onApprove}>{saving ? "Saving…" : "Approve edit"}</button>
    </div>
  </div>;
}
