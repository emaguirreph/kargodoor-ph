-- ADMIN_DB only. Manual cash and customer-credit records; invoice payments remain separate.
CREATE TABLE finance_cash_entries (
 id TEXT PRIMARY KEY NOT NULL,
 entry_date TEXT NOT NULL,
 entry_type TEXT NOT NULL CHECK(entry_type IN (
   'Opening Cash Balance','Owner Contribution','Other Cash Received',
   'Customer Reimbursement Due','Customer Payment Received',
   'Adjustment Increase','Adjustment Decrease'
 )),
 customer_id TEXT REFERENCES customers(id) ON DELETE RESTRICT,
 related_entry_id TEXT REFERENCES finance_cash_entries(id) ON DELETE RESTRICT,
 amount INTEGER NOT NULL CHECK(amount > 0),
 reference_number TEXT,
 notes TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);

CREATE INDEX idx_finance_cash_entries_date ON finance_cash_entries(entry_date DESC, created_at DESC);
CREATE INDEX idx_finance_cash_entries_customer ON finance_cash_entries(customer_id, entry_date DESC);
CREATE INDEX idx_finance_cash_entries_related ON finance_cash_entries(related_entry_id);
