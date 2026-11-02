import { finishMessage, messageFooter } from "./customer-messages";

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

export const warehouseNames = ["Guangzhou", "Yiwu", "Shishi", "Tongda Air Cargo", "Hong Kong"] as const;
export type WarehouseName = typeof warehouseNames[number];

/** Addresses exactly as supplied by Em (2026-11-02). Do not retype or "fix" the characters. */
const warehouseAddresses: Record<WarehouseName, string> = {
  Shishi: `Shishi Branch Address 通达国际物流（石狮）
地址：福建省晋江市龙湖镇梧坑村逸海产业园4栋A1通达仓库（+客户唛头）
邮编：362200
联系人:张先生  13600719368; 0595-85293217
高德导航搜索“泉海通达物流”
Receiving Time: Monday to Sunday 8am to 6pm (except for holidays)`,
  Guangzhou: `Guangzhou Branch通达国际物流（广州）
地址：广州市白云区江高镇沙溪东路18号166通达仓库 （+客户唛头）
联系人：伍先生
联系电话：13924091288 / 13560372000
固定电话：020-81997500
邮编：510450
高德导航搜索“广州通达仓库”
Receiving Time: Monday to Sunday 8am to 6pm (except for holidays)`,
  Yiwu: `Yiwu Branch Address 通达国际物流（义乌）
浙江省义乌市苏溪镇好派路121号飞天制衣1楼通达仓库 （+客户唛头.）
联系人：13867932099（施先生）18069956177
0579-85201593
邮编322009
Receiving Time: Monday to Sunday 8am to 5pm (except for holidays)`,
  "Tongda Air Cargo": `TONGDA AIR CARGO 通达空运
贴标: AIR + 客户唛头
收件人：通达空运
地址：   福建泉州市晋江市龙湖梧坑逸海产业园4栋空运部 (+客户唛头)
手机号：   13533392699
1104931438@qq.com`,
  "Hong Kong": `HONGKONG WAREHOUSE
Wing Shung Fat Trading Company
"Pls Label ""TD+ABCD+MOBILE NO"""
香港新界葵涌贷柜码头路51-63号葵顺工业中心9楼E室
TELEPHONE NO.: (00852) 243-95566
CONTACT PERSON: Mr Wang Shixiong 王世雄 （00852）65127878
星期一至五，9點至6點，星期六．9點至2點
Monday to Friday, 9am to 6pm, Saturday, 9am to 2pm.`,
};

export function warehouseAddress(warehouse: unknown): string {
  const name = text(warehouse);
  return Object.prototype.hasOwnProperty.call(warehouseAddresses, name)
    ? warehouseAddresses[name as WarehouseName]
    : "";
}

const divider = "━━━━━━━━━━━━━━";

/** Supplier rules in Chinese and English, with label examples for the customer's cargo code. */
export function supplierRequirementsText(code = "KDOOR-XXXX"): string {
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
    "🚢 SEA FREIGHT – Label Example",
    "",
    `SEA ${code}`,
    "Item: [Product Name]",
    "Supplier: [Chinese Phone Number]",
    "Recipient: [PH Phone Number]",
    "",
    "✈️ AIR FREIGHT – Label Example",
    "",
    `AIR ${code}`,
    "Item: [Product Name]",
    "Supplier: [Chinese Phone Number]",
    "Recipient: [PH Phone Number]",
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
    `Shipping Method: ${shippingMethod(details.service)}`,
    `Assigned Warehouse: ${warehouse}`,
    "",
    "📍 CHINA WAREHOUSE ADDRESS",
    "",
    address,
    "",
    divider,
    "",
    supplierRequirementsText(code),
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
    `Please share this address with your supplier and ask them to place ${code} clearly on every package so we can receive and identify your cargo.`,
    "",
  ]);
}

export function customerPortalAccessMessage(portal: PortalAccessMessage): string {
  return customerWelcomeMessage(portal);
}

/** Every China warehouse with its full address, for the bottom of the shipment page. */
export const malabonWarehouseAddress = `KARGODOOR PH – MALABON WAREHOUSE
36 Rivera St., Brgy. Tañong, Malabon City`;

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
