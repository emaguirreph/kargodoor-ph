-- Customer portal: "Email me a sign-in code". One pending 6-digit code per portal account.
CREATE TABLE customer_login_codes (
  account_id TEXT PRIMARY KEY NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at TEXT NOT NULL
);
