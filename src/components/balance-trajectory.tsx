"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { accountForecastSeries, addDays, addMonths, dateLabel, money, toCents, validDate } from "@/lib/finance";
import type { Account, CashFlow } from "@/lib/finance-types";

type TrajectoryPoint = {
  balance: bigint;
  interest: bigint;
};

type ForecastStat = {
  label: string;
  value: string;
  date?: string;
  note?: string;
  tone?: "positive" | "negative";
};

function forecastDates(start: string, months: number) {
  const candidate = addMonths(start, months);
  const end = validDate(candidate) ? candidate : "9999-12-31";
  const dates = [start];
  while (dates[dates.length - 1] < end) dates.push(addDays(dates[dates.length - 1], 1));
  return dates;
}

function targetAmount(value: string) {
  if (!value.trim()) return null;
  try {
    const cents = toCents(value);
    return cents < 0n ? null : cents;
  } catch {
    return null;
  }
}

export function BalanceTrajectory({ accounts, events, today, preferredCurrency, userId, scope }: {
  accounts: Account[];
  events: CashFlow[];
  today: string;
  preferredCurrency: string;
  userId: string;
  scope: string;
}) {
  const [start, setStart] = useState(today);
  const [months, setMonths] = useState(1);
  const [currencyChoice, setCurrencyChoice] = useState(preferredCurrency);
  const currencies = [...new Set(accounts.map(account => account.currency))];
  const currency = currencies.includes(currencyChoice) ? currencyChoice : currencies[0] ?? preferredCurrency;
  const dates = useMemo(() => forecastDates(start, months), [start, months]);
  const points = useMemo(() => {
    const totals: (TrajectoryPoint | null)[] = dates.map(() => ({ balance: 0n, interest: 0n }));
    for (const account of accounts) {
      if (account.currency !== currency) continue;
      accountForecastSeries(account, events, dates).forEach((forecast, index) => {
        const total = totals[index];
        totals[index] = forecast && total ? {
          balance: total.balance + forecast.balance,
          interest: total.interest + forecast.interest,
        } : null;
      });
    }
    return totals;
  }, [accounts, events, currency, dates]);
  const storageKey = `buffer:target:${userId}:${scope}:${currency}`;

  return (
    <section className="trajectory-panel" aria-labelledby="trajectory-heading">
      <div className="trajectory-header">
        <div>
          <h2 id="trajectory-heading">Balance trajectory</h2>
          {accounts.length > 0 && <p>{scope === "all" ? "All accounts" : accounts[0].name} · {currency}</p>}
        </div>
        {accounts.length > 0 && <div className="trajectory-controls">
          <div className="trajectory-period" role="group" aria-label="Chart timeframe">
            <button type="button" aria-pressed={months === 1} onClick={() => setMonths(1)}>1 month</button>
            <button type="button" aria-pressed={months === 12} onClick={() => setMonths(12)}>1 year</button>
          </div>
          <label>
            Start date
            <input type="date" min="0001-01-01" max="9999-12-31" value={start} onInput={event => {
              if (validDate(event.currentTarget.value)) setStart(event.currentTarget.value);
            }} />
          </label>
          {currencies.length > 1 && <label>
            Chart currency
            <select value={currency} onChange={event => setCurrencyChoice(event.target.value)}>
              {currencies.map(code => <option key={code}>{code}</option>)}
            </select>
          </label>}
        </div>}
      </div>
      {accounts.length > 0
        ? <TrajectoryTarget key={storageKey} storageKey={storageKey} currency={currency} dates={dates} points={points} />
        : <p className="empty-note">Add an account to see its projected balance over time.</p>}
    </section>
  );
}

function TrajectoryTarget({ storageKey, currency, dates, points }: {
  storageKey: string;
  currency: string;
  dates: string[];
  points: (TrajectoryPoint | null)[];
}) {
  const [value, setValue] = useState("");
  useEffect(() => {
    try {
      setValue(localStorage.getItem(storageKey) ?? "");
    } catch { /* The chart still works when storage is unavailable. */ }
  }, [storageKey]);

  const target = targetAmount(value);
  const invalid = Boolean(value.trim()) && target === null;
  const below = target === null ? 0 : points.filter(point => point && point.balance < target).length;
  const hasForecast = points.some(point => point !== null);

  function changeTarget(next: string) {
    setValue(next);
    try {
      if (!next.trim()) localStorage.removeItem(storageKey);
      else if (targetAmount(next) !== null) localStorage.setItem(storageKey, next);
    } catch { /* Keep the target for this visit. */ }
  }

  return <>
    <div className="trajectory-target">
      <label>
        Buffer target ({currency})
        <input type="text" inputMode="decimal" value={value} placeholder="Optional"
          aria-invalid={invalid || undefined} aria-describedby={invalid ? "trajectory-target-error" : undefined}
          onChange={event => changeTarget(event.target.value)} />
      </label>
      {invalid && <p className="trajectory-target-error" id="trajectory-target-error">Enter a non-negative amount with up to two decimal places.</p>}
      {target !== null && hasForecast && <p className={below > 0 ? "trajectory-below" : "positive"}>
        {below > 0 ? `${below} ${below === 1 ? "day" : "days"} below buffer` : "At or above buffer"}
      </p>}
    </div>
    {hasForecast
      ? <TrajectoryPlot key={dates[0] + dates[dates.length - 1]} dates={dates} points={points} currency={currency} target={target} />
      : <p className="empty-note">No starting balances are available in this date range.</p>}
  </>;
}

function roundCents(numerator: bigint, denominator: bigint) {
  const absolute = numerator < 0n ? -numerator : numerator;
  const rounded = (absolute + denominator / 2n) / denominator;
  return numerator < 0n ? -rounded : rounded;
}

function ForecastStats({ label, stats }: { label: string; stats: ForecastStat[] }) {
  return <dl className="trajectory-stats" aria-label={label}>
    {stats.map(stat => <div className="trajectory-stat" key={stat.label}>
      <dt>{stat.label}</dt>
      <dd>
        <strong className={stat.tone}>{stat.value}</strong>
        {stat.date && <time dateTime={stat.date}>{dateLabel(stat.date, true)}</time>}
        {stat.note && <span className="trajectory-stat-note">{stat.note}</span>}
      </dd>
    </div>)}
  </dl>;
}

function TrajectoryPlot({ dates, points, currency, target }: {
  dates: string[];
  points: (TrajectoryPoint | null)[];
  currency: string;
  target: bigint | null;
}) {
  const plot = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [index, setIndex] = useState<number | null>(null);
  useEffect(() => {
    const element = plot.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(220, entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const balances = points.map(point => point?.balance ?? null);
  const firstPoint = balances.findIndex(balance => balance !== null);
  const active = index ?? firstPoint;
  const activeBalance = balances[active];
  const firstBalance = balances[firstPoint]!;
  let lowestPoint = firstPoint;
  let lastPoint = firstPoint;
  let highestBalance = firstBalance;
  for (let point = firstPoint; point < balances.length; point++) {
    const balance = balances[point];
    if (balance === null) continue;
    if (balance < balances[lowestPoint]!) lowestPoint = point;
    if (balance > highestBalance) highestBalance = balance;
    lastPoint = point;
  }
  const lowestBalance = balances[lowestPoint]!;
  const lastBalance = balances[lastPoint]!;
  const change = lastBalance - firstBalance;
  const elapsedDays = BigInt(lastPoint - firstPoint);
  // Account forecasts store interest through each date. The difference gives interest
  // accrued between the two closing balances, even when the chart starts later.
  const interest = points[lastPoint]!.interest - points[firstPoint]!.interest;
  const dailyChange = elapsedDays > 0n ? roundCents(change, elapsedDays) : null;
  const monthlyChange = elapsedDays > 0n ? roundCents(change * 30n, elapsedDays) : null;

  function changeStat(label: string, amount: bigint | null, note?: string): ForecastStat {
    if (amount === null) return { label, value: "—", note: "Requires two dates" };
    return {
      label,
      value: `${amount > 0n ? "+" : ""}${money(amount, currency)}`,
      tone: amount > 0n ? "positive" : amount < 0n ? "negative" : undefined,
      note,
    };
  }

  const summary: ForecastStat[] = [
    { label: "Start balance", value: money(firstBalance, currency), date: dates[firstPoint] },
    { label: "End balance", value: money(lastBalance, currency), date: dates[lastPoint] },
    changeStat("Net change", change),
    { label: "Lowest balance", value: money(lowestBalance, currency), date: dates[lowestPoint],
      tone: lowestBalance < (target ?? 0n) ? "negative" : undefined },
  ];
  const breakdown = [
    changeStat("Average daily change", dailyChange),
    changeStat("Average monthly change", monthlyChange, "30-day equivalent"),
    changeStat("Estimated interest", interest, "Between start and end"),
    changeStat("Net cash flow", change - interest, "Income less expenses"),
  ];
  let low = target !== null && target < lowestBalance ? target : lowestBalance;
  let high = target !== null && target > highestBalance ? target : highestBalance;
  const padding = (high - low) / 10n || 100n;
  low -= padding;
  high += padding;
  const left = 62;
  const right = width - 12;
  const top = 12;
  const bottom = 188;
  const last = dates.length - 1;
  const x = (point: number) => left + (right - left) * (last ? point / last : 0.5);
  const y = (amount: bigint) => bottom - (bottom - top) * Number(amount - low) / Number(high - low);
  const path = balances.flatMap((balance, point) => balance === null ? [] : [
    `${point === 0 || balances[point - 1] === null ? "M" : "L"}${x(point)},${y(balance)}`,
  ]).join(" ");
  const axisMoney = new Intl.NumberFormat("en-CA", {
    style: "currency", currency, currencyDisplay: "narrowSymbol", notation: "compact", maximumFractionDigits: 2,
  });
  const spansYears = dates[0].slice(0, 4) !== dates[last].slice(0, 4);
  const axisDate = new Intl.DateTimeFormat("en-CA", {
    month: "short", day: "numeric", year: spansYears ? "2-digit" : undefined, timeZone: "UTC",
  });
  const tickCount = width < 500 ? 2 : 4;
  const ticks = [...new Set(Array.from({ length: tickCount + 1 }, (_, i) => Math.round(last * i / tickCount)))];
  const readout = `${dateLabel(dates[active], true)} · ${activeBalance === null ? "No starting balance" : money(activeBalance, currency)}`;

  function inspectPointer(clientX: number) {
    const rect = plot.current?.getBoundingClientRect();
    if (!rect) return;
    const position = (clientX - rect.left) * width / rect.width;
    setIndex(Math.max(0, Math.min(last, Math.round(last * (position - left) / (right - left)))));
  }

  return <>
    <ForecastStats label="Forecast statistics" stats={summary} />
    <div ref={plot} className="trajectory-plot" role="slider" tabIndex={0}
      aria-label="Inspect projected balance by date" aria-valuemin={0} aria-valuemax={last}
      aria-valuenow={active} aria-valuetext={readout}
      onPointerMove={event => { if (event.pointerType === "mouse") inspectPointer(event.clientX); }}
      onPointerDown={event => inspectPointer(event.clientX)}
      onKeyDown={event => {
        const positions: Partial<Record<string, number>> = {
          ArrowLeft: active - 1, ArrowDown: active - 1, ArrowRight: active + 1,
          ArrowUp: active + 1, Home: 0, End: last,
        };
        const next = positions[event.key];
        if (next === undefined) return;
        event.preventDefault();
        setIndex(Math.max(0, Math.min(last, next)));
      }}>
      <svg width="100%" height="216" viewBox={`0 0 ${width} 216`} aria-hidden="true">
        {[0, 1, 2, 3].map(tick => {
          const amount = low + (high - low) * BigInt(tick) / 3n;
          return <g key={tick}>
            <line className="trajectory-grid" x1={left} x2={right} y1={y(amount)} y2={y(amount)} />
            <text className="trajectory-axis" x={left - 7} y={y(amount)} dy=".32em" textAnchor="end">{axisMoney.format(Number(amount) / 100)}</text>
          </g>;
        })}
        {target !== null && <line className="trajectory-buffer-line" x1={left} x2={right} y1={y(target)} y2={y(target)} />}
        <path className="trajectory-balance-line" d={path} fill="none" />
        {balances.filter(balance => balance !== null).length === 1 &&
          <circle className="trajectory-dot" cx={x(firstPoint)} cy={y(balances[firstPoint]!)} r="3.5" />}
        <line className="trajectory-cursor" x1={x(active)} x2={x(active)} y1={top} y2={bottom} />
        {activeBalance !== null && <circle className="trajectory-dot" cx={x(active)} cy={y(activeBalance)} r="4" />}
        {ticks.map(tick => <text className="trajectory-axis" key={tick} x={x(tick)} y="208"
          textAnchor={tick === 0 ? "start" : tick === last ? "end" : "middle"}>
          {axisDate.format(new Date(`${dates[tick]}T00:00:00Z`))}
        </text>)}
      </svg>
    </div>
    <div className="trajectory-footer">
      <span className="trajectory-readout">{readout}</span>
      <span className="trajectory-legend"><i />Projected balance</span>
      {target !== null && <span className="trajectory-legend trajectory-buffer-legend"><i />Buffer {money(target, currency)}</span>}
    </div>
    <ForecastStats label="Forecast breakdown" stats={breakdown} />
  </>;
}
