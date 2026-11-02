/**
 * Copy-ready customer messages for Messenger, Viber and SMS. Plain text only:
 * Messenger shows **markdown** as literal asterisks, so section titles use an
 * emoji instead of bold.
 */

export const messageFooter = [
  "—",
  "KargoDoor PH",
  "China to PH, Made SIMPLE.",
  "🌐 www.kargodoorph.com",
].join("\n");

const thanks = "Thank you for trusting KargoDoor PH! 💚";

/** Joins lines, drops empty optional lines and repeated blank lines, and adds the footer. */
export function finishMessage(lines: Array<string | false | null | undefined>): string {
  const kept = lines.filter((line): line is string => typeof line === "string");
  const body = kept.filter((line, index) => line !== "" || (index > 0 && kept[index - 1] !== ""));
  while (body.length && body[body.length - 1] === "") body.pop();
  return `${body.join("\n")}\n\n${messageFooter}`;
}

export type ShipmentMessageInput = {
  customerName?: unknown;
  tracking?: unknown;
  cargoCode?: unknown;
  service?: unknown;
  warehouse?: unknown;
  received?: unknown;
  departure?: unknown;
  eta?: unknown;
  arrival?: unknown;
  paymentStatus?: unknown;
  declaredCbm?: unknown;
  declaredWeight?: unknown;
  verifiedCbm?: unknown;
  verifiedWeight?: unknown;
  /** Centavos, as stored on the shipment. */
  shippingCharge?: unknown;
  deliveryCharge?: unknown;
};

const peso = (centavos: number) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(centavos / 100);

/** Bank and GCash details, same as the customer portal. */
export const paymentInstructions = [
  "💳 Payment Instructions",
  "Bank Transfer",
  "Bank: UnionBank of the Philippines",
  "Account Name: KargoDoor Cargo Forwarding",
  "Account Number: 002170017106",
  "",
  "GCash",
  "GCash Number: 0919 932 3077",
  "Account Name: EMMARUTH GALLARDO",
  "",
  "Once paid, please send us a screenshot of your payment receipt so we can confirm it right away.",
];

const text = (value: unknown) => (value === null || value === undefined ? "" : String(value).trim());

/** Which notification tab matches each shipment status, so the page opens on the right one. */
export const notificationKeyForStatus: Record<string, string> = {
  "Awaiting Supplier Dispatch": "awaiting-supplier-dispatch",
  "Pending Warehouse Receipt": "awaiting-supplier-dispatch",
  "China Warehouse": "china-warehouse",
  "Received at Warehouse": "china-warehouse",
  "China Port": "china-port",
  "Sea Transit": "sea-transit",
  "In Transit": "sea-transit",
  "Manila Port": "manila-port",
  "Arrived in Philippines": "manila-port",
  Gatepass: "gatepass",
  "Malabon Warehouse": "malabon-warehouse",
  Delivered: "delivered",
};

/** [key, title, message] for every shipment status update, in status order. Taglish, friendly. */
export function shipmentStatusMessages(input: ShipmentMessageInput): Array<[string, string, string]> {
  const name = text(input.customerName);
  const tracking = text(input.tracking);
  const cargoCode = text(input.cargoCode);
  const service = text(input.service);
  const warehouse = text(input.warehouse);
  const received = text(input.received);
  const departure = text(input.departure);
  const eta = text(input.eta);
  const arrival = text(input.arrival);
  const paymentStatus = text(input.paymentStatus);
  const declaredCbm = text(input.declaredCbm);
  const declaredWeight = text(input.declaredWeight);
  const verifiedCbm = text(input.verifiedCbm);
  const verifiedWeight = text(input.verifiedWeight);
  const hasVerified = Boolean(verifiedCbm && verifiedWeight);
  const amount = (value: unknown) => (value === null || value === undefined || value === "" ? null : Number(value));
  const shippingCharge = amount(input.shippingCharge);
  const deliveryCharge = amount(input.deliveryCharge) ?? 0;
  const shippingCost = [
    "💰 Shipping Charges",
    `Shipping Fee: ${shippingCharge === null ? "To be confirmed" : peso(shippingCharge)}`,
    deliveryCharge > 0 && `Delivery Fee: ${peso(deliveryCharge)}`,
    shippingCharge !== null && `Total Amount Due: ${peso(shippingCharge + deliveryCharge)}`,
  ];
  const isAir = /air/i.test(service);
  const trackLink = `https://www.kargodoorph.com/track${tracking ? `?tracking=${encodeURIComponent(tracking)}` : ""}`;
  const chinaWarehouse = warehouse ? `${warehouse} warehouse` : "warehouse";
  const codeText = cargoCode ? `Account/Cargo Code mo (${cargoCode})` : "Account/Cargo Code mo";

  const hi = name ? `Hi ${name}! 😊` : "Hi po! 😊";
  const details = (...extra: Array<string | false>) => [
    "📦 Shipment Details",
    tracking && `Tracking No.: ${tracking}`,
    cargoCode && `Account/Cargo Code: ${cargoCode}`,
    ...extra,
  ];
  const track = `📍 I-track ang shipment mo anytime: ${trackLink}`;
  const salamat = "Salamat sa tiwala mo sa KargoDoor PH! 💚";
  const noAction = "Wala kang kailangang gawin for now. 👍";

  const messages: Array<[string, string, Array<string | false>]> = [
    ["awaiting-supplier-dispatch", "Awaiting Supplier Dispatch", [
      hi,
      "",
      `Ready na ang KargoDoor shipment mo! 🙌 Hinihintay na lang namin na ipadala ng supplier mo ang package sa ${chinaWarehouse} namin sa China.`,
      "",
      ...details(service && `Service: ${service}`, warehouse && `China Warehouse: ${warehouse}`),
      "",
      "✅ Next Steps",
      `1. Paalalahanan lang po ang supplier na ilagay ang ${codeText} sa bawat box or package.`,
      "2. Pag naipadala na ng supplier, send mo lang sa amin ang courier name at tracking number para ma-monitor namin.",
      "",
      "Pagdating ng package sa warehouse, iche-check namin agad at mag-a-update kami sa'yo.",
      "",
      salamat,
    ]],

    ["china-warehouse", "China Warehouse", [
      hi,
      "",
      `Good news! 🎉 Dumating na nang safe ang items mo sa ${chinaWarehouse} namin sa China.`,
      "",
      ...details(received && `Date Received: ${received}`),
      "",
      "📝 Declared Measurements",
      declaredCbm && `• CBM: ${declaredCbm}`,
      declaredWeight && `• Weight: ${declaredWeight} kg`,
      !declaredCbm && !declaredWeight && "• Not provided",
      "",
      "✅ Warehouse-Verified Measurements",
      `• CBM: ${hasVerified ? verifiedCbm : "Pending warehouse verification"}`,
      `• Weight: ${hasVerified ? `${verifiedWeight} kg` : "Pending warehouse verification"}`,
      "",
      "💡 Paano kino-compute ang final shipping cost mo?",
      "Ang basis ng final shipping charge ay ang warehouse-verified measurements, hindi ang declared.",
      isAir
        ? "For air freight, kino-compute namin ang volumetric weight (CBM × 167). Kung alin ang mas mataas sa actual weight at volumetric weight, 'yun ang billable weight (rounded up sa next whole kg) × rate. Ang phones, tablets at laptops ay per piece ang charge."
        : "For sea freight, kino-compute namin ang volume charge (CBM × rate) at weight charge (kg × rate). Kung alin ang mas mataas, 'yun ang final shipping cost mo, subject sa minimum charge at additional charges sa quotation mo.",
      hasVerified
        ? `Sa shipment mo, gagamitin namin ang verified ${verifiedCbm} CBM at ${verifiedWeight} kg.`
        : "Gagamitin namin ang verified CBM at weight once nasukat na ng warehouse ang cargo mo.",
      "",
      "✅ Next Steps",
      `${noAction} Ise-send namin sa'yo ang updated shipping quotation mo at ia-update ka namin sa susunod na steps.`,
      "",
      salamat,
    ]],

    ["china-port", "China Port", [
      hi,
      "",
      isAir
        ? "Good news! Cleared na sa China customs ang shipment mo at hinihintay na lang ang flight papuntang Pilipinas. ✈️"
        : "Good news! Cleared na sa China customs ang shipment mo at nasa port na, hinihintay na lang maisakay sa barko papuntang Pilipinas. 🚢",
      "",
      ...details(service && `Service: ${service}`, warehouse && `Origin Warehouse: ${warehouse}`, departure && `Departure: ${departure}`),
      "",
      "✅ Next Steps",
      `${noAction} Mag-a-update kami once ${isAir ? "naka-take off na ang flight" : "umalis na ng China ang barko"}.`,
      "",
      track,
      "",
      salamat,
    ]],

    ["sea-transit", isAir ? "Air Transit" : "Sea Transit", [
      hi,
      "",
      isAir
        ? "On the way na ang shipment mo! ✈️ Nasa flight na ito papuntang Pilipinas."
        : "On the way na ang shipment mo! 🚢🌊 Nasa barko na ito at naglalayag papuntang Pilipinas.",
      "",
      ...details(service && `Service: ${service}`, departure && `Departure: ${departure}`, eta && `Estimated Arrival: ${eta}`),
      "",
      "✅ Next Steps",
      `${noAction} Mag-a-update ulit kami once ${isAir ? "nag-land na ang shipment mo sa Manila" : "dumaong na ang barko sa Manila"}.`,
      "",
      track,
      "",
      salamat,
    ]],

    ["manila-port", isAir ? "Manila Arrival" : "Manila Port", [
      hi,
      "",
      "Nasa Pilipinas na ang shipment mo! 🇵🇭 Dumating na ito sa Manila at kasalukuyang dumadaan sa customs clearance.",
      "",
      ...details(),
      "",
      "✅ Next Steps",
      `${noAction} Sasabihan ka namin agad once tapos na ang customs clearance at na-release na ang cargo mo.`,
      "",
      track,
      "",
      salamat,
    ]],

    ["gatepass", "Gatepass", [
      hi,
      "",
      "Good news! 🎉 Cleared na sa customs ang shipment mo at na-release na ito.",
      "",
      ...details(),
      "",
      "✅ Next Steps",
      "Papunta na ang cargo mo sa Malabon warehouse namin. Message ka namin once dumating na para ma-arrange natin ang pickup or delivery mo.",
      "",
      track,
      "",
      salamat,
    ]],

    ["payment-request", "Payment Request", [
      hi,
      "",
      "Malapit nang ma-release ang shipment mo! 🙌 Isang step na lang bago namin ma-arrange ang pickup or delivery mo.",
      "",
      ...details(paymentStatus && `Payment Status: ${paymentStatus}`),
      "",
      ...shippingCost,
      "",
      ...paymentInstructions,
      "",
      "✅ Next Steps",
      "Paki-settle lang po ang shipping charges. Pwede mo ring makita ang invoice mo sa KargoDoor customer portal: https://kargodoorph.com/customer/login",
      "",
      "Once confirmed na ang payment mo, ise-schedule na namin agad ang pickup or delivery.",
      "",
      salamat,
    ]],

    ["malabon-warehouse", "Malabon Warehouse", [
      hi,
      "",
      "Good news! 🎉 Dumating na nang safe ang shipment mo sa Malabon warehouse namin at ready na for pickup or delivery.",
      "",
      ...details(),
      "",
      "✅ Next Steps",
      "Message mo lang kami kung kailan ang preferred pickup or delivery schedule mo.",
      "",
      "Paalala lang po: kailangan munang ma-settle ang lahat ng outstanding shipping charges bago ma-release ang cargo for pickup or delivery.",
      "",
      ...shippingCost,
      "",
      ...paymentInstructions,
      "",
      salamat,
    ]],

    ["out-for-delivery", "Out for Delivery", [
      hi,
      "",
      "Out for delivery na ang shipment mo! 🚚",
      "",
      ...details(),
      "",
      "✅ Next Steps",
      "Paki-siguro lang po na may tatanggap ng cargo, at naka-on ang phone mo in case tumawag ang driver namin.",
      "",
      "Mag-a-update kami once delivered na.",
      "",
      salamat,
    ]],

    ["delivered", "Delivered", [
      hi,
      "",
      "Delivered na ang KargoDoor shipment mo! 🎉📦",
      "",
      ...details(arrival && `Delivered: ${arrival}`),
      "",
      "Sana nasa maayos na kondisyon ang lahat ng items mo. Kung may concern ka sa cargo, reply ka lang dito at tutulungan ka namin agad.",
      "",
      salamat,
    ]],

    ["feedback", "Feedback / Referral", [
      hi,
      "",
      "Maraming salamat sa pag-choose sa KargoDoor PH! Sana naging smooth at hassle-free ang shipping experience mo. 🙏",
      "",
      "⭐ Gusto naming malaman ang feedback mo. Reply ka lang dito at sabihin mo kung kumusta ang serbisyo namin.",
      "",
      "🤝 May kakilala ka bang online seller, business owner, o nag-iimport from China? Malaking tulong sa amin kung ire-refer mo kami!",
      "",
      "Salamat sa pagsuporta sa KargoDoor PH! 💚",
    ]],
  ];

  return messages.map(([key, title, lines]) => [key, title, finishMessage(lines)]);
}

export type InvoiceMessageInput = {
  customerName?: unknown;
  cargoCode?: unknown;
  invoiceNumber?: unknown;
  tracking?: unknown;
  /** Centavos. */
  shippingFee?: unknown;
  deliveryFee?: unknown;
  otherCharge?: unknown;
  total?: unknown;
  paid?: unknown;
  dueDate?: unknown;
};

/** [key, title, message] for invoice and payment updates. */
export function invoiceMessages(input: InvoiceMessageInput): Array<[string, string, string]> {
  const name = text(input.customerName) || "there";
  const cargoCode = text(input.cargoCode);
  const invoiceNumber = text(input.invoiceNumber);
  const tracking = text(input.tracking);
  const num = (value: unknown) => Number(value ?? 0) || 0;
  const deliveryFee = num(input.deliveryFee);
  const otherCharge = num(input.otherCharge);
  const total = num(input.total);
  const paid = num(input.paid);
  const balance = Math.max(total - paid, 0);
  const dueDate = text(input.dueDate);
  const hi = `Hi ${name}! 😊`;
  const details = [
    "🧾 Invoice Details",
    invoiceNumber && `Invoice No.: ${invoiceNumber}`,
    tracking && `Tracking Number: ${tracking}`,
    cargoCode && `Account/Cargo Code: ${cargoCode}`,
  ];
  const charges = [
    "💰 Charges",
    `Shipping Fee: ${peso(num(input.shippingFee))}`,
    deliveryFee > 0 && `Delivery Fee: ${peso(deliveryFee)}`,
    otherCharge > 0 && `Other Charges: ${peso(otherCharge)}`,
    `Total Amount Due: ${peso(total)}`,
    dueDate && `Due Date: ${dueDate}`,
  ];
  const release = "Kindly note that all outstanding shipping charges must be settled and verified before your cargo can be released for pickup or delivery.";
  const portal = "You can also check your shipment and payment status in your KargoDoor customer portal: https://kargodoorph.com/customer/login";

  const messages: Array<[string, string, Array<string | false>]> = [
    ["invoice-issued", "Invoice Issued", [
      hi,
      "",
      `Here’s your KargoDoor invoice${tracking ? ` for shipment ${tracking}` : ""}.`,
      "",
      ...details,
      "",
      ...charges,
      "",
      ...paymentInstructions,
      "",
      "Next Steps:",
      release,
      "",
      portal,
      "",
      thanks,
    ]],
    ["payment-reminder", "Payment Reminder", [
      hi,
      "",
      `Just a friendly reminder about your KargoDoor invoice${invoiceNumber ? ` ${invoiceNumber}` : ""}.`,
      "",
      ...details,
      "",
      "💰 Balance",
      `Total Amount Due: ${peso(total)}`,
      paid > 0 && `Amount Paid: ${peso(paid)}`,
      `Remaining Balance: ${peso(balance)}`,
      dueDate && `Due Date: ${dueDate}`,
      "",
      ...paymentInstructions,
      "",
      "Next Steps:",
      release,
      "",
      "If you’ve already paid, please send us your payment receipt and we’ll update your account right away.",
      "",
      thanks,
    ]],
    ["partial-payment", "Partial Payment Received", [
      hi,
      "",
      `Thank you! We’ve received your payment of ${peso(paid)}.`,
      "",
      ...details,
      "",
      "💰 Balance",
      `Total Amount Due: ${peso(total)}`,
      `Amount Paid: ${peso(paid)}`,
      `Remaining Balance: ${peso(balance)}`,
      "",
      ...paymentInstructions,
      "",
      "Next Steps:",
      "Please settle the remaining balance so we can arrange the release of your cargo for pickup or delivery.",
      "",
      thanks,
    ]],
    ["payment-received", "Payment Received (Fully Paid)", [
      hi,
      "",
      "Good news! We’ve received your full payment. Your invoice is now fully paid. ✅",
      "",
      ...details,
      `Amount Paid: ${peso(paid)}`,
      "",
      "Next Steps:",
      "We’ll now arrange your pickup or delivery schedule and keep you updated.",
      "",
      thanks,
    ]],
  ];

  return messages.map(([key, title, lines]) => [key, title, finishMessage(lines)]);
}
