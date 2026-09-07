interface CloudflareEnv {
  ADMIN_DB: import("@cloudflare/workers-types").D1Database;
  TRACKING_DB: D1Database;
}
