import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authenticate, csrfToken, type AdminEnv } from "./security";
import { airItems, itemCategories } from "./quotation-pricing";
import { niHaoAirRates, niHaoSeaCategories } from "./nihao-rates";
import { esc, page } from "./ui";

export async function freightCalculatorPage(request: Request, envOverride?: AdminEnv) {
  const env = envOverride ?? ((await getCloudflareContext()).env as unknown as AdminEnv);
  const user = await authenticate(request, env);
  const seaItems = Object.keys(itemCategories).sort((a, b) => a.localeCompare(b));
  const csrf = csrfToken(env, user.id, "/admin/quotations");

  const body = `<style>
    [data-quick-input] textarea{min-height:96px}.freight-calculator-output{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(300px,.85fr);gap:16px;align-items:start;margin-top:14px}.freight-calculator-output>dl{margin:0}
    .freight-calculator-results{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}
    .freight-calculator-results div{border:1px solid #d5e4ed;border-radius:6px;padding:8px;background:#f8fbfd}
    .freight-calculator-results dt{font-size:.8rem;color:#466177}.freight-calculator-results dd{margin:4px 0 0;font-weight:700}
    .freight-calculator-results [data-total]{color:#0753ad;font-size:1.3rem}
    [data-auto-summary]{background:#e7f6eb;border-color:#8fc9a0}[data-auto-summary] h2{color:#17633a}
    .cbm-result{font-size:1.3rem;font-weight:700;color:#0753ad}
    .freight-calculator-results[hidden]{display:none}[data-package-review],[data-cbm-converter],[data-sea-rules],[data-air-rules],[data-calculator-fields]{display:none!important}.freight-calculator-results[data-sea-results] div:not(:has([data-sea-total]),:has([data-sea-tier]),:has([data-sea-method])),.freight-calculator-results[data-air-results] div:not(:has([data-air-total]),:has([data-air-basis])){display:none}
    [data-nihao-summary]{margin:0;border:1px solid #c6dde9;border-radius:8px;padding:12px;background:#fbfdff}[data-nihao-summary] h2{font-size:1rem;margin:0 0 4px}[data-nihao-summary] .muted{font-size:.82rem;margin:0 0 8px}[data-nihao-summary] .grid{display:none}[data-nihao-summary] .freight-calculator-results{grid-template-columns:1fr}[data-create-quotation]{margin-top:12px}
    @media(max-width:800px){.freight-calculator-output{grid-template-columns:1fr}}@media(max-width:600px){.freight-calculator-results{grid-template-columns:1fr}}
  </style>
  <section data-freight-calculator data-sea-items="${esc(JSON.stringify(itemCategories))}" data-air-items="${esc(JSON.stringify(airItems))}" data-nihao-sea="${esc(JSON.stringify(niHaoSeaCategories.map(([category, , rate]) => [category, rate])))}" data-nihao-air="${esc(JSON.stringify(niHaoAirRates.map(([item, rate]) => [item, Number(rate.replace(/[^\\d]/g, ""))])))}">
    <h2>Freight Calculator</h2>
    <p class="muted">Internal estimate only. This uses the same live KargoDoor pricing rules as quotations and does not save any data.</p>
  </section>
  <section data-quick-input>
    <h2>Quick shipment input</h2>
    <p class="muted">Paste client or supplier details from Viber, Messenger, or Alibaba. Extraction is a local structured parser: it never creates a quotation or sends the pasted message anywhere. Review every field before calculating.</p>
    <label class="wide">Shipment details to extract<textarea data-quick-text rows="4" placeholder="Example: Sea freight, LED lights. 4 cartons, 60 x 50 x 40 cm, 35 kg each."></textarea></label>
    <p class="actions"><button type="button" data-extract-details>Extract details for review</button></p>
    <p class="notice" data-extraction-notice hidden></p>
    <div class="table" data-package-review hidden><table><thead><tr><th>Product / package group</th><th>Quantity</th><th>Length (cm)</th><th>Width (cm)</th><th>Height (cm)</th><th>Weight each (kg)</th><th></th></tr></thead><tbody data-package-rows></tbody></table></div>
    <p class="actions" data-package-review hidden><button type="button" data-add-package>Add package group</button><button type="button" data-apply-packages>Use reviewed package totals</button></p>
  </section>
  <section>
    <form data-freight-calculator data-calculator-fields>
      <input type="hidden" data-csrf value="${esc(csrf)}">
      <div class="grid">
        <label>Freight type<select data-freight-type><option>Sea Freight</option><option>Air Freight</option></select></label>
        <label>Item / commodity<select data-item>${seaItems.map((item) => `<option value="${esc(item)}">${esc(item)}</option>`).join("")}</select></label>
        <label>Category<input data-category readonly></label>
        <label data-units-field hidden>Units / pieces<input data-units type="number" min="1" step="1" value="1"></label>
        <label>Total CBM<input data-cbm type="number" min="0" step="any" placeholder="e.g. 0.25"></label>
        <label>Actual weight (kg)<input data-weight type="number" min="0" step="any" placeholder="e.g. 50"></label>
      </div>
      <p class="actions"><button type="submit">Calculate Freight</button></p>
      <p class="notice" data-calculator-error hidden></p>
    </form>
    <section data-auto-summary hidden><h2>Calculation summary</h2><dl class="freight-calculator-results"><div><dt>Shipment</dt><dd data-summary-shipment>—</dd></div><div><dt>Total CBM</dt><dd data-summary-cbm>—</dd></div><div><dt>Total weight</dt><dd data-summary-weight>—</dd></div><div><dt>Density / billable weight</dt><dd data-summary-basis>—</dd></div><div><dt>KargoDoor formula</dt><dd data-summary-formula>—</dd></div><div><dt>Ni Hao formula</dt><dd data-summary-nihao>—</dd></div></dl></section>
    <div class="freight-calculator-output"><dl class="freight-calculator-results" data-sea-results>
      <div><dt>Category</dt><dd data-sea-category>—</dd></div><div><dt>Package tier</dt><dd data-sea-tier>—</dd></div>
      <div><dt>Total CBM</dt><dd data-sea-cbm>—</dd></div><div><dt>Actual weight</dt><dd data-sea-weight>—</dd></div>
      <div><dt>Density</dt><dd data-sea-density>—</dd></div><div><dt>Density rule</dt><dd data-sea-density-rule>—</dd></div>
      <div><dt>CBM rate</dt><dd data-sea-cbm-rate>—</dd></div><div><dt>Density rate</dt><dd data-sea-density-rate>—</dd></div>
      <div><dt>Base charge</dt><dd data-sea-base>—</dd></div><div><dt>Density-based charge</dt><dd data-sea-density-charge>—</dd></div>
      <div><dt>Pricing method</dt><dd data-sea-method>—</dd></div><div><dt>Total estimated freight</dt><dd data-sea-total data-total>—</dd></div>
    </dl>
    <dl class="freight-calculator-results" data-air-results hidden>
      <div><dt>Air category</dt><dd data-air-category>—</dd></div><div><dt>Rate</dt><dd data-air-rate>—</dd></div>
      <div><dt>Total CBM</dt><dd data-air-cbm>—</dd></div><div><dt>Actual weight</dt><dd data-air-weight>—</dd></div>
      <div><dt>Volumetric weight</dt><dd data-air-volumetric>—</dd></div><div><dt>Billable weight</dt><dd data-air-billable>—</dd></div>
      <div><dt>Charging basis</dt><dd data-air-basis>—</dd></div><div><dt>Units / pieces</dt><dd data-air-units>—</dd></div>
      <div><dt>Total estimated freight</dt><dd data-air-total data-total>—</dd></div>
    </dl>
    <section data-nihao-summary>
      <h2>Internal cost &amp; profit — Ni Hao</h2>
      <p class="muted">Internal only. Defaults come from the existing Ni Hao rates reference and remain editable. A blank density rate means no density cost is assumed.</p>
      <div class="grid">
        <label>Ni Hao base rate<input data-nihao-rate type="number" min="0" step="any" placeholder="Required"></label>
        <label data-nihao-minimum-field>Ni Hao minimum charge<input data-nihao-minimum type="number" min="0" step="any" value="1700"></label>
        <label data-nihao-density-field>Ni Hao density rate / kg<input data-nihao-density-rate type="number" min="0" step="any" placeholder="No default available"></label>
      </div>
      <dl class="freight-calculator-results">
        <div><dt>KargoDoor client price</dt><dd data-profit-client>—</dd></div><div><dt>Ni Hao pricing basis</dt><dd data-profit-basis>—</dd></div>
        <div><dt>Ni Hao cost</dt><dd data-profit-nihao>—</dd></div><div><dt>Gross profit</dt><dd data-profit-gross>—</dd></div>
        <div><dt>Gross margin</dt><dd data-profit-margin>—</dd></div><div data-profit-cbm-field><dt>Profit per CBM</dt><dd data-profit-per-cbm>—</dd></div>
      </dl>
      <p class="muted" data-extracted-contact hidden></p>
      <p class="actions" data-create-quotation hidden><button type="button" data-create-quotation-button>Create draft quotation</button></p>
    </section></div>
  </section>
  <section data-sea-rules>
    <h2>Sea Freight rules</h2>
    <ul><li>Your selected item assigns its Sea category automatically.</li><li>Density = actual weight ÷ CBM. Above <strong>425 kg/CBM</strong>, the density charge is compared with the base charge.</li><li>KD Mini applies up to 0.01 CBM, KD Lite up to 0.05 CBM, and KD Plus up to 0.125 CBM. Standard Sea Freight has a ₱1,700 minimum.</li><li>Mobile phones, computers, and tablets use a special CBM rate plus per-unit charge; density pricing does not apply.</li></ul>
  </section>
  <section data-air-rules hidden>
    <h2>Air Freight rules</h2>
    <ul><li>Ordinary items: <strong>₱500/kg</strong>. Restricted items: <strong>₱600/kg</strong>. Medicine and food supplements: <strong>₱650/kg</strong>.</li><li>For per-kilogram items, volumetric weight = <strong>CBM × 167</strong>. The higher of actual and volumetric weight is charged.</li><li>Mobile phones, tablets, and laptops use per-piece pricing.</li></ul>
  </section>
  <section data-cbm-converter>
    <h2>CBM Conversion</h2>
    <p class="muted">Calculate total CBM from package dimensions, then optionally use it in the freight calculator above.</p>
    <div class="grid">
      <label>Length<input data-length type="number" min="0" step="any"></label>
      <label>Width<input data-width type="number" min="0" step="any"></label>
      <label>Height<input data-height type="number" min="0" step="any"></label>
      <label>Unit<select data-unit><option value="cm">Centimeters (cm)</option><option value="mm">Millimeters (mm)</option><option value="m">Meters (m)</option></select></label>
      <label>Quantity<input data-quantity type="number" min="1" step="1" value="1"></label>
    </div>
    <p>Single package: <strong data-single>—</strong> CBM</p><p class="cbm-result">Total: <span data-total>—</span> CBM</p>
    <p class="actions"><button type="button" data-use-cbm disabled>Use this CBM in Freight Calculator</button></p>
  </section>
  <script src="/admin-freight-calculator.js" defer></script>`;
  return page("Freight Calculator", body, user.name, 200, {
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; font-src 'self'; script-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  });
}
