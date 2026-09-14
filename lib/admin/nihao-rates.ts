import { getCloudflareContext } from "@opennextjs/cloudflare";
import { airPerKgRates, airPieceRates, airVolumetricFactor, seaRates } from "./quotation-pricing";
import { authenticate, type AdminEnv } from "./security";
import { kargoDoorPackageTiers } from "./rates-guide";
import { esc, page } from "./ui";

const money = (amount: number) => `₱${amount.toLocaleString("en-PH")}`;
const seaRate = (category: keyof typeof seaRates) => `${money(seaRates[category].cbmRate)} / CBM${seaRates[category].densityRate === null ? " · Density exempt" : ` · ${money(seaRates[category].densityRate)} / kg density`}`;
const seaCategories = [
  ["LOW VALUE GOODS", "Bags, plastic toys (non-copy), beddings, clothes, household wares, face masks, packaging materials, plastic products, shoes/slippers, textile & leather, tissue paper", 0, "LOW VALUE GOODS"],
  ["VOLUME GOODS", "Construction materials, daily necessities, eyeglasses, office & school supplies, pet supplies/grooming, umbrellas", 7500, "VOLUME GOODS"],
  ["COMMODITIES", "Acrylic, bikes/accessories, cables/chargers, car/motor accessories, cosmetics, electrical appliances, e-bikes/accessories, food ingredients, packaged non-alcoholic food, furniture, games/toys, hardware, home appliances except TV, keyboard/mouse/earphones, LED lights, lighting/fixtures, medical supplies/tools, sanitary wares, solar panels, speakers, sports equipment", 8500, "COMMODITIES"],
  ["HIGH VALUE", "Medicines/health supplements, mobile/computer parts & accessories, machines, motorized/electric tools & equipment, novelty items, TV, USB, watches", 9500, "HIGH VALUE"],
  ["SENSITIVE GOODS", "Batteries, chemicals", 12000, "SENSITIVE GOODS"],
  ["MOBILE / COMPUTERS / TABLETS", "Mobile phones, computers, tablets", 10000, "MOBILE / COMPUTERS / TABLETS"],
] as const;
const packageRates = [
  ["Mini", "Up to 0.01 CBM", "₱200 / package"],
  ["Lite", ">0.01 – 0.05 CBM", "₱600 / package"],
  ["Plus", ">0.05 – 0.125 CBM", "₱10,000 / CBM"],
  ["Standard", "0.126 CBM and above", "Minimum ₱1,700 · ₱7,999 / CBM"],
  ["MAX", "Density threshold >425 kg/CBM", "—"],
] as const;
const airRates = [
  ["Ordinary Items", "₱350 / kg", `${money(airPerKgRates.ordinary)} / kg`],
  ["Liquid, Powder, Food, Computer Parts, Electronics", "₱450 / kg", `${money(airPerKgRates.restricted)} / kg`],
  ["Medicine and Food Supplements", "₱500 / kg", `${money(airPerKgRates.medicine)} / kg`],
  ["Mobile Phones", "₱800 / piece", `${money(airPieceRates["Mobile Phones"]!)} / piece`],
  ["Tablets", "₱1,000 / piece", `${money(airPieceRates.Tablets!)} / piece`],
  ["Laptop Computers", "₱2,000 / piece", `${money(airPieceRates["Laptop Computers"]!)} / piece`],
] as const;

export async function niHaoRatesPage(request: Request, envOverride?: AdminEnv): Promise<Response> {
  const env = envOverride ?? ((await getCloudflareContext()).env as unknown as AdminEnv);
  const user = await authenticate(request, env);
  const seaRows = seaCategories.map(([category, items, niHaoRate, kargoCategory]) => {
    const note = category === "HIGH VALUE" ? "<br><small>Mobile / computer parts &amp; accessories use KargoDoorPH MOBILE / COMPUTERS / TABLETS: " + money(seaRates["MOBILE / COMPUTERS / TABLETS"].cbmRate) + " / CBM; density exempt.</small>" : "";
    return `<tr><td>${category}</td><td>${items}</td><td>${money(niHaoRate)} / CBM</td><td>${seaRate(kargoCategory)}${note}</td></tr>`;
  }).join("");
  const packageRows = packageRates.map(([tier, range, niHaoRate], index) => {
    const kargo = kargoDoorPackageTiers[index];
    return "<tr><td>" + tier + "</td><td>" + range + "</td><td>" + niHaoRate + "</td><td>" + kargo.tier + ": " + kargo.base + " · " + esc(kargo.range) + " · " + esc(kargo.rule) + "</td></tr>";
  }).join("");
  const airRows = airRates.map(([item, niHaoRate, kargoRate]) => `<tr><td>${item}</td><td>${niHaoRate}</td><td>${kargoRate}</td></tr>`).join("");
  const body = `<section><p class="actions"><a class="button" href="/admin/rates-guide">Return to Rates &amp; Pricing Guide</a></p><p class="muted">Supplier / Backend Costs vs KargoDoorPH Customer Rates</p><p class="notice"><strong>INTERNAL REFERENCE</strong><br>Ni Hao rates are our supplier/backend costs. KargoDoorPH rates are our customer selling rates. Figures may differ.</p></section>
<section><h2>1. Sea Freight — Category Rates</h2><div class="table"><table><thead><tr><th>CATEGORY</th><th>ITEM / PRICING RULE</th><th>NI HAO RATE</th><th>KARGODOORPH RATE</th></tr></thead><tbody>${seaRows}</tbody></table></div></section>
<section><h2>2. Sea Freight — Package / Size Rates</h2><div class="table"><table><thead><tr><th>PACKAGE TIER</th><th>CBM RANGE</th><th>NI HAO RATE</th><th>KARGODOORPH RATE</th></tr></thead><tbody>${packageRows}</tbody></table></div><p class="notice">KargoDoorPH Mobile / Computers / Tablets remain exempt from density pricing and KD Max.</p></section>
<section><h2>3. Air Cargo Rates — Ni Hao Updated August 2026</h2><div class="table"><table><thead><tr><th>ITEM</th><th>NI HAO RATE</th><th>KARGODOORPH RATE</th></tr></thead><tbody>${airRows}</tbody></table></div><h3>Ni Hao reference rules</h3><ul><li>Billable weight = whichever is higher between actual and volumetric weight.</li><li>Volumetric weight = Total CBM × ${airVolumetricFactor} kg.</li><li>Items should not exceed 250 × 150 × 150 cm in dimension.</li></ul></section>`;
  return page("Ni Hao Rates", body, user.name, 200, {}, false);
}
