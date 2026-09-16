-- ADMIN_DB only. Owner-editable customer communication templates.
CREATE TABLE message_templates (
  template_key TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 120),
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 8000),
  updated_by_admin_user_id TEXT REFERENCES admin_users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
