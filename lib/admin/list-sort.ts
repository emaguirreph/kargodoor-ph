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

/** Only values from the list are kept; anything else means "no filter". */
export function pickFilter(options: readonly string[], value: string | null): string {
  return value && options.includes(value) ? value : "";
}

export function sortSelect(options: readonly SortOption[], current: SortOption) {
  return `<label>Sort by<select name="sort">${options
    .map((option) => `<option value="${esc(option.value)}"${option === current ? " selected" : ""}>${esc(option.label)}</option>`)
    .join("")}</select></label>`;
}

/** A filter dropdown. Options are [value, label] pairs or plain values. */
export function filterSelect(
  name: string,
  label: string,
  options: readonly (string | readonly [string, string])[],
  current: string,
  allLabel: string,
) {
  return `<label>${esc(label)}<select name="${esc(name)}"><option value="">${esc(allLabel)}</option>${options
    .map((option) => {
      const [value, text] = typeof option === "string" ? [option, option] : option;
      return `<option value="${esc(value)}"${current === value ? " selected" : ""}>${esc(text)}</option>`;
    })
    .join("")}</select></label>`;
}

// {shipments} is swapped for the customer's shipment count by the list query.
export const customerSorts: readonly SortOption[] = [
  { value: "newest", label: "Newest added", sql: "created_at DESC, id" },
  { value: "oldest", label: "Oldest added", sql: "created_at ASC, id" },
  { value: "name", label: "Name (A–Z)", sql: "full_name COLLATE NOCASE ASC, id" },
  { value: "name-desc", label: "Name (Z–A)", sql: "full_name COLLATE NOCASE DESC, id" },
  { value: "code", label: "Account no. (KDOOR, A–Z)", sql: "customer_code COLLATE NOCASE ASC, id" },
  { value: "shipments", label: "Most shipments", sql: "{shipments} DESC, created_at DESC, id" },
];

export const customerShipmentFilters = [["with", "With shipments"], ["without", "No shipments yet"]] as const;
