// Makes the branded FB Posts image cards (1080 × 1350, Facebook's 4:5 feed size) from the
// post library in lib/admin/fb-library.ts, into public/fb-cards/<key>.jpg.
// Run after editing the library:  node --experimental-strip-types scripts/make-fb-cards.mjs
import { readFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { fbLibrary } = await import(path.join(root, "lib/admin/fb-library.ts"));
// lib/insights.ts uses extensionless imports, so bundle it with esbuild before importing.
const { buildSync } = createRequire(import.meta.url)("esbuild");
const bundled = buildSync({ entryPoints: [path.join(root, "lib/insights.ts")], bundle: true, format: "esm", write: false, platform: "node" }).outputFiles[0].text;
const { insights } = await import(`data:text/javascript;base64,${Buffer.from(bundled).toString("base64")}`);
// Blog cards (the Blog day posts a photo, not a link): article title + its first section headings.
const blogCards = [
  { key: "blog", category: "Blog", headline: "Bago sa Blog namin", lines: ["Importing guides from China", "Rates, tips at checklists", "Taglish, madaling basahin"] },
  ...insights.map((i) => ({ key: `blog-${i.slug}`, category: "Blog", headline: i.title, lines: i.sections.slice(0, 3).map((x) => x.heading.replace(/^\d+[.)]\s*/, "")) })),
];
const { chromium } = createRequire(import.meta.url)("playwright");

const data = (file, type) => `data:${type};base64,${readFileSync(path.join(root, "public", file)).toString("base64")}`;
const font = (file) => data(`fonts/${file}`, "font/woff2");
const logo = data("assets/kargodoor-footer-logo.png", "image/png");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]).replace(/(\d) (kg|CBM|pcs|days|weeks)/g, "$1&nbsp;$2");

const pill = {
  Learning: ["#69BE28", "#0A2F86"],
  Importing: ["#FFB020", "#0A2F86"],
  Business: ["#FF7A1A", "#ffffff"],
  "Rate comparison": ["#ffffff", "#0649A8"],
  Blog: ["#ffffff", "#0A2F86"],
  Tip: ["#69BE28", "#0A2F86"],
  Rates: ["#FFB020", "#0A2F86"],
};

const card = (item) => {
  const [pillBg, pillFg] = pill[item.category] ?? ["#69BE28", "#0A2F86"];
  const size = item.headline.length > 52 ? 64 : item.headline.length > 40 ? 72 : item.headline.length > 30 ? 84 : 98;
  const stat = item.stat
    ? `<div class="stat"><div class="stat-v${item.stat.length > 7 ? " small" : ""}">${esc(item.stat)}</div><div class="stat-l">${esc(item.statLabel ?? "")}</div></div>`
    : "";
  const tip = item.category === "Tip" ? "Quick tip" : item.category === "Blog" ? "Bago sa Blog" : item.category;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:P;src:url(${font("poppins-800.woff2")});font-weight:800}
@font-face{font-family:P;src:url(${font("poppins-700.woff2")});font-weight:700}
@font-face{font-family:J;src:url(${font("plus-jakarta-sans-600.woff2")});font-weight:600}
@font-face{font-family:J;src:url(${font("plus-jakarta-sans-800.woff2")});font-weight:800}
*{box-sizing:border-box;margin:0}
body{width:1080px;height:1350px;overflow:hidden;font-family:J,sans-serif;color:#fff;background:linear-gradient(160deg,#0B3A9E 0%,#0A2F86 60%,#082670 100%);position:relative}
.ring{position:absolute;border-radius:50%;border:70px solid rgba(255,255,255,.045)}
.r1{width:760px;height:760px;right:-300px;top:-280px}.r2{width:520px;height:520px;left:-260px;bottom:120px}
.swoosh{position:absolute;left:-80px;right:-80px;bottom:-110px;height:250px;border-top:18px solid #69BE28;border-radius:50% 50% 0 0/100% 100% 0 0;opacity:.9}
.wrap{position:relative;padding:90px 84px 0;height:100%;display:flex;flex-direction:column}.mid{flex:1;display:flex;flex-direction:column;justify-content:center;padding-bottom:30px}
.pill{align-self:flex-start;background:${pillBg};color:${pillFg};font:800 30px/1 J;letter-spacing:.06em;text-transform:uppercase;padding:16px 28px;border-radius:999px}
h1{font:800 ${size}px/1.08 P;margin:44px 0 0;letter-spacing:-.01em}
.stat{margin-bottom:44px;display:flex;align-items:baseline;gap:22px;flex-wrap:wrap}
.stat-v{font:800 124px/1 P;color:#69BE28;white-space:nowrap}.stat-v.small{font-size:96px}
.stat-l{font:600 38px/1.2 J;color:#cfe0ff}
.list{margin-top:0;background:#fff;border-radius:34px;padding:22px 44px;color:#0A2F86;box-shadow:0 24px 60px rgba(0,0,0,.25)}
.row{display:flex;gap:26px;align-items:center;padding:26px 0;font:700 46px/1.25 J}
.row+.row{border-top:2px solid #e3ecf8}
.dot{flex:none;width:52px;height:52px;border-radius:50%;background:#69BE28;color:#fff;font:800 32px/52px P;text-align:center}
.foot{position:relative;z-index:2;display:flex;align-items:center;justify-content:space-between;padding-bottom:150px}
.foot img{height:118px}
.web{text-align:right;font:800 36px/1.25 J}.web small{display:block;font:600 27px/1.3 J;color:#cfe0ff}
</style></head><body><div class="ring r1"></div><div class="ring r2"></div><div class="swoosh"></div>
<div class="wrap"><div class="pill">${esc(tip)}</div><h1>${esc(item.headline)}</h1><div class="mid">${stat}
<div class="list">${item.lines.map((l, i) => `<div class="row"><span class="dot">${/^\d\.\s/.test(l) ? "" : "✓"}${/^\d\.\s/.test(l) ? i + 1 : ""}</span><span>${esc(l.replace(/^\d\.\s*/, ""))}</span></div>`).join("")}</div></div>
<div class="foot"><img src="${logo}" alt=""><div class="web">kargodoorph.com<small>Message us on Facebook</small></div></div></div></body></html>`;
};

const out = path.join(root, "public/fb-cards");
mkdirSync(out, { recursive: true });
const only = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
for (const item of [...fbLibrary, ...blogCards]) {
  if (only.length && !only.includes(item.key)) continue;
  await page.setContent(card(item), { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(out, `${item.key}.jpg`), type: "jpeg", quality: 88 });
  console.log("card", item.key);
}
await browser.close();
