import { spawn } from "node:child_process";
import { resolve } from "node:path";
const child = spawn(
  "npx",
  [
    "wrangler",
    "dev",
    "--local",
    "--ip",
    "127.0.0.1",
    "--port",
    "8787",
    "--config",
    "wrangler.admin-local.json",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      WRANGLER_SEND_METRICS: "false",
      XDG_CONFIG_HOME: resolve(".admin-local/config"),
      WRANGLER_LOG_PATH: resolve(".admin-local/logs"),
      WRANGLER_REGISTRY_PATH: resolve(".admin-local/registry"),
    },
  },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
