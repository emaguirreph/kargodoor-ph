import type { D1Database } from "@cloudflare/workers-types";

import { AdminError } from "./security";
import { esc } from "./ui";

/**
 * Packages (cartons) inside one shipment. A shipment with one package keeps
 * using Declared CBM / weight only and saves nothing here. With two or more,
 * each package is listed, and Declared CBM / weight become their totals.
 * Pricing still runs on those totals, the same as before.
 */
export type ShipmentPackage = {
  /** Centimetres; null when only the CBM was typed. */
  length: number | null;
  width: number | null;
  height: number | null;
  cbm: number;
  weight: number;
};

const packageKeys = ["pkg_length", "pkg_width", "pkg_height", "pkg_cbm", "pkg_weight"] as const;
export const maxShipmentPackages = 100;

const round = (value: number, places: number) => Number(value.toFixed(places));

function readNumber(raw: string, label: string, row: number, max: number) {
  const value = raw.trim().replaceAll(",", "");
  if (!value) return null;
  const parsed = Number(value.startsWith(".") ? `0${value}` : value);
  if (!/^\d*\.?\d+$/.test(value) || !Number.isFinite(parsed) || parsed < 0 || parsed > max)
    throw new AdminError(`Package ${row}: ${label} must be a positive number.`);
  return parsed;
}

/**
 * Takes the package rows out of a submitted shipment form (so the shipment
 * fields can be checked as before). Returns null when the form has no package
 * rows. With two or more packages, Declared CBM and weight in the form are
 * set to their totals.
 */
export function takeShipmentPackages(form: URLSearchParams): ShipmentPackage[] | null {
  // The packages box always sends pkg_present, so removing every extra row still clears the saved list.
  const present = form.has("pkg_present");
  form.delete("pkg_present");
  if (!present && !packageKeys.some((key) => form.has(key))) return null;
  const columns = Object.fromEntries(packageKeys.map((key) => [key, form.getAll(key)])) as Record<(typeof packageKeys)[number], string[]>;
  for (const key of packageKeys) form.delete(key);
  const count = Math.max(...packageKeys.map((key) => columns[key].length));
  if (packageKeys.some((key) => columns[key].length !== count)) throw new AdminError("Package rows are incomplete. Reload the page and try again.");

  const packages: ShipmentPackage[] = [];
  for (let index = 0; index < count; index += 1) {
    const cell = (key: (typeof packageKeys)[number]) => columns[key][index] ?? "";
    if (packageKeys.every((key) => !cell(key).trim())) continue; // blank row
    const row = packages.length + 1;
    const length = readNumber(cell("pkg_length"), "Length", row, 10000);
    const width = readNumber(cell("pkg_width"), "Width", row, 10000);
    const height = readNumber(cell("pkg_height"), "Height", row, 10000);
    const sides = [length, width, height];
    const typedCbm = readNumber(cell("pkg_cbm"), "CBM", row, 1000000);
    const weight = readNumber(cell("pkg_weight"), "Weight", row, 100000000);
    let cbm: number;
    if (sides.some((side) => side !== null)) {
      if (sides.some((side) => !side)) throw new AdminError(`Package ${row}: enter Length, Width and Height, or leave all three blank and type the CBM.`);
      cbm = round((length! * width! * height!) / 1_000_000, 6);
    } else {
      if (!typedCbm) throw new AdminError(`Package ${row}: enter its size (L × W × H in cm) or its CBM.`);
      cbm = round(typedCbm, 6);
    }
    if (weight === null) throw new AdminError(`Package ${row}: enter its weight in kg.`);
    if (cbm <= 0) throw new AdminError(`Package ${row}: the size is too small to measure. Check the centimetres.`);
    packages.push({ length, width, height, cbm, weight: round(weight, 3) });
  }
  if (packages.length > maxShipmentPackages) throw new AdminError(`A shipment can have up to ${maxShipmentPackages} packages.`);
  if (packages.length >= 2) {
    const totals = shipmentPackageTotals(packages);
    form.set("cbm", String(totals.cbm));
    form.set("weight_kg", String(totals.weight));
  }
  return packages;
}

export function shipmentPackageTotals(packages: ShipmentPackage[]) {
  return {
    cbm: round(packages.reduce((sum, item) => sum + item.cbm, 0), 6),
    weight: round(packages.reduce((sum, item) => sum + item.weight, 0), 3),
  };
}

function parsePackages(value: unknown): ShipmentPackage[] {
  try {
    const list = JSON.parse(String(value ?? "[]"));
    if (!Array.isArray(list)) return [];
    const size = (raw: unknown) => (raw === null || raw === undefined || raw === "" ? null : Number(raw));
    return list
      .filter((item) => item && typeof item === "object")
      .map((item) => ({ length: size(item.length), width: size(item.width), height: size(item.height), cbm: Number(item.cbm) || 0, weight: Number(item.weight) || 0 }));
  } catch {
    return [];
  }
}

/** Saved packages for a shipment; empty when it has only one package (or the table is not there yet). */
export async function readShipmentPackages(db: D1Database, shipmentId: unknown): Promise<ShipmentPackage[]> {
  if (!shipmentId) return [];
  try {
    const row = await db.prepare("SELECT packages FROM shipment_packages WHERE shipment_id = ?").bind(String(shipmentId)).first<{ packages: string }>();
    return row ? parsePackages(row.packages) : [];
  } catch {
    return [];
  }
}

/** Saves the package list (two or more) or clears it (one or none). Logs a change. */
export async function saveShipmentPackages(db: D1Database, shipmentId: string, packages: ShipmentPackage[], userId: string) {
  const old = await readShipmentPackages(db, shipmentId);
  const next = packages.length >= 2 ? packages : [];
  if (JSON.stringify(old) === JSON.stringify(next)) return false;
  const now = new Date().toISOString();
  const log = db.prepare("INSERT INTO activity_log (id,admin_user_id,action,entity_type,entity_id,old_value,new_value,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), userId, "packages", "shipments", shipmentId, JSON.stringify({ packages: old }), JSON.stringify({ packages: next }), `${next.length || 1} package${next.length === 1 || !next.length ? "" : "s"} on this shipment`, now);
  try {
    await db.batch([
      next.length
        ? db.prepare(`INSERT INTO shipment_packages (shipment_id, packages, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(shipment_id) DO UPDATE SET packages = excluded.packages, updated_at = excluded.updated_at`).bind(shipmentId, JSON.stringify(next), now)
        : db.prepare("DELETE FROM shipment_packages WHERE shipment_id = ?").bind(shipmentId),
      log,
    ]);
  } catch (error) {
    if (/no such table/i.test(String(error))) throw new AdminError("Multiple packages are not switched on yet (database update pending). The rest of the shipment was saved.", 503);
    throw error;
  }
  return true;
}

const num = (value: number | null, places: number) => (value === null ? "" : String(Number(value.toFixed(places))));

/** One package row in the Edit shipment form. */
function packageRow(item: Partial<ShipmentPackage>, index: number) {
  const cell = (name: string, label: string, value: string, step: string, extra = "") =>
    `<label>${esc(label)}<input name="${name}" type="number" min="0" step="${step}" inputmode="decimal" value="${esc(value)}"${extra}></label>`;
  return `<div class="shipment-package" data-package-row>
    <p class="shipment-package-title"><strong data-package-number>Package ${index + 1}</strong><button type="button" class="shipment-package-remove" data-package-remove aria-label="Remove package ${index + 1}">Remove</button></p>
    <div class="shipment-package-fields">
      ${cell("pkg_length", "Length (cm)", num(item.length ?? null, 2), "any")}
      ${cell("pkg_width", "Width (cm)", num(item.width ?? null, 2), "any")}
      ${cell("pkg_height", "Height (cm)", num(item.height ?? null, 2), "any")}
      ${cell("pkg_cbm", "CBM", num(item.cbm ?? null, 6), "any", " data-package-cbm")}
      ${cell("pkg_weight", "Weight (kg)", num(item.weight ?? null, 3), "any")}
    </div>
  </div>`;
}

export const shipmentPackagesCss = `<style>
.shipment-packages{border:1.5px dashed #9cc3dd;border-radius:14px;padding:14px 16px;background:#f5fafd}
.shipment-packages>p{margin:0 0 8px}
.shipment-package{border-top:1px solid #d5e4ed;padding:10px 0}
.shipment-package:first-of-type{border-top:0;padding-top:0}
.shipment-package-title{display:flex;justify-content:space-between;align-items:center;margin:0 0 6px}
.shipment-package-fields{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}
.shipment-package-fields label{font-size:.85rem}
.shipment-package-fields input{background:#fff}
html body button.shipment-package-remove{background:transparent!important;color:#a3261f!important;box-shadow:none!important;padding:2px 6px;font-size:.85rem;font-weight:700}
html body button.shipment-package-add{margin-top:6px}
.shipment-packages-total{font-weight:700;color:#154876}
@media(max-width:640px){.shipment-package-fields{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>`;

/**
 * Packages box for the Edit / Add shipment form, placed under Declared CBM and
 * weight. With no saved list it shows only the "Add another package" button,
 * so a one-package shipment looks and saves as before.
 * /admin-shipment-packages.js adds and removes rows and keeps the totals.
 */
export function shipmentPackagesBox(packages: ShipmentPackage[]) {
  const rows = packages.length >= 2 ? packages.map(packageRow).join("") : "";
  return `${shipmentPackagesCss}<div class="wide shipment-packages" data-shipment-packages data-max="${maxShipmentPackages}">
    <p><strong>Packages</strong> <span class="muted" data-packages-hint>${packages.length >= 2
      ? `${packages.length} packages. Declared CBM and weight are their totals.`
      : "One package. Cargo in more than one carton? Add each package so the totals add up."}</span></p>
    <input type="hidden" name="pkg_present" value="1">
    <div data-package-rows>${rows}</div>
    <template data-package-template>${packageRow({}, 0)}</template>
    <p class="shipment-packages-total" data-packages-total${packages.length >= 2 ? "" : " hidden"}></p>
    <button type="button" class="shipment-package-add" data-package-add>+ Add another package</button>
    <small class="muted" style="display:block;margin-top:6px">Type L × W × H in cm and the CBM fills itself, or type the CBM only. The KargoDoor charge and Ni Hao estimate use the totals.</small>
  </div>`;
}

const sizeText = (item: ShipmentPackage) =>
  item.length && item.width && item.height ? `${num(item.length, 2)} × ${num(item.width, 2)} × ${num(item.height, 2)} cm · ` : "";

/** Package list for the shipment page. */
export function shipmentPackagesSummary(packages: ShipmentPackage[]) {
  if (packages.length < 2) return "";
  return `<ol style="margin:0;padding-left:18px">${packages
    .map((item) => `<li>${esc(sizeText(item))}${esc(num(item.cbm, 6))} CBM · ${esc(num(item.weight, 3))} kg</li>`)
    .join("")}</ol>`;
}
