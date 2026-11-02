/**
 * Copy-ready customer messages for Messenger, Viber and SMS. Plain text only:
 * Messenger shows **markdown** as literal asterisks, so section titles use an
 * emoji instead of bold.
 */

/** Sign-off at the end of every customer message (Em, 2026-11-02). */
export const messageFooter = "Thank you for trusting KargoDoorPH.com! 💚 💙";

/** Older per-message sign-offs, replaced by messageFooter. */
const legacySignOff = /^Thank you for (trusting|choosing|supporting) KargoDoor ?PH(\.com)?! 💚$/;


/** Joins lines, drops empty optional lines and repeated blank lines, and adds the footer. */
export function finishMessage(lines: Array<string | false | null | undefined>): string {
  const kept = lines.filter((line): line is string => typeof line === "string" && !legacySignOff.test(line));
  const body = kept.filter((line, index) => line !== "" || (index > 0 && kept[index - 1] !== ""));
  while (body.length && body[body.length - 1] === "") body.pop();
  return `${body.join("\n")}\n\n${messageFooter}`;
}

export type ShipmentMessageInput = {
  customerName?: unknown;
  tracking?: unknown;
  cargoCode?: unknown;
  /** Cargo item or description, for the rider message. */
  item?: unknown;
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

/** The notification tab for a shipment status; air shipments in transit open Air Transit. */
export function notificationKeyFor(status: unknown, service: unknown): string | undefined {
  const key = notificationKeyForStatus[String(status ?? "")];
  return key === "sea-transit" && /air/i.test(String(service ?? "")) ? "air-transit" : key;
}

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

/** [key, title, message] for every shipment status update, in status order. */
export function shipmentStatusMessages(input: ShipmentMessageInput): Array<[string, string, string]> {
  const name = text(input.customerName) || "there";
  const tracking = text(input.tracking);
  const cargoCode = text(input.cargoCode);
  const service = text(input.service);
  const warehouse = text(input.warehouse);
  const received = text(input.received);
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
    "💰 Shipping Cost",
    `Shipping Fee: ${shippingCharge === null ? "To be confirmed" : peso(shippingCharge)}`,
    deliveryCharge > 0 && `Delivery Fee: ${peso(deliveryCharge)}`,
    shippingCharge !== null && `Total Amount Due: ${peso(shippingCharge + deliveryCharge)}`,
  ];
  const isAir = /air/i.test(service);
  const trackLink = `https://www.kargodoorph.com/track${tracking ? `?tracking=${encodeURIComponent(tracking)}` : ""}`;

  const hi = `Hi ${name}! 😊`;
  const details = (...extra: Array<string | false>) => [
    "📦 Shipment Details",
    tracking && `Tracking Number: ${tracking}`,
    cargoCode && `Account/Cargo Code: ${cargoCode}`,
    ...extra,
  ];
  const track = `📍 Track your shipment anytime: ${trackLink}`;

  const messages: Array<[string, string, Array<string | false>]> = [
    ["awaiting-supplier-dispatch", "Awaiting Supplier Package", [
      hi,
      "",
      `Your KargoDoor shipment is all set! We're now waiting for your supplier to send your package to our ${warehouse ? `${warehouse} warehouse` : "warehouse"} in China.`,
      "",
      ...details(warehouse && `China Warehouse: ${warehouse}`),
      "",
      "Next Steps:",
      `Please remind your supplier to put ${cargoCode ? `your Account/Cargo Code ${cargoCode}` : "your Account/Cargo Code"} on every package. Once it ships, send us the courier name and tracking number so we can watch for it.`,
      "",
      "As soon as your package arrives, we'll check it and send you the next update.",
      "",
    ]],

    ["china-warehouse", "China Warehouse", [
      hi,
      "",
      `Good news! Your items have safely arrived at our ${warehouse ? `${warehouse} warehouse` : "warehouse"} in China.`,
      "",
      ...details(received && `Received: ${received}`),
      "",
      "📝 Declared Measurements",
      declaredCbm && `• CBM: ${declaredCbm}`,
      declaredWeight && `• Weight: ${declaredWeight} kg`,
      "",
      "✅ Warehouse-Verified Measurements",
      `• CBM: ${hasVerified ? verifiedCbm : "Pending warehouse verification"}`,
      `• Weight: ${hasVerified ? `${verifiedWeight} kg` : "Pending warehouse verification"}`,
      "",
      "💰 How Your Final Shipping Cost Is Computed",
      "Your final shipping charge is based on the warehouse-verified measurements, not the declared figures.",
      "For sea freight, we compute both the volume charge (CBM × rate) and the weight charge (kg × rate). Whichever is higher becomes your final shipping cost, subject to the minimum charge and any additional charges in your quotation.",
      hasVerified
        ? `For your shipment, we'll use the verified ${verifiedCbm} CBM and ${verifiedWeight} kg.`
        : "We'll use the verified CBM and weight once the warehouse has measured your cargo.",
      "",
      "Next Steps:",
      "No action needed from you. We'll send you your updated shipping quotation and keep you posted on the next steps.",
      "",
    ]],

    ["china-port", "China Port", [
      hi,
      "",
      isAir
        ? "Good news! Your shipment has cleared customs in China and is now waiting to board its flight to the Philippines. ✈️"
        : "Good news! Your shipment has cleared customs in China and is now at the port, waiting to board the vessel to the Philippines. 🚢",
      "",
      ...details(service && `Service: ${service}`, warehouse && `Origin Warehouse: ${warehouse}`),
      "",
      "Next Steps:",
      `No action needed from you. We'll update you once your shipment ${isAir ? "takes off" : "departs China"}.`,
      "",
      track,
      "",
    ]],

    ["sea-transit", "Sea Transit", [
      hi,
      "",
      "Your shipment is now on the vessel, sailing to the Philippines. 🚢🌊",
      "",
      ...details(service && `Service: ${service}`, eta && `Estimated Arrival: ${eta}`),
      "",
      "Next Steps:",
      "No action needed from you. We'll send another update once the ship docks in Manila.",
      "",
      track,
      "",
    ]],

    ["air-transit", "Air Transit", [
      hi,
      "",
      "Your shipment is now on its flight to the Philippines. ✈️",
      "",
      ...details(service && `Service: ${service}`, eta && `Estimated Arrival: ${eta}`),
      "",
      "Next Steps:",
      "No action needed from you. We'll send another update once your shipment lands in Manila.",
      "",
      track,
      "",
    ]],

    ["manila-port", "Manila Port", [
      hi,
      "",
      "Your shipment has arrived in Manila! 🇵🇭 It's now going through customs clearance.",
      "",
      ...details(),
      "",
      "Next Steps:",
      "No action needed from you. We'll let you know once customs clearance is complete and your cargo is released from the port.",
      "",
      track,
      "",
    ]],

    ["gatepass", "Gatepass", [
      hi,
      "",
      "Good news! Your shipment has cleared customs and has been released from the port. 🎉",
      "",
      ...details(),
      "",
      "Next Steps:",
      "Your cargo is now on its way to our Malabon warehouse. We'll message you once it arrives so we can arrange your pickup or delivery.",
      "",
    ]],

    ["malabon-warehouse", "Malabon Warehouse", [
      hi,
      "",
      "Good news! Your shipment has safely arrived at our Malabon warehouse and is now ready for pickup or delivery arrangements.",
      "",
      ...details(),
      "",
      "Next Steps:",
      "Please coordinate with our team to arrange your preferred pickup or delivery schedule.",
      "",
      "Kindly note that all outstanding shipping charges must be settled before your cargo can be released for pickup or delivery.",
      "",
      ...shippingCost,
      "",
      ...paymentInstructions,
      "",
    ]],

    ["payment-request", "Payment Instructions Reminder", [
      hi,
      "",
      "Your shipment is almost ready for release! Just one more step before we can arrange your pickup or delivery.",
      "",
      ...details(paymentStatus && `Payment Status: ${paymentStatus}`),
      "",
      ...shippingCost,
      "",
      ...paymentInstructions,
      "",
      "Next Steps:",
      "Please settle your shipping charges. You can also view your invoice in your KargoDoor customer portal: https://kargodoorph.com/customer/login",
      "",
      "Once your payment is confirmed, we'll schedule your pickup or delivery right away.",
      "",
    ]],

    ["out-for-delivery", "Out for Delivery", [
      hi,
      "",
      "Your shipment is out for delivery! 🚚",
      "",
      ...details(),
      "",
      "Next Steps:",
      "Please make sure someone is available to receive your cargo, and keep your phone on in case our driver needs to reach you.",
      "",
      "We'll update you once your delivery is complete.",
      "",
    ]],

    ["delivered", "Delivered", [
      hi,
      "",
      "Your KargoDoor shipment has been delivered! 🎉",
      "",
      ...details(arrival && `Delivered: ${arrival}`),
      "",
      "We hope everything arrived in great condition. If you have any concerns about your cargo, just reply to this message and we'll help you right away.",
      "",
      "",
      "SOURCE • SHIP • RECEIVE",
    ]],

    ["feedback", "Feedback / Referral", [
      hi,
      "",
      "Thank you for choosing KargoDoor PH! We hope your shipping experience was smooth and easy.",
      "",
      "⭐ We'd love to hear your feedback. Just reply here and let us know how we did.",
      "",
      "🤝 Know a friend, business owner, online seller, or entrepreneur who imports from China? We'd really appreciate your referral.",
      "",
    ]],
  ];

  const finished: Array<[string, string, string]> = messages.map(([key, title, lines]) => [key, title, finishMessage(lines)]);
  const pickupAt = finished.findIndex(([key]) => key === "malabon-warehouse") + 1;
  finished.splice(
    pickupAt,
    0,
    ["pickup-instructions", "Pickup Instructions", pickupInstructionsMessage(text(input.customerName) || "there")],
    ["rider-pickup", "Lalamove Rider Pickup", riderPickupMessage({ cargoCode: text(input.cargoCode), item: text(input.item) })],
  );
  return finished;
}

/**
 * Short message for the Lalamove (or other) rider collecting cargo at Malabon.
 * Em's exact wording (2026-11-02), kept under 500 characters, so it has its
 * own "Salamat po!" sign-off instead of the shared footer. Plain text:
 * Messenger shows **bold** markers literally.
 */
export function riderPickupMessage(input: { cargoCode?: string; item?: string }): string {
  return [
    "Hi Rider! Pagdating po sa warehouse:",
    `Account/ Cargo Code: ${input.cargoCode || "[KDOOR code]"}`,
    `Item: ${input.item || "[Item]"}`,
    "",
    "1. Proceed sa Window 1.",
    "2. Fill out Pickup Form (Name, Plate No., Cargo Code, No. of Packages).",
    "3. Submit form with 2 valid government IDs.",
    "4. Wait for your name/queue number bago kunin ang package.",
    "",
    "⚠ Trucks over 16 ft bawal 9 AM–4 PM. Wingvan: 10 PM–2 AM only.",
    "Salamat po! 💚",
  ].join("\n");
}

/**
 * Malabon warehouse pickup steps, worded by Em (2026-11-02). Plain text:
 * Messenger shows **bold** markers literally, so they are left out.
 */
export function pickupInstructionsMessage(customerName: string): string {
  return [
    "📦 KARGODOOR PH – WAREHOUSE PICKUP INSTRUCTIONS",
    "",
    `Hi ${customerName}! 😊`,
    "",
    "Your shipment is ready for pickup! Please follow the instructions below for a smooth release.",
    "",
    "📍 PICKUP LOCATION",
    "Tongda Malabon Warehouse",
    "PIN: FSW COMMERCIAL WAREHOUSE RENTAL",
    "Old 59, New 36 Rivera St Brgy Tañong Malabon City",
    "(Color of Gate- Gray / Nearest Landmark McDonalds Rizal Ave)",
    "",
    "🕒 Warehouse Operational Hours: 7:00AM to 7:00PM, Monday to Saturday",
    "📞 Contact person: Alma / Elyza / Tiffany / Rhea/ Maylin",
    "09175188335    09175188339",
    "",
    "━━━━━━━━━━━━━━",
    "",
    "📋 PICKUP PROCEDURE",
    "",
    "1️⃣ Proceed to Window 1",
    "Upon arrival, fill out the Pickup Form with:",
    "",
    "• Date",
    "• Representative's Full Name",
    "• Vehicle Plate Number",
    "• Customer/Cargo Code",
    "• Number of Packages",
    "",
    "2️⃣ Submit Your Documents",
    "Submit the completed form to the Front Desk together with two (2) valid government-issued IDs of the pickup representative.",
    "",
    "3️⃣ Wait for Verification",
    "After verification, proceed to the designated waiting area and wait for your name or queue number to be called.",
    "",
    "4️⃣ Cargo Release",
    "When called, proceed to the releasing area to collect your packages.",
    "",
    "━━━━━━━━━━━━━━",
    "",
    "🕒 PICKUP SCHEDULE & VEHICLE RESTRICTIONS",
    "",
    "✅ Recommended Off-Peak Hours",
    "• 7:00 AM – 8:00 AM",
    "• 4:00 PM – 7:00 PM",
    "",
    "🚚 Vehicles Over 16 Feet",
    "Not allowed during peak hours: 9:00 AM – 4:00 PM.",
    "",
    "🚛 Wingvan Trucks",
    "Allowed only from 10:00 PM – 2:00 AM.",
    "",
    "━━━━━━━━━━━━━━",
    "",
    "⚠️ IMPORTANT REMINDERS",
    "",
    "• Shipping charges must be fully settled before cargo release.",
    "• Pickup representatives must bring two valid government-issued IDs.",
    "• Please coordinate your pickup schedule with our team in advance.",
    "",
    messageFooter,
  ].join("\n");
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
    ]],
  ];

  return messages.map(([key, title, lines]) => [key, title, finishMessage(lines)]);
}
