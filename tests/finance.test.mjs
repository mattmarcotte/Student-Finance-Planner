import assert from "node:assert/strict";
import { test } from "node:test";
import { accountForecast, accountForecastSeries, addMonths, calendarDays, endOfMonth, money, occurrencesThrough, occursOn, recurrenceLabel, toCents, validDate } from "../src/lib/finance.ts";
import { validateAccount, validateCashFlow } from "../src/lib/finance-validation.ts";

const account = { id: "account-a", name: "Chequing", kind: "checking", currency: "CAD", opening_balance: "1000.00", balance_date: "2026-11-05" };
const event = { id: "event-a", account_id: account.id, label: "Pay", kind: "income", amount: "450.00", currency: "CAD", start_date: "2026-11-06", repeat_unit: "week", repeat_every: 2, end_date: null, is_active: true };

test("two-week pay is anchored to its first date, with inclusive cutoffs", () => {
  assert.equal(occurrencesThrough(event, "2026-11-05"), 0);
  assert.equal(occurrencesThrough(event, "2026-11-06"), 1);
  assert.equal(occurrencesThrough(event, "2026-11-19"), 1);
  assert.equal(occurrencesThrough(event, "2026-11-20"), 2);
  assert.equal(occursOn(event, "2026-11-20"), true);
  assert.equal(occursOn(event, "2026-11-21"), false);
  assert.equal(occurrencesThrough({ ...event, end_date: "2026-11-20" }, "2027-01-01"), 2);
  assert.equal(occurrencesThrough({ ...event, end_date: "2026-11-19" }, "2027-01-01"), 1);
});

test("monthly schedules clamp shorter months without drifting their anchor", () => {
  const rent = { ...event, start_date: "2026-01-31", repeat_unit: "month", repeat_every: 1 };
  assert.equal(occursOn(rent, "2026-02-28"), true);
  assert.equal(occursOn(rent, "2026-03-28"), false);
  assert.equal(occursOn(rent, "2026-03-31"), true);
  assert.equal(occurrencesThrough(rent, "2026-03-30"), 2);
  assert.equal(occurrencesThrough(rent, "2026-03-31"), 3);
  assert.equal(occursOn({ ...rent, repeat_every: 2 }, "2026-02-28"), false);
  assert.equal(occursOn({ ...rent, repeat_every: 2 }, "2026-03-31"), true);
});

test("yearly leap-day schedules return to February 29 in leap years", () => {
  const leap = { ...event, start_date: "2024-02-29", repeat_unit: "year", repeat_every: 1 };
  assert.equal(occursOn(leap, "2025-02-28"), true);
  assert.equal(occursOn(leap, "2028-02-28"), false);
  assert.equal(occursOn(leap, "2028-02-29"), true);
  assert.equal(occurrencesThrough(leap, "2028-02-29"), 5);
});

test("month-end schedules follow actual month ends without changing ordinary monthly rules", () => {
  const monthEnd = { ...event, start_date: "2026-11-30", repeat_unit: "month_end", repeat_every: 1 };
  assert.equal(occurrencesThrough(monthEnd, "2026-11-29"), 0);
  for (const date of ["2026-11-30", "2026-12-31", "2027-01-31", "2027-02-28", "2027-04-30"]) assert.equal(occursOn(monthEnd, date), true);
  for (const date of ["2026-12-30", "2027-01-30", "2027-02-27", "2027-04-29"]) assert.equal(occursOn(monthEnd, date), false);
  assert.equal(occurrencesThrough(monthEnd, "2027-02-27"), 3);
  assert.equal(occurrencesThrough(monthEnd, "2027-02-28"), 4);
  assert.equal(occurrencesThrough({ ...monthEnd, end_date: "2027-02-27" }, "2027-12-31"), 3);
  assert.equal(occurrencesThrough({ ...monthEnd, end_date: "2027-02-28" }, "2027-12-31"), 4);
  const monthly = { ...monthEnd, repeat_unit: "month" };
  assert.equal(occursOn(monthly, "2026-12-30"), true);
  assert.equal(occursOn(monthly, "2026-12-31"), false);
  assert.equal(recurrenceLabel(monthEnd), "End of month");
});

test("month-end schedules handle leap years, custom intervals, and rebased balances", () => {
  const monthEnd = { ...event, start_date: "2028-01-31", repeat_unit: "month_end", repeat_every: 1 };
  assert.equal(occursOn(monthEnd, "2028-02-28"), false);
  assert.equal(occursOn(monthEnd, "2028-02-29"), true);
  assert.equal(occursOn({ ...monthEnd, repeat_every: 2 }, "2028-02-29"), false);
  assert.equal(occursOn({ ...monthEnd, repeat_every: 2 }, "2028-03-31"), true);
  const rebased = { ...account, balance_date: "2028-02-01" };
  assert.equal(accountForecast(rebased, [monthEnd], "2028-02-28").balance, 100000n);
  assert.equal(accountForecast(rebased, [monthEnd], "2028-02-29").balance, 145000n);
  assert.equal(accountForecast(rebased, [monthEnd], "2028-03-31").balance, 190000n);
  assert.equal(endOfMonth("2028-02-03"), "2028-02-29");
  assert.equal(endOfMonth("9999-12-01"), "9999-12-31");
  assert.equal(occursOn({ ...monthEnd, start_date: "9999-11-30" }, "9999-12-31"), true);
});

test("forecast includes baseline-day events and excludes already-accounted-for dates", () => {
  const daily = { ...event, amount: "0.10", start_date: "2026-11-01", repeat_unit: "day", repeat_every: 1 };
  const expense = { ...event, id: "expense", kind: "expense", amount: "200.00", start_date: "2026-11-05", repeat_unit: null, repeat_every: null };
  assert.equal(accountForecast(account, [daily, expense], "2026-11-04"), null);
  assert.equal(accountForecast(account, [daily, expense], "2026-11-05").balance, 80010n);
  assert.equal(accountForecast(account, [daily, expense], "2026-11-07").balance, 80030n);
  assert.equal(accountForecast({ ...account, balance_date: "2026-11-07", opening_balance: "900" }, [daily, expense], "2026-11-07").balance, 90010n);
});

test("accounts, currencies, inactive schedules, and unassigned events stay isolated", () => {
  const ignored = [
    { ...event, account_id: "account-b" }, { ...event, currency: "USD" },
    { ...event, is_active: false }, { ...event, account_id: null },
  ];
  assert.equal(accountForecast(account, ignored, "2026-12-31").balance, 100000n);
  assert.equal(accountForecast(account, [event], "2026-11-20").balance, 190000n);
  assert.equal(accountForecast({ ...account, opening_balance: "-25.01" }, [], "2026-11-20").balance, -2501n);
});

test("interest accrues on positive closing balances after each day's scheduled events", () => {
  const savings = { ...account, annual_interest_rate: "3.650" };
  const oneTime = { ...event, repeat_unit: null, repeat_every: null };
  const events = [
    { ...oneTime, kind: "expense", amount: "1200", start_date: "2026-11-06" },
    { ...oneTime, kind: "expense", amount: "100", start_date: "2026-11-07" },
    { ...oneTime, kind: "income", amount: "800", start_date: "2026-11-07" },
  ];
  assert.equal(accountForecast(savings, events, "2026-11-05").interest, 10n);
  assert.equal(accountForecast(savings, events, "2026-11-06").interest, 10n);
  const forecast = accountForecast(savings, events, "2026-11-08");
  assert.equal(forecast.interest, 20n);
  assert.equal(forecast.balance, 50020n);
  assert.equal(accountForecast(account, events, "2026-11-08").interest, 0n);
  const dates = ["2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"];
  const series = accountForecastSeries(savings, events, dates);
  assert.deepEqual(series.map(point => point?.balance ?? null), [null, 100010n, -19990n, 50015n, 50020n]);
});

test("interest honors recurring dates and accumulates fractional cents until display", () => {
  const savings = { ...account, opening_balance: "10", balance_date: "2028-02-27", annual_interest_rate: 3.65 };
  const monthEnd = { ...event, amount: "100", start_date: "2028-01-31", repeat_unit: "month_end", repeat_every: 1 };
  assert.equal(accountForecast(savings, [monthEnd], "2028-02-28").interest, 0n);
  assert.equal(accountForecast(savings, [monthEnd], "2028-02-29").interest, 1n);
  assert.equal(accountForecast(savings, [monthEnd], "2028-03-01").interest, 2n);
  assert.equal(accountForecast({ ...savings, opening_balance: "1000" }, [], "2029-02-25").interest, 3650n);
});

test("daily recurrence remains exact across DST and long forecast windows", () => {
  const daily = { ...event, start_date: "2026-10-31", repeat_unit: "day", repeat_every: 1 };
  assert.equal(occurrencesThrough(daily, "2026-11-03"), 4);
  assert.equal(occurrencesThrough({ ...daily, start_date: "2000-01-01" }, "2099-12-31"), 36525);
});

test("money math and formatting preserve exact cents and large totals", () => {
  assert.equal(toCents("0.10") + toCents("0.20"), 30n);
  assert.equal(toCents("-0.01"), -1n);
  assert.equal(money(123456789012345678n, "CAD"), "$1,234,567,890,123,456.78");
  assert.equal(money(-1n, "CAD"), "-$0.01");
  for (const value of ["NaN", "Infinity", "1.001", "1e2"]) assert.throws(() => toCents(value));
});

test("calendar and date validation handle leap years and year boundaries", () => {
  assert.equal(validDate("2026-02-29"), false);
  assert.equal(validDate("2028-02-29"), true);
  assert.equal(validDate("0001-01-01"), true);
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(calendarDays("2026-11-01").length, 42);
  assert.ok(calendarDays("0001-01-01").every(date => !date || validDate(date)));
  assert.ok(calendarDays("9999-12-01").every(date => !date || validDate(date)));
});

test("server input validation rejects malformed financial records", () => {
  const accountInput = { name: "  Savings  ", kind: "savings", currency: "CAD", opening_balance: "-1.20", balance_date: "2026-11-05" };
  assert.equal(validateAccount(accountInput).name, "Savings");
  assert.throws(() => validateAccount({ ...accountInput, opening_balance: "NaN" }));
  assert.throws(() => validateAccount({ ...accountInput, balance_date: "2026-02-30" }));
  assert.equal(validateAccount({ ...accountInput, annual_interest_rate: "4.125" }).annual_interest_rate, 4.125);
  assert.equal(validateAccount({ ...accountInput, annual_interest_rate: "" }).annual_interest_rate, 0);
  for (const rate of ["-1", "100.001", "2.1234", "NaN", "1e1"]) {
    assert.throws(() => validateAccount({ ...accountInput, annual_interest_rate: rate }));
  }
  const input = { account_id: "00000000-0000-4000-8000-000000000001", label: "Rent", kind: "expense", amount: "900.00", start_date: "2026-11-05", repeat_unit: "month", repeat_every: 1, end_date: null, is_active: true };
  assert.equal(validateCashFlow(input).amount, "900.00");
  assert.throws(() => validateCashFlow({ ...input, repeat_every: 0 }));
  assert.throws(() => validateCashFlow({ ...input, end_date: "2026-01-01" }));
  assert.throws(() => validateCashFlow({ ...input, amount: "-1" }));
  assert.throws(() => validateCashFlow({ ...input, account_id: "forged" }));
  const monthEnd = validateCashFlow({ ...input, start_date: "2028-02-03", repeat_unit: "month_end" });
  assert.equal(monthEnd.start_date, "2028-02-29");
  assert.equal(monthEnd.repeat_unit, "month_end");
  assert.throws(() => validateCashFlow({ ...input, repeat_unit: "month_end", end_date: "2026-11-20" }));
  assert.throws(() => validateCashFlow({ ...input, repeat_unit: "fortnight" }));
});
