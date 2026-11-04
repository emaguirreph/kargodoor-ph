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
  if (str(cargo.originWarehouse)) supplierRows.push(["Origin Warehouse", str(cargo.originWarehouse)]);
  if (!supplierRows.length) supplierRows.push(["Supplier", "To follow"]);
  kv("Supplier", boxes[2], w2, supplierRows);

  // Cargo / charges table.
  y = boxTop - boxH - 18;
  const th = 22;
  c.round(L, y - th, R - L, th, 5, C.blue);
  c.rect(L, y - th, R - L, 6, C.blue);
  const colNo = L + 9;
  const colDesc = L + 30;
  const colSize = L + 352;
  const head = (s: string, x: number, align: "left" | "right" = "left") => c.text(s, x, y - 14.5, 7, { bold: true, color: C.white, spacing: 0.7, align });
  head("#", colNo); head("CARGO DETAILS", colDesc); head("SIZE", colSize); head("ESTIMATE", R - 9, "right");
  y -= th;

  const item = str(cargo.description) || str(cargo.item) || "Cargo";
  const details: string[] = [`Item: ${item}`];
  if (freightType === "Full Container") details.push(`Container: ${num(cargo.containerQuantity) || 1} × ${str(cargo.containerSize)}`);
  else {
    const packages = Number(cargo.packageQuantity ?? 1);
    const n = Number.isInteger(packages) && packages > 0 ? packages : 1;
    details.push(`Quantity / Packages: ${n} package${n === 1 ? "" : "s"}`);
  }
  // Em 2026-11-04: show declared weight, declared CBM and L × W × H whenever they were entered.
  const cbm = num(cargo.cbm);
  const kg = num(cargo.weight);
  if (cbm) details.push(`Declared CBM: ${trimNumber(cbm)} CBM`);
  if (kg) details.push(`Declared weight: ${trimNumber(kg)} kg`);
  const dims = [cargo.length, cargo.width, cargo.height].map((v) => Number(v ?? 0));
  if (dims.some((v) => v > 0))
    details.push(`Dimensions (L × W × H): ${dims.map((v) => (v > 0 ? trimNumber(v) : "—")).join(" × ")} ${str(cargo.measurementUnit) || "cm"}`);
  const detailLines = details.flatMap((d) => wrap(d, 8, colSize - colDesc - 14));
  const rowH = 30 + detailLines.length * 10.5;
  c.text("1", colNo + 2, y - 17, 9.5);
  c.text(serviceLine[freightType] ?? "Freight, China to Manila", colDesc, y - 17, 9.5, { bold: true });
  detailLines.forEach((d, j) => c.text(d, colDesc, y - 29 - j * 10.5, 8, { color: C.muted }));
  c.text(cbm ? `${trimNumber(cbm)} CBM` : freightType === "Full Container" ? str(cargo.containerSize) : "—", colSize, y - 17, 9.5);
  if (kg) c.text(`${trimNumber(kg)} kg declared`, colSize, y - 29, 8, { color: C.muted });
  else if (cbm) c.text("declared", colSize, y - 29, 8, { color: C.muted });
  c.text(peso(total), R - 9, y - 17, 9.5, { align: "right" });
  y -= rowH;
  c.hline(L, R, y);

  // Note left, big estimate box right.
  y -= 14;
  const note = "All-in estimate from our China warehouse to our Malabon warehouse. The final bill follows the size and weight we verify at the warehouse.";
  wrap(note, 8.3, 270).forEach((l, i) => c.text(l, L, y - 9 - i * 11.5, 8.3, { color: C.muted }));
  const tx = R - 210;
  const grandH = 54;
  c.round(tx, y - grandH, R - tx, grandH, 5, C.blue);
  c.text("ESTIMATED ALL-IN RATE", tx + 10, y - 15, 7.5, { bold: true, color: C.white, spacing: 0.8 });
  c.text(freightType, R - 10, y - 15, 7.5, { color: C.white, align: "right" });
  c.text(peso(total), R - 10, y - 42, 18, { bold: true, color: C.white, align: "right" });
  y -= grandH + 18;

  // Next steps, in the green box style of the invoice's "How to pay".
  const stepsH = 70;
  c.round(L, y - stepsH, R - L, stepsH, 7, undefined, C.green, 1.2);
  c.ops.push(`q ${L + 0.6} ${y - 26} ${R - L - 1.2} 25.4 re W n`);
  c.round(L + 0.6, y - 40, R - L - 1.2, 39.4, 6.5, C.greenSoft);
  c.ops.push("Q");
  c.text("Ready to ship?", L + 12, y - 17.5, 10.5, { bold: true, color: C.blueDark });
  c.text(`Quotation ${number}`, R - 12, y - 17, 8.3, { color: C.muted, align: "right" });
  const steps = ["Reply YES on Messenger or WhatsApp to confirm.", "We send your KargoDoor code and warehouse address.", "Your supplier ships to our China warehouse."];
  const third = (R - L - 24) / 3;
  steps.forEach((s, i) => {
    const x = L + 12 + i * third;
    c.round(x, y - 48, 13, 13, 6.5, C.blue);
    c.text(String(i + 1), x + 6.5, y - 44, 7.5, { bold: true, color: C.white, align: "center" });
    wrap(s, 8.4, third - 26).slice(0, 2).forEach((l, j) => c.text(l, x + 19, y - 44.5 - j * 11, 8.4));
  });
  y -= stepsH + 18;

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
