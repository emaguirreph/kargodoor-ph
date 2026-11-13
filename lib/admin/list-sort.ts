// Sort and filter controls for the admin lists (Shipments, Customers,
// Invoices, Expenses). Em asked for these on 2026-11-13. Every choice comes
// from a fixed list: anything else in the URL falls back to the default, and
// only the SQL written here is ever put into ORDER BY.
import { esc } from "./ui";

export type SortOption = { value: string; label: string; sql: string };

/** The chosen sort, or the first (default) option when the value is unknown. */
export function pickSort(options: readonly SortOption[], value: string | null): SortOption {
  return options.find((option) => option.value === value) ?? options[0];
}

export function sortSelect(options: readonly SortOption[], current: SortOption) {
  return `<label>Sort by<select name="sort">${options
    .map((option) => `<option value="${esc(option.value)}"${option === current ? " selected" : ""}>${esc(option.label)}</option>`)
    .join("")}</select></label>`;
}

export type CheckOption = string | readonly [string, string];
const optionValue = (option: CheckOption) => (typeof option === "string" ? option : option[0]);
const optionText = (option: CheckOption) => (typeof option === "string" ? option : option[1]);

/**
 * Tick-box filters (Em, 2026-11-13): every box starts ticked; untick what you
 * don't want. Unticked boxes are not sent, so the form also sends
 * filtered=1: then the ticked values are the whole choice (none ticked = no
 * rows). With no filtered=1 and no value in the URL, the defaults apply.
 */
export function pickMany(
  params: URLSearchParams,
  name: string,
  options: readonly CheckOption[],
  defaults: readonly string[] = options.map(optionValue),
): string[] {
  const values = options.map(optionValue);
  const chosen = params.getAll(name).filter(Boolean);
  if (params.get("filtered") !== "1" && !chosen.length) return values.filter((value) => defaults.includes(value));
  return values.filter((value) => chosen.includes(value));
}

/** True when every option is ticked, so the list needs no filter for it. */
export const allPicked = (picked: readonly string[], options: readonly CheckOption[]) =>
  options.every((option) => picked.includes(optionValue(option)));

/** SQL "column IN (?, ?)" for the ticked values, or "" when all are ticked. */
export function inClause(column: string, picked: readonly string[], options: readonly CheckOption[]) {
  if (allPicked(picked, options)) return { sql: "", bindings: [] as string[] };
  if (!picked.length) return { sql: "0", bindings: [] as string[] };
  return { sql: `${column} IN (${picked.map(() => "?").join(", ")})`, bindings: [...picked] };
}

/** Hidden marker every filter form sends (see pickMany). */
export const filteredMarker = '<input type="hidden" name="filtered" value="1">';

export function checkFilter(name: string, label: string, options: readonly CheckOption[], picked: readonly string[]) {
  const count = options.filter((option) => picked.includes(optionValue(option))).length;
  const summary = count === options.length ? "All" : count === 0 ? "None" : count === 1
    ? optionText(options.find((option) => picked.includes(optionValue(option)))!)
    : `${count} of ${options.length}`;
  return `<details class="filter-checks"><summary>${esc(label)}: <strong>${esc(summary)}</strong></summary><div class="filter-checks-box">
    <div class="filter-checks-actions"><button type="button" class="secondary" data-check="all">Tick all</button><button type="button" class="secondary" data-check="none">Untick all</button></div>
    ${options.map((option) => `<label><input type="checkbox" name="${esc(name)}" value="${esc(optionValue(option))}"${picked.includes(optionValue(option)) ? " checked" : ""}> ${esc(optionText(option))}</label>`).join("")}
  </div></details>`;
}

/** Style + Tick all / Untick all script for the tick-box filters. */
export const checkFilterAssets = `<style>
.filter-checks{position:relative;align-self:end}
section:has(.filter-checks),form:has(.filter-checks){overflow:visible}
section:has(.filter-checks){position:relative;z-index:5}
.filter-checks>summary{cursor:pointer;list-style:none;border:1px solid #c9d3e0;border-radius:8px;padding:8px 12px;background:#fff;white-space:nowrap}
.filter-checks>summary::-webkit-details-marker{display:none}
.filter-checks>summary::after{content:" ▾";color:#667}
.filter-checks[open]>summary{border-color:#1f6feb}
.filter-checks-box{position:absolute;z-index:20;top:calc(100% + 4px);left:0;min-width:240px;max-height:340px;overflow:auto;background:#fff;border:1px solid #c9d3e0;border-radius:8px;padding:10px;box-shadow:0 8px 24px rgba(0,0,0,.12);display:grid;gap:6px}
.filter-checks-box label{display:flex;gap:8px;align-items:center;font-weight:400;margin:0}
.filter-checks-box input{width:auto;margin:0}
.filter-checks-actions{display:flex;gap:6px}
.filter-checks-actions button{padding:4px 10px;font-size:.85rem}
@media (max-width:600px){.filter-checks-box{position:static;box-shadow:none}}
</style><script src="/admin-filter-checks.js" defer></script>`;

// {shipments} is swapped for the customer's shipment count by the list query.
export const customerSorts: readonly SortOption[] = [
  { value: "newest", label: "Newest added", sql: "created_at DESC, id" },
  { value: "oldest", label: "Oldest added", sql: "created_at ASC, id" },
  { value: "name", label: "Name (A–Z)", sql: "full_name COLLATE NOCASE ASC, id" },
  { value: "name-desc", label: "Name (Z–A)", sql: "full_name COLLATE NOCASE DESC, id" },
  { value: "code", label: "Account no. (KDOOR, A–Z)", sql: "customer_code COLLATE NOCASE ASC, id" },
  { value: "shipments", label: "Most shipments", sql: "{shipments} DESC, created_at DESC, id" },
];

export const customerShipmentFilters = [["with", "With shipments"], ["without", "No shipments yet"]] as const satisfies readonly CheckOption[];
