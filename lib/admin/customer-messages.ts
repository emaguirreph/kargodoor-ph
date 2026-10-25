/**
 * Copy-ready customer messages for Messenger, Viber and SMS. Plain text only:
 * Messenger shows **markdown** as literal asterisks, so section titles use an
 * emoji instead of bold.
 */

export const messageFooter = [
  "—",
  "KargoDoor PH",
  "China to PH, Made SIMPLE.",
  "",
  "📞 +63 917 157 7370 | +63 908 889 0664",
  "✉️ support@kargodoorph.com",
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
  arrival?: unknown;
  paymentStatus?: unknown;
  declaredCbm?: unknown;
  declaredWeight?: unknown;
  verifiedCbm?: unknown;
  verifiedWeight?: unknown;
};

const text = (value: unknown) => (value === null || value === undefined ? "" : String(value).trim());

/** [key, title, message] for every shipment status update, in status order. */
export function shipmentStatusMessages(input: ShipmentMessageInput): Array<[string, string, string]> {
  const name = text(input.customerName) || "there";
  const tracking = text(input.tracking);
  const cargoCode = text(input.cargoCode);
  const service = text(input.service);
  const warehouse = text(input.warehouse);
  const received = text(input.received);
  const arrival = text(input.arrival);
  const paymentStatus = text(input.paymentStatus);
  const declaredCbm = text(input.declaredCbm);
  const declaredWeight = text(input.declaredWeight);
  const verifiedCbm = text(input.verifiedCbm);
  const verifiedWeight = text(input.verifiedWeight);
  const hasVerified = Boolean(verifiedCbm && verifiedWeight);
  const isAir = /air/i.test(service);
  const trackLink = `https://www.kargodoorph.com/track${tracking ? `?tracking=${encodeURIComponent(tracking)}` : ""}`;

  const hi = `Hi ${name}! 😊`;
  const details = (...extra: Array<string | false>) => [
    "📦 Shipment Details",
    tracking && `Tracking Number: ${tracking}`,
    cargoCode && `Cargo Code: ${cargoCode}`,
    ...extra,
  ];
  const track = `📍 Track your shipment anytime: ${trackLink}`;

  const messages: Array<[string, string, Array<string | false>]> = [
    ["awaiting-supplier-dispatch", "Awaiting Supplier Dispatch", [
      hi,
      "",
      `Your KargoDoor shipment is all set! We're now waiting for your supplier to send your package to our ${warehouse ? `${warehouse} warehouse` : "warehouse"} in China.`,
      "",
      ...details(warehouse && `China Warehouse: ${warehouse}`),
      "",
      "Next Steps:",
      `Please remind your supplier to put ${cargoCode ? `your cargo code ${cargoCode}` : "your cargo code"} on every package. Once it ships, send us the courier name and tracking number so we can watch for it.`,
      "",
      "As soon as your package arrives, we'll check it and send you the next update.",
      "",
      thanks,
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
      thanks,
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
      thanks,
    ]],

    ["sea-transit", "Sea Transit", [
      hi,
      "",
      "Your shipment is now on the vessel, sailing to the Philippines. 🚢🌊",
      "",
      ...details(service && `Service: ${service}`),
      "",
      "Next Steps:",
      "No action needed from you. We'll send another update once the ship docks in Manila.",
      "",
      track,
      "",
      thanks,
    ]],

    ["shipment-in-transit", "Shipment In Transit", [
      hi,
      "",
      `Your shipment is now on its way to the Philippines! ${isAir ? "✈️" : "🚢"}`,
      "",
      ...details(service && `Service: ${service}`),
      "",
      "Next Steps:",
      "No action needed from you. We'll send another update once your cargo arrives in the Philippines.",
      "",
      track,
      "",
      thanks,
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
      thanks,
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
      thanks,
    ]],

    ["payment-request", "Payment Request", [
      hi,
      "",
      "Your shipment is almost ready for release! Just one more step before we can arrange your pickup or delivery.",
      "",
      ...details(paymentStatus && `Payment Status: ${paymentStatus}`),
      "",
      "Next Steps:",
      "Please settle your shipping charges. You can view your invoice in your KargoDoor customer portal: https://kargodoorph.com/customer/login",
      "",
      "You can also reply to this message and we'll send your invoice and payment details. Once your payment is confirmed, we'll schedule your pickup or delivery right away.",
      "",
      thanks,
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
      thanks,
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
      thanks,
    ]],

    ["delivered", "Shipment Delivered", [
      hi,
      "",
      "Your KargoDoor shipment has been delivered! 🎉",
      "",
      ...details(arrival && `Delivered: ${arrival}`),
      "",
      "We hope everything arrived in great condition. If you have any concerns about your cargo, just reply to this message and we'll help you right away.",
      "",
      thanks,
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
      "Thank you for supporting KargoDoor PH! 💚",
    ]],
  ];

  return messages.map(([key, title, lines]) => [key, title, finishMessage(lines)]);
}
