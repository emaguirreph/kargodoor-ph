// Multiple packages on one shipment, end to end on an isolated local D1 emulator; never reads or writes remote databases.
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes, scryptSync, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import assert from "node:assert/strict";
const root = process.cwd(),
  dir = resolve(".admin-local", `packages-${Date.now()}`);
mkdirSync(dir, { recursive: true, mode: 0o700 });
const config = resolve(dir, "wrangler.json"),
  state = resolve(dir, "state");
const origin = "http://localhost:8788";
const source = JSON.parse(readFileSync("wrangler.jsonc", "utf8"));
source.main = resolve(".open-next/worker.js");
source.assets.directory = resolve(".open-next/assets");
source.d1_databases = source.d1_databases.map((d) => ({
  ...d,
  database_id:
    d.binding === "ADMIN_DB"
      ? "00000000-0000-0000-0000-000000000001"
      : d.database_id,
  ...(d.binding === "ADMIN_DB"
    ? { migrations_dir: resolve("migrations/admin") }
    : {}),
}));
writeFileSync(config, JSON.stringify(source));
const password = randomBytes(24).toString("base64url"),
  salt = randomBytes(16).toString("hex");
writeFileSync(
  resolve(dir, ".dev.vars"),
  `ADMIN_ORIGIN="${origin}"\nADMIN_LOCAL_DEV="true"\nLOCAL_ADMIN_EMAIL="local-admin@example.test"\nLOCAL_ADMIN_HASH="${salt}:${scryptSync(password, salt, 64).toString("hex")}"\nADMIN_CSRF_SECRET="${randomBytes(32).toString("hex")}"\n`,
  { mode: 0o600 },
);
const env = {
  ...process.env,
  WRANGLER_SEND_METRICS: "false",
  XDG_CONFIG_HOME: resolve(dir, "config"),
  WRANGLER_LOG_PATH: resolve(dir, "logs"),
  WRANGLER_REGISTRY_PATH: resolve(dir, "registry"),
};
const cli = (args) => {
  const r = spawnSync(
    "npx",
    ["wrangler", ...args, "--config", config, "--persist-to", state],
    { encoding: "utf8", env, cwd: root },
  );
  if (r.status !== 0) throw new Error(r.stderr + r.stdout);
  return r.stdout;
};
cli(["d1", "migrations", "apply", "ADMIN_DB", "--local"]);
const uid = randomUUID();
cli([
  "d1",
  "execute",
  "ADMIN_DB",
  "--local",
  "--command",
    `INSERT INTO admin_users VALUES ('${uid}','Local admin','local-admin@example.test','owner','2026-01-01','2026-01-01')`,
]);
let logs = "";
const server = spawn(
  "npx",
  [
    "wrangler",
    "dev",
    "--local",
    "--ip",
    "127.0.0.1",
    "--port",
    "8788",
    "--config",
    config,
    "--persist-to",
    state,
  ],
  { env, cwd: root, stdio: ["ignore", "pipe", "pipe"], detached: true },
);
server.stdout.on("data", (d) => (logs += d));
server.stderr.on("data", (d) => (logs += d));
const authorization =
  "Basic " +
  Buffer.from(`local-admin@example.test:${password}`).toString("base64");
let get = (path, auth = true) =>
  fetch(origin + path, {
    headers: auth === "invalid"
      ? { authorization: "Basic invalid" }
      : auth ? { authorization } : {},
    redirect: "manual",
  });
const token = (html) => {
  const m = html.match(/name="csrf" value="([^"]+)"/);
  assert.ok(m, "CSRF token present");
  return m[1];
};
const revision = (html) => {
  const m = html.match(/name="revision" value="([^"]*)"/);
  assert.ok(m);
  return m[1];
};
let post = (path, values, extra = {}) =>
  fetch(origin + path, {
    method: "POST",
    headers: {
      authorization,
      Origin: origin,
      "Content-Type": "application/x-www-form-urlencoded",
      ...extra,
    },
    body: new URLSearchParams(values),
    redirect: "manual",
  });
try {
  for (let n = 0; n < 80; n++) {
    try {
      await get("/admin/dashboard", false);
      break;
    } catch {
      if (n === 79) throw new Error(logs);
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  // The local dev server can drop the first connection after a CLI database
  // read; retry that request once (only when no response came back).
  const retry = async (fn) => { try { return await fn(); } catch (e) { if (!String(e?.cause ?? e).includes("other side closed")) throw e; await new Promise((r) => setTimeout(r, 1000)); return fn(); } };
  const get2 = get, post2 = post;
  get = (...a) => retry(() => get2(...a));
  post = (...a) => retry(() => post2(...a));
  const sqlRows = (command) => JSON.parse(cli(["d1", "execute", "ADMIN_DB", "--local", "--json", "--command", command]))[0].results;
  const money = (html, label) => {
    const at = html.indexOf(label);
    assert.ok(at >= 0, `${label} shown`);
    return html.slice(at, at + 400).match(/₱[\d,]+\.\d\d/)[0];
  };
  const steps = [];
  const step = (name) => { steps.push(name); console.log("✓ " + name); };

  // 1. A one-package shipment saves exactly as before: charge from the rates, no package list.
  let html = await (await get("/admin/customers?new=1")).text();
  let response = await post("/admin/customers", { csrf: token(html), id: "", revision: "", full_name: "Package Test Customer", company_name: "", mobile: "+639171113333", email: "", address: "", notes: "" });
  assert.equal(response.status, 303, await response.text());
  const cid = new URL(response.headers.get("location"), origin).searchParams.get("id");
  html = await (await get(`/admin/shipments?new=1&customer_id=${cid}`)).text();
  assert.match(html, /data-package-add/, "Add another package button on Add shipment");
  assert.doesNotMatch(html.replace(/<template[\s\S]*?<\/template>/, ""), /name="pkg_length"/, "no package rows on a new shipment");
  const base = { customer_id: cid, service_type: "Sea Freight", china_warehouse: "Guangzhou", cargo_description: "Cotton pads", cargo_item: "Daily necessities",
    cbm: "0.0332", weight_kg: "12.5", status: "Awaiting Supplier Dispatch", shipping_charge: "", nihao_cost: "", delivery_charge: "0", payment_status: "Unpaid", pkg_present: "1" };
  response = await post("/admin/shipments", { ...base, csrf: token(html), id: "", revision: "" });
  assert.equal(response.status, 303, await response.text());
  const sid = new URL(response.headers.get("location"), origin).searchParams.get("id");
  let row = sqlRows(`SELECT cbm, weight_kg, shipping_charge FROM shipments WHERE id='${sid}'`)[0];
  assert.deepEqual([row.cbm, row.weight_kg, row.shipping_charge], [0.0332, 12.5, 78000]);
  assert.equal(sqlRows(`SELECT COUNT(*) AS n FROM shipment_packages`)[0].n, 0);
  step("One package: 0.0332 CBM / 12.5 kg saves as before, KD Lite ₱750 + ₱30 = ₱780, no package list");

  // 2. Add a second carton: Declared CBM / weight become the totals and the charge follows them.
  html = await (await get(`/admin/shipments?id=${sid}&edit=1`)).text();
  const edit = new URLSearchParams({ ...base, csrf: token(html), id: sid, revision: revision(html) });
  edit.delete("pkg_present"); edit.append("pkg_present", "1");
  for (const carton of [["49", "31", "21", "", "14"], ["49", "31", "21", "", "14"]])
    ["pkg_length", "pkg_width", "pkg_height", "pkg_cbm", "pkg_weight"].forEach((key, i) => edit.append(key, carton[i]));
  response = await fetch(origin + "/admin/shipments", { method: "POST", headers: { authorization, Origin: origin, "Content-Type": "application/x-www-form-urlencoded" }, body: edit, redirect: "manual" });
  assert.equal(response.status, 303, await response.text());
  row = sqlRows(`SELECT cbm, weight_kg, shipping_charge FROM shipments WHERE id='${sid}'`)[0];
  assert.deepEqual([row.cbm, row.weight_kg, row.shipping_charge], [0.063798, 28, 152900], "totals, KD Plus ₱1,499 + ₱30");
  assert.equal(JSON.parse(sqlRows(`SELECT packages FROM shipment_packages WHERE shipment_id='${sid}'`)[0].packages).length, 2);
  html = await (await get(`/admin/shipments?id=${sid}`)).text();
  assert.match(html, /Packages \(2\)/);
  assert.match(html, /49 × 31 × 21 cm · 0\.031899 CBM · 14 kg/);
  html = await (await get(`/admin/shipments?id=${sid}&edit=1`)).text();
  assert.equal((html.replace(/<template[\s\S]*?<\/template>/, "").match(/name="pkg_length"/g) || []).length, 2, "edit form shows both packages");
  step("Two cartons 49×31×21 cm, 14 kg each: Declared 0.063798 CBM / 28 kg, charge ₱1,529, shipment page lists both");

  // 3. Remove the extra package: back to one, list cleared.
  response = await post("/admin/shipments", { ...base, cbm: "0.031899", weight_kg: "14", csrf: token(html), id: sid, revision: revision(html) });
  assert.equal(response.status, 303, await response.text());
  assert.equal(sqlRows(`SELECT COUNT(*) AS n FROM shipment_packages`)[0].n, 0);
  html = await (await get(`/admin/shipments?id=${sid}`)).text();
  assert.doesNotMatch(html, /Packages \(/);
  step("Back to one package: list cleared, shipment page as before");

  if (process.env.PACKAGES_SCREENSHOT_DIR) {
    const { chromium } = (await import("node:module")).createRequire(import.meta.url)("playwright");
    const browser = await chromium.launch();
    for (const [name, viewport] of [["desktop", { width: 1280, height: 900 }], ["phone", { width: 390, height: 844 }]]) {
      const page = await browser.newPage({ viewport, deviceScaleFactor: 2, extraHTTPHeaders: { authorization } });
      await page.goto(`${origin}/admin/shipments?id=${sid}&edit=1`);
      await page.click("[data-package-add]");
      const second = page.locator("[data-package-row]").nth(1);
      for (const [field, value] of [["pkg_length", "49"], ["pkg_width", "31"], ["pkg_height", "21"], ["pkg_weight", "14"]]) await second.locator(`[name="${field}"]`).fill(value);
      const first = page.locator("[data-package-row]").nth(0);
      for (const [field, value] of [["pkg_length", "49"], ["pkg_width", "31"], ["pkg_height", "21"]]) await first.locator(`[name="${field}"]`).fill(value);
      await page.waitForTimeout(800);
      await page.locator('[name="cbm"]').scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, -80));
      await page.screenshot({ path: `${process.env.PACKAGES_SCREENSHOT_DIR}/edit-${name}.png` });
      assert.equal(await page.locator('[name="cbm"]').inputValue(), "0.063798");
      await page.close();
    }
    await browser.close();
    step("Screenshots of Edit shipment with two packages");
  }

  console.log(`\nShipment packages end-to-end passed: ${steps.length} steps. All operations were local.`);
} catch (error) {
  console.error(error);
  console.error(logs.slice(-3000));
  process.exitCode = 1;
} finally {
  try { process.kill(-server.pid, "SIGTERM"); } catch {}
}
