(() => {
  const form = document.querySelector("[data-freight-calculator]");
  const converter = document.querySelector("[data-cbm-converter]");
  if (!form || !converter) return;
  let seaItems, airItems;
  try {
    seaItems = JSON.parse(form.dataset.seaItems || "{}");
    airItems = JSON.parse(form.dataset.airItems || "[]");
  } catch { return; }
  const money = (value) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(value || 0));
  const type = document.querySelector("[data-freight-type]"), item = document.querySelector("[data-item]"), category = document.querySelector("[data-category]"), cbm = document.querySelector("[data-cbm]"), weight = document.querySelector("[data-weight]"), units = document.querySelector("[data-units]"), unitsField = document.querySelector("[data-units-field]"), csrf = document.querySelector("[data-csrf]"), error = document.querySelector("[data-calculator-error]"), sea = document.querySelector("[data-sea-results]"), air = document.querySelector("[data-air-results]"), seaRules = document.querySelector("[data-sea-rules]"), airRules = document.querySelector("[data-air-rules]");
  const put = (group, key, value) => { const node = document.querySelector(`[data-${group}-${key}]`); if (node) node.textContent = value; };
  const pieceItem = () => ["Mobile Phones", "Tablets", "Laptop Computers"].includes(item.value);
  const seaPieceItem = () => type.value === "Sea Freight" && seaItems[item.value] === "MOBILE / COMPUTERS / TABLETS";
  const sync = () => {
    const allowed = type.value === "Sea Freight" ? Object.keys(seaItems) : airItems;
    const previous = item.value;
    item.replaceChildren(...allowed.map((value) => new Option(value, value)));
    if (allowed.includes(previous)) item.value = previous;
    category.value = type.value === "Sea Freight" ? (seaItems[item.value] || "") : item.value;
    const needsUnits = seaPieceItem() || (type.value === "Air Freight" && pieceItem());
    unitsField.hidden = !needsUnits;
    units.required = needsUnits;
    sea.hidden = type.value !== "Sea Freight";
    air.hidden = type.value !== "Air Freight";
    seaRules.hidden = type.value !== "Sea Freight";
    airRules.hidden = type.value !== "Air Freight";
  };
  const showError = (message = "") => { error.textContent = message; error.hidden = !message; };
  let timer;
  const calculate = async () => {
    const isPiece = type.value === "Air Freight" && pieceItem();
    if ((!isPiece && (!cbm.value || !weight.value)) || (isPiece && Number(units.value) < 1)) return showError(isPiece ? "Enter at least one piece." : "Enter both Total CBM and Actual Weight.");
    const payload = type.value === "Sea Freight" ? { freightType: type.value, item: item.value, category: category.value, cbm: cbm.value, weight: weight.value, units: units.value || "0" } : { freightType: type.value, item: item.value, cbm: cbm.value || "0", weight: weight.value || "0", quantity: isPiece ? units.value : "1" };
    clearTimeout(timer);
    timer = setTimeout(async () => { try {
      const response = await fetch("/admin/quotations/calculate", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf.value }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to calculate freight.");
      showError();
      if (type.value === "Sea Freight") {
        put("sea", "category", result.category); put("sea", "tier", result.packageTier); put("sea", "cbm", result.cbm); put("sea", "weight", `${result.weight} kg`); put("sea", "density", `${Number(result.density).toFixed(2)} kg/CBM`); put("sea", "density-rule", result.densityApplies ? "Above 425 kg/CBM — comparison applies" : "Within threshold"); put("sea", "cbm-rate", `${money(result.cbmRate)} / CBM`); put("sea", "density-rate", result.densityRate === null ? "Exempt" : `${money(result.densityRate)} / kg`); put("sea", "base", money(result.base)); put("sea", "density-charge", result.densityRate === null ? "Not applicable" : money(result.densityCharge)); put("sea", "method", result.pricingMethod); put("sea", "total", money(result.final));
      } else {
        const pieces = result.rateBasis === "Per piece"; put("air", "category", result.airCategory); put("air", "rate", `${money(result.rate)} / ${pieces ? "piece" : "kg"}`); put("air", "cbm", pieces ? "Not applicable" : result.cbm); put("air", "weight", pieces ? "Not applicable" : `${result.weight} kg`); put("air", "volumetric", pieces ? "Not applicable" : `${Number(result.volumetricWeight).toFixed(2)} kg`); put("air", "billable", pieces ? "Not applicable" : `${Number(result.billableWeight).toFixed(2)} kg`); put("air", "basis", result.rateBasis); put("air", "units", pieces ? result.quantity : "Not applicable"); put("air", "total", money(result.final));
      }
    } catch (cause) { showError(cause instanceof Error ? cause.message : "Unable to calculate freight."); } }, 180);
  };
  form.addEventListener("submit", (event) => { event.preventDefault(); calculate(); });
  type.addEventListener("change", () => { sync(); calculate(); });
  item.addEventListener("change", () => { sync(); calculate(); });
  [cbm, weight, units].forEach((field) => field.addEventListener("input", calculate));
  sync();
  const fields = ["length", "width", "height", "unit", "quantity"].map((key) => converter.querySelector(`[data-${key}]`));
  const single = converter.querySelector("[data-single]"), total = converter.querySelector("[data-total]"), use = converter.querySelector("[data-use-cbm]"); let converted = null;
  const convert = () => { const [length, width, height, unit, quantity] = fields.map((field) => field.value); const divisor = { mm: 1e9, cm: 1e6, m: 1 }[unit]; const values = [length, width, height, quantity].map(Number); if (!divisor || values.some((value) => !Number.isFinite(value) || value <= 0) || !Number.isInteger(values[3])) { converted = null; single.textContent = total.textContent = "—"; use.disabled = true; return; } const one = values[0] * values[1] * values[2] / divisor; converted = one * values[3]; single.textContent = Number(one.toFixed(6)); total.textContent = Number(converted.toFixed(6)); use.disabled = false; };
  fields.forEach((field) => field.addEventListener(field.tagName === "SELECT" ? "change" : "input", convert)); use.addEventListener("click", () => { if (converted !== null) { cbm.value = Number(converted.toFixed(6)); cbm.focus(); } }); convert();
})();

/* Internal quick-input and Ni Hao estimate. It only fills the calculator form; pricing remains the existing server calculation. */
(() => {
  const root=document.querySelector("section[data-freight-calculator]"),form=document.querySelector("form[data-freight-calculator]"),quick=document.querySelector("[data-quick-input]");
  if(!root||!form||!quick)return;
  let sea,air;try{sea=Object.fromEntries(JSON.parse(root.dataset.nihaoSea||"[]"));air=Object.fromEntries(JSON.parse(root.dataset.nihaoAir||"[]"));}catch{return;}
  const type=form.querySelector("[data-freight-type]"),item=form.querySelector("[data-item]"),category=form.querySelector("[data-category]"),cbm=form.querySelector("[data-cbm]"),weight=form.querySelector("[data-weight]"),units=form.querySelector("[data-units]");
  const rate=document.querySelector("[data-nihao-rate]"),minimum=document.querySelector("[data-nihao-minimum]"),density=document.querySelector("[data-nihao-density-rate]"),minimumField=document.querySelector("[data-nihao-minimum-field]"),densityField=document.querySelector("[data-nihao-density-field]");
  const money=value=>new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(Number(value||0)), put=(key,value)=>{const node=document.querySelector(`[data-profit-${key}]`);if(node)node.textContent=value;};
  const defaultRate=()=>{const value=type.value==="Air Freight"?air[item.value]:sea[category.value];if(value!==undefined)rate.value=value;minimumField.hidden=type.value==="Air Freight";densityField.hidden=type.value==="Air Freight";};
  const numberFrom=node=>Number((node?.textContent||"").replace(/[^0-9.-]/g,""));
  const profit=()=>{const client=numberFrom(document.querySelector(type.value==="Sea Freight"?"[data-sea-total]":"[data-air-total]")),baseRate=Number(rate.value);if(!Number.isFinite(client)||!Number.isFinite(baseRate)||baseRate<0)return;let cost,basis;if(type.value==="Air Freight"){const pieces=["Mobile Phones","Tablets","Laptop Computers"].includes(item.value),amount=pieces?Number(units.value):Math.max(Number(weight.value),Number(cbm.value)*167);cost=baseRate*amount;basis=`${money(baseRate)} / ${pieces?"piece":"billable kg"}`;}else{const base=Math.max(Number(minimum.value||0),baseRate*Number(cbm.value)),weightCost=Number(density.value||0)*Number(weight.value);cost=Math.max(base,weightCost);basis=weightCost>base?`${money(density.value)} / kg density`:`${money(baseRate)} / CBM${minimum.value?` · minimum ${money(minimum.value)}`:""}`;}const gross=client-cost;put("client",money(client));put("basis",basis);put("nihao",money(cost));put("gross",money(gross));put("margin",`${(client?gross/client*100:0).toFixed(2)}%`);const per=document.querySelector("[data-profit-cbm-field]"),hasCbm=type.value==="Sea Freight"&&Number(cbm.value)>0;if(per)per.hidden=!hasCbm;if(hasCbm)put("per-cbm",money(gross/Number(cbm.value)));};
  type.addEventListener("change",()=>setTimeout(defaultRate));item.addEventListener("change",()=>setTimeout(defaultRate));[rate,minimum,density].forEach(field=>field.addEventListener("input",profit));new MutationObserver(profit).observe(document.querySelector("[data-sea-results]"),{subtree:true,childList:true,characterData:true});new MutationObserver(profit).observe(document.querySelector("[data-air-results]"),{subtree:true,childList:true,characterData:true});defaultRate();
  const text=quick.querySelector("[data-quick-text]"),notice=quick.querySelector("[data-extraction-notice]"),rows=quick.querySelector("[data-package-rows]"),review=quick.querySelectorAll("[data-package-review]");
  const row=(group={})=>{const tr=document.createElement("tr"),fields=[["product","text"],["quantity","number"],["length","number"],["width","number"],["height","number"],["weight","number"]];tr.innerHTML=fields.map(([key,kind])=>`<td><input data-package-${key} type="${kind}" min="0" step="any" value="${group[key]||""}"></td>`).join("")+"<td><button type=\"button\" data-remove-package>Remove</button></td>";return tr;};
  const flag=message=>{notice.textContent=message;notice.hidden=false;};
  quick.querySelector("[data-extract-details]").addEventListener("click",()=>{const source=text.value.trim(),lower=source.toLowerCase(),flags=[];if(!source)return flag("Paste shipment details first.");const method=/\bair\b|air freight|air cargo/.test(lower)?"Air Freight":/\bsea\b|ocean|sea freight/.test(lower)?"Sea Freight":null;if(method){type.value=method;type.dispatchEvent(new Event("change"));}else flags.push("Freight method was not stated; confirm Sea or Air.");const inferredProduct=((source.match(/(?:\d+\s*)?(?:packages?|cartons?|boxes?)\s+([a-z][a-z -]{2,})/i)||[])[1]||"").trim(),groups=[];for(const match of source.matchAll(/(\d+(?:\.\d+)?)\s*(?:x|×|\*)\s*(\d+(?:\.\d+)?)\s*(?:x|×|\*)\s*(\d+(?:\.\d+)?)(?:\s*(cm|mm|m))?\s*,?\s*(?:gross\s+)?(?:weight|wt\.?)?\s*(\d+(?:\.\d+)?)\s*kg/gi)){const nearby=source.slice(Math.max(0,(match.index||0)-45),(match.index||0)+match[0].length+70),quantity=Number((nearby.match(/(\d+)\s*(?:cartons?|boxes?|pcs?|pieces?|packages?)/i)||[])[1]||1),factor=(match[4]||"cm").toLowerCase()==="m"?100:(match[4]||"cm").toLowerCase()==="mm"?.1:1;groups.push({product:inferredProduct,quantity,length:Number(match[1])*factor,width:Number(match[2])*factor,height:Number(match[3])*factor,weight:Number(match[5])});}if(!groups.length)flags.push("No complete dimensions and weight were found; add package groups manually.");rows.replaceChildren(...(groups.length?groups:[{}]).map(row));review.forEach(node=>node.hidden=false);const normalized=value=>value.toLowerCase().replace(/[^a-z0-9]+/g," ").trim(),suggested=lower.includes("syringe")?"Medical supplies / tools":"",match=[...item.options].find(option=>lower.includes(normalized(option.value)))||[...item.options].find(option=>option.value===suggested);if(match){item.value=match.value;item.dispatchEvent(new Event("change"));}else flags.push("Product was not confidently matched to a pricing item; choose it manually.");flag(flags.length?`Review required: ${flags.join(" ")}`:"Details extracted. Review package groups and calculator fields before calculating.");});
  quick.querySelector("[data-add-package]").addEventListener("click",()=>rows.append(row()));rows.addEventListener("click",event=>{if(event.target.closest("[data-remove-package]"))event.target.closest("tr").remove();});quick.querySelector("[data-apply-packages]").addEventListener("click",()=>{let totalCbm=0,totalWeight=0,valid=rows.children.length>0;rows.querySelectorAll("tr").forEach(tr=>{const get=key=>Number(tr.querySelector(`[data-package-${key}]`).value),[q,l,w,h,kg]=["quantity","length","width","height","weight"].map(get);if(![q,l,w,h,kg].every(value=>Number.isFinite(value)&&value>0))valid=false;else{totalCbm+=q*l*w*h/1e6;totalWeight+=q*kg;}});if(!valid)return flag("Every package group needs quantity, dimensions, and weight before totals can be used.");cbm.value=totalCbm.toFixed(6).replace(/\\.?0+$/,"");weight.value=totalWeight.toFixed(2).replace(/\\.?0+$/,"");flag(`Reviewed totals applied: ${cbm.value} CBM and ${weight.value} kg. Confirm the calculator fields before calculating.`);form.dispatchEvent(new Event("submit",{cancelable:true}));});
})();
