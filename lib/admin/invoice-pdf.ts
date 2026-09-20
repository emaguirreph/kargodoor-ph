const esc = (value: unknown) => String(value ?? "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
export function customerInvoicePdf(invoice: Record<string, unknown>) {
  const money = (n: unknown) => `PHP ${(Number(n ?? 0) / 100).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
  const lines = [
    "KARGODOOR PH - INVOICE",
    `Invoice No.: ${invoice.invoice_number ?? ""}`,
    `Issued: ${invoice.issued_at ?? invoice.created_at ?? ""}`,
    "",
    "BILLED TO",
    String(invoice.full_name ?? "Customer"),
    `Customer reference: ${invoice.customer_code ?? ""}`,
    "",
    "SHIPMENT DETAILS",
    `Tracking: ${invoice.tracking_number ?? ""}`,
    `Freight: ${invoice.service_type ?? ""}`,
    `Origin warehouse: ${invoice.china_warehouse ?? ""}`,
    "",
    "CHARGES",
    `Shipping charge: ${money(invoice.subtotal)}`,
    `Delivery charge: ${money(invoice.delivery_charge)}`,
    `Other charges: ${money(invoice.other_charge)}`,
    `TOTAL DUE: ${money(Number(invoice.total ?? 0) + Number(invoice.other_charge ?? 0))}`,
    `Payment status: ${invoice.status ?? "UNPAID"}`,
    "",
    "PAYMENT AND CARGO RELEASE",
    "Please settle the total amount due before KargoDoor can release the package or cargo.",
    "Cargo release proceeds after payment is verified by KargoDoor.",
    "",
    "Thank you for doing business with KargoDoor PH.",
    "Contact: +63 917 157 7370 / +63 908 889 0664",
    "support@kargodoorph.com | www.kargodoorph.com",
  ];
  let stream = "BT\n/F1 11 Tf\n50 790 Td\n";
  for (const line of lines) stream += `(${esc(line)}) Tj\n0 -18 Td\n`;
  stream += "ET";
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let pdf = "%PDF-1.4\n"; const offsets = [0];
  objects.forEach((obj, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`; });
  const xref = pdf.length; pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`; for (let i = 1; i < offsets.length; i++) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`; pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}
