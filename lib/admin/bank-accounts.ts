// Bank accounts shown under Billing & Finance → Bank Accounts and offered on the
// Expense and Cash Flow forms. Saved records keep only the id, so keep ids stable;
// a new account is added here (no database change needed).

export type BankAccount = {
  id: string;
  owner: "nihao" | "kargodoor";
  bank: string;
  branch: string;
  accountName: string;
  accountNumber: string;
};

export const nihaoPayableTo = "NIHAO EXPRESS LOGISTICS CORPORATION";

// From Ni Hao's 2026 Bank Account Details. All checks and payments are
// addressed to NIHAO EXPRESS LOGISTICS CORPORATION.
export const nihaoBankAccounts = [
  { id: "nihao-sterling", owner: "nihao", bank: "Sterling Bank of Asia", branch: "Malabon · Checking", accountName: nihaoPayableTo, accountNumber: "532600010047" },
  { id: "nihao-metrobank", owner: "nihao", bank: "Metrobank", branch: "Masangkay · Checking", accountName: nihaoPayableTo, accountNumber: "279-7-27901627-7" },
  { id: "nihao-bdo", owner: "nihao", bank: "BDO", branch: "Malabon Concepcion · Checking", accountName: nihaoPayableTo, accountNumber: "0128 8800 1087" },
] as const satisfies readonly BankAccount[];

// The same accounts customers are told to pay into (customer-messages.ts paymentInstructions).
export const kargodoorBankAccounts = [
  { id: "kd-unionbank", owner: "kargodoor", bank: "UnionBank of the Philippines", branch: "Bank transfer", accountName: "KargoDoor Cargo Forwarding", accountNumber: "002170017106" },
  { id: "kd-gcash", owner: "kargodoor", bank: "GCash", branch: "E-wallet", accountName: "EMMARUTH AGUIRRE", accountNumber: "0919 932 3077" },
] as const satisfies readonly BankAccount[];

export const bankAccounts: readonly BankAccount[] = [...nihaoBankAccounts, ...kargodoorBankAccounts];

export const nihaoAccountIds = nihaoBankAccounts.map((account) => account.id) as [
  (typeof nihaoBankAccounts)[number]["id"], ...(typeof nihaoBankAccounts)[number]["id"][],
];
export const kargodoorAccountIds = kargodoorBankAccounts.map((account) => account.id) as [
  (typeof kargodoorBankAccounts)[number]["id"], ...(typeof kargodoorBankAccounts)[number]["id"][],
];

export function bankAccountById(id: unknown) {
  return bankAccounts.find((account) => account.id === id);
}

/** Short label such as "BDO ••1087" or "GCash ••3077". */
export function bankAccountLabel(id: unknown) {
  const account = bankAccountById(id);
  if (!account) return id ? String(id) : "";
  const digits = account.accountNumber.replace(/\D/g, "");
  return `${account.bank} ••${digits.slice(-4)}`;
}

/** Full details in the order a bank transfer form asks for them. */
export function bankAccountDetails(account: BankAccount) {
  return [
    `Bank: ${account.bank} (${account.branch})`,
    `Account Name: ${account.accountName}`,
    `Account Number: ${account.accountNumber}`,
  ].join("\n");
}

const escHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** A <select> of accounts for the Expense and Cash Flow forms; blank means "not recorded". */
export function bankAccountSelect(name: string, label: string, accounts: readonly BankAccount[], value: unknown, prompt: string) {
  return `<label>${escHtml(label)}<select name="${escHtml(name)}"><option value="">${escHtml(prompt)}</option>${accounts.map((account) =>
    `<option value="${escHtml(account.id)}"${value === account.id ? " selected" : ""}>${escHtml(`${account.bank} — ${account.accountNumber} (${account.accountName})`)}</option>`).join("")}</select></label>`;
}
