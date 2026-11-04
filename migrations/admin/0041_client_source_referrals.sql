-- ADMIN_DB only. Who brought each client (partner split) and the friend who
-- referred them (referral commission), set once on the customer (Em, 2026-11-04).
-- Existing customers start as 'company' (50/50) until Em changes them.
ALTER TABLE customers ADD COLUMN client_source TEXT NOT NULL DEFAULT 'company'
  CHECK(client_source IN ('ae','pk','company','ref_ae','ref_pk','ref_company'));
ALTER TABLE customers ADD COLUMN referral_code TEXT;
ALTER TABLE customers ADD COLUMN referrer_name TEXT;
ALTER TABLE customers ADD COLUMN referrer_pay_to TEXT;
-- Starts the 12-month partner bonus clock; blank means the customer's created date.
ALTER TABLE customers ADD COLUMN client_since TEXT;
CREATE INDEX idx_expenses_category_tracking ON expenses(category, tracking_number);
