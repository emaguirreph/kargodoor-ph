import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
const dir = ".admin-local";
mkdirSync(dir, { recursive: true, mode: 0o700 });
if (existsSync(".dev.vars")) {
  console.error(
    "Existing .dev.vars preserved. Use the existing local configuration; see ADMIN_PHASE1.md.",
  );
  process.exit(1);
}
const password = randomBytes(18).toString("base64url");
const salt = randomBytes(16).toString("hex");
const email = "local-admin@example.test";
const now = new Date().toISOString();
writeFileSync(
  ".dev.vars",
  `ADMIN_ORIGIN="http://localhost:8787"\nADMIN_CSRF_SECRET="${randomBytes(32).toString("hex")}"\nADMIN_LOCAL_DEV="true"\nLOCAL_ADMIN_EMAIL="${email}"\nLOCAL_ADMIN_HASH="${salt}:${scryptSync(password, salt, 64).toString("hex")}"\n`,
  { mode: 0o600, flag: "wx" },
);
const source = JSON.parse(readFileSync("wrangler.jsonc", "utf8"));
source.d1_databases = source.d1_databases.map((db) =>
  db.binding === "ADMIN_DB"
    ? { ...db, database_id: "00000000-0000-0000-0000-000000000001" }
    : db,
);
writeFileSync(
  "wrangler.admin-local.json",
  JSON.stringify(source, null, 2) + "\n",
);
const seed = `INSERT INTO admin_users (id,name,email,role,created_at,updated_at) VALUES ('${randomUUID()}','Local administrator','${email}','owner','${now}','${now}') ON CONFLICT(email) DO NOTHING;\n`;
writeFileSync(`${dir}/seed.sql`, seed, { mode: 0o600 });
for (const args of [
  [
    "d1",
    "migrations",
    "apply",
    "ADMIN_DB",
    "--local",
    "--config",
    "wrangler.admin-local.json",
  ],
  [
    "d1",
    "execute",
    "ADMIN_DB",
    "--local",
    "--config",
    "wrangler.admin-local.json",
    "--file",
    `${dir}/seed.sql`,
  ],
]) {
  const result = spawnSync("npx", ["wrangler", ...args], {
    stdio: "inherit",
    env: {
      ...process.env,
      WRANGLER_SEND_METRICS: "false",
      XDG_CONFIG_HOME: resolve(dir, "config"),
      WRANGLER_LOG_PATH: resolve(dir, "logs"),
      WRANGLER_REGISTRY_PATH: resolve(dir, "registry"),
    },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(
  `Local admin ready. Username: ${email}\nTemporary local password (save now; only its hash is stored): ${password}\nRun npm run admin:dev and open http://localhost:8787/admin/dashboard. Production data was not accessed.`,
);
