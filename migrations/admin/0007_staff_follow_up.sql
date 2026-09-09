-- ADMIN_DB only. One shared, auditable operational follow-up note.
CREATE TABLE staff_follow_up (
 id INTEGER PRIMARY KEY CHECK(id = 1),
 note TEXT NOT NULL CHECK(length(note) <= 4000),
 updated_by_admin_user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
