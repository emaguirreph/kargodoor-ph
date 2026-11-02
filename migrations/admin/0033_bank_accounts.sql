-- ADMIN_DB only. Optional bank account tags so expenses and manual cash
-- records can say which account the money left or entered. The accounts
-- themselves are listed in lib/admin/bank-accounts.ts. Existing rows stay
-- NULL (no account picked), so no saved amount or date changes.
ALTER TABLE expenses ADD COLUMN paid_from_account TEXT;
ALTER TABLE expenses ADD COLUMN paid_to_account TEXT;
ALTER TABLE finance_cash_entries ADD COLUMN bank_account TEXT;
CREATE INDEX idx_expenses_paid_from_account ON expenses(paid_from_account, expense_date DESC);
CREATE INDEX idx_expenses_paid_to_account ON expenses(paid_to_account, expense_date DESC);
CREATE INDEX idx_finance_cash_entries_bank_account ON finance_cash_entries(bank_account, entry_date DESC);
