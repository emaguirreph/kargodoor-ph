export type ShippingInstructionCustomer = {
  name?: unknown;
  customerCode?: unknown;
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

export const warehouseNames = ["Guangzhou", "Yiwu", "Shishi", "Tongda Air Cargo"] as const;
export type WarehouseName = typeof warehouseNames[number];

const warehouseAddresses: Record<WarehouseName, string> = {
  Shishi: `通达国际物流（石狮）
地址：福建省晋江市龙湖镇梧坑村逸海产业园4栋A1通达仓库（+客户唛头）
邮编：362200
联系人：张先生 13600719368 / 0595-85293217
高德导航搜索“泉海通达物流”
Receiving Time: Monday to Sunday 8am to 6pm (except for holidays)`,
  Guangzhou: `通达国际物流（广州）
地址：广州市白云区江高镇沙溪东路18号166通达仓库（+客户唛头）
联系人：伍先生
联系电话：13924091288 / 13560372000
固定电话：020-81997500
邮编：510450
高德导航搜索“广州通达仓库”
Receiving Time: Monday to Sunday 8am to 6pm (except for holidays)`,
  Yiwu: `通达国际物流（义乌）
地址：浙江省义乌市苏溪镇好派路121号飞天制衣1楼通达仓库（+客户唛头）
联系人：施先生 13867932099 / 18069956177
固定电话：0579-85201593
邮编：322009
Receiving Time: Monday to Sunday 8am to 5pm (except for holidays)`,
  "Tongda Air Cargo": `TONGDA AIR CARGO 通达空运
贴标: AIR + 客户唛头
收件人：通达空运
地址：福建泉州市晋江市龙湖梧坑逸海产业园4栋空运部（+客户唛头）
手机号：13533392699
邮箱：1104931438@qq.com`,
};

export function warehouseAddress(warehouse: unknown): string {
  const name = text(warehouse);
  return Object.prototype.hasOwnProperty.call(warehouseAddresses, name)
    ? warehouseAddresses[name as WarehouseName]
    : "";
}

const supplierRequirements = `Instructions to Suppliers
发货前注意重要事项：
1. 请务必每件货物贴好唛头标签（包括客户代号，菲律宾收货人电话，中国寄件人电话），否则仓库无法收货入仓；
2. 请每票货随货附一张装箱单，包含详细中文品名，材质，件数，重量，发货人电话等；
3. 送货前请确保货物包装完整无破损，易碎货物加固包装，否则仓库不接收包装破损货物。

English translation:
1. Attach a cargo-mark label to every package. It must include the customer code, the Philippine recipient’s phone number, and the China sender’s phone number; otherwise, the warehouse cannot receive the cargo.
2. Include one packing list with each shipment, showing the detailed Chinese product name, material, quantity, weight, and sender’s phone number.
3. Ensure all packaging is complete and undamaged before delivery. Reinforce fragile cargo. The warehouse will not accept cargo with damaged packaging.`;

export function customerAccountCreatedMessage(customer: ShippingInstructionCustomer): string {
  const name = text(customer.name, "there");
  const code = text(customer.customerCode, "[account/cargo code]");
  return `Hi ${name}! Welcome to KargoDoor PH.

Your KargoDoor Account Number is: ${code}

Please use this account number or cargo code on your supplier’s shipping label so we can identify your packages when they arrive at our China warehouse.

We’ll send your warehouse address and shipping instructions next.

— KargoDoor PH`;
}

export function customerShippingInstructions(customer: ShippingInstructionCustomer): string {
  const name = text(customer.name, "there");
  const code = text(customer.customerCode, "[account/cargo code]");
  const warehouse = text(customer.warehouse, "[Confirm the assigned warehouse]");
  const address = text(customer.warehouseAddress || warehouseAddress(warehouse), "[Add warehouse address]");
  return `Hi ${name}! Here are your KargoDoor China warehouse shipping instructions.

Account/Cargo Code: ${code}
Assigned Warehouse: ${warehouse}
Warehouse Address:
${address}

Please ask your supplier to place ${code} clearly on every package label. This helps us receive, identify, and update your shipment correctly.

${supplierRequirements}

Once shipped, please send us the courier name, tracking/waybill number, and a receipt or package photo so we can monitor your cargo going to our warehouse.

— KargoDoor PH`;
}

export function customerPortalAccessMessage(portal: PortalAccessMessage): string {
  const name = text(portal.name, "there");
  const customerCode = text(portal.customerCode, "[account/cargo code]");
  const login = text(portal.login, "[email or mobile number]");
  const loginLabel = text(portal.loginLabel, "email or mobile number");
  const password = text(portal.temporaryPassword, "[temporary password]");
  return `Hi ${name}!
Your KargoDoor customer portal account is ready.
Here is your Account/Cargo Code: ${customerCode}
Login page: https://kargodoorph.com/customer/login
Login ${loginLabel}: ${login}
Temporary password: ${password}
Please sign in and change your password right away. Never share your temporary password with anyone.
You can use the portal to view your shipment and payment updates.
— KargoDoor PH`;
}

export function shipmentShippingInstructions(shipment: ShippingInstructionShipment): string {
  const name = text(shipment.name, "there");
  const code = text(shipment.customerCode, "[account/cargo code]");
  const warehouse = text(shipment.warehouse, "[Confirm the assigned warehouse]");
  const address = text(shipment.warehouseAddress || warehouseAddress(warehouse), "[Add warehouse address]");
  const courier = text(shipment.supplierCourier, "[courier name]");
  const waybill = text(shipment.supplierWaybill, "[tracking/waybill number]");
  return `Hi ${name}! Here are the shipping instructions for your KargoDoor cargo.

Account/Cargo Code: ${code}
Assigned Warehouse: ${warehouse}
Warehouse Address: ${address}

Please ask your supplier to place ${code} clearly on every package before shipping.

${supplierRequirements}

Once shipped, please send us:
• Courier: ${courier}
• Tracking/Waybill number: ${waybill}
• Receipt or package photo

This helps us monitor your cargo going to our warehouse.`;
}

export function copyButton(id: string, label = "Copy shipping instructions"): string {
  return `<button type="button" class="copy-shipping-instructions" data-copy-source="${id}">${label}</button>`;
}

export function copyScript(): string {
  return `<script src="/admin-copy.js" defer></script>`;
}
