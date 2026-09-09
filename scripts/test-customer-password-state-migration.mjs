import { build } from "esbuild";
import { spawnSync } from "node:child_process";

await build({ entryPoints: ["tests/customer-password-state-migration.test.ts"], bundle: true, platform: "node", format: "esm", packages: "external", outfile: ".admin-local/customer-password-state-migration.test.mjs" });
const result = spawnSync(process.execPath, ["--test", ".admin-local/customer-password-state-migration.test.mjs"], { stdio: "inherit" });
process.exit(result.status ?? 1);
