import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Shipment = {
  cargo_code: string;
  freight_type: string;
  origin_warehouse: string | null;
  warehouse_received_date: string | null;
  departure_date: string | null;
  current_status: string;
  eta: string | null;
  remarks: string | null;
  last_updated: string;
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const cargoCode = url.searchParams.get("code")?.trim().toUpperCase();

    if (!cargoCode) {
      return Response.json(
        { error: "Please enter your KargoDoor Cargo Code." },
        { status: 400 },
      );
    }

    const validCode =
      /^KDOOR-\d{4,}$/.test(cargoCode) ||
      /^AIR-KDOOR-\d{4,}$/.test(cargoCode);

    if (!validCode) {
      return Response.json(
        { error: "Please enter a valid KargoDoor Cargo Code." },
        { status: 400 },
      );
    }

    const { env } = await getCloudflareContext();

    const shipment = await env.TRACKING_DB.prepare(
      `
        SELECT
          cargo_code,
          freight_type,
          origin_warehouse,
          warehouse_received_date,
          departure_date,
          current_status,
          eta,
          remarks,
          last_updated
        FROM shipments
        WHERE cargo_code = ?
        LIMIT 1
      `,
    )
      .bind(cargoCode)
      .first<Shipment>();

    if (!shipment) {
      return Response.json(
        {
          error:
            "Cargo Code not found. Please check your code or message KargoDoor PH for assistance.",
        },
        { status: 404 },
      );
    }

    return Response.json({
      ...shipment,
      standard_transit:
        shipment.freight_type === "Air Freight"
          ? "5–7 days from departure"
          : "3–5 weeks from departure",
    });
  } catch (error) {
    console.error("Tracking lookup failed:", error);

    return Response.json(
      {
        error:
          "We couldn't retrieve your shipment right now. Please try again or message KargoDoor PH.",
      },
      { status: 500 },
    );
  }
}
