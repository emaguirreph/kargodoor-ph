ALTER TABLE customer_accounts
  ADD COLUMN password_state TEXT NOT NULL DEFAULT 'temporary'
  CHECK(password_state IN ('temporary', 'active'));
