"use server";

import { createClient } from "@/lib/supabase/server";
import { accountEditSchema, loadAccountForEdit, writeAccountEdit, type AccountEdit } from "@/lib/account-edits";
import type { AskEventProposal } from "@/lib/ask-buffer-types";
import { loadEventAccount } from "@/lib/event-edits";
import { accountFields, eventFields } from "@/lib/finance-fields";
import { InputError, requireId, validateAccount, validateCashFlow } from "@/lib/finance-validation";
import type { Account, AccountInput, ActionResult, CashFlow, CashFlowInput } from "@/lib/finance-types";

async function context() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new InputError("Your session has ended. Please sign in again.");
  return { supabase, user };
}

function failure(error: unknown) {
  return { error: error instanceof InputError ? error.message : "We couldn’t save this change. Please try again." };
}

export async function saveAccount(input: AccountInput): Promise<ActionResult<Account>> {
  try {
    const { supabase, user } = await context();
    const { currency, ...values } = validateAccount(input);
    if (input.id) requireId(input.id);
    const query = input.id
      ? supabase.from("accounts").update(values).eq("id", input.id).eq("user_id", user.id)
      : supabase.from("accounts").insert({ ...values, currency, user_id: user.id });
    const { data, error } = await query.select(accountFields).single<Account>();
    if (error || !data) throw new Error();
    return { data };
  } catch (error) { return failure(error); }
}

export async function approveAccountEdit(edit: AccountEdit, reviewedVersion: string): Promise<ActionResult<Account>> {
  try {
    const { supabase, user } = await context();
    const parsed = accountEditSchema.safeParse(edit);
    if (!parsed.success) throw new InputError("Ask Buffer for a new account edit proposal.");
    const account = await loadAccountForEdit(supabase, parsed.data.account_id);
    if (account.updated_at !== reviewedVersion) {
      throw new InputError("This account changed since it was reviewed. Ask for a new proposal.");
    }
    return { data: await writeAccountEdit(supabase, account, parsed.data, user.id) };
  } catch (error) { return failure(error); }
}

export async function deleteAccount(id: string): Promise<ActionResult<string>> {
  try {
    const { supabase, user } = await context();
    requireId(id);
    const { data, error } = await supabase.from("accounts").delete().eq("id", id).eq("user_id", user.id).select("id").single();
    if (error || !data) throw new Error();
    return { data: id };
  } catch (error) { return failure(error); }
}

const staleEvent = "This event changed or was removed since it was reviewed. Ask for a new proposal.";

async function persistEvent({ supabase, user }: Awaited<ReturnType<typeof context>>, input: CashFlowInput, reviewedVersion?: string) {
  const values = validateCashFlow(input);
  if (input.id) requireId(input.id);
  const account = await loadEventAccount(supabase, values.account_id, user.id);
  const payload = { ...values, currency: account.currency };
  const query = input.id
    ? supabase.from("cash_flows").update(payload).eq("id", input.id).eq("user_id", user.id)
    : supabase.from("cash_flows").insert({ ...payload, user_id: user.id });
  if (reviewedVersion) query.eq("updated_at", reviewedVersion);
  const { data, error } = await query.select(eventFields).maybeSingle<CashFlow>();
  if (!error && !data && reviewedVersion) throw new InputError(staleEvent);
  if (error || !data) throw new Error();
  return data;
}

async function removeEvent({ supabase, user }: Awaited<ReturnType<typeof context>>, id: string, reviewedVersion?: string) {
  requireId(id);
  const query = supabase.from("cash_flows").delete().eq("id", id).eq("user_id", user.id);
  if (reviewedVersion) query.eq("updated_at", reviewedVersion);
  const { data, error } = await query.select("id").maybeSingle();
  if (!error && !data && reviewedVersion) throw new InputError(staleEvent);
  if (error || !data) throw new Error();
  return id;
}

export async function approveEventChange(proposal: AskEventProposal): Promise<ActionResult<CashFlow | string>> {
  try {
    const session = await context();
    if (proposal?.operation === "create") {
      return { data: await persistEvent(session, { ...proposal.after, id: undefined }) };
    }
    if (proposal?.operation !== "edit" && proposal?.operation !== "remove") {
      throw new InputError("Ask Buffer for a new event proposal.");
    }
    const { id, updated_at } = proposal.before;
    requireId(id);
    if (typeof updated_at !== "string" || !Number.isFinite(Date.parse(updated_at))) {
      throw new InputError("Ask Buffer for a new event proposal.");
    }
    return { data: proposal.operation === "remove"
      ? await removeEvent(session, id, updated_at)
      : await persistEvent(session, { ...proposal.after, id }, updated_at) };
  } catch (error) {
    return { error: error instanceof InputError ? error.message : "Couldn’t confirm the change. Refresh and check Event schedules before trying again." };
  }
}

export async function saveEvent(input: CashFlowInput): Promise<ActionResult<CashFlow>> {
  try {
    return { data: await persistEvent(await context(), input) };
  } catch (error) { return failure(error); }
}

export async function deleteEvent(id: string): Promise<ActionResult<string>> {
  try {
    return { data: await removeEvent(await context(), id) };
  } catch (error) { return failure(error); }
}
