-- Admin-authored public Insights articles and their R2 cover-image keys.
CREATE TABLE insights (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL COLLATE NOCASE UNIQUE,
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 180),
  body TEXT NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 50000),
  cover_image_key TEXT,
  status TEXT NOT NULL DEFAULT 'Draft' CHECK(status IN ('Draft','Published')),
  published_at TEXT,
  created_by_admin_user_id TEXT NOT NULL REFERENCES admin_users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE insight_images (
  id TEXT PRIMARY KEY NOT NULL,
  data BLOB NOT NULL,
  mime_type TEXT NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/webp')),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_insights_published ON insights(status, published_at DESC);
