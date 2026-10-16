export type ShippingInstructionCustomer = {
  name?: unknown;
  customerCode?: unknown;
};

export type ShippingInstructionShipment = ShippingInstructionCustomer & {
  warehouse?: unknown;
  warehouseAddress?: unknown;
  supplierCourier?: unknown;
  supplierWaybill?: unknown;
};

export type PortalAccessMessage = ShippingInstructionCustomer & {
  email?: unknown;
  temporaryPassword?: unknown;
};

const text = (value: unknown, fallback = "") => String(value ?? "").trim() || fallback;

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
  return `Hi ${name}! Here are your KargoDoor China warehouse shipping instructions.

Account/Cargo Code: ${code}
Assigned Warehouse: [Confirm the assigned warehouse]
Warehouse Address: [Add warehouse address]

Please ask your supplier to place ${code} clearly on every package label. This helps us receive, identify, and update your shipment correctly.

Once shipped, please send us the courier name, tracking/waybill number, and a receipt or package photo so we can monitor your cargo going to our warehouse.

— KargoDoor PH`;
}

export function customerPortalAccessMessage(portal: PortalAccessMessage): string {
  const name = text(portal.name, "there");
  const email = text(portal.email, "[customer email]");
  const password = text(portal.temporaryPassword, "[temporary password]");
  return `Hi ${name}! Your KargoDoor customer portal account is ready.

Login page: https://kargodoorph.com/customer/login
Login email: ${email}
Temporary password: ${password}

Please sign in and change your password right away. Never share your temporary password with anyone.

You can use the portal to view your shipment and payment updates.

— KargoDoor PH`;
}

export function shipmentShippingInstructions(shipment: ShippingInstructionShipment): string {
  const name = text(shipment.name, "there");
  const code = text(shipment.customerCode, "[account/cargo code]");
  const warehouse = text(shipment.warehouse, "[Confirm the assigned warehouse]");
  const address = text(shipment.warehouseAddress, "[Add warehouse address]");
  const courier = text(shipment.supplierCourier, "[courier name]");
  const waybill = text(shipment.supplierWaybill, "[tracking/waybill number]");
  return `Hi ${name}! Here are the shipping instructions for your KargoDoor cargo.

Account/Cargo Code: ${code}
Assigned Warehouse: ${warehouse}
Warehouse Address: ${address}

Please ask your supplier to place ${code} clearly on every package before shipping.

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
