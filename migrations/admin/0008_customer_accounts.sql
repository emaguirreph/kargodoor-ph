-- ADMIN_DB only. Customer credentials are intentionally separate from admin_users.
CREATE TABLE customer_accounts (
 id TEXT PRIMARY KEY NOT NULL,
 customer_id TEXT NOT NULL UNIQUE REFERENCES customers(id) ON DELETE RESTRICT,
 login_email TEXT NOT NULL COLLATE NOCASE UNIQUE
  CHECK(login_email = lower(trim(login_email)) COLLATE BINARY),
 password_hash TEXT NOT NULL CHECK(length(password_hash) >= 32),
 password_salt TEXT NOT NULL CHECK(length(password_salt) >= 16),
 password_algorithm TEXT NOT NULL CHECK(password_algorithm = 'scrypt'),
 password_n INTEGER NOT NULL CHECK(password_n >= 16384),
 password_r INTEGER NOT NULL CHECK(password_r >= 1),
 password_p INTEGER NOT NULL CHECK(password_p >= 1),
 password_key_length INTEGER NOT NULL CHECK(password_key_length >= 32),
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);

CREATE TABLE customer_sessions (
 id TEXT PRIMARY KEY NOT NULL,
 customer_account_id TEXT NOT NULL REFERENCES customer_accounts(id) ON DELETE RESTRICT,
 token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash) >= 32),
 created_at TEXT NOT NULL,
 expires_at TEXT NOT NULL CHECK(expires_at > created_at)
);

CREATE TABLE customer_password_reset_tokens (
 id TEXT PRIMARY KEY NOT NULL,
 customer_account_id TEXT NOT NULL REFERENCES customer_accounts(id) ON DELETE RESTRICT,
 token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash) >= 32),
 created_at TEXT NOT NULL,
 expires_at TEXT NOT NULL CHECK(expires_at > created_at),
 used_at TEXT CHECK(used_at IS NULL OR used_at >= created_at)
);

CREATE INDEX idx_customer_accounts_email ON customer_accounts(login_email);
CREATE INDEX idx_customer_sessions_account_expiry ON customer_sessions(customer_account_id, expires_at);
CREATE INDEX idx_customer_reset_tokens_account_expiry ON customer_password_reset_tokens(customer_account_id, expires_at);
