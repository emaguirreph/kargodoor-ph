-- ADMIN_DB only. Money moved between KargoDoor's own accounts (e.g. GCash to
-- UnionBank). Not income or expense; the transfer fee is its own expense.
CREATE TABLE account_transfers (
 id TEXT PRIMARY KEY NOT NULL,
 transfer_date TEXT NOT NULL,
 from_account TEXT NOT NULL,
 to_account TEXT NOT NULL,
 amount INTEGER NOT NULL CHECK(amount > 0),
 fee_expense_id TEXT REFERENCES expenses(id) ON DELETE SET NULL,
 reference_number TEXT,
 notes TEXT,
 created_by_admin_user_id TEXT,
 created_at TEXT NOT NULL,
 CHECK(from_account != to_account)
);
CREATE INDEX idx_account_transfers_date ON account_transfers(transfer_date DESC, created_at DESC);
