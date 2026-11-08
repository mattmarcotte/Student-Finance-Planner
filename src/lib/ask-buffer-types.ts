import type { AccountEdit, VersionedAccount } from "./account-edits";
import type { CashFlow } from "./finance-types";

export const askHistoryLimit = 9;
export const askQuestionLimit = 1500;
export const askReplyLimit = 8000;

export type AskMessage = { role: "user" | "assistant"; text: string };
export type AskAccountProposal = { kind: "account"; account: VersionedAccount; edit: AccountEdit };
export type EventPreview = Omit<CashFlow, "id"> & { accountName: string };
type ReviewedEvent = EventPreview & { id: string; updated_at: string };
type ProposedEvent = EventPreview & { account_id: string; amount: string };
export type AskEventProposal = { kind: "event" } & (
  | { operation: "create"; after: ProposedEvent }
  | { operation: "edit"; before: ReviewedEvent; after: ProposedEvent }
  | { operation: "remove"; before: ReviewedEvent }
);
export type AskAnswer = { reply: string; proposal?: AskAccountProposal | AskEventProposal };
