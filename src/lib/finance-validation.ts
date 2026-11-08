import { accountKinds, currencies, endOfMonth, toCents, validDate } from "./finance.ts";
import type { AccountInput, CashFlowInput, RepeatUnit } from "./finance-types.ts";

export class InputError extends Error {}

export function requireId(value: unknown) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new InputError("Please choose a valid account or event.");
  }
  return value;
}

function requireDate(value: unknown, label: string) {
  if (!validDate(value)) throw new InputError(`Choose a valid ${label}.`);
  return value;
}

function requireText(value: unknown, label: string, max: number) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new InputError(`${label} must contain 1–${max} characters.`);
  }
  return value.trim();
}

function requireAmount(value: unknown, positive: boolean) {
  if (typeof value !== "string") throw new InputError("Enter a valid amount.");
  try {
    const cents = toCents(value);
    if (positive && cents <= 0n) throw new Error();
  } catch {
    throw new InputError(positive ? "Enter an amount above zero, with at most two decimal places." : "Enter a balance with at most 12 digits and two decimal places.");
  }
  return value.trim();
}

function requireInterestRate(value: unknown) {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new InputError("Enter a valid annual interest rate.");
  const rate = value.trim();
  if (!rate) return 0;
  if (!/^(?:\d{1,3}(?:\.\d{0,3})?|\.\d{1,3})$/.test(rate) || Number(rate) > 100) {
    throw new InputError("Enter an annual interest rate from 0 to 100%, with up to three decimal places.");
  }
  return Number(rate);
}

export function validateAccount(input: AccountInput) {
  if (!input || typeof input !== "object") throw new InputError("Enter your account details.");
  if (!(accountKinds as readonly string[]).includes(input.kind)) throw new InputError("Choose an account type.");
  if (!(currencies as readonly string[]).includes(input.currency)) throw new InputError("Choose a supported currency.");
  return {
    name: requireText(input.name, "Account name", 80),
    kind: input.kind,
    currency: input.currency,
    opening_balance: requireAmount(input.opening_balance, false),
    balance_date: requireDate(input.balance_date, "balance date"),
    annual_interest_rate: requireInterestRate(input.annual_interest_rate),
  };
}

export function validateCashFlow(input: CashFlowInput) {
  if (!input || typeof input !== "object") throw new InputError("Enter your event details.");
  requireId(input.account_id);
  if (input.kind !== "income" && input.kind !== "expense") throw new InputError("Choose income or expense.");
  const date = requireDate(input.start_date, "event date");
  const start = input.repeat_unit === "month_end" ? endOfMonth(date) : date;
  let end: string | null = null;
  if (input.repeat_unit !== null) {
    if (!["day", "week", "month", "month_end", "year"].includes(input.repeat_unit)) throw new InputError("Choose a repeat frequency.");
    if (!Number.isInteger(input.repeat_every) || input.repeat_every! < 1 || input.repeat_every! > 10000) throw new InputError("Repeat intervals must be between 1 and 10,000.");
    if (input.end_date) {
      end = requireDate(input.end_date, "end date");
      if (end < start) throw new InputError("The end date cannot be before the first event.");
    }
  } else if (input.repeat_every !== null || input.end_date !== null) {
    throw new InputError("One-time events do not have repeat settings.");
  }
  if (typeof input.is_active !== "boolean") throw new InputError("Choose whether this event is active.");
  return {
    account_id: input.account_id,
    label: requireText(input.label, "Event name", 200),
    kind: input.kind,
    amount: requireAmount(input.amount, true),
    start_date: start,
    repeat_unit: input.repeat_unit as RepeatUnit | null,
    repeat_every: input.repeat_unit ? input.repeat_every : null,
    end_date: end,
    is_active: input.is_active,
  };
}
