import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

mkdirSync(".admin-local", { recursive: true });
await build({ entryPoints: ["tests/email-verification.test.ts"], bundle: true, platform: "node", format: "esm", packages: "external", outfile: ".admin-local/email-verification.test.mjs", alias: { "@": "." } });
const result = spawnSync(process.execPath, ["--test", ".admin-local/email-verification.test.mjs"], { stdio: "inherit" });
process.exit(result.status ?? 1);
