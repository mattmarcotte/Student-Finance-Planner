import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { accountFields } from "./finance-fields";
import { accountKinds, validDate } from "./finance";
import type { Account } from "./finance-types";
import { InputError, validateAccount } from "./finance-validation";

export const accountEditSchema = z.strictObject({
  account_id: z.uuid().describe("Account ID from list_accounts"),
  name: z.string().trim().min(1).max(80).optional(),
  kind: z.enum(accountKinds).optional(),
  opening_balance: z.string().max(32).optional(),
  balance_date: z.string().refine(validDate, "Use a valid YYYY-MM-DD date.").optional(),
  annual_interest_rate: z.string().trim().min(1).max(7).optional(),
});

export type AccountEdit = z.infer<typeof accountEditSchema>;
export type VersionedAccount = Account & { updated_at: string };

export async function loadAccountForEdit(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase.from("accounts").select(`${accountFields},updated_at`)
    .eq("id", id).maybeSingle<VersionedAccount>();
  if (error || !data) throw new InputError("Could not find that account.");
  return data;
}

export function validateAccountEdit(account: Account, { account_id, ...edits }: AccountEdit) {
  const fields = Object.keys(edits) as (keyof typeof edits)[];
  if (!fields.length) throw new InputError("Provide at least one field to update.");
  if ((edits.opening_balance === undefined) !== (edits.balance_date === undefined)) {
    throw new InputError("Provide the starting balance and balance date together.");
  }

  const validated = validateAccount({
    ...account,
    opening_balance: String(account.opening_balance),
    annual_interest_rate: String(account.annual_interest_rate),
    ...edits,
  });
  return Object.fromEntries(fields.map(field => [field, validated[field]]));
}

export async function writeAccountEdit(supabase: SupabaseClient, account: VersionedAccount, edit: AccountEdit, userId?: string) {
  const patch = validateAccountEdit(account, edit);
  const query = supabase.from("accounts").update(patch).eq("id", account.id).eq("updated_at", account.updated_at);
  if (userId) query.eq("user_id", userId);
  const { data, error } = await query.select(accountFields).maybeSingle<Account>();
  if (error) throw new InputError("Could not update that account. Try again.");
  if (!data) throw new InputError("This account changed since it was reviewed. Ask for a new proposal.");
  return data;
}
