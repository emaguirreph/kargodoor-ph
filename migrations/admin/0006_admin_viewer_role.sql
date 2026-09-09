-- ADMIN_DB only. Add the read-only viewer role while preserving all existing users.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE admin_users_new (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  role TEXT NOT NULL CHECK(role IN ('owner','admin','viewer','disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO admin_users_new (
  id,
  name,
  email,
  role,
  created_at,
  updated_at
)
SELECT
  id,
  name,
  lower(email),
  role,
  created_at,
  updated_at
FROM admin_users;

DROP TABLE admin_users;

ALTER TABLE admin_users_new RENAME TO admin_users;

INSERT INTO admin_users (
  id,
  name,
  email,
  role,
  created_at,
  updated_at
)
VALUES
  (
    '70f6cc38-e198-4f01-a200-000000000001',
    'em.aguirreph@gmail.com',
    'em.aguirreph@gmail.com',
    'owner',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    '70f6cc38-e198-4f01-a200-000000000002',
    'Archie Aguirre',
    'archie.aguirre@gmail.com',
    'viewer',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    '70f6cc38-e198-4f01-a200-000000000003',
    'Patrick Lapid',
    'lapid.patrick@gmail.com',
    'viewer',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    '70f6cc38-e198-4f01-a200-000000000004',
    'Keah Reyes',
    'keahreyes.inquiry@gmail.com',
    'viewer',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
ON CONFLICT(email) DO UPDATE SET
  name = CASE
    WHEN admin_users.role IN ('owner','admin')
      THEN admin_users.name
    ELSE excluded.name
  END,
  role = CASE
    WHEN excluded.role = 'owner'
      THEN 'owner'
    WHEN admin_users.role IN ('owner','admin')
      THEN admin_users.role
    ELSE 'viewer'
  END,
  updated_at = CASE
    WHEN admin_users.role = excluded.role
      AND admin_users.name = excluded.name
      THEN admin_users.updated_at
    ELSE CURRENT_TIMESTAMP
  END;

PRAGMA foreign_key_check;
