-- 0001 already creates expenses. Extend it without replacing existing records.
ALTER TABLE expenses ADD COLUMN payee TEXT;
ALTER TABLE expenses ADD COLUMN payment_method TEXT;
ALTER TABLE expenses ADD COLUMN tracking_number TEXT;
ALTER TABLE expenses ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
UPDATE expenses SET updated_at = created_at WHERE updated_at = '';
CREATE INDEX idx_expenses_date ON expenses(expense_date DESC, created_at DESC);
