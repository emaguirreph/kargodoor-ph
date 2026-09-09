import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { Footer, Header } from "@/components/site-chrome";
import { MessengerLink } from "@/components/messenger-link";
import {
  customerSession,
  customerSessionCookie,
} from "@/lib/customer/security";

export const dynamic = "force-dynamic";

type CustomerShipment = {
  id: string;
  tracking_number: string;
  service_type: "Sea Freight" | "Air Freight";
  cbm: number;
  weight_kg: number;
  status:
    | "Received at Warehouse"
    | "In Transit"
    | "Arrived in Philippines"
    | "Ready for Release"
    | "Delivered"
    | "Cancelled";
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
}: {
  shipment: CustomerShipment;
}) {
  const measurement =
    shipment.service_type === "Sea Freight"
      ? shipment.cbm > 0
        ? `${shipment.cbm.toLocaleString("en-PH", {
            maximumFractionDigits: 3,
          })} CBM`
        : "—"
      : shipment.weight_kg > 0
        ? `${shipment.weight_kg.toLocaleString("en-PH", {
            maximumFractionDigits: 2,
          })} kg`
        : "—";

  return (
    <tr>
      <td>
        <strong>{shipment.tracking_number}</strong>
      </td>

      <td>{shipment.status}</td>

      <td>{shipment.service_type}</td>

      <td>{measurement}</td>

      <td>{formatMoney(shipment.shipping_charge)}</td>

      <td>{formatMoney(deliveryCharge(shipment))}</td>

      <td>
        <strong>{paymentLabel(shipment)}</strong>
      </td>

      <td>
        <a
          className="kd-customer-track"
          href={`/track?tracking=${encodeURIComponent(
            shipment.tracking_number,
          )}`}
        >
          TRACK
        </a>
      </td>
    </tr>
  );
}

function ShipmentTable({
  shipments,
  emptyMessage,
}: {
  shipments: CustomerShipment[];
  emptyMessage: string;
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
            <th></th>
          </tr>
        </thead>

        <tbody>
          {shipments.map((shipment) => (
            <ShipmentRow
              key={shipment.id}
              shipment={shipment}
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
        s.status,
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
    (shipment) =>
      shipment.status === "Received at Warehouse" ||
      shipment.status === "In Transit" ||
      shipment.status === "Arrived in Philippines" ||
      shipment.status === "Ready for Release",
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
          </div>

          <section className="kd-customer-dashboard-section">
            <h2>My Shipments</h2>

            <ShipmentTable
              shipments={activeShipments}
              emptyMessage="You have no active shipments."
            />
          </section>

          <section className="kd-customer-dashboard-section">
            <h2>Shipment History</h2>

            <ShipmentTable
              shipments={shipmentHistory}
              emptyMessage="No shipment history yet."
            />
          </section>

          <div className="kd-customer-dashboard-actions">
            <MessengerLink
              target="_blank"
              rel="noopener noreferrer"
            >
              CONTACT KARGODOOR
            </MessengerLink>

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
