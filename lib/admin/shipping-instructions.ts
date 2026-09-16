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

const text = (value: unknown, fallback = "") => String(value ?? "").trim() || fallback;

export function customerShippingInstructions(customer: ShippingInstructionCustomer): string {
  const name = text(customer.name, "there");
  const code = text(customer.customerCode, "[account/cargo code]");
  return `Hi ${name}! Your KargoDoor account is ready.

Account/Cargo Code: ${code}
Assigned Warehouse: [Confirm the assigned warehouse]
Warehouse Address: [Add warehouse address]

Please ask your supplier to place ${code} clearly on every package before shipping.

Once shipped, please send us the courier name, tracking/waybill number, and a receipt or package photo so we can monitor your cargo going to our warehouse.`;
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
  return `<script>document.querySelectorAll('.copy-shipping-instructions').forEach((button)=>button.addEventListener('click',async()=>{const source=document.getElementById(button.dataset.copySource);if(!source)return;try{await navigator.clipboard.writeText(source.value);button.textContent='Copied!'}catch{source.select();document.execCommand('copy');button.textContent='Copied!'}setTimeout(()=>button.textContent='Copy shipping instructions',1600)}))</script>`;
}
