import type { CSSProperties, ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { SiteShell } from "@/components/v5/chrome";
import { CopyCode } from "@/components/v5/copy-code";
import { MessengerLink } from "@/components/messenger-link";
import { shipmentShippingInstructions, warehouseAddress } from "@/lib/admin/shipping-instructions";
import {
  customerSession,
  customerSessionCookie,
} from "@/lib/customer/security";

export const dynamic = "force-dynamic";

export type CustomerShipment = {
  id: string;
  tracking_number: string;
  item: string;
  service_type: "Sea Freight" | "Air Freight" | "FCL";
  cbm: number;
  weight_kg: number;
  verified_cbm: number | null;
  verified_weight_kg: number | null;
  status: string;
  china_warehouse: string;
  warehouse_received_date: string | null;
  actual_arrival: string | null;
  shipping_charge: number;
  shipment_delivery_charge: number;
  invoice_delivery_charge: number | null;
  invoice_status: string | null;
  invoice_total: number | null;
  invoice_other_charge: number | null;
  payments_total: number;
};

function formatMoney(centavos: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(centavos / 100);
}

function paymentLabel(shipment: CustomerShipment) {
  const amountDue =
    (shipment.invoice_total ?? 0) +
    (shipment.invoice_other_charge ?? 0);

  if (
    shipment.invoice_status === "Paid" &&
    shipment.payments_total >= amountDue
  ) {
    return "PAID";
  }

  return "UNPAID";
}

function deliveryCharge(shipment: CustomerShipment) {
  if (
    shipment.invoice_status &&
    shipment.invoice_status !== "Void" &&
    shipment.invoice_delivery_charge !== null
  ) {
    return shipment.invoice_delivery_charge;
  }

  return shipment.shipment_delivery_charge;
}

const stages = [
  "Awaiting Supplier Dispatch",
  "China Warehouse",
  "China Port",
  "Sea Transit",
  "Manila Port",
  "Gatepass",
  "Malabon Warehouse",
  "Delivered",
];

function ShipmentCard({
  shipment,
  customer,
}: {
  shipment: CustomerShipment;
  customer: { full_name: string; customer_code: string };
}) {
  const hasVerifiedMeasurements =
    shipment.verified_cbm !== null &&
    shipment.verified_weight_kg !== null;
  const cbm = hasVerifiedMeasurements
    ? shipment.verified_cbm ?? 0
    : shipment.cbm;
  const weight = hasVerifiedMeasurements
    ? shipment.verified_weight_kg ?? 0
    : shipment.weight_kg;
  const measurement = hasVerifiedMeasurements
    ? `${cbm.toLocaleString("en-PH", {
        maximumFractionDigits: 3,
      })} CBM · ${weight.toLocaleString("en-PH", {
        maximumFractionDigits: 2,
      })} kg`
    : shipment.service_type === "Sea Freight"
      ? cbm > 0
        ? `${cbm.toLocaleString("en-PH", {
            maximumFractionDigits: 3,
          })} CBM`
        : "—"
      : weight > 0
        ? `${weight.toLocaleString("en-PH", {
            maximumFractionDigits: 2,
          })} kg`
        : "—";

  const declaredCbm = shipment.cbm > 0
    ? `${shipment.cbm.toLocaleString("en-PH", { maximumFractionDigits: 3 })} CBM`
    : "—";
  const declaredWeight = shipment.weight_kg > 0
    ? `${shipment.weight_kg.toLocaleString("en-PH", { maximumFractionDigits: 2 })} kg`
    : "—";

  const instructions = shipmentShippingInstructions({
    name: customer.full_name,
    customerCode: customer.customer_code,
    warehouse: shipment.china_warehouse,
    warehouseAddress: warehouseAddress(shipment.china_warehouse),
  });
  const chinaReceivedDate = shipment.warehouse_received_date || "Pending warehouse receipt";
  const phWarehouseReceivedDate = shipment.actual_arrival || "—";
  const payment = paymentLabel(shipment);
  const stage = stages.indexOf(shipment.status);

  return (
    <article className="ship">
      <div className="st">
        <div>
          <a className="tn" href={`/track?tracking=${encodeURIComponent(shipment.tracking_number)}`}>
            {shipment.tracking_number}
          </a>
          <div className="item">{shipment.item || "—"}</div>
        </div>
        <span className={`pay ${payment === "PAID" ? "paid" : "unpaid"}`}>{payment}</span>
      </div>

      <div className="stbar">
        <div className="row">
          <span>{shipment.status}</span>
          {stage >= 0 && <span>{stage + 1} / {stages.length}</span>}
        </div>
        {stage >= 0 && (
          <div className="prog" aria-hidden="true">
            <i style={{ "--w": `${Math.round((stage / (stages.length - 1)) * 100)}%` } as CSSProperties} />
          </div>
        )}
      </div>

      <dl className="sdl">
        <div><dt>Service</dt><dd>{shipment.service_type}</dd></div>
        <div><dt>CN Warehouse</dt><dd>{shipment.china_warehouse || "—"}</dd></div>
        <div><dt>Declared CBM</dt><dd>{declaredCbm}</dd></div>
        <div><dt>Declared Weight</dt><dd>{declaredWeight}</dd></div>
        <div>
          <dt>CBM / Weight</dt>
          <dd>
            {measurement}
            {hasVerifiedMeasurements ? <small>Warehouse verified</small> : null}
          </dd>
        </div>
        <div><dt>Freight</dt><dd>{formatMoney(shipment.shipping_charge)}</dd></div>
        <div><dt>Delivery</dt><dd>{formatMoney(deliveryCharge(shipment))}</dd></div>
      </dl>

      <details>
        <summary>Shipping instructions for this package</summary>
        <p className="cnote">
          <strong>Account / Cargo Code: {customer.customer_code}</strong> — use this on every supplier label so KargoDoor can identify your cargo. <strong>Tracking Number: {shipment.tracking_number}</strong> — this is the unique KargoDoor reference for this specific package and is different from your account/cargo code.
        </p>
        <dl className="dates">
          <div>
            <dt>China received date</dt>
            <dd>{chinaReceivedDate}</dd>
          </div>
          <div>
            <dt>PH warehouse received date</dt>
            <dd>{phWarehouseReceivedDate}</dd>
          </div>
        </dl>
        <pre>{instructions}</pre>
      </details>
      {payment !== "PAID" ? (
        <details>
          <summary>Payment instructions</summary>
          <div className="paygrid">
            <section>
              <h3>Bank Account Information</h3>
              <dl>
                <div><dt>Bank</dt><dd>UnionBank of the Philippines</dd></div>
                <div><dt>Account Name</dt><dd>KargoDoor Cargo Forwarding</dd></div>
                <div><dt>Account Number</dt><dd>002170017106</dd></div>
              </dl>
            </section>
            <section>
              <h3>GCash</h3>
              <dl>
                <div><dt>GCash Number</dt><dd>0917 157 7370</dd></div>
                <div><dt>Account Name</dt><dd>EMMARUTH GALLARDO</dd></div>
              </dl>
            </section>
          </div>
        </details>
      ) : null}
    </article>
  );
}

export function ShipmentTable({
  shipments,
  emptyMessage,
  customer,
}: {
  shipments: CustomerShipment[];
  emptyMessage: string;
  customer: { full_name: string; customer_code: string };
}) {
  if (shipments.length === 0) {
    return (
      <p className="dempty">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="ships">
      {shipments.map((shipment) => (
        <ShipmentCard
          key={shipment.id}
          shipment={shipment}
          customer={customer}
        />
      ))}
    </div>
  );
}

/** The dashboard header and both shipment lists, shared with the admin customer preview. */
export function CustomerDashboard({
  customer,
  activeShipments,
  shipmentHistory,
  actions,
  notice,
}: {
  customer: { full_name: string; customer_code: string };
  activeShipments: CustomerShipment[];
  shipmentHistory: CustomerShipment[];
  actions: ReactNode;
  notice?: ReactNode;
}) {
  return (
    <>
      <div className="dhead">
        <div className="grid-bg" />
        <div className="wrap">
          <div>
            <h1>MY KargoDoorPH</h1>
            <p className="welcome">Welcome, {customer.full_name}</p>
            <p className="code-chip">
              Account / Cargo Code: <strong>{customer.customer_code}</strong>
              <CopyCode code={customer.customer_code} />
            </p>
          </div>
          <div className="dacts">{actions}</div>
        </div>
      </div>

      <div className="wrap dbody">
        {notice}
        <section className="dsec">
          <h2>My Shipments <span className="cnt">{activeShipments.length}</span></h2>
          <ShipmentTable
            shipments={activeShipments}
            emptyMessage="You have no active shipments."
            customer={customer}
          />
        </section>

        <section className="dsec">
          <h2>Shipment History <span className="cnt">{shipmentHistory.length}</span></h2>
          <ShipmentTable
            shipments={shipmentHistory}
            emptyMessage="No shipment history yet."
            customer={customer}
          />
        </section>
      </div>
    </>
  );
}

export default async function CustomerPage() {
  const { env } = await getCloudflareContext();

  const token = (await cookies()).get(
    customerSessionCookie,
  )?.value;

  const customer = await customerSession(
    env.ADMIN_DB,
    token,
  );

  if (!customer) {
    redirect("/customer/login");
  }

  if (customer.password_state === "temporary") {
    redirect("/customer/change-password");
  }

  const result = await env.ADMIN_DB.prepare(
    `
      SELECT
        s.id,
        s.tracking_number,
        CASE
          WHEN s.tracking_remarks LIKE 'Item: %'
            THEN substr(s.tracking_remarks, 7, instr(s.tracking_remarks || char(10), char(10)) - 7)
          ELSE COALESCE(NULLIF(json_extract(q.cargo_snapshot, '$.item'), ''), '—')
        END AS item,
        s.service_type,
        s.cbm,
        s.weight_kg,
        s.verified_cbm,
        s.verified_weight_kg,
        s.status,
        s.china_warehouse,
        s.warehouse_received_date,
        s.actual_arrival,
        s.shipping_charge,
        s.delivery_charge AS shipment_delivery_charge,

        i.delivery_charge AS invoice_delivery_charge,
        i.status AS invoice_status,
        i.total AS invoice_total,
        i.other_charge AS invoice_other_charge,

        COALESCE(
          (
            SELECT SUM(p.amount)
            FROM payments p
            WHERE p.invoice_id = i.id
              AND p.customer_id = s.customer_id
          ),
          0
        ) AS payments_total

      FROM shipments s

      LEFT JOIN quotations q
        ON q.id = s.source_quotation_id

      LEFT JOIN invoices i
        ON i.shipment_id = s.id
        AND i.customer_id = s.customer_id
        AND i.status != 'Void'

      WHERE s.customer_id = ?
        AND s.archived_at IS NULL

      ORDER BY s.created_at DESC
    `,
  )
    .bind(customer.customer_id)
    .all<CustomerShipment>();

  const shipments = result.results ?? [];

  const activeShipments = shipments.filter(
    (shipment) => shipment.status !== "Delivered" && shipment.status !== "Cancelled",
  );

  const shipmentHistory = shipments.filter(
    (shipment) =>
      shipment.status === "Delivered" ||
      shipment.status === "Cancelled",
  );

  return (
    <SiteShell>
      <CustomerDashboard
        customer={customer}
        activeShipments={activeShipments}
        shipmentHistory={shipmentHistory}
        actions={
          <>
            <MessengerLink className="btn btn-green" target="_blank" rel="noopener noreferrer">
              CONTACT KARGODOOR
            </MessengerLink>
            <a className="btn btn-line" href="/customer/change-password">
              CHANGE PASSWORD
            </a>
            <form action="/customer/logout" method="post">
              <button className="btn btn-line" type="submit">
                LOG OUT
              </button>
            </form>
          </>
        }
      />
    </SiteShell>
  );
}
