import type { Account, CashFlow } from "./finance-types.ts";

const DAY = 86_400_000;
export const currencies = ["CAD", "USD", "EUR", "GBP"] as const;
export const accountKinds = ["checking", "savings", "cash", "other"] as const;

export function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "0001-01-01") return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function dateLabel(value: string, short = false) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC", month: short ? "short" : "long", day: "numeric", year: "numeric",
  }).format(new Date(`${value}T00:00:00Z`));
}

export function todayInZone(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  return `${parts.find(p => p.type === "year")!.value}-${parts.find(p => p.type === "month")!.value}-${parts.find(p => p.type === "day")!.value}`;
}

export function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function addMonths(value: string, months: number) {
  const date = new Date(`${value}T00:00:00Z`);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const nextMonth = new Date(date);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  nextMonth.setUTCDate(0);
  date.setUTCDate(Math.min(day, nextMonth.getUTCDate()));
  return date.toISOString().slice(0, 10);
}

export function endOfMonth(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
}

export function calendarDays(month: string): string[] {
  const first = `${month.slice(0, 7)}-01`;
  const weekday = new Date(`${first}T00:00:00Z`).getUTCDay();
  const start = addDays(first, -weekday);
  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(start, index);
    return validDate(date) ? date : "";
  });
}

// Calculate in integer cents, including totals across arbitrarily many accounts.
export function toCents(value: string | number): bigint {
  const text = String(value).trim();
  if (!/^-?\d{1,12}(?:\.\d{1,2})?$/.test(text)) throw new Error("Use an amount with at most 12 digits and two decimal places.");
  const [whole, fraction = ""] = text.replace(/^-/, "").split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return text.startsWith("-") ? -cents : cents;
}

export function money(cents: bigint, currency: string) {
  const absolute = cents < 0n ? -cents : cents;
  const whole = new Intl.NumberFormat("en-CA").format(absolute / 100n);
  const fraction = String(absolute % 100n).padStart(2, "0");
  const parts = new Intl.NumberFormat("en-CA", {
    style: "currency", currency, currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).formatToParts(cents < 0n ? -0 : 0);
  return parts.map(part => part.type === "integer" ? whole : part.type === "fraction" ? fraction : part.value).join("");
}

// Number of occurrences through an inclusive date. Constant time, even years out.
export function occurrencesThrough(event: CashFlow, through: string): number {
  if (!event.is_active || through < event.start_date) return 0;
  const end = event.end_date && event.end_date < through ? event.end_date : through;
  if (end < event.start_date) return 0;
  if (!event.repeat_unit) return 1;
  const interval = event.repeat_every ?? 1;
  if (interval <= 0 || !Number.isInteger(interval)) return 0;
  if (event.repeat_unit === "day" || event.repeat_unit === "week") {
    const days = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${event.start_date}T00:00:00Z`)) / DAY);
    return Math.floor(days / (interval * (event.repeat_unit === "week" ? 7 : 1))) + 1;
  }
  const monthInterval = interval * (event.repeat_unit === "year" ? 12 : 1);
  const startMonth = Number(event.start_date.slice(0, 4)) * 12 + Number(event.start_date.slice(5, 7));
  const endMonth = Number(end.slice(0, 4)) * 12 + Number(end.slice(5, 7));
  let index = Math.floor((endMonth - startMonth) / monthInterval);
  const candidate = addMonths(event.start_date, index * monthInterval);
  if ((event.repeat_unit === "month_end" ? endOfMonth(candidate) : candidate) > end) index--;
  return Math.max(0, index + 1);
}

export function occursOn(event: CashFlow, date: string) {
  if (date < event.start_date) return false;
  return occurrencesThrough(event, date) > (date === "0001-01-01" ? 0 : occurrencesThrough(event, addDays(date, -1)));
}

export function accountForecast(account: Account, events: CashFlow[], date: string) {
  if (date < account.balance_date) return null;
  let income = 0n;
  let expenses = 0n;
  const before = account.balance_date === "0001-01-01" ? null : addDays(account.balance_date, -1);
  for (const event of events) {
    if (event.account_id !== account.id || event.currency !== account.currency) continue;
    const count = occurrencesThrough(event, date) - (before ? occurrencesThrough(event, before) : 0);
    if (count <= 0) continue;
    const amount = toCents(event.amount) * BigInt(count);
    if (event.kind === "income") income += amount;
    else expenses += amount;
  }
  const opening = toCents(account.opening_balance);
  return { opening, income, expenses, balance: opening + income - expenses };
}

export function recurrenceLabel(event: Pick<CashFlow, "repeat_unit" | "repeat_every">) {
  if (!event.repeat_unit) return "One time";
  const every = event.repeat_every ?? 1;
  if (event.repeat_unit === "month_end") return every === 1 ? "End of month" : `Every ${every} months, at month end`;
  return every === 1 ? `Every ${event.repeat_unit}` : `Every ${every} ${event.repeat_unit}s`;
}
