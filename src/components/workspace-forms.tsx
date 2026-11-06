"use client";

import { useEffect, useRef, useState } from "react";
import { accountKinds, currencies, dateLabel, endOfMonth, recurrenceLabel, validDate } from "@/lib/finance";
import type { Account, CashFlow, WorkspaceActions } from "@/lib/finance-types";

function ChoiceField({ label, name, options, defaultValue, value, onValueChange, disabled = false }: {
  label: string; name: string; options: { value: string; label: string }[];
  defaultValue?: string; value?: string; onValueChange?: (value: string) => void; disabled?: boolean;
}) {
  return <fieldset className="choice-field" disabled={disabled}>
    <legend>{label}</legend>
    <div className="choice-options">{options.map(option => <label className="choice-option" key={option.value}>
      <input type="radio" name={name} value={option.value} defaultChecked={value === undefined ? option.value === defaultValue : undefined} checked={value === undefined ? undefined : option.value === value} onChange={onValueChange ? () => onValueChange(option.value) : undefined} required />
      <span>{option.label}</span>
    </label>)}</div>
  </fieldset>;
}

export function WorkspaceModal({ title, children, onClose, busy = false }: {
  title: string; children: React.ReactNode; onClose: () => void; busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    dialog.querySelector<HTMLInputElement>("input, select")?.focus();
    return () => dialog.close();
  }, []);
  return (
    <dialog className="workspace-modal" ref={ref} aria-labelledby="modal-title" onCancel={event => {
      event.preventDefault();
      if (!busy) onClose();
    }}>
      <div className="modal-heading"><h2 id="modal-title">{title}</h2><button className="icon-button" type="button" aria-label="Close dialog" onClick={onClose} disabled={busy}>×</button></div>
      {children}
    </dialog>
  );
}

export function AccountForm({ account, today, currency, eventCount, actions, onClose, onSaved, onDeleted }: {
  account?: Account; today: string; currency: string; eventCount: number; actions: WorkspaceActions;
  onClose: () => void; onSaved: (account: Account) => void; onDeleted: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      const result = await actions.saveAccount({
        id: account?.id, name: String(form.get("name")), kind: String(form.get("kind")),
        currency: account?.currency ?? String(form.get("currency")),
        opening_balance: String(form.get("opening_balance")), balance_date: String(form.get("balance_date")),
      });
      if (result.error) setError(result.error);
      else if (result.data) onSaved(result.data);
    } catch { setError("Connection interrupted. Please try again."); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!account) return;
    setBusy(true); setError("");
    try {
      const result = await actions.deleteAccount(account.id);
      if (result.error) setError(result.error);
      else onDeleted(account.id);
    } catch { setError("Connection interrupted. Please try again."); }
    finally { setBusy(false); }
  }

  return (
    <WorkspaceModal title={account ? "Edit account" : "Add account"} onClose={onClose} busy={busy}>
      <form className="workspace-form" onSubmit={submit}>
        <fieldset disabled={busy}>
          <label>Account name<input name="name" required maxLength={80} defaultValue={account?.name ?? ""} placeholder="e.g. Everyday chequing" autoFocus /></label>
          <ChoiceField label="Account type" name="kind" defaultValue={account?.kind ?? "checking"} options={accountKinds.map(kind => ({ value: kind, label: kind === "checking" ? "Chequing" : kind[0].toUpperCase() + kind.slice(1) }))} />
          <ChoiceField label="Currency" name="currency" defaultValue={account?.currency ?? (currencies.includes(currency as typeof currencies[number]) ? currency : "CAD")} disabled={Boolean(account)} options={currencies.map(code => ({ value: code, label: code }))} />
          <label>Starting balance<input name="opening_balance" type="number" step="0.01" required defaultValue={account?.opening_balance ?? "0.00"} /></label>
          <label>Balance starts on<input name="balance_date" type="date" min="0001-01-01" max="9999-12-31" required defaultValue={account?.balance_date ?? today} /></label>
          <p className="field-help">Balance at the start of this date, before scheduled events. Earlier events are excluded.</p>
          {account && <p className="field-help">Account currency cannot be changed.</p>}
          {confirmDelete && <div className="delete-warning"><strong>Delete {account?.name}?</strong><p>This permanently removes the account and its {eventCount} event {eventCount === 1 ? "schedule" : "schedules"}.</p><div className="button-row"><button type="button" className="danger-button" onClick={remove}>Confirm delete</button><button type="button" className="subtle-button" onClick={() => setConfirmDelete(false)}>Keep account</button></div></div>}
        </fieldset>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <div className="modal-actions">{account && <button className="text-danger" type="button" disabled={busy} onClick={() => setConfirmDelete(true)}>Delete account</button>}<button className="subtle-button" type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="solid-button" type="submit" disabled={busy || confirmDelete}>{busy ? "Saving…" : account ? "Save account" : "Add account"}</button></div>
      </form>
    </WorkspaceModal>
  );
}

const frequencies = {
  daily: { unit: "day", every: 1 }, weekly: { unit: "week", every: 1 },
  biweekly: { unit: "week", every: 2 }, monthly: { unit: "month", every: 1 },
  month_end: { unit: "month_end", every: 1 }, yearly: { unit: "year", every: 1 },
};

function presetFor(event?: CashFlow) {
  if (!event?.repeat_unit) return "once";
  return Object.entries(frequencies).find(([, entry]) => entry.unit === event.repeat_unit && entry.every === event.repeat_every)?.[0] ?? "custom";
}

export function EventForm({ event, date, accounts, defaultAccountId, actions, onClose, onSaved, onDeleted }: {
  event?: CashFlow; date: string; accounts: Account[]; defaultAccountId: string;
  actions: WorkspaceActions; onClose: () => void; onSaved: (event: CashFlow) => void; onDeleted: (id: string) => void;
}) {
  const [frequency, setFrequency] = useState(presetFor(event));
  const [customUnit, setCustomUnit] = useState<string>(event?.repeat_unit ?? "week");
  const [startDate, setStartDate] = useState(event?.repeat_unit === "month_end" ? endOfMonth(event.start_date) : event?.start_date ?? date);
  const [accountId, setAccountId] = useState(event?.account_id ?? defaultAccountId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const selectedAccount = accounts.find(account => account.id === accountId);
  const monthEnd = frequency === "month_end" || (frequency === "custom" && customUnit === "month_end");

  function chooseFrequency(value: string) {
    setFrequency(value);
    if ((value === "month_end" || (value === "custom" && customUnit === "month_end")) && validDate(startDate)) setStartDate(endOfMonth(startDate));
  }

  function chooseCustomUnit(value: string) {
    setCustomUnit(value);
    if (value === "month_end" && validDate(startDate)) setStartDate(endOfMonth(startDate));
  }

  async function submit(submitEvent: React.FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    const form = new FormData(submitEvent.currentTarget);
    const preset = frequencies[frequency as keyof typeof frequencies];
    const repeating = frequency !== "once";
    setBusy(true); setError("");
    try {
      const result = await actions.saveEvent({
        id: event?.id, account_id: accountId, label: String(form.get("label")),
        kind: String(form.get("kind")), amount: String(form.get("amount")),
        start_date: String(form.get("start_date")),
        repeat_unit: repeating ? preset?.unit ?? String(form.get("repeat_unit")) : null,
        repeat_every: repeating ? preset?.every ?? Number(form.get("repeat_every")) : null,
        end_date: repeating && form.get("end_date") ? String(form.get("end_date")) : null,
        is_active: form.get("is_active") === "on",
      });
      if (result.error) setError(result.error);
      else if (result.data) onSaved(result.data);
    } catch { setError("Connection interrupted. Please try again."); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!event) return;
    setBusy(true); setError("");
    try {
      const result = await actions.deleteEvent(event.id);
      if (result.error) setError(result.error);
      else onDeleted(event.id);
    } catch { setError("Connection interrupted. Please try again."); }
    finally { setBusy(false); }
  }

  return (
    <WorkspaceModal title={event ? "Edit event schedule" : "Add event"} onClose={onClose} busy={busy}>
      <form className="workspace-form" onSubmit={submit}>
        <fieldset disabled={busy}>
          <label>Event name<input name="label" required maxLength={200} defaultValue={event?.label ?? ""} placeholder="e.g. Rent, paycheque, tuition" autoFocus /></label>
          <label>Account<select name="account_id" required value={accountId} onChange={e => setAccountId(e.target.value)}><option value="" disabled>Choose an account</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}</select></label>
          <div className="field-row event-amount-row"><ChoiceField label="Type" name="kind" defaultValue={event?.kind ?? "expense"} options={[{ value: "expense", label: "− Expense" }, { value: "income", label: "+ Income" }]} /><label>Amount {selectedAccount ? `(${selectedAccount.currency})` : ""}<input name="amount" type="number" min="0.01" step="0.01" required defaultValue={event?.amount ?? ""} /></label></div>
          <label>{frequency === "once" ? "Date" : "First occurrence"}<input name="start_date" type="date" min="0001-01-01" max="9999-12-31" required value={startDate} onChange={e => setStartDate(monthEnd && validDate(e.target.value) ? endOfMonth(e.target.value) : e.target.value)} /></label>
          <label>Repeats<select name="frequency" value={frequency} onChange={e => chooseFrequency(e.target.value)}><option value="once">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="biweekly">Every 2 weeks</option><option value="monthly">Monthly</option><option value="month_end">End of month</option><option value="yearly">Yearly</option><option value="custom">Custom interval</option></select></label>
          {frequency === "custom" && <><label>Every<input name="repeat_every" type="number" min="1" max="10000" step="1" required defaultValue={event?.repeat_every ?? 1} /></label><ChoiceField label="Period" name="repeat_unit" value={customUnit} onValueChange={chooseCustomUnit} options={[{ value: "day", label: "Days" }, { value: "week", label: "Weeks" }, { value: "month", label: "Months" }, { value: "month_end", label: "Month ends" }, { value: "year", label: "Years" }]} /></>}
          {monthEnd && <p className="field-help">Last calendar day of each month. First occurrence adjusts to month end.</p>}
          {frequency !== "once" && <><label>Last date (optional)<input name="end_date" type="date" min="0001-01-01" max="9999-12-31" defaultValue={event?.end_date ?? ""} /></label><p className="field-help">End date is inclusive. Shorter months use the last valid day.</p></>}
          <label className="checkbox-label"><input type="checkbox" name="is_active" defaultChecked={event?.is_active ?? true} />Include in forecasts</label>
          {event?.repeat_unit && <p className="field-help">Changes apply to the entire recurring schedule, including earlier occurrences.</p>}
          {confirmDelete && <div className="delete-warning"><strong>Delete this {event?.repeat_unit ? "entire schedule" : "event"}?</strong><p>It will be removed from all forecasts.</p><div className="button-row"><button type="button" className="danger-button" onClick={remove}>Confirm delete</button><button type="button" className="subtle-button" onClick={() => setConfirmDelete(false)}>Keep event</button></div></div>}
        </fieldset>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <div className="modal-actions">{event && <button className="text-danger" type="button" disabled={busy} onClick={() => setConfirmDelete(true)}>Delete {event.repeat_unit ? "schedule" : "event"}</button>}<button className="subtle-button" type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="solid-button" type="submit" disabled={busy || confirmDelete}>{busy ? "Saving…" : event ? "Save event" : "Add event"}</button></div>
      </form>
    </WorkspaceModal>
  );
}

export function ScheduleList({ events, accounts, onClose, onEdit }: {
  events: CashFlow[]; accounts: Account[]; onClose: () => void; onEdit: (event: CashFlow) => void;
}) {
  return <WorkspaceModal title="Event schedules" onClose={onClose}><div className="schedule-list">{events.length === 0 ? <p className="empty-note">No schedules.</p> : [...events].sort((a, b) => a.start_date.localeCompare(b.start_date)).map(event => <button type="button" className="schedule-list-item" key={event.id} onClick={() => onEdit(event)}><span><strong>{event.label}</strong><small>{accounts.find(account => account.id === event.account_id)?.name ?? "Needs an account"} · {recurrenceLabel(event)} · {dateLabel(event.start_date, true)}</small></span><span className={event.is_active ? "event-status" : "event-status paused"}>{event.is_active ? "Active" : "Paused"}<span aria-hidden="true"> ↗</span></span></button>)}</div></WorkspaceModal>;
}
