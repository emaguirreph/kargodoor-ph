import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fields = [
  "cargo_code",
  "freight_type",
  "origin_warehouse",
  "warehouse_received_date",
  "departure_date",
  "current_status",
  "eta",
  "remarks",
] as const;

type Values = Partial<Record<(typeof fields)[number], string | null>>;

type ShipmentOption = {
  cargo_code: string;
};

const warehouses = [
  "Guangzhou",
  "Yiwu",
  "Shishi",
  "Hong Kong",
  "Taiwan",
] as const;

const statuses = [
  "Received at Warehouse",
  "In Transit",
  "Arrived in Philippines",
  "Ready for Release",
  "Delivered",
] as const;

const codePattern = /^(?:AIR-)?KDOOR-\d{4,}$/;

const headers = {
  "Cache-Control": "no-store, private",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; font-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};

function escape(value: unknown) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c]!,
  );
}

function response(
  body: string,
  status = 200,
  extra: Record<string, string> = {},
) {
  return new Response(body, {
    status,
    headers: {
      ...headers,
      "Content-Type": "text/html; charset=utf-8",
      ...extra,
    },
  });
}

function page(
  values: Values = {},
  shipmentOptions: ShipmentOption[] = [],
  message = "",
  status = 200,
) {
  const input = (
    key: (typeof fields)[number],
    label: string,
    type = "text",
    required = false,
    max = 100,
  ) => `
    <label>
      ${label}
      <input
        name="${key}"
        type="${type}"
        value="${escape(values[key])}"
        ${required ? "required" : ""}
        maxlength="${max}"
        ${
          key === "cargo_code"
            ? 'pattern="(AIR-)?KDOOR-[0-9]{4,}" placeholder="KDOOR-0001"'
            : ""
        }
      >
    </label>
  `;

  const shipmentDropdown = shipmentOptions
    .map(
      (shipment) => `
        <option
          value="${escape(shipment.cargo_code)}"
          ${
            values.cargo_code === shipment.cargo_code
              ? "selected"
              : ""
          }
        >
          ${escape(shipment.cargo_code)}
        </option>
      `,
    )
    .join("");

  const warehouseDropdown = warehouses
    .map(
      (warehouse) => `
        <option
          value="${escape(warehouse)}"
          ${
            values.origin_warehouse === warehouse
              ? "selected"
              : ""
          }
        >
          ${escape(warehouse)}
        </option>
      `,
    )
    .join("");

  return response(
    `<!doctype html>
<html lang="en">

<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">

<title>Shipment Admin | KargoDoor PH</title>

<style>

@font-face {
  font-family: Inter;
  src: url('/fonts/inter-400.woff2');
}

@font-face {
  font-family: Montserrat;
  src: url('/fonts/montserrat-700.woff2');
  font-weight: 700;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: #eef8ff;
  color: #154876;
  font: 15px Inter, Arial, sans-serif;
}

main {
  max-width: 720px;
  margin: 32px auto;
  padding: 24px;
  background: white;
  border: 1px solid #d4e5f0;
  border-radius: 16px;
}

header {
  display: flex;
  align-items: center;
  gap: 16px;
}

img {
  width: 88px;
  height: 70px;
  object-fit: contain;
}

h1 {
  font: 700 24px Montserrat, Arial, sans-serif;
  margin: 0 0 6px;
}

p {
  line-height: 1.5;
  color: #466177;
}

.tag {
  font-size: 12px;
  letter-spacing: 1px;
  color: #007bad;
  margin: 0 0 6px;
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

label {
  display: block;
  font-size: 13px;
  font-weight: bold;
}

input,
select,
textarea {
  display: block;
  width: 100%;
  margin-top: 7px;
  padding: 11px;
  border: 1px solid #a8c0d1;
  border-radius: 7px;
  background: white;
  color: #154876;
  font: 15px Inter, Arial, sans-serif;
}

textarea {
  resize: vertical;
  min-height: 90px;
}

input:focus,
select:focus,
textarea:focus {
  outline: 2px solid #0099cf;
  outline-offset: 2px;
}

.wide {
  grid-column: 1 / -1;
}

.actions {
  display: flex;
  gap: 12px;
  margin-top: 20px;
}

button {
  border: 0;
  border-radius: 8px;
  padding: 12px 18px;
  background: #0753ad;
  color: white;
  font: 600 15px Inter, Arial, sans-serif;
  cursor: pointer;
}

.secondary {
  background: #e7f3fa;
  color: #154876;
  border: 1px solid #adc7d8;
}

.lookup {
  display: flex;
  align-items: end;
  gap: 12px;
  padding: 18px 0 22px;
  margin-bottom: 22px;
  border-bottom: 1px solid #d4e5f0;
}

.lookup label {
  flex: 1;
}

.notice {
  padding: 12px;
  border: 1px solid #94b9cb;
  border-radius: 8px;
  background: #edf7fc;
  overflow-wrap: anywhere;
}

.help {
  font-size: 13px;
}

a {
  color: #0753ad;
}

@media (max-width: 600px) {

  main {
    margin: 12px;
    padding: 18px;
  }

  .grid {
    grid-template-columns: 1fr;
  }

  .actions {
    flex-direction: column;
  }

  h1 {
    font-size: 21px;
  }

  .lookup {
    align-items: stretch;
    flex-direction: column;
  }
}

</style>
</head>

<body>

<main>

<header>

<img
  src="/assets/kargodoor-logo-approved.png"
  alt="KargoDoor PH"
>

<div>
<p class="tag">PRIVATE ADMIN</p>
<h1>Manage shipments</h1>
</div>

</header>

<p>
Add a shipment, or load an existing shipment to update the details.
</p>

${
  message
    ? `<p class="notice" role="status">${escape(message)}</p>`
    : ""
}

<form
  class="lookup"
  method="get"
  action="/admin/tracking-editor"
>

<label>

Find an existing shipment

<select name="code" required>

<option value="">
Select cargo code
</option>

${shipmentDropdown}

</select>

</label>

<button class="secondary">
Load Shipment
</button>

</form>

<form
  method="post"
  action="/admin/tracking-editor"
>

<div class="grid">

${input(
  "cargo_code",
  "Cargo Code *",
  "text",
  true,
)}

<label>

Freight Type *

<select
  name="freight_type"
  required
>

<option
  value="Sea Freight"
  ${
    values.freight_type !== "Air Freight"
      ? "selected"
      : ""
  }
>
Sea Freight
</option>

<option
  value="Air Freight"
  ${
    values.freight_type === "Air Freight"
      ? "selected"
      : ""
  }
>
Air Freight
</option>

</select>

</label>

<label>

Origin Warehouse

<select name="origin_warehouse">

<option value="">
Select warehouse
</option>

${warehouseDropdown}

</select>

</label>

${input(
  "warehouse_received_date",
  "Warehouse Received Date",
  "date",
)}

${input(
  "departure_date",
  "Departure Date",
  "date",
)}

<label>

Current Status *

<input
  name="current_status"
  required
  maxlength="100"
  list="statuses"
  value="${escape(
    values.current_status ??
      "Received at Warehouse",
  )}"
>

<datalist id="statuses">

${statuses
  .map(
    (status) =>
      `<option value="${escape(status)}"></option>`,
  )
  .join("")}

</datalist>

</label>

${input(
  "eta",
  "ETA",
  "date",
)}

<label class="wide">

Remarks

<textarea
  name="remarks"
  maxlength="2000"
>${escape(values.remarks)}</textarea>

</label>

</div>

<p class="help">
* Required.
Use KDOOR-0001 for sea freight or
AIR-KDOOR-0001 for air freight.
Load an existing shipment before updating it.
Blank optional fields are cleared.
</p>

<div class="actions">

<button
  name="action"
  value="add"
>
Add Shipment
</button>

<button
  class="secondary"
  name="action"
  value="update"
>
Update Shipment
</button>

</div>

</form>

<p class="help">
This admin page is protected by Cloudflare Access.
</p>

<a href="/">
Back to website
</a>

</main>

</body>
</html>`,
    status,
  );
}

async function getEnvironment() {
  const { env } = await getCloudflareContext();
  return env;
}

async function getShipmentOptions(
  env: Awaited<ReturnType<typeof getEnvironment>>,
) {
  const result = await env.TRACKING_DB
    .prepare(
      `
      SELECT cargo_code
      FROM shipments
      ORDER BY cargo_code ASC
      LIMIT 500
      `,
    )
    .all<ShipmentOption>();

  return result.results ?? [];
}

function validate(values: Values) {

  if (!codePattern.test(values.cargo_code ?? "")) {
    return "Use a valid cargo code, such as KDOOR-0001 or AIR-KDOOR-0001.";
  }

  if (
    !["Sea Freight", "Air Freight"].includes(
      values.freight_type ?? "",
    )
  ) {
    return "Choose Sea Freight or Air Freight.";
  }

  if (
    (values.cargo_code!.startsWith("AIR-")
      ? "Air Freight"
      : "Sea Freight") !== values.freight_type
  ) {
    return "Cargo code and freight type must match.";
  }

  if (
    values.origin_warehouse &&
    !warehouses.includes(
      values.origin_warehouse as
        (typeof warehouses)[number],
    )
  ) {
    return "Choose a valid origin warehouse.";
  }

  if (!values.current_status) {
    return "Enter the current status.";
  }

  for (const key of fields) {

    if (
      (values[key]?.length ?? 0) >
      (key === "remarks" ? 2000 : 100)
    ) {
      return `${key} is too long.`;
    }
  }

  for (const key of [
    "warehouse_received_date",
    "departure_date",
    "eta",
  ] as const) {

    const value = values[key];

    if (
      value &&
      (
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(Date.parse(value)) ||
        new Date(value)
          .toISOString()
          .slice(0, 10) !== value
      )
    ) {
      return "Enter valid dates in YYYY-MM-DD format.";
    }
  }

  return null;
}

export async function GET(request: Request) {

  try {

    const env = await getEnvironment();

    const shipmentOptions =
      await getShipmentOptions(env);

    const url = new URL(request.url);

    const code = url.searchParams
      .get("code")
      ?.trim()
      .toUpperCase();

    if (!code) {
      return page(
        {},
        shipmentOptions,
      );
    }

    if (
      !codePattern.test(code) ||
      code.length > 100
    ) {
      return page(
        {},
        shipmentOptions,
        "Enter a valid cargo code.",
        400,
      );
    }

    const shipment =
      await env.TRACKING_DB
        .prepare(
          `
          SELECT ${fields.join(", ")}
          FROM shipments
          WHERE cargo_code = ?
          LIMIT 1
          `,
        )
        .bind(code)
        .first<Values>();

    if (!shipment) {

      return page(
        {
          cargo_code: code,
        },
        shipmentOptions,
        "Shipment not found.",
        404,
      );
    }

    const saved =
      url.searchParams.get("saved");

    return page(
      shipment,
      shipmentOptions,
      saved === "add"
        ? "Shipment added successfully."
        : saved === "update"
          ? "Shipment updated successfully."
          : "Shipment loaded. Edit the details, then select Update Shipment.",
    );

  } catch {

    return response(
      "Unable to load admin. Check the existing TRACKING_DB connection and try again.",
      500,
    );
  }
}

export async function POST(request: Request) {

  let values: Values = {};

  try {

    const env = await getEnvironment();

    const shipmentOptions =
      await getShipmentOptions(env);

    const origin =
      request.headers.get("origin");

    const expectedOrigin =
      new URL(request.url).origin;

    if (
      origin &&
      origin !== "null" &&
      origin !== expectedOrigin
    ) {

      return response(
        "This request is not allowed.",
        403,
      );
    }

    if (
      !request.headers
        .get("content-type")
        ?.startsWith(
          "application/x-www-form-urlencoded",
        )
    ) {

      return response(
        "Unsupported form format.",
        415,
      );
    }

    const body =
      await request.text();

    if (body.length > 24000) {

      return response(
        "Form is too large.",
        413,
      );
    }

    const form =
      new URLSearchParams(body);

    values =
      Object.fromEntries(
        fields.map(
          (key) => [
            key,
            form.get(key)?.trim() || null,
          ],
        ),
      );

    values.cargo_code =
      values.cargo_code
        ?.toUpperCase() ?? "";

    const error =
      validate(values);

    if (error) {

      return page(
        values,
        shipmentOptions,
        error,
        400,
      );
    }

    const action =
      form.get("action");

    const db =
      env.TRACKING_DB;

    if (action === "add") {

      const result =
        await db
          .prepare(
            `
            INSERT INTO shipments (
              ${fields.join(", ")}
            )

            SELECT
              ${fields
                .map(() => "?")
                .join(", ")}

            WHERE NOT EXISTS (
              SELECT 1
              FROM shipments
              WHERE cargo_code = ?
            )
            `,
          )
          .bind(
            ...fields.map(
              (key) =>
                values[key] ?? null,
            ),
            values.cargo_code,
          )
          .run();

      if (!result.meta.changes) {

        return page(
          values,
          shipmentOptions,
          "This cargo code already exists. Load it and use Update Shipment.",
          409,
        );
      }

    } else if (
      action === "update"
    ) {

      const editable =
        fields.filter(
          (key) =>
            key !== "cargo_code",
        );

      const result =
        await db
          .prepare(
            `
            UPDATE shipments

            SET
              ${editable
                .map(
                  (key) =>
                    `${key} = ?`,
                )
                .join(", ")},

              last_updated =
                CURRENT_TIMESTAMP

            WHERE cargo_code = ?
            `,
          )
          .bind(
            ...editable.map(
              (key) =>
                values[key] ?? null,
            ),
            values.cargo_code,
          )
          .run();

      if (!result.meta.changes) {

        return page(
          values,
          shipmentOptions,
          "Shipment not found. Check the cargo code or use Add Shipment.",
          404,
        );
      }

    } else {

      return page(
        values,
        shipmentOptions,
        "Choose Add Shipment or Update Shipment.",
        400,
      );
    }

    return response(
      "",
      303,
      {
        Location:
          `/admin/tracking-editor?code=${encodeURIComponent(
            values.cargo_code!,
          )}&saved=${action}`,
      },
    );

  } catch {

    return response(
      "Could not save the shipment. Return to the Tracking Editor and load the cargo code to check its current details before retrying.",
      500,
    );
  }
}
