import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authenticate, type AdminEnv } from "./security";
import { esc, page } from "./ui";
import { airItems, airPerKgRates, airPieceRates, airVolumetricFactor, itemCategories, seaRates } from "./quotation-pricing";

const money = (amount: number) => `₱${amount.toLocaleString("en-PH")}`;

function airRate(item: (typeof airItems)[number]) {
  if (item in airPieceRates) return `${money(airPieceRates[item]!)} / piece`;
  if (item === "Ordinary Items") return `${money(airPerKgRates.ordinary)} / kg`;
  if (item === "Medicine and Food Supplements") return `${money(airPerKgRates.medicine)} / kg`;
  return `${money(airPerKgRates.restricted)} / kg`;
}

function airBasis(item: (typeof airItems)[number]) {
  return item in airPieceRates ? "Per piece" : "Higher of actual or volumetric weight";
}

export const kargoDoorPackageTiers = [
  { tier: "KD Mini", range: "≤0.01 CBM", base: "₱250", rule: "If density >425, compare ₱250 with weight × category density rate. Higher wins." },
  { tier: "KD Lite", range: ">0.01–0.05 CBM", base: "₱750", rule: "If density >425, compare ₱750 with weight × category density rate. Higher wins." },
  { tier: "KD Plus", range: ">0.05–0.125 CBM", base: "₱1,400", rule: "If density >425, compare ₱1,400 with weight × category density rate. Higher wins." },
  { tier: "KD Standard", range: ">0.125 CBM", base: "Minimum ₱1,700", rule: "Base = MAX(₱1,700, CBM × category CBM rate). If density >425, compare base with density charge." },
  { tier: "KD Max", range: "Density charge wins", base: "Density-based charge", rule: "Applies only when density is >425 kg/CBM and the density charge is higher than the base charge." },
] as const;

function packageTierRows() {
  return kargoDoorPackageTiers.map(({ tier, range, base, rule }) =>
    "<tr><td>" + tier + "</td><td>" + esc(range) + "</td><td>" + base + "</td><td>" + esc(rule) + "</td></tr>",
  ).join("");
}

export async function ratesGuidePage(request: Request, envOverride?: AdminEnv): Promise<Response> {
  const env = envOverride ?? ((await getCloudflareContext()).env as unknown as AdminEnv);
  const user = await authenticate(request, env);
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().toLocaleLowerCase();
  const selectedCategory = url.searchParams.get("category") ?? "";
  const rows = Object.entries(itemCategories)
    .filter(([item, category]) =>
      (!query || `${item} ${category}`.toLocaleLowerCase().includes(query)) &&
      (!selectedCategory || category === selectedCategory),
    )
    .map(([item, category]) => `<tr><td>${esc(item)}</td><td>${esc(category)}</td><td>${money(seaRates[category].cbmRate)} / CBM</td><td>${seaRates[category].densityRate === null ? "Exempt" : `${money(seaRates[category].densityRate)} / kg`}</td></tr>`)
    .join("") || `<tr><td colspan="4">No matching Sea Freight items.</td></tr>`;
  const categories = Object.keys(seaRates);

  const body = `<section><p class="muted">Internal reference only. Rates and item categories are shown from the authoritative Admin quotation pricing source.</p><p class="actions"><a class="button" href="#sea-freight">SEA FREIGHT</a><a class="button" href="#air-freight">AIR FREIGHT</a></p></section>
<section id="sea-freight"><h2>1. Sea Freight — Rates &amp; Package Tiers</h2><h3>Item, Category &amp; Rates</h3><form method="get" class="search"><label>Search items<input name="q" value="${esc(url.searchParams.get("q") ?? "")}" placeholder="Item or category"></label><label>Category<select name="category"><option value="">All categories</option>${categories.map(category => `<option value="${esc(category)}"${selectedCategory === category ? " selected" : ""}>${esc(category)}</option>`).join("")}</select></label><button>Filter</button><a href="/admin/rates-guide">Clear</a></form><div class="table"><table><thead><tr><th>ITEM</th><th>CATEGORY</th><th>CBM RATE</th><th>DENSITY RATE</th></tr></thead><tbody>${rows}</tbody></table></div><h3>Package Tiers</h3><div class="table"><table><thead><tr><th>PACKAGE TIER</th><th>CBM / DENSITY</th><th>BASE RATE</th><th>CALCULATION RULE</th></tr></thead><tbody>${packageTierRows()}</tbody></table></div><p class="notice">Mobile / Computers / Tablets are exempt from density pricing and KD Max.</p></section>
<section><h2>2. Sea Freight — Calculation Cheat Sheet</h2><div class="table"><thead><tr><th>STEP</th><th>CALCULATION</th><th>RULE</th></tr></thead><tbody><tr><td>1. Calculate CBM</td><td>L × W × H ÷ 1,000,000</td><td>Dimensions in centimeters</td></tr><tr><td>2. Calculate Density</td><td>Weight (kg) ÷ CBM</td><td>Determines density classification</td></tr><tr><td>3. Determine Package Tier</td><td>Based on total CBM</td><td>Mini / Lite / Plus / Standard</td></tr><tr><td>4. Determine Category Rate</td><td>Based on item</td><td>Category-specific CBM and density rates</td></tr><tr><td>5. Check Density Pricing</td><td>Density &gt;425 kg/CBM</td><td>Only then calculate weight × category density rate</td></tr><tr><td>6. Density Charge</td><td>Weight × density rate</td><td>Uses the category density rate</td></tr><tr><td>7. Check KD Max</td><td>Density Charge &gt; Base Charge</td><td>Applies only when density is &gt;425 kg/CBM</td></tr><tr><td>8. Final Rate</td><td>MAX(Base Charge, Density Charge)</td><td>When density is &gt;425, higher charge wins; otherwise use Base Charge.</td></tr></tbody></table></div><p><strong>KD Standard Base = MAX(₱1,700, CBM × Category CBM Rate)</strong></p><p><strong>If density &gt;425: Final = MAX(Base Charge, Weight × Category Density Rate)</strong></p><h3>Mobile / Computers / Tablets special Sea rule</h3><p><strong>Base = MAX(₱1,700, CBM × ₱10,500)</strong><br><strong>Final = Base + (Units × ₱250)</strong><br>No density surcharge. No KD Max.</p></section>
<section id="air-freight"><h2>3. Air Freight — Rates</h2><div class="table"><table><thead><tr><th>ITEM / CATEGORY</th><th>RATE</th><th>CHARGING BASIS</th></tr></thead><tbody>${airItems.map(item => `<tr><td>${esc(item)}</td><td>${airRate(item)}</td><td>${airBasis(item)}</td></tr>`).join("")}</tbody></table></div></section>
<section><h2>4. Air Freight — Calculation Cheat Sheet</h2><div class="table"><table><thead><tr><th>STEP</th><th>CALCULATION</th><th>RULE</th></tr></thead><tbody><tr><td>1. Actual Weight</td><td>Actual cargo weight in kg</td><td>Record actual weight</td></tr><tr><td>2. Volumetric Weight</td><td>CBM × ${airVolumetricFactor} kg</td><td>Calculate volume-based weight</td></tr><tr><td>3. Compare</td><td>Actual vs Volumetric</td><td>Higher wins</td></tr><tr><td>4. Billable Weight</td><td>MAX(Actual Weight, CBM × ${airVolumetricFactor})</td><td>Use the higher weight. No rounding.</td></tr><tr><td>5. Determine Air Rate</td><td>Applicable per-kg rate</td><td>Based on cargo type</td></tr><tr><td>6. Air Freight Charge</td><td>Billable Weight × Air Rate</td><td>Estimated Air freight</td></tr></tbody></table></div><p><strong>Mobile Phones = Pieces × ${money(airPieceRates["Mobile Phones"]!)}</strong><br><strong>Tablets = Pieces × ${money(airPieceRates.Tablets!)}</strong><br><strong>Laptop Computers = Pieces × ${money(airPieceRates["Laptop Computers"]!)}</strong></p></section>`;

  return page("Rates & Pricing Guide", body.replace('<div class="table"><thead>', '<div class="table"><table><thead>'), user.name, 200, {}, false);
}
