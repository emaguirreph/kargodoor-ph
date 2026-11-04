// lib/admin/quotation-pdf.ts
import { invoiceLogo } from "./invoice-logo";
import { C, Canvas, PAGE_H, PDF_LEFT as L, PDF_RIGHT as R, buildPdf, niceDate, pdfTextWidth as textWidth, peso, trimNumber, wrapPdfText as wrap } from "./invoice-pdf";

/**
 * Customer quotation PDF (A4), same look as the customer invoice (Em,
 * 2026-11-04: "make it similar to the invoice"). Uses the invoice's drawing
 * helpers, which print ₱, ×, · and dashes properly instead of "?".
 * Only customer-facing data: no internal rates, costs or override reasons.
 */
export const defaultQuotationTerms = `This quotation is based on the cargo information provided. Final charges may change if the actual dimensions, CBM, weight, quantity, cargo category, or other shipment details differ upon warehouse inspection.

Rates and transit times are estimates and are subject to final warehouse confirmation. Additional charges may apply for special handling, restricted or regulated cargo, permits, taxes, or other government requirements.

Incoterm: FCA - KargoDoor Origin Warehouse
Service Coverage: Origin Warehouse > Manila Customs Clearance > KargoDoor Metro Manila Warehouse`;

type CustomerSnapshot = { name?: unknown; company?: unknown; mobile?: unknown; email?: unknown; address?: unknown };
type CargoSnapshot = {
  description?: unknown; item?: unknown; category?: unknown; quantity?: unknown; packageQuantity?: unknown;
  units?: unknown; unitType?: unknown; length?: unknown; width?: unknown; height?: unknown; measurementUnit?: unknown;
  showPackageDimensions?: unknown; cbm?: unknown; weight?: unknown; supplierName?: unknown; origin?: unknown;
  originWarehouse?: unknown; containerSize?: unknown; containerQuantity?: unknown;
};
type QuotationPdfData = {
  customer_snapshot?: unknown; cargo_snapshot?: unknown; pricing_snapshot?: unknown; quotation_date?: unknown;
  quotation_number?: unknown; valid_until?: unknown; freight_type?: unknown; final_amount?: unknown; notes?: unknown;
};

function snapshot<T extends object>(value: unknown): T {
  try {
    const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as T : {} as T;
  } catch {
    return {} as T;
  }
}
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const num = (v: unknown) => Number(v ?? 0) || 0;

const serviceLine: Record<string, string> = {
  "Sea Freight": "Sea freight, China to Manila",
  "Air Freight": "Air freight, China to Manila",
  "Full Container": "Full container (FCL), China to Manila",
};

/** The second argument (old header logo) is ignored: the invoice logo is built in. */
function customerQuotationPdf(q: QuotationPdfData, _logoJpeg?: Uint8Array) {
  void _logoJpeg;
  const c = new Canvas();
  const customer = snapshot<CustomerSnapshot>(q.customer_snapshot);
  const cargo = snapshot<CargoSnapshot>(q.cargo_snapshot);
  const number = str(q.quotation_number);
  const freightType = str(q.freight_type);
  const total = num(q.final_amount);
  const firstName = str(customer.name).split(/\s+/)[0] || "po";

  // Top colour band, logo, company lines: same as the invoice.
  c.rect(0, PAGE_H - 4, 595.28 * 0.7, 4, C.blue);
  c.rect(595.28 * 0.7, PAGE_H - 4, 595.28 * 0.3, 4, C.green);
  c.image(L - 4, PAGE_H - 98, (58 * invoiceLogo.width) / invoiceLogo.height, 58);
  c.text("KargoDoor Cargo Forwarding · Malabon, Metro Manila", L, PAGE_H - 112, 8, { color: C.muted });
  c.text("support@kargodoorph.com · +63 919 932 3077 · +63 908 889 0664 · kargodoorph.com", L, PAGE_H - 123, 8, { color: C.muted });

  c.text("QUOTATION", R, PAGE_H - 70, 26, { bold: true, color: C.blue, align: "right", spacing: 0.6 });
  const noW = c.text(number, R, PAGE_H - 88, 9, { bold: true, align: "right" });
  c.text("No. ", R - noW, PAGE_H - 88, 9, { color: C.muted, align: "right" });
  if (str(q.valid_until)) {
    const label = `VALID UNTIL ${niceDate(q.valid_until).toUpperCase()}`;
    const pillW = textWidth(label, 8.5, true) + 0.4 * (label.length - 1) + 20;
    c.round(R - pillW, PAGE_H - 120, pillW, 18, 9, C.greenSoft, C.green);
    c.text(label, R - pillW / 2, PAGE_H - 114.5, 8.5, { bold: true, color: C.ok, align: "center", spacing: 0.4 });
  }

  // Three info boxes: prepared for, quotation, supplier.
  const boxTop = PAGE_H - 145;
  const boxH = 84;
  const gap = 12;
  const w1 = 190;
  const w2 = (R - L - w1 - gap * 2) / 2;
  const boxes = [L, L + w1 + gap, L + w1 + gap + w2 + gap];
  const label = (s: string, x: number, y: number) => c.text(s.toUpperCase(), x, y, 6.5, { bold: true, color: C.muted, spacing: 0.9 });
  [w1, w2, w2].forEach((w, i) => c.round(boxes[i], boxTop - boxH, w, boxH, 5, undefined, C.line));
  let y = boxTop - 16;
  label("Prepared for", boxes[0] + 11, y);
  c.text(str(customer.name) || "Customer", boxes[0] + 11, y - 15, 10.5, { bold: true });
  let by = y - 28;
  if (str(customer.company)) { c.text(wrap(str(customer.company), 9, w1 - 22)[0] ?? "", boxes[0] + 11, by, 9); by -= 12; }
  for (const line of [str(customer.mobile), str(customer.email)].filter(Boolean)) {
    c.text(wrap(line, 8.3, w1 - 22)[0] ?? "", boxes[0] + 11, by, 8.3, { color: C.muted });
    by -= 11;
  }
  const kv = (title: string, x: number, w: number, rows: [string, string][]) => {
    label(title, x + 11, y);
    // A value too long for its row goes on its own line(s) under the label, never cut off.
    let ry = y - 15;
    for (const [k, v] of rows) {
      c.text(k, x + 11, ry, 8.6, { color: C.muted });
      if (textWidth(v, 8.6) <= w - 22 - textWidth(k, 8.6) - 8) c.text(v, x + w - 11, ry, 8.6, { align: "right" });
      else for (const line of wrap(v, 8.6, w - 22).slice(0, 2)) { ry -= 11; c.text(line, x + 11, ry, 8.6); }
      ry -= 13;
    }
  };
  const quoteRows: [string, string][] = [["Date", niceDate(q.quotation_date)]];
  if (str(q.valid_until)) quoteRows.push(["Valid until", niceDate(q.valid_until)]);
  quoteRows.push(["Service", freightType || "—"]);
  kv("Quotation", boxes[1], w2, quoteRows);
  const supplierRows: [string, string][] = [];
  if (str(cargo.supplierName)) supplierRows.push(["Supplier", str(cargo.supplierName)]);
  if (str(cargo.origin)) supplierRows.push(["Location", str(cargo.origin)]);
  if (!supplierRows.length) supplierRows.push(["Supplier", "To follow"]);
  kv("Supplier", boxes[2], w2, supplierRows);

  // Cargo table (Em, 2026-11-04): Item, Dimensions, Declared CBM, Declared Weight,
  // Warehouse, Sea or Air, Total Qty of Packages. Only what was entered is shown.
  y = boxTop - boxH - 18;
  const isAir = /air/i.test(freightType);
  const isFcl = freightType === "Full Container";
  const cbm = num(cargo.cbm);
  const kg = num(cargo.weight);
  const dims = [cargo.length, cargo.width, cargo.height].map((v) => Number(v ?? 0));
  const item = str(cargo.description) || str(cargo.item) || "Cargo";
  const packages = Number(cargo.packageQuantity ?? 1);
  const qty = isFcl
    ? `${num(cargo.containerQuantity) || 1} × ${str(cargo.containerSize) || "container"}`
    : `${Number.isInteger(packages) && packages > 0 ? packages : 1}`;
  const cols: { head: [string, string]; w: number; value: string; align?: "center" }[] = [
    { head: ["ITEM", ""], w: 120, value: item },
    { head: ["DIMENSIONS", "(L × W × H)"], w: 84, value: dims.some((v) => v > 0) ? `${dims.map((v) => (v > 0 ? trimNumber(v) : "—")).join(" × ")} ${str(cargo.measurementUnit) || "cm"}` : "—" },
    { head: ["DECLARED", "CBM"], w: 64, value: cbm ? `${trimNumber(cbm)} CBM` : "—", align: "center" },
    { head: ["DECLARED", "WEIGHT"], w: 60, value: kg ? `${trimNumber(kg)} kg` : "—", align: "center" },
    { head: ["WAREHOUSE", ""], w: 66, value: str(cargo.originWarehouse) || "—", align: "center" },
    { head: ["SEA OR AIR", ""], w: 50, value: isAir ? "AIR" : isFcl ? "SEA (FCL)" : "SEA", align: "center" },
    { head: ["TOTAL QTY", "OF PACKAGES"], w: 0, value: qty, align: "center" },
  ];
  cols[cols.length - 1].w = R - L - cols.slice(0, -1).reduce((a, col) => a + col.w, 0);
  const th = 28;
  c.round(L, y - th, R - L, th, 5, C.blue);
  c.rect(L, y - th, R - L, 6, C.blue);
  let cx = L;
  const cells = cols.map((col) => {
    const pad = 7;
    const mid = cx + col.w / 2;
    const at = col.align === "center" ? mid : cx + pad;
    const opts = { bold: true, color: C.white, spacing: 0.5, align: col.align ?? "left" } as const;
    if (col.head[1]) { c.text(col.head[0], at, y - 12, 6.6, opts); c.text(col.head[1], at, y - 21, 6.6, opts); }
    else c.text(col.head[0], at, y - 16.5, 6.6, opts);
    const lines = wrap(col.value, 8.8, col.w - pad * 2).slice(0, 4);
    const cell = { x: at, lines, align: col.align };
    cx += col.w;
    return cell;
  });
  y -= th;
  const rowH = 16 + Math.max(...cells.map((cell) => cell.lines.length)) * 11.5;
  cells.forEach((cell, i) => cell.lines.forEach((line, j) => c.text(line, cell.x, y - 16 - j * 11.5, 8.8, { bold: i === 0 && j === 0, align: cell.align ?? "left" })));
  y -= rowH;
  c.hline(L, R, y);

  // Estimated all-in rate, full width under the table.
  y -= 12;
  const grandH = 50;
  c.round(L, y - grandH, R - L, grandH, 5, C.blue);
  c.text("ESTIMATED ALL-IN RATE", L + 14, y - 19, 8, { bold: true, color: C.white, spacing: 0.8 });
  c.text("China warehouse to our Malabon warehouse. Final bill follows the size and weight we verify.", L + 14, y - 34, 7.6, { color: C.white });
  c.text(peso(total), R - 14, y - 32, 19, { bold: true, color: C.white, align: "right" });
  y -= grandH + 16;

  // Cargo label example (left) and shipping instructions (right).
  const boxH2 = 160;
  const lw = 196;
  const rx = L + lw + 12;
  c.round(L, y - boxH2, lw, boxH2, 6, undefined, C.line);
  c.round(rx, y - boxH2, R - rx, boxH2, 6, undefined, C.green, 1.2);
  label("Cargo label example", L + 12, y - 15);
  label("Shipping instructions", rx + 12, y - 15);
  // The label itself: a white sticker with a dark border, like the one on the box.
  const sx = L + 12, sw = lw - 24, sTop = y - 24, sH = 86;
  c.round(sx, sTop - sH, sw, sH, 3, C.white, C.ink, 1.4);
  const mark = `${isAir ? "AIR " : ""}KDOOR-XXXX`;
  c.text(mark, sx + sw / 2, sTop - 22, 15, { bold: true, align: "center", spacing: 0.6 });
  c.hline(sx + 10, sx + sw - 10, sTop - 30, C.greyLine);
  const labelRows: [string, string][] = [["Item", item], ["Supplier no.", "[China phone]"], ["PH phone", str(customer.mobile) || "[PH phone]"]];
  labelRows.forEach(([k, v], i) => {
    const ly = sTop - 44 - i * 12.5;
    const kw = c.text(`${k}: `, sx + 10, ly, 8.4, { bold: true });
    c.text(wrap(v, 8.4, sw - 20 - kw)[0] ?? "", sx + 10 + kw, ly, 8.4);
  });
  const labelNote = `Your own KDOOR code replaces XXXX once you confirm.${isAir ? " Air cargo: write AIR before the code." : ""}`;
  wrap(labelNote, 7.4, lw - 24).slice(0, 3).forEach((l, i) => c.text(l, L + 12, sTop - sH - 12 - i * 9.5, 7.4, { color: C.muted }));
  const instructions = [
    "Confirm this quotation on Messenger or WhatsApp. We send your KDOOR code and China warehouse address.",
    "Put the cargo label on EVERY package: code, item, supplier's phone and your PH phone.",
    "Add a packing list: item name in Chinese, material, quantity, weight and supplier's phone.",
    "Pack securely. Fragile items need extra protection.",
    "Once shipped, send us the courier, tracking/waybill no., total packages and a photo of the receipt.",
  ];
  let iy = y - 30;
  const iw = R - rx - 24 - 18;
  instructions.forEach((s, i) => {
    c.round(rx + 12, iy - 4, 12, 12, 6, C.blue);
    c.text(String(i + 1), rx + 18, iy - 0.5, 7, { bold: true, color: C.white, align: "center" });
    wrap(s, 8, iw).slice(0, 2).forEach((l, j) => c.text(l, rx + 30, iy - j * 10, 8));
    iy -= wrap(s, 8, iw).slice(0, 2).length * 10 + 5;
  });
  wrap("Packages with missing labels or damaged packing are not accepted at the warehouse.", 7.4, R - rx - 24).forEach((l, i, all) => c.text(l, rx + 12, y - boxH2 + 10 + (all.length - 1 - i) * 9, 7.4, { bold: true, color: C.red }));
  y -= boxH2 + 16;

  // Terms and conditions (saved on the quotation; empty removes them).
  c.text("TERMS AND CONDITIONS", L, y, 7.5, { bold: true, color: C.blue, spacing: 0.8 });
  y -= 13;
  const terms = q.notes === null || q.notes === undefined ? defaultQuotationTerms : String(q.notes);
  for (const paragraph of terms.split(/\n\s*\n/)) {
    for (const raw of paragraph.split("\n")) {
      for (const line of wrap(raw, 7.6, R - L)) {
        if (y < 136) break;
        c.text(line, L, y, 7.6, { color: C.muted });
        y -= 10;
      }
    }
    y -= 4;
  }

  // Thank-you line + footer, pinned at the bottom like the invoice.
  const ty = 104;
  c.text(`Salamat, ${firstName}!`, L, ty, 11, { bold: true, color: C.blue });
  c.text("Questions? Message us on Messenger (facebook.com/KargoDoorPH), Instagram @kargodoorph, or WhatsApp.", L, ty - 14, 7.8, { color: C.muted });
  c.text("www.kargodoorph.com · SOURCE · SHIP · RECEIVE", L, ty - 25, 7.8, { color: C.muted });
  c.hline(L, R, 56);
  c.text("KargoDoor PH · China to PH, made SIMPLE", L, 44, 7.6, { color: C.muted });
  c.text(`${number} · Page 1 of 1`, R, 44, 7.6, { color: C.muted, align: "right" });

  return buildPdf(c.ops.join("\n"));
}

export { customerQuotationPdf };
