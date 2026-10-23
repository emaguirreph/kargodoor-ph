import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { Footer, Header } from "@/components/site-chrome";
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

function ShipmentRow({
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

  const instructions = shipmentShippingInstructions({
    name: customer.full_name,
    customerCode: customer.customer_code,
    warehouse: shipment.china_warehouse,
    warehouseAddress: warehouseAddress(shipment.china_warehouse),
  });
  const chinaReceivedDate = shipment.warehouse_received_date || "Pending warehouse receipt";
  const phWarehouseReceivedDate = shipment.actual_arrival || "—";

  return (
    <>
      <tr>
        <td>
          <a
            className="kd-customer-track"
            href={`/track?tracking=${encodeURIComponent(
              shipment.tracking_number,
            )}`}
          >
            <strong>{shipment.tracking_number}</strong>
          </a>
        </td>

        <td>{shipment.status}</td>

        <td>{shipment.service_type}</td>

        <td>
          {measurement}
          {hasVerifiedMeasurements ? (
            <small className="kd-customer-verified-measurement">
              Warehouse verified
            </small>
          ) : null}
        </td>

        <td>{formatMoney(shipment.shipping_charge)}</td>

        <td>{formatMoney(deliveryCharge(shipment))}</td>

        <td>
          <strong>{paymentLabel(shipment)}</strong>
        </td>

      </tr>
      <tr className="kd-customer-instruction-row">
        <td colSpan={7}>
          <details className="kd-customer-instructions">
            <summary>Shipping instructions for this package</summary>
            <p className="kd-customer-code-note">
              <strong>Account / Cargo Code: {customer.customer_code}</strong> — use this on every supplier label so KargoDoor can identify your cargo. <strong>Tracking Number: {shipment.tracking_number}</strong> — this is the unique KargoDoor reference for this specific package and is different from your account/cargo code.
            </p>
            <dl className="kd-customer-shipment-dates">
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
          {paymentLabel(shipment) !== "PAID" ? (
            <details className="kd-customer-payment-instructions">
              <summary>Payment instructions</summary>
              <div className="kd-customer-payment-grid">
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
        </td>
      </tr>
    </>
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
      <p className="kd-customer-empty">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="kd-customer-table-wrap">
      <table className="kd-customer-table">
        <thead>
          <tr>
            <th>Tracking No.</th>
            <th>Status</th>
            <th>Service</th>
            <th>CBM / Weight</th>
            <th>Freight</th>
            <th>Delivery</th>
            <th>Payment</th>
          </tr>
        </thead>

        <tbody>
          {shipments.map((shipment) => (
            <ShipmentRow
              key={shipment.id}
              shipment={shipment}
              customer={customer}
            />
          ))}
        </tbody>
      </table>
    </div>
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

      LEFT JOIN invoices i
        ON i.shipment_id = s.id
        AND i.customer_id = s.customer_id
        AND i.status != 'Void'

      WHERE s.customer_id = ?

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
    <div className="kd-site-shell">
      <Header />

      <main className="kd-customer-page">
        <section className="kd-customer-card kd-customer-dashboard">
          <div className="kd-customer-dashboard-heading">
            <h1>MY KargoDoorPH</h1>
            <p>Welcome, {customer.full_name}</p>
            <p className="kd-customer-account-code">
              Account / Cargo Code: <strong>{customer.customer_code}</strong>
            </p>
          </div>

          <section className="kd-customer-dashboard-section">
            <h2>My Shipments</h2>

            <ShipmentTable
              shipments={activeShipments}
              emptyMessage="You have no active shipments."
              customer={customer}
            />
          </section>

          <section className="kd-customer-dashboard-section">
            <h2>Shipment History</h2>

            <ShipmentTable
              shipments={shipmentHistory}
              emptyMessage="No shipment history yet."
              customer={customer}
            />
          </section>

          <div className="kd-customer-dashboard-actions">
            <MessengerLink
              target="_blank"
              rel="noopener noreferrer"
            >
              CONTACT KARGODOOR
            </MessengerLink>

            <a href="/customer/change-password">
              CHANGE PASSWORD
            </a>

            <form action="/customer/logout" method="post">
              <button type="submit">
                LOG OUT
              </button>
            </form>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
