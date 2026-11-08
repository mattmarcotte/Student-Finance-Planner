"use server";

import { createClient } from "@/lib/supabase/server";
import { InputError, requireId, validateAccount, validateCashFlow } from "@/lib/finance-validation";
import type { Account, AccountInput, ActionResult, CashFlow, CashFlowInput } from "@/lib/finance-types";

const accountFields = "id,name,kind,currency,opening_balance,balance_date,annual_interest_rate";
const eventFields = "id,account_id,label,kind,amount,currency,start_date,repeat_unit,repeat_every,end_date,is_active";

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

export async function deleteAccount(id: string): Promise<ActionResult<string>> {
  try {
    const { supabase, user } = await context();
    requireId(id);
    const { data, error } = await supabase.from("accounts").delete().eq("id", id).eq("user_id", user.id).select("id").single();
    if (error || !data) throw new Error();
    return { data: id };
  } catch (error) { return failure(error); }
}

export async function saveEvent(input: CashFlowInput): Promise<ActionResult<CashFlow>> {
  try {
    const { supabase, user } = await context();
    const values = validateCashFlow(input);
    if (input.id) requireId(input.id);
    const { data: account, error: accountError } = await supabase.from("accounts").select("currency").eq("id", values.account_id).eq("user_id", user.id).maybeSingle();
    if (accountError || !account) throw new InputError("Choose one of your accounts for this event.");
    const payload = { ...values, currency: account.currency };
    const query = input.id
      ? supabase.from("cash_flows").update(payload).eq("id", input.id).eq("user_id", user.id)
      : supabase.from("cash_flows").insert({ ...payload, user_id: user.id });
    const { data, error } = await query.select(eventFields).single<CashFlow>();
    if (error || !data) throw new Error();
    return { data };
  } catch (error) { return failure(error); }
}

export async function deleteEvent(id: string): Promise<ActionResult<string>> {
  try {
    const { supabase, user } = await context();
    requireId(id);
    const { data, error } = await supabase.from("cash_flows").delete().eq("id", id).eq("user_id", user.id).select("id").single();
    if (error || !data) throw new Error();
    return { data: id };
  } catch (error) { return failure(error); }
}
