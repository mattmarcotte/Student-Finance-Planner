import "server-only";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { AskAnswer } from "./ask-buffer-types";
import { eventCreateSchema, eventEditSchema, eventRemoveSchema, prepareEventChange } from "./event-edits";
import { accountFields, eventFields, profileFields } from "./finance-fields";
import { accountForecast, validDate } from "./finance";
import type { Account, CashFlow } from "./finance-types";
import { InputError } from "./finance-validation";
import { accountEditSchema, loadAccountForEdit, validateAccountEdit, writeAccountEdit } from "./account-edits";

const readOnly = { readOnlyHint: true, openWorldHint: false };
const accountId = z.uuid().describe("Account ID from list_accounts");
const dateInput = z.string().refine(validDate, "Use a valid YYYY-MM-DD date.");
const offsetInput = z.number().int().min(0).max(2_147_483_597).default(0);
const pageSize = 25;

function result(data: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }], structuredContent: data };
}

function page<T>(items: T[], offset: number) {
  return { items: items.slice(0, pageSize), next_offset: items.length > pageSize ? offset + pageSize : null };
}

export function createMcpServer(supabase: SupabaseClient, allowEdits: boolean,
  propose?: (proposal: NonNullable<AskAnswer["proposal"]>) => void) {
  const server = new McpServer({ name: "Buffer", version: "1.0.0" });

  server.registerTool("get_profile", {
    description: "Read the connected user's Buffer display name, default currency, and timezone.",
    annotations: readOnly,
  }, async () => {
    const { data, error } = await supabase.from("profiles").select(profileFields).maybeSingle();
    if (error) throw new Error("Could not load the profile.");
    return result({ profile: data });
  });

  server.registerTool("list_accounts", {
    description: "List manually tracked accounts, their starting balances and balance dates, currencies, and annual interest rates.",
    inputSchema: { offset: offsetInput },
    annotations: readOnly,
  }, async ({ offset }) => {
    const { data, error } = await supabase.from("accounts").select(accountFields)
      .order("id").range(offset, offset + pageSize);
    if (error) throw new Error("Could not load accounts.");
    return result(page(data, offset));
  });

  server.registerTool("list_events", {
    description: "List the connected user's planned income and expenses, with their recurrence rules. Supply an account ID to limit results to one account.",
    inputSchema: { account_id: accountId.optional(), offset: offsetInput },
    annotations: readOnly,
  }, async ({ account_id, offset }) => {
    const query = supabase.from("cash_flows").select(eventFields).order("id").range(offset, offset + pageSize);
    if (account_id) query.eq("account_id", account_id);
    const { data, error } = await query;
    if (error) throw new Error("Could not load events.");
    return result(page(data, offset));
  });

  server.registerTool("get_forecast", {
    description: "Calculate one account's end-of-day forecast on a date using Buffer's forecast engine. All monetary fields are integer-cent strings in the returned currency. Dates before the starting balance are unavailable. The maximum horizon is five years from the starting balance date.",
    inputSchema: { account_id: accountId, date: dateInput },
    annotations: readOnly,
  }, async ({ account_id, date }) => {
    const { data: account, error } = await supabase.from("accounts").select(accountFields)
      .eq("id", account_id).maybeSingle<Account>();
    if (error || !account) throw new Error("Could not find that account.");
    if (date < account.balance_date) return result({ date, balance_date: account.balance_date, forecast: null });
    if (Date.parse(date) - Date.parse(account.balance_date) > 5 * 366 * 86_400_000) {
      throw new Error("Choose a date within five years of the account's balance date.");
    }

    const events: CashFlow[] = [];
    for (let after: string | undefined; ;) {
      const query = supabase.from("cash_flows").select(eventFields).eq("account_id", account.id)
        .eq("is_active", true).lte("start_date", date).order("id").limit(500);
      if (after) query.gt("id", after);
      const { data, error } = await query.returns<CashFlow[]>();
      if (error) throw new Error("Could not load the events for this forecast.");
      if (!data.length) break;
      events.push(...data);
      after = data[data.length - 1].id;
    }
    const forecast = accountForecast(account, events, date)!;
    return result({ account_id, date, currency: account.currency, unit: "cents",
      forecast: Object.fromEntries(Object.entries(forecast).map(([key, cents]) => [key, cents.toString()])) });
  });

  if (propose || allowEdits) {
    server.registerTool(propose ? "propose_account_edit" : "update_account", {
      description: `${propose ? "Prepare an edit to an existing account for review" : "Edit an existing manually tracked account after asking the user"}. Supply both starting balance and balance date to rebase the forecast. Use decimal strings for balances and annual percentage rates. Include only fields the user asked to change.`,
      inputSchema: accountEditSchema,
      annotations: propose ? readOnly : { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    }, async edit => {
      const account = await loadAccountForEdit(supabase, edit.account_id);
      if (propose) {
        validateAccountEdit(account, edit);
        propose({ kind: "account", account, edit });
        return result({ status: "awaiting_approval" });
      }
      return result({ account: await writeAccountEdit(supabase, account, edit) });
    });
  }

  if (propose) {
    const reviewEvent = async (change: Parameters<typeof prepareEventChange>[1]) => {
      try {
        propose(await prepareEventChange(supabase, change));
        return result({ status: "awaiting_approval" });
      } catch (error) {
        if (error instanceof InputError) return result({ error: error.message });
        throw error;
      }
    };
    server.registerTool("propose_create_event", {
      description: "Prepare a new one-time or recurring income or expense for review. Look up the account ID with list_accounts.",
      inputSchema: eventCreateSchema,
      annotations: readOnly,
    }, input => reviewEvent({ operation: "create", input }));
    server.registerTool("propose_edit_event", {
      description: "Prepare an edit to an existing income or expense schedule for review. Look up the event ID with list_events. Supply only changed fields. This affects the entire schedule.",
      inputSchema: eventEditSchema,
      annotations: readOnly,
    }, input => reviewEvent({ operation: "edit", input }));
    server.registerTool("propose_remove_event", {
      description: "Prepare removal of an entire income or expense schedule for review. Look up the event ID with list_events.",
      inputSchema: eventRemoveSchema,
      annotations: readOnly,
    }, input => reviewEvent({ operation: "remove", input }));
  }

  return server;
}
