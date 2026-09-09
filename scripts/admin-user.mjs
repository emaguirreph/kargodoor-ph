// Produces SQL for owner-reviewed provisioning; does not execute any database operation.
import { randomUUID } from "node:crypto";
const [email, name, role = "admin"] = process.argv.slice(2);
if (
  !email ||
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
  !name?.trim() ||
  !["owner", "admin", "viewer"].includes(role)
) {
  console.error(
    'Usage: node scripts/admin-user.mjs email "Full name" [viewer|admin|owner]',
  );
  process.exit(1);
}
const quote = (v) => `'${v.replaceAll("'", "''")}'`;
const now = new Date().toISOString();
console.log(
  `INSERT INTO admin_users (id,name,email,role,created_at,updated_at) VALUES (${[randomUUID(), name.trim(), email.toLowerCase(), role, now, now].map(quote).join(",")});`,
);
