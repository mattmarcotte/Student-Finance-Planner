import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { AskEventProposal } from "./ask-buffer-types";
import { eventFields } from "./finance-fields";
import type { Account, CashFlow, CashFlowInput } from "./finance-types";
import { InputError, validateCashFlow } from "./finance-validation";
import { validDate } from "./finance";

const date = z.string().refine(validDate, "Use a valid YYYY-MM-DD date.");
const eventId = z.uuid().describe("Event schedule ID from list_events");

export const eventCreateSchema = z.strictObject({
  account_id: z.uuid().describe("Account ID from list_accounts"),
  label: z.string().trim().min(1).max(200),
  kind: z.enum(["income", "expense"]),
  amount: z.string().max(32).describe("Positive decimal amount in the account currency, e.g. 125.50"),
  start_date: date.describe("Date of the first occurrence, in YYYY-MM-DD format"),
  repeat_unit: z.enum(["day", "week", "month", "month_end", "year"]).nullable().optional()
    .describe("Null for one-time, month_end for the last day of each month"),
  repeat_every: z.number().int().min(1).max(10000).optional().describe("Number of units between occurrences, e.g. 2 weeks for biweekly"),
  end_date: date.nullable().optional().describe("Inclusive end date, or null for no end"),
  is_active: z.boolean().optional().describe("Whether to include the event in forecasts"),
});
export const eventEditSchema = eventCreateSchema.partial().extend({ event_id: eventId });
export const eventRemoveSchema = z.strictObject({ event_id: eventId });

type EventCreate = z.infer<typeof eventCreateSchema>;
type EventEdit = z.infer<typeof eventEditSchema>;
type EventChange = { operation: "create"; input: EventCreate }
  | { operation: "edit"; input: EventEdit }
  | { operation: "remove"; input: z.infer<typeof eventRemoveSchema> };

export async function loadEventAccount(supabase: SupabaseClient, id: string, userId?: string) {
  const query = supabase.from("accounts").select("name,currency").eq("id", id);
  if (userId) query.eq("user_id", userId);
  const { data, error } = await query.maybeSingle<Pick<Account, "name" | "currency">>();
  if (error || !data) throw new InputError("Choose one of your accounts for this event.");
  return data;
}

function eventInput(patch: Partial<EventCreate>, existing?: CashFlow): CashFlowInput {
  const repeatUnit = patch.repeat_unit === undefined ? existing?.repeat_unit ?? null : patch.repeat_unit;
  const existingInterval = repeatUnit === existing?.repeat_unit ? existing.repeat_every : null;
  return {
    account_id: patch.account_id ?? existing?.account_id ?? "",
    label: patch.label ?? existing?.label ?? "",
    kind: patch.kind ?? existing?.kind ?? "",
    amount: patch.amount ?? String(existing?.amount ?? ""),
    start_date: patch.start_date ?? existing?.start_date ?? "",
    repeat_unit: repeatUnit,
    repeat_every: patch.repeat_every ?? (repeatUnit ? existingInterval ?? 1 : null),
    end_date: patch.end_date === undefined ? (repeatUnit ? existing?.end_date ?? null : null) : patch.end_date,
    is_active: patch.is_active ?? existing?.is_active ?? true,
  };
}

export async function prepareEventChange(supabase: SupabaseClient, change: EventChange): Promise<AskEventProposal> {
  if (change.operation === "create") {
    const values = validateCashFlow(eventInput(change.input));
    const account = await loadEventAccount(supabase, values.account_id);
    return { kind: "event", operation: "create", after: { ...values, currency: account.currency, accountName: account.name } };
  }

  const { event_id } = change.input;
  const { data: event, error } = await supabase.from("cash_flows").select(`${eventFields},updated_at`)
    .eq("id", event_id).maybeSingle<CashFlow & { updated_at: string }>();
  if (error || !event) throw new InputError("Could not find that event.");
  const currentAccount = event.account_id ? await loadEventAccount(supabase, event.account_id) : null;
  const before = { ...event, accountName: currentAccount?.name ?? "Unassigned" };
  if (change.operation === "remove") return { kind: "event", operation: "remove", before };

  if (Object.keys(change.input).length === 1) throw new InputError("Provide at least one field to update.");
  const values = validateCashFlow(eventInput(change.input, event));
  const account = values.account_id === event.account_id && currentAccount
    ? currentAccount : await loadEventAccount(supabase, values.account_id);
  return { kind: "event", operation: "edit", before, after: { ...values, currency: account.currency, accountName: account.name } };
}
