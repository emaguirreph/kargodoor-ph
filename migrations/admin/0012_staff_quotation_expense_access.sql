-- ADMIN_DB only. Adds a restricted staff role and ownership for new quotations and expenses.
-- Existing records retain NULL ownership and remain available to owner/admin users only.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE admin_users_new (
 id TEXT PRIMARY KEY NOT NULL,
 name TEXT NOT NULL,
 email TEXT NOT NULL COLLATE NOCASE UNIQUE,
 role TEXT NOT NULL CHECK(role IN ('owner','admin','viewer','staff','disabled')),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);

INSERT INTO admin_users_new (id, name, email, role, created_at, updated_at)
SELECT id, name, email, role, created_at, updated_at FROM admin_users;

DROP TABLE admin_users;
ALTER TABLE admin_users_new RENAME TO admin_users;

ALTER TABLE quotations ADD COLUMN prepared_by_admin_user_id TEXT REFERENCES admin_users(id) ON DELETE RESTRICT;
ALTER TABLE expenses ADD COLUMN created_by_admin_user_id TEXT REFERENCES admin_users(id) ON DELETE RESTRICT;

CREATE INDEX idx_quotations_prepared_by_admin_user ON quotations(prepared_by_admin_user_id, updated_at DESC);
CREATE INDEX idx_expenses_created_by_admin_user ON expenses(created_by_admin_user_id, updated_at DESC);
