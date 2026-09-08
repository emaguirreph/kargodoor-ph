import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Shipment = {
  tracking_number: string;
  service_type: string;
  china_warehouse: string | null;
  warehouse_received_date: string | null;
  departure_date: string | null;
  status: string;
  estimated_arrival: string | null;
  tracking_remarks: string | null;
  updated_at: string;
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);

    const trackingNumber =
      url.searchParams
        .get("code")
        ?.trim()
        .toUpperCase();

    if (!trackingNumber) {
      return Response.json(
        {
          error:
            "Please enter your KargoDoor tracking number.",
        },
        {
          status: 400,
        },
      );
    }

    const validCode =
      /^KD-?(?:SEA|AIR)-?\d{6,}$/i.test(trackingNumber) ||
      /^(?:AIR-)?KDOOR-?\d{4,}$/i.test(trackingNumber);

    if (!validCode) {
      return Response.json(
        {
          error:
            "Please enter a valid KargoDoor tracking number.",
        },
        {
          status: 400,
        },
      );
    }

    const { env } =
      await getCloudflareContext();

    const shipment =
      await env.ADMIN_DB
        .prepare(
          `
          SELECT
            tracking_number,
            service_type,
            china_warehouse,
            warehouse_received_date,
            departure_date,
            status,
            estimated_arrival,
            tracking_remarks,
            updated_at
          FROM shipments
          WHERE tracking_number = ?
          LIMIT 1
          `,
        )
        .bind(trackingNumber)
        .first<Shipment>();

    if (!shipment) {
      return Response.json(
        {
          error:
            "Tracking number not found. Please check the number or message KargoDoor PH for assistance.",
        },
        {
          status: 404,
        },
      );
    }

    return Response.json({
      tracking_number:
        shipment.tracking_number,

      freight_type:
        shipment.service_type,

      origin_warehouse:
        shipment.china_warehouse,

      warehouse_received_date:
        shipment.warehouse_received_date,

      departure_date:
        shipment.departure_date,

      current_status:
        shipment.status,

      eta:
        shipment.estimated_arrival,

      remarks:
        shipment.tracking_remarks,

      last_updated:
        shipment.updated_at,

      standard_transit:
        shipment.service_type ===
        "Air Freight"
          ? "5–7 days from departure"
          : "3–5 weeks from departure",
    });
  } catch (error) {
    console.error(
      "Tracking lookup failed:",
      error,
    );

    return Response.json(
      {
        error:
          "We couldn't retrieve your shipment right now. Please try again or message KargoDoor PH.",
      },
      {
        status: 500,
      },
    );
  }
}
