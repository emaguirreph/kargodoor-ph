import { esc, pesos } from "./ui";

/**
 * Package lines of a bulk quotation (made on /admin/bulk-intake). Each line is
 * one physical package with its own KargoDoor charge and Ni Hao cost, both in
 * centavos. Regular quotations return an empty list.
 */
export type BulkPackageLine = {
  item: string;
  category: string;
  length: number;
  width: number;
  height: number;
  /** Packages in this line (a bundle can be one line). Sizes are per package. */
  packageCount: number;
  weight: number;
  cbm: number;
  /** KargoDoor charge, centavos (includes the ₱30 transfer fee). */
  charge: number;
  /** Ni Hao cost, centavos. Internal only. */
  nihaoCost: number;
};

const n = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function bulkPackageLines(cargo: Record<string, unknown> | null | undefined): BulkPackageLine[] {
  const rows = cargo && Array.isArray(cargo.bulkPackages) ? cargo.bulkPackages : [];
  return rows
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
    .map((row) => ({
      item: String(row.item ?? "").trim() || "Package",
      category: String(row.category ?? ""),
      length: n(row.length),
      width: n(row.width),
      height: n(row.height),
      packageCount: Math.max(1, Math.floor(n(row.packageCount) || 1)),
      weight: n(row.weight),
      cbm: n(row.cbm),
      charge: Math.round(n(row.charge)),
      nihaoCost: Math.round(n(row.nihaoCost)),
    }));
}

export const isBulkCargo = (cargo: Record<string, unknown> | null | undefined) =>
  Boolean(cargo && Array.isArray(cargo.bulkPackages));

const trim = (value: number, places = 3) => String(Number(value.toFixed(places)));
export const bulkDimensions = (line: BulkPackageLine) =>
  line.length && line.width && line.height
    ? `${trim(line.length, 2)} × ${trim(line.width, 2)} × ${trim(line.height, 2)} cm${line.packageCount > 1 ? ` × ${line.packageCount} pcs` : ""}`
    : "—";

/**
 * Admin table of the package lines. With `internal`, also shows Ni Hao cost
 * and profit per line (never used on anything the customer sees).
 */
export function bulkPackageTable(lines: BulkPackageLine[], internal: boolean) {
  if (!lines.length) return "";
  const totals = lines.reduce(
    (sum, line) => ({ cbm: sum.cbm + line.cbm, weight: sum.weight + line.weight, charge: sum.charge + line.charge, cost: sum.cost + line.nihaoCost }),
    { cbm: 0, weight: 0, charge: 0, cost: 0 },
  );
  const head = `<tr><th>#</th><th>Item</th><th>Category</th><th>L × W × H</th><th>CBM</th><th>Weight</th><th>KargoDoor charge</th>${internal ? "<th>Ni Hao cost</th><th>Profit</th>" : ""}</tr>`;
  const body = lines
    .map((line, index) => `<tr><td>${index + 1}</td><td>${esc(line.item)}</td><td>${esc(line.category || "—")}</td><td>${esc(bulkDimensions(line))}</td><td>${esc(trim(line.cbm, 4))}</td><td>${esc(trim(line.weight, 2))} kg</td><td>${pesos(line.charge)}</td>${internal ? `<td>${pesos(line.nihaoCost)}</td><td>${pesos(line.charge - line.nihaoCost)}</td>` : ""}</tr>`)
    .join("");
  const foot = `<tr><th></th><th>Total (${lines.length} line${lines.length === 1 ? "" : "s"})</th><th></th><th></th><th>${esc(trim(totals.cbm, 4))}</th><th>${esc(trim(totals.weight, 2))} kg</th><th>${pesos(totals.charge)}</th>${internal ? `<th>${pesos(totals.cost)}</th><th>${pesos(totals.charge - totals.cost)}</th>` : ""}</tr>`;
  const packages = lines.reduce((sum, line) => sum + line.packageCount, 0);
  return `<section class="quotation-detail-card bulk-lines-card"><h2>Package lines (${lines.length} line${lines.length === 1 ? "" : "s"}, ${packages} package${packages === 1 ? "" : "s"})</h2><p class="muted">Each line is one package, or one bundle of packages. The KargoDoor charge on each line includes the ₱30 transfer fee.${internal ? " Ni Hao cost and profit are internal only and never appear on the customer PDF." : ""}</p><div class="table"><table class="bulk-lines"><thead>${head}</thead><tbody>${body}</tbody><tfoot>${foot}</tfoot></table></div></section>`;
}
