import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authenticate, csrfToken, type AdminEnv } from "./security";
import { airItems, itemCategories } from "./quotation-pricing";
import { esc, page } from "./ui";

export async function freightCalculatorPage(request: Request, envOverride?: AdminEnv) {
  const env = envOverride ?? ((await getCloudflareContext()).env as unknown as AdminEnv);
  const user = await authenticate(request, env);
  const seaItems = Object.keys(itemCategories).sort((a, b) => a.localeCompare(b));
  const csrf = csrfToken(env, user.id, "/admin/quotations");

  const body = `<style>
    .freight-calculator-results{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:18px}
    .freight-calculator-results div{border:1px solid #d5e4ed;border-radius:8px;padding:12px;background:#f8fbfd}
    .freight-calculator-results dt{font-size:.8rem;color:#466177}.freight-calculator-results dd{margin:4px 0 0;font-weight:700}
    .freight-calculator-results [data-total]{color:#0753ad;font-size:1.3rem}
    .cbm-result{font-size:1.3rem;font-weight:700;color:#0753ad}
    @media(max-width:600px){.freight-calculator-results{grid-template-columns:1fr}}
  </style>
  <section>
    <h2>Freight Calculator</h2>
    <p class="muted">Internal estimate only. This uses the same live KargoDoor pricing rules as quotations and does not save any data.</p>
  </section>
  <section>
    <form data-freight-calculator>
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
    <dl class="freight-calculator-results" data-sea-results>
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
  <script data-sea-items="${esc(JSON.stringify(itemCategories))}" data-air-items="${esc(JSON.stringify(airItems))}" src="/admin-freight-calculator.js" defer></script>`;
  return page("Freight Calculator", body, user.name);
}
