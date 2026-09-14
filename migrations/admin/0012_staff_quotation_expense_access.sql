-- ADMIN_DB only. Adds a restricted staff role and ownership for new quotations and expenses.
-- Existing records retain NULL ownership and remain available to owner/admin users only.
-- D1 validates foreign keys at the end of a migration. Preserve the two
-- existing audit tables that reference admin_users while the role constraint
-- is upgraded, then restore their constraints, indexes, and immutability rules.
CREATE TABLE activity_log_hold (
 id TEXT PRIMARY KEY NOT NULL,
 admin_user_id TEXT NOT NULL,
 action TEXT NOT NULL,
 entity_type TEXT NOT NULL,
 entity_id TEXT NOT NULL,
 old_value TEXT CHECK(old_value IS NULL OR json_valid(old_value)),
 new_value TEXT CHECK(new_value IS NULL OR json_valid(new_value)),
 notes TEXT,
 created_at TEXT NOT NULL
);
INSERT INTO activity_log_hold SELECT * FROM activity_log;
DROP TABLE activity_log;

CREATE TABLE staff_follow_up_hold (
 id INTEGER PRIMARY KEY CHECK(id = 1),
 note TEXT NOT NULL CHECK(length(note) <= 4000),
 updated_by_admin_user_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
INSERT INTO staff_follow_up_hold SELECT * FROM staff_follow_up;
DROP TABLE staff_follow_up;

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

CREATE TABLE activity_log (
 id TEXT PRIMARY KEY NOT NULL,
 admin_user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
 action TEXT NOT NULL,
 entity_type TEXT NOT NULL,
 entity_id TEXT NOT NULL,
 old_value TEXT CHECK(old_value IS NULL OR json_valid(old_value)),
 new_value TEXT CHECK(new_value IS NULL OR json_valid(new_value)),
 notes TEXT,
 created_at TEXT NOT NULL
);
INSERT INTO activity_log SELECT * FROM activity_log_hold;
DROP TABLE activity_log_hold;
CREATE INDEX idx_activity_admin ON activity_log(admin_user_id);
CREATE INDEX idx_activity_entity ON activity_log(entity_type, entity_id, created_at);
CREATE TRIGGER activity_log_no_update BEFORE UPDATE ON activity_log BEGIN
 SELECT RAISE(ABORT, 'Activity logs are immutable');
END;
CREATE TRIGGER activity_log_no_delete BEFORE DELETE ON activity_log BEGIN
 SELECT RAISE(ABORT, 'Activity logs are immutable');
END;

CREATE TABLE staff_follow_up (
 id INTEGER PRIMARY KEY CHECK(id = 1),
 note TEXT NOT NULL CHECK(length(note) <= 4000),
 updated_by_admin_user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
INSERT INTO staff_follow_up SELECT * FROM staff_follow_up_hold;
DROP TABLE staff_follow_up_hold;

ALTER TABLE quotations ADD COLUMN prepared_by_admin_user_id TEXT REFERENCES admin_users(id) ON DELETE RESTRICT;
ALTER TABLE expenses ADD COLUMN created_by_admin_user_id TEXT REFERENCES admin_users(id) ON DELETE RESTRICT;

CREATE INDEX idx_quotations_prepared_by_admin_user ON quotations(prepared_by_admin_user_id, updated_at DESC);
CREATE INDEX idx_expenses_created_by_admin_user ON expenses(created_by_admin_user_id, updated_at DESC);
