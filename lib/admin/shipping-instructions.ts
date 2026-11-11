import { finishMessage, messageFooter } from "./customer-messages";
import { warehouseNames, type WarehouseName, warehouseAddresses, malabonWarehouseAddress, isHongKongWarehouse, hongKongMark } from "../warehouse-addresses";
export { warehouseNames, type WarehouseName, malabonWarehouseAddress } from "../warehouse-addresses";

export type ShippingInstructionCustomer = {
  name?: unknown;
  customerCode?: unknown;
  /** Sea Freight, Air Freight or Full Container. */
  service?: unknown;
  warehouse?: unknown;
  warehouseAddress?: unknown;
};

export type ShippingInstructionShipment = ShippingInstructionCustomer & {
  warehouse?: unknown;
  warehouseAddress?: unknown;
  supplierCourier?: unknown;
  supplierWaybill?: unknown;
};

export type PortalAccessMessage = ShippingInstructionCustomer & {
  login?: unknown;
  loginLabel?: unknown;
  temporaryPassword?: unknown;
};

const text = (value: unknown, fallback = "") => String(value ?? "").trim() || fallback;

export function warehouseAddress(warehouse: unknown): string {
  const name = text(warehouse);
  return Object.prototype.hasOwnProperty.call(warehouseAddresses, name)
    ? warehouseAddresses[name as WarehouseName]
    : "";
}

const divider = "━━━━━━━━━━━━━━";

/**
 * Supplier rules in Chinese and English, with label examples for the customer's cargo code.
 * For the Hong Kong warehouse only the TD label is shown; with no warehouse, the TD label is noted under sea.
 */
export function supplierRequirementsText(code = "KDOOR-XXXX", warehouse?: unknown): string {
  const hongKong = isHongKongWarehouse(warehouse);
  const labelExamples = hongKong
    ? [
        "🚢 SEA FREIGHT (HONG KONG) – Label Example",
        "",
        hongKongMark(code),
        "Item: [Product Name]",
        "Supplier: [Supplier Phone Number]",
        "Recipient: [PH Phone Number]",
      ]
    : [
        "🚢 SEA FREIGHT – Label Example",
        "",
        code,
        "Item: [Product Name]",
        "Supplier: [Chinese Phone Number]",
        "Recipient: [PH Phone Number]",
        `(Hong Kong warehouse: ${hongKongMark(code)})`,
        "",
        "✈️ AIR FREIGHT – Label Example",
        "",
        `AIR ${code}`,
        "Item: [Product Name]",
        "Supplier: [Chinese Phone Number]",
        "Recipient: [PH Phone Number]",
      ];
  return [
    "📌 IMPORTANT SUPPLIER INSTRUCTIONS",
    "",
    "🇨🇳 中文说明（请转发供应商）",
    "",
    "1️⃣ 每件货物必须贴好唛头标签，注明客户代号、菲律宾收货人电话及中国寄件人电话，否则仓库不予收货。",
    "",
    "2️⃣ 每票货须附装箱单，注明中文品名、材质、数量、重量及寄件人电话。",
    "",
    "3️⃣ 包装必须完整无损，易碎品需加固，否则仓库不予接收。",
    "",
    divider,
    "",
    "🇬🇧 ENGLISH – SHIPPING REMINDERS",
    "",
    "1️⃣ Cargo Label – Required on EVERY package",
    "",
    "Each package must display the cargo code, item name, supplier's contact number, and Philippine recipient's phone number.",
    "",
    ...labelExamples,
    "",
    "2️⃣ Packing List",
    "",
    "Every shipment must include:",
    "• Product description in Chinese",
    "• Material/composition",
    "• Quantity and weight",
    "• Supplier's phone number",
    "",
    "3️⃣ Proper Packaging",
    "",
    "All packages must be securely packed and undamaged. Fragile items require additional protection.",
    "",
    "⚠️ IMPORTANT: Packages with incomplete labels or damaged packaging will NOT be accepted by the warehouse.",
  ].join("\n");
}

export const supplierRequirements = supplierRequirementsText();

const shippingMethod = (service: unknown) => {
  const value = text(service);
  if (!value) return "[Confirm shipping method]";
  return /air/i.test(value) ? `${value} ✈️` : `${value} 🚢`;
};

/** Full shipping instructions the customer forwards to their supplier. */
function shippingInstructionsMessage(details: ShippingInstructionCustomer): string {
  const name = text(details.name, "there");
  const code = text(details.customerCode, "[account/cargo code]");
  const warehouse = text(details.warehouse, "[Confirm the assigned warehouse]");
  const address = text(details.warehouseAddress || warehouseAddress(warehouse), "[Add warehouse address]");
  return [
    `Hi ${name}! 😊`,
    "",
    "Here are the shipping instructions for your KargoDoor PH shipment. Please forward these details to your supplier before shipping.",
    "",
    "📦 YOUR SHIPPING DETAILS",
    "",
    `Cargo Code: ${code}`,
    ...(isHongKongWarehouse(warehouse) ? [`Shipping Mark: ${hongKongMark(code)}`] : []),
    `Shipping Method: ${shippingMethod(details.service)}`,
    `Assigned Warehouse: ${warehouse}`,
    "",
    "📍 CHINA WAREHOUSE ADDRESS",
    "",
    address,
    "",
    divider,
    "",
    supplierRequirementsText(code, warehouse),
    "",
    divider,
    "",
    "📲 ONCE SHIPPED, PLEASE SEND US:",
    "",
    "Example:",
    "",
    "• Courier: SF Express",
    "• Tracking/Waybill No.: SF123456789",
    "• Total Packages: 2",
    "• Receipt or Package Photo: 📸",
    "",
    "This allows us to monitor your shipment before it reaches our China warehouse.",
    "",
    "📦 Shipping Reminder: Final shipping charges will be based on the actual CBM and weight verified by our China warehouse, using the applicable freight rates.",
    "",
    messageFooter,
  ].join("\n");
}

/** Welcome message: Account/Cargo Code and customer portal login in one message. */
export function customerWelcomeMessage(customer: PortalAccessMessage): string {
  const name = text(customer.name, "there");
  const code = text(customer.customerCode, "[account/cargo code]");
  const login = text(customer.login, "[email or mobile number]");
  const loginLabel = text(customer.loginLabel, "email or mobile number");
  const password = text(customer.temporaryPassword, "[temporary password]");
  return finishMessage([
    `Hi ${name}! 😊`,
    "",
    "Welcome to KargoDoor PH! Your account is all set.",
    "",
    "🔑 Your Account Details",
    `Account/Cargo Code: ${code}`,
    "",
    "💻 Your Customer Portal",
    "Login page: https://kargodoorph.com/customer/login",
    `Login ${loginLabel}: ${login}`,
    `Temporary password: ${password}`,
    "",
    "Next Steps:",
    "1. Please use your Account/Cargo Code on your supplier’s shipping label so we can identify your packages when they arrive at our China warehouse.",
    "2. Sign in to the portal and change your password right away. Never share your temporary password with anyone.",
    "3. We’ll send your warehouse address and shipping instructions next.",
    "",
    "You can use the portal to view your shipment and payment updates anytime.",
    "",
  ]);
}

export function customerShippingInstructions(customer: ShippingInstructionCustomer): string {
  return shippingInstructionsMessage(customer);
}

/** Short message with only the assigned China warehouse address and the cargo code. */
export function customerWarehouseAddressMessage(customer: ShippingInstructionCustomer): string {
  const name = text(customer.name, "there");
  const code = text(customer.customerCode, "[account/cargo code]");
  const warehouse = text(customer.warehouse, "[Confirm the assigned warehouse]");
  const address = text(customer.warehouseAddress || warehouseAddress(warehouse), "[Add warehouse address]");
  return finishMessage([
    `Hi ${name}! 😊`,
    "",
    "Here’s the KargoDoor China warehouse address for your cargo.",
    "",
    "📦 Your Details",
    `Account/Cargo Code: ${code}`,
    `Assigned Warehouse: ${warehouse}`,
    "",
    "📍 Warehouse Address",
    address,
    "",
    "Next Steps:",
    `Please share this address with your supplier and ask them to place ${isHongKongWarehouse(warehouse) ? hongKongMark(code) : code} clearly on every package so we can receive and identify your cargo.`,
    "",
  ]);
}

export function customerPortalAccessMessage(portal: PortalAccessMessage): string {
  return customerWelcomeMessage(portal);
}

/** Every China warehouse with its full address, for the bottom of the shipment page. */
/** Addresses for Nihao: every China warehouse, Hong Kong, then our Malabon warehouse. */
export function nihaoAddressBook(): Array<[string, string]> {
  return [...warehouseAddressBook(), ["Malabon Warehouse", malabonWarehouseAddress]];
}

export function warehouseAddressBook(): Array<[WarehouseName, string]> {
  return warehouseNames.map((warehouse) => [warehouse, warehouseAddress(warehouse)]);
}

export function shipmentShippingInstructions(shipment: ShippingInstructionShipment): string {
  return shippingInstructionsMessage(shipment);
}

export function copyButton(id: string, label = "Copy shipping instructions"): string {
  return `<button type="button" class="copy-shipping-instructions" data-copy-source="${id}">${label}</button>`;
}

export function copyScript(): string {
  return `<script src="/admin-copy.js" defer></script>`;
}

export type SupplierMessageShipment = {
  customerName?: unknown;
  customerCode?: unknown;
  /** Sea Freight, Air Freight or Full Container. */
  service?: unknown;
  warehouse?: unknown;
  item?: unknown;
  clientPhone?: unknown;
};

/** Shipping mark on the boxes: AIR KDOOR-XXXX for air, TD KDOOR-XXXX for Hong Kong, otherwise KDOOR-XXXX. */
export function supplierShippingMark(code: string, service: unknown, warehouse: unknown): string {
  if (/air/i.test(text(service))) return `AIR ${code}`;
  if (isHongKongWarehouse(warehouse)) return hongKongMark(code);
  return code;
}

/**
 * Short message the client forwards to their supplier, filled in from the
 * shipment (Em, 2026-11-11). Missing details show a [bracketed] placeholder.
 */
export function supplierShipmentMessage(shipment: SupplierMessageShipment): string {
  const name = text(shipment.customerName, "there");
  const service = text(shipment.service);
  const type = !service ? "[Choose Sea or Air on Edit shipment]" : /air/i.test(service) ? "AIR ✈️" : "SEA 🚢";
  const customerCode = text(shipment.customerCode);
  const mark = customerCode ? supplierShippingMark(customerCode, service, shipment.warehouse) : "[Add the customer's KDOOR code]";
  const warehouse = text(shipment.warehouse);
  const address = warehouseAddress(warehouse) || "[Choose the China warehouse on Edit shipment]";
  return [
    `Hi ${name}! 😊`,
    "Please send this to your supplier.",
    "",
    `🚚 SHIPMENT: ${type}`,
    `🏷️ SHIPPING MARK / CARGO CODE: ${mark}`,
    `📦 ITEM: ${text(shipment.item, "[Add the item / product name]")}`,
    `📱 CLIENT PHONE NUMBER: ${text(shipment.clientPhone, "[Add the client's phone number]")}`,
    "",
    "📍 CHINA WAREHOUSE ADDRESS",
    address,
    "",
    "1. Packing List",
    "",
    "Every shipment must include:",
    "• Product description in Chinese",
    "• Material/composition",
    "• Quantity and weight",
    "• Supplier's phone number",
    "",
    "2. Proper Packaging",
    "",
    "All packages must be securely packed and undamaged. Fragile items require additional protection.",
    "⚠️ IMPORTANT: Packages with incomplete labels or damaged packaging will NOT be accepted by the warehouse.",
    "",
    "Thank you for trusting KargoDoorph.com",
  ].join("\n");
}

/** Asks the client for the supplier's courier details once shipped. Em's wording, 2026-11-11. */
export function onceShippedMessage(): string {
  return finishMessage([
    "📲 ONCE SHIPPED, PLEASE SEND US:",
    "",
    "Example:",
    "",
    "• Courier: SF Express",
    "• Tracking/Waybill No.: SF123456789",
    "• Total Packages: 1",
    "• Receipt or Package Photo: 📸",
    "",
    "This allows us to monitor your shipment before it reaches our China warehouse.",
    "",
    "📦 Shipping Reminder: Final shipping charges will be based on the actual CBM and weight verified by our China warehouse, using the applicable freight rates.",
  ]);
}
