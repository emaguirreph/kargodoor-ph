import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

mkdirSync(".admin-local", { recursive: true });
await build({ entryPoints: ["tests/email-verification.test.ts", "tests/login-code.test.ts", "tests/signup-email.test.ts"], bundle: true, platform: "node", format: "esm", packages: "external", outdir: ".admin-local/email-otp", alias: { "@": "." } });
const result = spawnSync(process.execPath, ["--test", ".admin-local/email-otp/email-verification.test.js", ".admin-local/email-otp/login-code.test.js", ".admin-local/email-otp/signup-email.test.js"], { stdio: "inherit" });
process.exit(result.status ?? 1);
