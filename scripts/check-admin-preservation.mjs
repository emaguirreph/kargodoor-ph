import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const baseline = "1b69263d864812fc1a5f65814ef9103acda5a0ec";
const git = (...args) => execFileSync("git", args, { maxBuffer: 64 * 1024 * 1024 });
const allowed = new Set([".gitignore","cloudflare-env.d.ts","package.json","package-lock.json","wrangler.jsonc"]);
const existing = git("ls-tree","-r","--name-only",baseline).toString().trim().split("\n");
for(const name of existing) {
  if (!allowed.has(name)) assert.deepEqual(readFileSync(name),git("show",`${baseline}:${name}`),name + " changed");
}
const old = JSON.parse(git("show",`${baseline}:wrangler.jsonc`));
const current = JSON.parse(readFileSync("wrangler.jsonc","utf8"));
assert.deepEqual(current.d1_databases.filter(d=>d.binding!=="ADMIN_DB"),old.d1_databases);
const admin = current.d1_databases.filter(d=>d.binding === "ADMIN_DB");
assert.equal(admin.length,1);
assert.ok(admin[0].database_id !== old.d1_databases[0].database_id);
assert.equal(admin[0].migrations_dir,"migrations/admin");
for(const key of Object.keys(old)) if(key !== "d1_databases") assert.deepEqual(current[key],old[key],key);
const oldLock = JSON.parse(git("show",`${baseline}:package-lock.json`));
const lock = JSON.parse(readFileSync("package-lock.json","utf8"));
for(const [name,value] of Object.entries(oldLock.packages)) if(name) assert.deepEqual(lock.packages[name],value,name);
console.log("Preservation verified: every existing public page, asset, tracking API and /admin editor is byte-identical; TRACKING_DB, Worker settings and existing locked packages are unchanged.");
