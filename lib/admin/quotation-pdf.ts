// lib/admin/quotation-pdf.ts
var blue = "0.04 0.33 0.68";
var green = "0.16 0.60 0.20";
type CustomerSnapshot = { name?: unknown };
type CargoSnapshot = {
  description?: unknown;
  item?: unknown;
  category?: unknown;
  quantity?: unknown;
  units?: unknown;
  unitType?: unknown;
  length?: unknown;
  width?: unknown;
  height?: unknown;
  measurementUnit?: unknown;
  cbm?: unknown;
  weight?: unknown;
  originWarehouse?: unknown;
};
type PricingSnapshot = { density?: unknown; rateBasis?: unknown; pricingMethod?: unknown; formula?: unknown };
type QuotationPdfData = {
  customer_snapshot?: unknown;
  cargo_snapshot?: unknown;
  pricing_snapshot?: unknown;
  quotation_date?: unknown;
  quotation_number?: unknown;
  freight_type?: unknown;
  final_amount?: unknown;
};
type PdfText = (value: unknown, x?: number, size?: number, bold?: boolean, color?: string) => void;

var clean = (value: unknown): string => String(value ?? "").replace(/[\\()]/g, "\\$&").replace(/\u00b7/g, "\\267").replace(/\u00d7/g, "\\327").replace(/[^\x20-\x7e]/g, "?");
var money = (cents: unknown): string => "PHP " + (Number(cents ?? 0) / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
var wrap = (value: unknown, width = 88): string[] => {
  const out = [];
  let line = "";
  for (const word of clean(value).split(/\s+/)) {
    if ((line + " " + word).trim().length > width) {
      if (line) out.push(line);
      line = word;
    } else line = (line + " " + word).trim();
  }
  return line ? [...out, line] : out;
};
function customerQuotationPdf(q: QuotationPdfData): Uint8Array<ArrayBuffer> {
  const customer: CustomerSnapshot = JSON.parse(String(q.customer_snapshot ?? "{}")), cargo: CargoSnapshot = JSON.parse(String(q.cargo_snapshot ?? "{}")), pricing: PricingSnapshot = JSON.parse(String(q.pricing_snapshot ?? "{}"));
  const lines: string[] = [];
  let y = 790;
  const text: PdfText = (value, x = 52, size = 9, bold = false, color = "0.12 0.18 0.25") => {
    lines.push(`${color} rg BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${y} Td (${clean(value)}) Tj ET`);
    y -= size + 5;
  };
  const rule = () => {
    lines.push(`${blue} RG 52 ${y + 2} m 543 ${y + 2} l S`);
    y -= 14;
  };
  const heading = (value: unknown): void => {
    rule();
    text(value, 52, 11, true, blue);
    y -= 1;
  };
  const pair = (label: string, value: unknown): void => {
    if (String(value ?? "").trim()) text(`${label}: ${value}`);
  };
  lines.push(`${blue} rg 52 756 491 54 re f`);
  y = 790;
  text("KargoDoorPH", 68, 20, true, "1 1 1");
  text("China to PH, made SIMPLE.", 68, 10, false, "0.88 0.96 1");
  y = 788;
  text("QUOTATION", 412, 16, true, "1 1 1");
  y = 730;
  text(`Date: ${q.quotation_date ?? ""}`, 52, 9, false, blue);
  text(`Quotation No.: ${q.quotation_number ?? ""}`, 52, 9, false, blue);
  y -= 4;
  heading("CLIENT INFORMATION");
  pair("Client Name", customer.name);
  heading("CARGO DETAILS");
  pair("Item", cargo.description || cargo.item);
  pair("Category", cargo.category);
  text("Quantity / Packages: 1 package");
  if (cargo.length || cargo.width || cargo.height) pair("Dimensions (L × W × H)", [cargo.length, cargo.width, cargo.height].filter(Boolean).join(" × ") + ` ${cargo.measurementUnit ?? "cm"}`);
  pair("Total CBM", cargo.cbm);
  if (cargo.weight !== void 0) pair("Actual Weight", `${cargo.weight} kg`);
  pair("Freight", q.freight_type);
  pair("Origin Warehouse", cargo.originWarehouse);
  heading("SHIPPING CALCULATION");
  pair("Total CBM", cargo.cbm);
  if (cargo.weight !== void 0) pair("Actual Weight", `${cargo.weight} kg`);
  pair("Density", pricing.density === void 0 ? "Not applicable" : `${Number(pricing.density).toFixed(2)} kg/CBM`);
  pair("Applicable Rate / Basis", pricing.rateBasis || pricing.pricingMethod || cargo.category);
  pair("Calculation", pricing.formula || pricing.pricingMethod || "Saved quotation calculation");
  heading("ESTIMATED ALL-IN RATE");
  y -= 12;
  text(money(q.final_amount), 52, 21, true, green);
  y -= 1;
  text("Incoterm: FCA - KargoDoor Origin Warehouse", 52, 8);
  text("Service Coverage: Origin Warehouse > Manila Customs Clearance >", 52, 8);
  text("KargoDoor Metro Manila Warehouse", 52, 8);
  heading("DISCLAIMER");
  for (const line of wrap("This quotation is based on the cargo information provided. Final charges may change if the actual dimensions, CBM, weight, quantity, cargo category, or other shipment details differ upon warehouse inspection.", 96)) text(line, 52, 7);
  y -= 4;
  for (const line of wrap("Rates and transit times are estimates and are subject to final warehouse confirmation. Additional charges may apply for special handling, restricted or regulated cargo, permits, taxes, or other government requirements.", 96)) text(line, 52, 7);
  y = 170;
  lines.push(`${blue} RG 52 193 m 543 193 l S`);
  text("KARGODOOR PH", 52, 8, true, blue);
  text("China to PH, made SIMPLE.", 52, 7, false, blue);
  text("+63 917 157 7370 | +63 908 889 0664", 52, 7, false, blue);
  text("support@kargodoorph.com | www.kargodoorph.com | facebook.com/KargoDoorPH", 52, 7, false, blue);
  text("Instagram: @kargodoorph | SOURCE · SHIP · RECEIVE", 52, 7, false, blue);
  const stream = lines.join("\n"), objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>", `<< /Length ${new TextEncoder().encode(stream).length} >>
stream
${stream}
endstream`];
  let pdf = "%PDF-1.4\n% KargoDoor quotation\n", offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(new TextEncoder().encode(pdf).length);
    pdf += `${i + 1} 0 obj
${objects[i]}
endobj
`;
  }
  const xref = new TextEncoder().encode(pdf).length;
  pdf += `xref
0 ${objects.length + 1}
0000000000 65535 f
${offsets.slice(1).map((x) => String(x).padStart(10, "0") + " 00000 n ").join("\n")}
trailer
<< /Size ${objects.length + 1} /Root 1 0 R >>
startxref
${xref}
%%EOF`;
  return new TextEncoder().encode(pdf);
}
export {
  customerQuotationPdf
};
