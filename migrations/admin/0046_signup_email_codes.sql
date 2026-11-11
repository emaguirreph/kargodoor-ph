-- Sign-up email check: after signing up online, the client gets a 6-digit code by
-- email and types it on the sign-up page. Admin sees "Email verified" on the sign-up.
ALTER TABLE customer_signups ADD COLUMN email_verified_at TEXT;
ALTER TABLE customer_signups ADD COLUMN email_code_hash TEXT;
ALTER TABLE customer_signups ADD COLUMN email_code_expires_at TEXT;
ALTER TABLE customer_signups ADD COLUMN email_code_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE customer_signups ADD COLUMN email_code_sent_at TEXT;
ALTER TABLE customer_signups ADD COLUMN email_code_sends INTEGER NOT NULL DEFAULT 0;
