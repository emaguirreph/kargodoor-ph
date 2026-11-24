-- FB Posts (Em, 2026-11-24): schedule posts on the KargoDoor PH Facebook Page from the admin,
-- through Meta's Graph API (same setup as Sabong Sentral's FB Scheduler).

-- The connected Facebook Page. token_enc is the Page token, AES-GCM encrypted with the
-- TOKEN_KEY Worker secret. It never reaches the browser, a URL or a log.
CREATE TABLE social_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fb_page_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  token_enc TEXT,
  token_status TEXT NOT NULL DEFAULT 'ok' CHECK (token_status IN ('ok','expired','missing')),
  tasks TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  checked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Every call to Meta and its result. request is a short summary, never a token.
CREATE TABLE social_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id INTEGER,
  post_ref TEXT,
  action TEXT NOT NULL,
  request TEXT,
  http_status INTEGER,
  fb_error_code INTEGER,
  result TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX social_log_page ON social_log (page_id, id);

-- The posting plan: one automatic post a day (kind 'auto', from the post library) plus
-- Em's own posts (kind 'own', her image and caption). Her post replaces that day's
-- automatic post (the auto row is set to 'skipped' with replaced = 1).
-- post_date / post_time are Manila time. image_path is a public path on kargodoorph.com
-- (/fb-cards/... card or /api/insights/images/<id> upload) that Facebook downloads.
CREATE TABLE fb_posts (
  id TEXT PRIMARY KEY NOT NULL,
  post_date TEXT NOT NULL,
  post_time TEXT NOT NULL DEFAULT '19:00',
  kind TEXT NOT NULL CHECK (kind IN ('auto','own')),
  topic TEXT,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  caption TEXT NOT NULL,
  image_path TEXT,
  image_id TEXT,
  link TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','scheduled','posted','skipped','failed')),
  replaced INTEGER NOT NULL DEFAULT 0,
  fb_post_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX fb_posts_date ON fb_posts (post_date, status);
CREATE INDEX fb_posts_topic ON fb_posts (topic);
