"use client";

import { useMemo, useState, type ReactNode } from "react";
import { DashboardChat } from "@/app/dashboard/ask/ask-chat";
import { accountForecast, addMonths, calendarDays, dateLabel, money, occursOn, recurrenceLabel, toCents, validDate } from "@/lib/finance";
import type { Account, CashFlow, WorkspaceActions } from "@/lib/finance-types";
import { BalanceTrajectory } from "./balance-trajectory";
import { AccountForm, EventForm, ScheduleList } from "./workspace-forms";

type Modal = { type: "account"; account?: Account } | { type: "event"; date: string; event?: CashFlow } | { type: "schedules" } | null;

export function FinanceWorkspace({ initialAccounts, initialEvents, today, currency, timezone, userId, actions, chat, children }: {
  initialAccounts: Account[]; initialEvents: CashFlow[]; today: string; currency: string;
  timezone: string; userId: string; actions: WorkspaceActions;
  chat: { enabled: boolean; externalEnabled: boolean; startOpen: boolean };
  children: ReactNode;
}) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [events, setEvents] = useState(initialEvents);
  const [selectedDate, setSelectedDate] = useState(today);
  const [month, setMonth] = useState(`${today.slice(0, 7)}-01`);
  const [accountFilter, setAccountFilter] = useState("all");
  const [modal, setModal] = useState<Modal>(null);
  const [notice, setNotice] = useState("");
  const scopedAccounts = useMemo(() => accounts.filter(a => accountFilter === "all" || a.id === accountFilter), [accounts, accountFilter]);
  const scopedEvents = useMemo(() => events.filter(e => accountFilter === "all" || e.account_id === accountFilter), [events, accountFilter]);
  const days = useMemo(() => calendarDays(month), [month]);
  const selectedEvents = scopedEvents.filter(e => e.account_id && occursOn(e, selectedDate));
  const unassigned = events.filter(e => !e.account_id);
  const accountBalances = useMemo(() => accounts.map(account => ({
    account, forecast: accountForecast(account, events, selectedDate),
  })), [accounts, events, selectedDate]);
  const groups = [...new Set(scopedAccounts.map(a => a.currency))].map(code => {
    const entries = accountBalances.filter(e => e.account.currency === code && scopedAccounts.some(a => a.id === e.account.id));
    return {
      currency: code, missing: entries.filter(e => !e.forecast).length,
      balance: entries.reduce((sum, e) => sum + (e.forecast?.balance ?? 0n), 0n),
      opening: entries.reduce((sum, e) => sum + (e.forecast?.opening ?? 0n), 0n),
      income: entries.reduce((sum, e) => sum + (e.forecast?.income ?? 0n), 0n),
      expenses: entries.reduce((sum, e) => sum + (e.forecast?.expenses ?? 0n), 0n),
      interest: entries.reduce((sum, e) => sum + (e.forecast?.interest ?? 0n), 0n),
      hasInterest: entries.some(e => Number(e.account.annual_interest_rate) > 0),
    };
  });
  const monthTitle = new Intl.DateTimeFormat("en-CA", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}T00:00:00Z`));

  function selectDate(date: string) {
    if (!validDate(date)) return;
    setSelectedDate(date); setMonth(`${date.slice(0, 7)}-01`);
  }
  function accountSaved(account: Account) {
    setAccounts(previous => previous.some(a => a.id === account.id) ? previous.map(a => a.id === account.id ? account : a) : [...previous, account]);
    setModal(null); setNotice("Account saved.");
  }
  function eventSaved(event: CashFlow) {
    setEvents(previous => previous.some(e => e.id === event.id) ? previous.map(e => e.id === event.id ? event : e) : [...previous, event]);
    setModal(null); setNotice("Event saved.");
  }
  function accountDeleted(id: string) {
    setAccounts(previous => previous.filter(a => a.id !== id));
    setEvents(previous => previous.filter(e => e.account_id !== id));
    if (accountFilter === id) setAccountFilter("all");
    setModal(null); setNotice("Account and schedules deleted.");
  }
  function eventDeleted(id: string) {
    setEvents(previous => previous.filter(e => e.id !== id));
    setModal(null); setNotice("Schedule deleted.");
  }

  return <DashboardChat {...chat} onAccountUpdated={accountSaved} onEventSaved={eventSaved} onEventDeleted={eventDeleted}>
    {children}
    <main id="main" className="finance-main">
      <div className="finance-title-row"><h1>Dashboard</h1><button className="solid-button" type="button" onClick={() => setModal({ type: "event", date: selectedDate })} disabled={!accounts.length}><span aria-hidden="true">＋</span> Add event</button></div>
      <div className="workspace-notice" role="status" aria-live="polite">{notice}</div>
      {unassigned.length > 0 && <div className="assignment-note">{unassigned.length} {unassigned.length === 1 ? "event needs" : "events need"} an account before they can affect forecasts. <button type="button" className="inline-link" disabled={!accounts.length} onClick={() => setModal({ type: "event", date: unassigned[0].start_date, event: unassigned[0] })}>Assign an account ↗</button></div>}
      <BalanceTrajectory accounts={scopedAccounts} events={scopedEvents} today={today} preferredCurrency={currency} userId={userId} scope={accountFilter} />
      <div className="finance-layout">
        <aside className="accounts-panel" aria-labelledby="accounts-heading">
          <div className="section-heading"><h2 id="accounts-heading">Accounts <span className="count-badge">{accounts.length}</span></h2><button className="icon-button" type="button" aria-label="Add account" title="Add account" onClick={() => setModal({ type: "account" })}>＋</button></div>
          {accounts.length > 0 ? <>
            <button type="button" className={`all-accounts ${accountFilter === "all" ? "is-active" : ""}`} aria-pressed={accountFilter === "all"} onClick={() => setAccountFilter("all")}><span>All accounts</span><span aria-hidden="true">↗</span></button>
            <p className="account-list-caption">PROJECTED FOR {dateLabel(selectedDate, true).toUpperCase()}</p>
            <div className="account-list">{accountBalances.map(({ account, forecast }, index) => <div key={account.id} className={`account-card ${accountFilter === account.id ? "is-active" : ""}`}>
              <button type="button" className="account-select" aria-pressed={accountFilter === account.id} onClick={() => setAccountFilter(account.id)}><span className="account-card-name"><span className={`account-dot dot-${index % 4}`} />{account.name}</span><span className="account-card-balance">{forecast ? money(forecast.balance, account.currency) : "—"}<small>{account.currency}</small></span><span className="account-card-meta">{account.kind === "checking" ? "Chequing" : account.kind[0].toUpperCase() + account.kind.slice(1)} · starts {dateLabel(account.balance_date, true)}</span></button>
              <button className="account-edit" type="button" aria-label={`Edit ${account.name}`} title={`Edit ${account.name}`} onClick={() => setModal({ type: "account", account })}>···</button>
            </div>)}</div>
          </> : <div className="accounts-empty"><span className="empty-symbol" aria-hidden="true">[ + ]</span><h3>No accounts</h3></div>}
          <button type="button" className="outline-button add-account-button" onClick={() => setModal({ type: "account" })}>＋ Add account</button>
        </aside>
        <section className="calendar-panel" aria-labelledby="calendar-heading">
          <div className="calendar-toolbar"><div><span className="small-label">CALENDAR</span><h2 id="calendar-heading">{monthTitle}</h2></div><div className="calendar-navigation"><button type="button" className="subtle-button today-button" onClick={() => selectDate(today)}>Today</button><button className="icon-button" type="button" aria-label="Previous month" disabled={month.slice(0, 7) === "0001-01"} onClick={() => setMonth(addMonths(month, -1))}>‹</button><button className="icon-button" type="button" aria-label="Next month" disabled={month.slice(0, 7) === "9999-12"} onClick={() => setMonth(addMonths(month, 1))}>›</button></div></div>
          <div className="mobile-forecast-readout" aria-live="polite"><span>{dateLabel(selectedDate, true)}</span><strong>{groups.length ? groups.map(group => `${group.currency} ${group.missing ? "—" : money(group.balance, group.currency)}`).join(" · ") : "Add an account to forecast"}</strong></div>
          <table className="finance-calendar" aria-label={`${monthTitle} financial calendar`}>
            <thead><tr>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => <th scope="col" key={day}>{day}</th>)}</tr></thead>
            <tbody>{Array.from({ length: 6 }, (_, week) => <tr key={week}>{days.slice(week * 7, week * 7 + 7).map((date, index) => {
              if (!date) return <td key={`blank-${index}`} className="calendar-day empty-day" />;
              const dayEvents = scopedEvents.filter(e => e.account_id && occursOn(e, date));
              return <td key={date} className={`calendar-day ${date.slice(0, 7) !== month.slice(0, 7) ? "outside-month" : ""} ${date === selectedDate ? "selected-day" : ""} ${date === today ? "today" : ""}`} onClick={click => { if (click.target === click.currentTarget) selectDate(date); }}>
                <button className="day-select" type="button" aria-label={`View forecast for ${dateLabel(date)}`} aria-pressed={date === selectedDate} onClick={click => { click.stopPropagation(); selectDate(date); }}><span className="day-number">{Number(date.slice(8))}</span></button>
                <button className="day-add" type="button" aria-label={`Add event on ${dateLabel(date)}`} title={accounts.length ? `Add event on ${dateLabel(date)}` : "Add an account first"} disabled={!accounts.length} onClick={click => { click.stopPropagation(); setModal({ type: "event", date }); }}>+</button>
                <div className="calendar-events">{dayEvents.slice(0, 2).map(event => <button type="button" key={event.id} className={`calendar-event ${event.kind}`} title={`${event.label} · ${event.kind === "income" ? "+" : "−"}${money(toCents(event.amount), event.currency)}`} onClick={click => { click.stopPropagation(); setModal({ type: "event", date, event }); }}><span className="event-dot" /><span className="calendar-event-label">{event.label}</span></button>)}{dayEvents.length > 2 && <button type="button" className="more-events" onClick={() => selectDate(date)}>+{dayEvents.length - 2} more</button>}</div>
              </td>;
            })}</tr>)}</tbody>
          </table>
          <div className="calendar-bottom"><span><i className="legend-dot income" />Income <i className="legend-dot expense" />Expense</span><button type="button" className="inline-link" onClick={() => setModal({ type: "schedules" })}>Schedules ({scopedEvents.length}) ↗</button></div>
        </section>
        <aside className="forecast-panel" aria-labelledby="forecast-heading">
          <div className="section-heading"><h2 id="forecast-heading">Forecast</h2></div>
          <label className="jump-to-date">Date<input type="date" min="0001-01-01" max="9999-12-31" value={selectedDate} onChange={e => selectDate(e.target.value)} aria-label="Forecast date" /></label>
          <div className="forecast-summary" aria-live="polite" aria-atomic="true"><span className="small-label">END-OF-DAY BALANCE</span><p className="forecast-scope">{accountFilter === "all" ? `${accounts.length} ${accounts.length === 1 ? "account" : "accounts"}` : scopedAccounts[0]?.name}</p>
            {groups.length === 0 ? <p className="forecast-empty">Add an account to calculate balances.</p> : groups.map(group => <div key={group.currency} className="forecast-currency"><span className="currency-tag">{group.currency}</span><strong className={`forecast-amount ${!group.missing && group.balance < 0n ? "negative" : ""}`}>{group.missing ? "—" : money(group.balance, group.currency)}</strong>{group.missing ? <p className="field-help">{group.missing} {group.missing === 1 ? "account has" : "accounts have"} a starting balance after this date. Choose a later date or update its balance date.</p> : <dl className="forecast-breakdown"><div><dt>Starting balances</dt><dd>{money(group.opening, group.currency)}</dd></div><div><dt>Planned income</dt><dd className="positive">+{money(group.income, group.currency)}</dd></div><div><dt>Planned expenses</dt><dd>−{money(group.expenses, group.currency)}</dd></div>
              {group.hasInterest && <div><dt>Estimated interest</dt><dd className="positive">+{money(group.interest, group.currency)}</dd></div>}
            </dl>}</div>)}
          </div>
          <div className="day-events-section"><div className="section-heading"><h3>Events <span className="count-badge">{selectedEvents.length}</span></h3><button type="button" className="icon-button" aria-label="Add event for selected date" disabled={!accounts.length} onClick={() => setModal({ type: "event", date: selectedDate })}>＋</button></div>{selectedEvents.length === 0 ? <p className="empty-note">No events.</p> : <div className="selected-events">{selectedEvents.map(event => <button type="button" className="selected-event" key={event.id} onClick={() => setModal({ type: "event", date: selectedDate, event })}><span><strong>{event.label}</strong><small>{accounts.find(a => a.id === event.account_id)?.name} · {recurrenceLabel(event)}</small></span><span className={event.kind === "income" ? "positive" : ""}>{event.kind === "income" ? "+" : "−"}{money(toCents(event.amount), event.currency)}</span></button>)}</div>}</div>
          <details className="forecast-details"><summary>Calculation details</summary><p>Starting balance + active income − active expenses + estimated interest through this date. Events before each account’s balance date are excluded.</p>{groups.some(group => group.hasInterest) && <p>Simple interest accrues daily at the annual rate divided by 365, based on positive closing balances before interest. The total is rounded to cents.</p>}<p>Currencies are totaled separately. Timezone: {timezone}.</p></details>
        </aside>
      </div>
      {modal?.type === "account" && <AccountForm account={modal.account} today={today} currency={currency} eventCount={events.filter(e => e.account_id === modal.account?.id).length} actions={actions} onClose={() => setModal(null)} onSaved={accountSaved} onDeleted={accountDeleted} />}
      {modal?.type === "event" && <EventForm event={modal.event} date={modal.date} accounts={accounts} defaultAccountId={accountFilter === "all" ? accounts[0]?.id ?? "" : accountFilter} actions={actions} onClose={() => setModal(null)} onSaved={eventSaved} onDeleted={eventDeleted} />}
      {modal?.type === "schedules" && <ScheduleList events={scopedEvents} accounts={accounts} onClose={() => setModal(null)} onEdit={event => setModal({ type: "event", date: event.start_date, event })} />}
    </main>
  </DashboardChat>;
}
