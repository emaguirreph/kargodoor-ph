-- Email OTP: a one-time code + confirm link is emailed to the customer (automatically
-- when a new customer with an email is saved). The customer taps the link, or sends the
-- code back on Messenger and admin types it in. Either way the email is marked verified.
ALTER TABLE customers ADD COLUMN email_verified_at TEXT;
ALTER TABLE customers ADD COLUMN email_verified_address TEXT;

CREATE TABLE customer_email_codes (
  customer_id TEXT PRIMARY KEY NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  link_token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at TEXT NOT NULL
);
