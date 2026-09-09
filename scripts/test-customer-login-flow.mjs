import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
mkdirSync(".admin-local", { recursive: true });
await build({ entryPoints: ["tests/customer-login-flow.test.ts"], bundle: true, platform: "node", format: "esm", packages: "external", outfile: ".admin-local/customer-login-flow.test.mjs" });
const result = spawnSync(process.execPath, ["--test", ".admin-local/customer-login-flow.test.mjs"], { stdio: "inherit" });
process.exit(result.status ?? 1);
