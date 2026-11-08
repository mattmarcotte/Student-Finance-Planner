export type AccountKind = "checking" | "savings" | "cash" | "other";
export type RepeatUnit = "day" | "week" | "month" | "month_end" | "year";

export type Account = {
  id: string;
  name: string;
  kind: AccountKind;
  currency: string;
  opening_balance: string | number;
  balance_date: string;
  annual_interest_rate: string | number;
};

export type CashFlow = {
  id: string;
  account_id: string | null;
  label: string;
  kind: "income" | "expense";
  amount: string | number;
  currency: string;
  start_date: string;
  repeat_unit: RepeatUnit | null;
  repeat_every: number | null;
  end_date: string | null;
  is_active: boolean;
};

export type AccountInput = {
  id?: string;
  name: string;
  kind: string;
  currency: string;
  opening_balance: string;
  balance_date: string;
  annual_interest_rate?: string;
};
export type CashFlowInput = {
  id?: string;
  account_id: string;
  label: string;
  kind: string;
  amount: string;
  start_date: string;
  repeat_unit: string | null;
  repeat_every: number | null;
  end_date: string | null;
  is_active: boolean;
};
export type ActionResult<T> = { data: T; error?: never } | { error: string; data?: never };
export type WorkspaceActions = {
  saveAccount: (input: AccountInput) => Promise<ActionResult<Account>>;
  deleteAccount: (id: string) => Promise<ActionResult<string>>;
  saveEvent: (input: CashFlowInput) => Promise<ActionResult<CashFlow>>;
  deleteEvent: (id: string) => Promise<ActionResult<string>>;
};
