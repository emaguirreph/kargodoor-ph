// lib/admin/quotation-pdf.ts
import { quotationLogoJpegBase64, quotationLogoWidth, quotationLogoHeight } from "./quotation-logo";
var blue = "0.04 0.33 0.68";
var green = "0.16 0.60 0.20";
type CustomerSnapshot = {
  name?: unknown;
  company?: unknown;
  mobile?: unknown;
  email?: unknown;
  address?: unknown;
};
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
  supplierName?: unknown;
  origin?: unknown;
  originWarehouse?: unknown;
};
type QuotationPdfData = {
  customer_snapshot?: unknown;
  cargo_snapshot?: unknown;
  pricing_snapshot?: unknown;
  quotation_date?: unknown;
  quotation_number?: unknown;
  valid_until?: unknown;
  freight_type?: unknown;
  final_amount?: unknown;
};
type PdfText = (value: unknown, x?: number, size?: number, bold?: boolean, color?: string) => void;

var clean = (value: unknown): string => String(value ?? "").replace(/[\\()]/g, "\\$&").replace(/\u00b7/g, "\\267").replace(/\u00d7/g, "\\327").replace(/[^\x20-\x7e]/g, "?");
var base64ToHex = (value: string): string => {
  const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};
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
  const customer: CustomerSnapshot = JSON.parse(String(q.customer_snapshot ?? "{}")), cargo: CargoSnapshot = JSON.parse(String(q.cargo_snapshot ?? "{}"));
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
  lines.push(`q ${quotationLogoWidth / 2} 0 0 ${quotationLogoHeight / 2} 58 761 cm /Im1 Do Q`);
  y = 790;
  text("KargoDoorPH", 68, 20, true, "1 1 1");
  text("China to PH, made SIMPLE.", 68, 10, false, "0.88 0.96 1");
  y = 788;
  text("QUOTATION", 412, 16, true, "1 1 1");
  // Header metadata
  y = 730;
  text(`Date: ${q.quotation_date ?? ""}`, 52, 9, false, blue);
  if (String(q.valid_until ?? "").trim()) {
    text(`Valid Until: ${q.valid_until}`, 52, 9, false, blue);
  }

  // Quotation number stays on the right.
  const headerInfoY = y;
  y = 730;
  text(`Quotation No.: ${q.quotation_number ?? ""}`, 360, 9, false, blue);
  y = headerInfoY - 5;

  // Client + Supplier Information
  rule();
  const infoHeadingY = y;
  text("CLIENT INFORMATION", 52, 11, true, blue);
  y = infoHeadingY;
  text("SUPPLIER INFORMATION", 310, 11, true, blue);

  const infoBodyY = Math.min(y, infoHeadingY - 17);

  y = infoBodyY;
  pair("Client Name", customer.name);
  pair("Company", customer.company);
  pair("Phone Number", customer.mobile);
  pair("Email", customer.email);
  pair("Address", customer.address);
  const clientEndY = y;

  y = infoBodyY;
  if (String(cargo.supplierName ?? "").trim()) {
    text(`Supplier Name: ${cargo.supplierName}`, 310, 9);
  }
  if (String(cargo.origin ?? "").trim()) {
    text(`Supplier Location: ${cargo.origin}`, 310, 9);
  }
  const supplierEndY = y;

  y = Math.min(clientEndY, supplierEndY) - 6;

  // Cargo Details + Estimated All-In Rate
  rule();
  const cargoHeadingY = y;
  text("CARGO DETAILS", 52, 11, true, blue);
  y = cargoHeadingY;
  text("ESTIMATED ALL-IN RATE", 310, 11, true, blue);

  const cargoBodyY = cargoHeadingY - 22;

  // Left column: cargo only
  y = cargoBodyY;
  pair("Item", cargo.description || cargo.item);
  text("Quantity / Packages: 1 package");

  const dimensions = [cargo.length, cargo.width, cargo.height]
    .map((value) => Number(value ?? 0));

  if (dimensions.some((value) => value > 0)) {
    pair(
      "Dimensions (L × W × H)",
      `${cargo.length ?? ""} × ${cargo.width ?? ""} × ${cargo.height ?? ""} ${cargo.measurementUnit ?? "cm"}`,
    );
  }

  pair("Total CBM", cargo.cbm);
  if (cargo.weight !== void 0) pair("Actual Weight", `${cargo.weight} kg`);
  const cargoEndY = y;

  // Right column: rate + freight + origin warehouse
  y = cargoBodyY - 3;
  text(money(q.final_amount), 310, 21, true, green);
  y -= 4;
  text(q.freight_type ?? "", 310, 9);

  if (String(cargo.originWarehouse ?? "").trim()) {
    text(`Origin Warehouse: ${cargo.originWarehouse}`, 310, 9);
  }
  const rateEndY = y;

  y = Math.min(cargoEndY, rateEndY) - 7;

  // Compact disclaimer
  rule();
  text("DISCLAIMER", 52, 9, true, blue);

  for (const line of wrap(
    "This quotation is based on the cargo information provided. Final charges may change if the actual dimensions, CBM, weight, quantity, cargo category, or other shipment details differ upon warehouse inspection.",
    112,
  )) text(line, 52, 6.5);

  y -= 2;

  for (const line of wrap(
    "Rates and transit times are estimates and are subject to final warehouse confirmation. Additional charges may apply for special handling, restricted or regulated cargo, permits, taxes, or other government requirements.",
    112,
  )) text(line, 52, 6.5);

  // Incoterm and coverage below disclaimer
  y -= 4;
  text("Incoterm: FCA - KargoDoor Origin Warehouse", 52, 7);
  text("Service Coverage: Origin Warehouse > Manila Customs Clearance >", 52, 7);
  text("KargoDoor Metro Manila Warehouse", 52, 7);

  y = 245;
  lines.push(`${blue} RG 52 268 m 543 268 l S`);
  text("KARGODOOR PH", 52, 8, true, blue);
  text("China to PH, made SIMPLE.", 52, 7, false, blue);
  text("+63 917 157 7370 | +63 908 889 0664", 52, 7, false, blue);
  text("support@kargodoorph.com | www.kargodoorph.com | facebook.com/KargoDoorPH", 52, 7, false, blue);
  text("Instagram: @kargodoorph | SOURCE · SHIP · RECEIVE", 52, 7, false, blue);
  const stream = lines.join("\n"), logoHex = base64ToHex(quotationLogoJpegBase64), objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> /XObject << /Im1 7 0 R >> >> /Contents 6 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>", `<< /Length ${new TextEncoder().encode(stream).length} >>
stream
${stream}
endstream`, `<< /Type /XObject /Subtype /Image /Width ${quotationLogoWidth} /Height ${quotationLogoHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /ASCIIHexDecode /Length ${logoHex.length + 1} >>
stream
${logoHex}> 
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
