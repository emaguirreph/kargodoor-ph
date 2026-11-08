-- ADMIN_DB only. Online sign-up for new clients (Em, 2026-11-08): instead of
-- Em creating each customer, she sends the client kargodoorph.com/customer/signup.
-- The client fills in their details and picks a password. The request waits in
-- admin → Bookings → Sign-ups until an admin approves it (which creates the
-- customer with a KDOOR code and the portal sign-in) or rejects it.
CREATE TABLE customer_signups (
 id TEXT PRIMARY KEY NOT NULL,
 full_name TEXT NOT NULL CHECK(length(trim(full_name)) BETWEEN 2 AND 160),
 company_name TEXT,
 mobile TEXT NOT NULL CHECK(length(mobile) = 11),
 email TEXT NOT NULL CHECK(email = lower(trim(email)) AND length(email) BETWEEN 5 AND 254),
 address TEXT NOT NULL,
 ships_what TEXT,
 heard_from TEXT,
 referral_code TEXT,
 -- The password the client chose, hashed the same way as customer_accounts.
 password_hash TEXT NOT NULL CHECK(length(password_hash) >= 32),
 password_salt TEXT NOT NULL CHECK(length(password_salt) >= 16),
 password_n INTEGER NOT NULL CHECK(password_n >= 16384),
 password_r INTEGER NOT NULL CHECK(password_r >= 1),
 password_p INTEGER NOT NULL CHECK(password_p >= 1),
 password_key_length INTEGER NOT NULL CHECK(password_key_length >= 32),
 status TEXT NOT NULL DEFAULT 'New' CHECK(status IN ('New','Approved','Rejected')),
 customer_id TEXT REFERENCES customers(id) ON DELETE RESTRICT,
 reject_reason TEXT,
 client_key TEXT,
 reviewed_by_admin_user_id TEXT,
 reviewed_at TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX customer_signups_status ON customer_signups(status, created_at);
CREATE INDEX customer_signups_mobile ON customer_signups(mobile, created_at);
CREATE INDEX customer_signups_email ON customer_signups(email, created_at);
CREATE INDEX customer_signups_client_key ON customer_signups(client_key, created_at);
