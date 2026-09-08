import { getCloudflareContext } from "@opennextjs/cloudflare";
import { ZodError } from "zod";

import {
  authenticate,
  AdminError,
  canonicalOrigin,
  csrfToken,
  checkCsrf,
  type AdminEnv,
} from "./security";

import {
  statuses,
  warehouses,
  schemaKeys,
  parseForm,
  type Entity,
  type RecordData,
} from "./validation";

import { saveRecord } from "./data";
import { page, esc, pesos, input, select, hidden } from "./ui";
import { dashboard, finance, activity } from "./reports";

const labels: Record<string, string> = {
  nihao_cost: "Ni Hao freight cost",
  shipping_charge: "KargoDoor freight charge",
  delivery_charge: "Delivery charge",
  china_warehouse: "Origin warehouse",
  customer_code: "Account number",
  full_name: "Full name",
  company_name: "Company",
  mobile: "Mobile",
  email: "Email",
  address: "Address",
  notes: "Notes",

  tracking_number: "Tracking number",
  cargo_code: "Legacy cargo code",
  service_type: "Service type",
  warehouse_received_date: "Warehouse received date",
  departure_date: "Departure date",
  status: "Status",
  estimated_arrival: "Estimated arrival",
  actual_arrival: "Actual arrival",
  tracking_remarks: "Tracking remarks",
  payment_status: "Payment status",
  cbm: "CBM",
  weight_kg: "Weight (kg)",

  created_at: "Created",
  updated_at: "Updated",
};

function validateFormOrigin(
  request: Request,
  env: AdminEnv,
) {
  const expectedOrigin = canonicalOrigin(env);
  const requestOrigin = new URL(request.url).origin;

  if (requestOrigin !== expectedOrigin) {
    throw new AdminError(
      "Admin request origin is invalid.",
      403,
    );
  }

  const fetchSite =
    request.headers.get("sec-fetch-site");

  if (fetchSite === "cross-site") {
    throw new AdminError(
      "Cross-site form submission rejected.",
      403,
    );
  }

  const originHeader =
    request.headers.get("origin");

  if (!originHeader || originHeader === "null") {
    return;
  }

  let submittedOrigin: string;

  try {
    submittedOrigin =
      new URL(originHeader).origin;
  } catch {
    throw new AdminError(
      "Invalid form origin.",
      403,
    );
  }

  if (submittedOrigin !== expectedOrigin) {
    throw new AdminError(
      "Cross-site form submission rejected.",
      403,
    );
  }
}

export async function handleAdmin(
  request: Request,
  view?: Entity | "finance" | "activity",
) {
  let localChallenge = false;

  try {
    const { env: cf } =
      await getCloudflareContext();

    const env =
      cf as unknown as AdminEnv;

    localChallenge =
      env.ADMIN_LOCAL_DEV === "true" &&
      ["localhost", "127.0.0.1"].includes(
        new URL(
          canonicalOrigin(env),
        ).hostname,
      );

    const user =
      await authenticate(request, env);

    const db = env.ADMIN_DB;
    const url = new URL(request.url);

    const entity =
      view === "customers" ||
      view === "shipments"
        ? view
        : undefined;

    const path = view
      ? `/admin/${view}`
      : "/admin/dashboard";

    if (
      url.pathname !== path &&
      url.pathname !== `${path}/`
    ) {
      throw new AdminError(
        "Admin page not found.",
        404,
      );
    }

    if (
      request.method !== "GET" &&
      request.method !== "POST"
    ) {
      throw new AdminError(
        "Method not allowed.",
        405,
      );
    }

    /*
     * POST
     */
    if (request.method === "POST") {
      if (!entity) {
        throw new AdminError(
          "Use the customer or shipment form.",
          405,
        );
      }

      validateFormOrigin(
        request,
        env,
      );

      const contentType =
        request.headers
          .get("content-type")
          ?.split(";")[0]
          ?.trim()
          .toLowerCase();

      if (
        contentType !==
        "application/x-www-form-urlencoded"
      ) {
        throw new AdminError(
          "Unsupported form format.",
          415,
        );
      }

      const contentLength =
        Number(
          request.headers.get(
            "content-length",
          ) ?? 0,
        );

      if (
        Number.isFinite(contentLength) &&
        contentLength > 24_000
      ) {
        throw new AdminError(
          "Form is too large.",
          413,
        );
      }

      const reader =
        request.body?.getReader();

      if (!reader) {
        throw new AdminError(
          "Form is empty.",
        );
      }

      const chunks: Uint8Array[] = [];
      let length = 0;

      while (true) {
        const {
          done,
          value,
        } =
          await reader.read();

        if (done) {
          break;
        }

        length +=
          value.length;

        if (
          length > 24_000
        ) {
          await reader.cancel();

          throw new AdminError(
            "Form is too large.",
            413,
          );
        }

        chunks.push(value);
      }

      const form =
        new URLSearchParams(
          Buffer.concat(
            chunks,
          ).toString(
            "utf8",
          ),
        );

      checkCsrf(
        env,
        user.id,
        path,
        form.get("csrf") ?? "",
      );

      const values =
        parseForm(
          entity,
          form,
        );

      const id =
        form.get("id") ?? "";

      const revision =
        form.get("revision") ?? "";

      if (
        id &&
        (
          !/^[\da-f-]{36}$/i.test(id) ||
          !revision ||
          revision.length > 40
        )
      ) {
        throw new AdminError(
          "Invalid record revision.",
        );
      }

      const recordId =
        await saveRecord(
          db,
          entity,
          values,
          user.id,
          id,
          revision,
        );

      return page(
        "Saved",
        "",
        user.name,
        303,
        {
          Location:
            `${path}?id=${encodeURIComponent(
              recordId,
            )}&saved=1`,
        },
      );
    }

    /*
     * REPORT PAGES
     */
    if (
      view ===
      "finance"
    ) {
      return await finance(
        db,
        url,
        user.name,
      );
    }

    if (
      view ===
      "activity"
    ) {
      return await activity(
        db,
        url,
        user.name,
      );
    }

    if (!entity) {
      return await dashboard(
        db,
        user.name,
      );
    }

    /*
     * CUSTOMER / SHIPMENT ROUTES
     */
    const id =
      url.searchParams.get(
        "id",
      );

    const edit =
      url.searchParams.get(
        "edit",
      ) === "1";

    const add =
      url.searchParams.get(
        "new",
      ) === "1";

    let record: RecordData = {};

    if (id) {
      if (
        !/^[\da-f-]{36}$/i.test(
          id,
        )
      ) {
        throw new AdminError(
          "Invalid record ID.",
        );
      }

      const found =
        await db
          .prepare(
            `SELECT * FROM ${entity} WHERE id = ?`,
          )
          .bind(id)
          .first<RecordData>();

      if (!found) {
        throw new AdminError(
          "Record not found.",
          404,
        );
      }

      record =
        found;
    }

    const title =
      entity ===
      "customers"
        ? "Customers"
        : "Shipments";

    const notice =
      url.searchParams.get(
        "saved",
      ) === "1"
        ? '<p class="notice" role="status">Changes saved.</p>'
        : "";

    /*
     * ADD / EDIT
     */
    if (
      add ||
      edit
    ) {
      if (
        edit &&
        !id
      ) {
        throw new AdminError(
          "Choose a record to edit.",
        );
      }

      let fields =
        "";

      /*
       * CUSTOMER FORM
       */
      if (
        entity ===
        "customers"
      ) {
        fields =
          input(
            "customer_code",
            "Account number",
            record,
            "text",
            true,
            40,
          ) +
          input(
            "full_name",
            "Full name",
            record,
            "text",
            true,
          ) +
          input(
            "company_name",
            "Company",
            record,
          ) +
          input(
            "mobile",
            "Mobile",
            record,
            "tel",
            true,
            40,
          ) +
          input(
            "email",
            "Email",
            record,
            "email",
            false,
            254,
          ) +
          `<label class="wide">
            Address
            <textarea
              name="address"
              maxlength="1000"
            >${esc(
              record.address,
            )}</textarea>
          </label>

          <label class="wide">
            Notes
            <textarea
              name="notes"
              maxlength="4000"
            >${esc(
              record.notes,
            )}</textarea>
          </label>`;
      } else {
        /*
         * SHIPMENT FORM
         */
        const customerSearch =
          (
            url.searchParams.get(
              "customer_search",
            ) ?? ""
          ).trim();

        if (
          customerSearch.length >
          160
        ) {
          throw new AdminError(
            "Search is too long.",
          );
        }

        const selectedCustomer =
          String(
            record.customer_id ??
            url.searchParams.get(
              "customer_id",
            ) ??
            "",
          );

        /*
         * CUSTOMER PICKER
         *
         * Always show customers.
         * If a search is entered,
         * narrow the list.
         * Always include the selected
         * customer when editing.
         */
        const result =
          await db
            .prepare(
              `
              SELECT
                id,
                customer_code,
                full_name,
                company_name,
                mobile,
                email
              FROM customers
              WHERE
                (
                  ? = ''

                  OR instr(
                    lower(
                      COALESCE(
                        customer_code,
                        ''
                      )
                    ),
                    lower(?)
                  ) > 0

                  OR instr(
                    lower(
                      COALESCE(
                        full_name,
                        ''
                      )
                    ),
                    lower(?)
                  ) > 0

                  OR instr(
                    lower(
                      COALESCE(
                        company_name,
                        ''
                      )
                    ),
                    lower(?)
                  ) > 0

                  OR instr(
                    COALESCE(
                      mobile,
                      ''
                    ),
                    ?
                  ) > 0

                  OR instr(
                    lower(
                      COALESCE(
                        email,
                        ''
                      )
                    ),
                    lower(?)
                  ) > 0
                )

                OR (
                  ? != ''
                  AND id = ?
                )

              ORDER BY
                CASE
                  WHEN id = ?
                  THEN 0
                  ELSE 1
                END,
                full_name,
                customer_code

              LIMIT 50
              `,
            )
            .bind(
              customerSearch,
              customerSearch,
              customerSearch,
              customerSearch,
              customerSearch,
              customerSearch,
              selectedCustomer,
              selectedCustomer,
              selectedCustomer,
            )
            .all<RecordData>();

        const customerRows =
          result.results;

        fields =
          `<label class="wide">
            Customer *

            <select
              name="customer_id"
              required
            >
              <option value="">
                Choose an existing customer
              </option>

              ${customerRows
                .map(
                  (
                    customer,
                  ) =>
                    `<option
                      value="${esc(
                        customer.id,
                      )}"${
                        selectedCustomer ===
                        String(
                          customer.id,
                        )
                          ? " selected"
                          : ""
                      }
                    >${esc(
                      customer.customer_code,
                    )} — ${esc(
                      customer.full_name,
                    )}</option>`,
                )
                .join("")}
            </select>
          </label>`;

        /*
         * SHIPMENT IDENTITY
         */
        fields +=
          input(
            "tracking_number",
            "Tracking number",
            record,
            "text",
            true,
            60,
          ) +
          input(
            "cargo_code",
            "Legacy cargo code (optional)",
            record,
            "text",
            false,
            60,
          ) +
          select(
            "service_type",
            "Service type",
            record,
            [
              "Sea Freight",
              "Air Freight",
            ],
          ) +
          select(
            "china_warehouse",
            "Origin warehouse",
            record,
            warehouses,
          );

        /*
         * TRACKING DATES
         */
        fields +=
          input(
            "warehouse_received_date",
            "Warehouse received date",
            record,
            "date",
          ) +
          input(
            "departure_date",
            "Departure date",
            record,
            "date",
          );

        /*
         * SHIPPING DETAILS
         */
        fields +=
          input(
            "cbm",
            "CBM",
            record,
            "number",
            true,
          ) +
          input(
            "weight_kg",
            "Weight (kg)",
            record,
            "number",
            true,
          ) +
          select(
            "status",
            "Status",
            record,
            statuses,
          ) +
          input(
            "estimated_arrival",
            "Estimated arrival",
            record,
            "date",
          ) +
          input(
            "actual_arrival",
            "Actual arrival",
            record,
            "date",
          );

        /*
         * PUBLIC TRACKING REMARKS
         */
        fields +=
          `<label class="wide">
            Tracking remarks

            <textarea
              name="tracking_remarks"
              maxlength="2000"
              placeholder="Optional update visible in shipment tracking"
            >${esc(
              record.tracking_remarks,
            )}</textarea>
          </label>`;

        /*
         * FINANCIAL DETAILS
         */
        fields +=
          input(
            "shipping_charge",
            "KargoDoor freight charge (PHP)",
            record,
            "text",
            true,
            30,
          ) +
          input(
            "delivery_charge",
            "Delivery charge (PHP)",
            record,
            "text",
            true,
            30,
          ) +
          input(
            "nihao_cost",
            "Ni Hao freight cost (PHP; blank if unknown)",
            record,
            "text",
            false,
            30,
          ) +
          select(
            "payment_status",
            "Payment status",
            record,
            [
              "Unpaid",
              "Partial",
              "Paid",
            ],
          );
      }

      /*
       * CUSTOMER SEARCH
       */
      const picker =
        entity ===
        "shipments"
          ? `
            <section>
              <form
                method="get"
                action="${path}"
                class="search"
              >
                ${
                  id
                    ? hidden(
                        "id",
                        id,
                      ) +
                      hidden(
                        "edit",
                        "1",
                      )
                    : hidden(
                        "new",
                        "1",
                      )
                }

                ${
                  record.customer_id
                    ? hidden(
                        "customer_id",
                        record.customer_id,
                      )
                    : url.searchParams.get(
                          "customer_id",
                        )
                      ? hidden(
                          "customer_id",
                          url.searchParams.get(
                            "customer_id",
                          ),
                        )
                      : ""
                }

                <label>
                  Find customer by account number, name, company, mobile or email

                  <input
                    name="customer_search"
                    maxlength="160"
                    value="${esc(
                      url.searchParams.get(
                        "customer_search",
                      ) ?? "",
                    )}"
                  >
                </label>

                <button
                  type="submit"
                >
                  Find customer
                </button>
              </form>

              <p class="muted">
                Customers are shown automatically below.
                Use search to narrow the list.

                <a
                  href="/admin/customers?new=1"
                >
                  Add a customer
                </a>
              </p>
            </section>
          `
          : "";

      return page(
        `${
          id
            ? "Edit"
            : "Add"
        } ${
          entity ===
          "customers"
            ? "customer"
            : "shipment"
        }`,
        `
          ${picker}

          <section>
            <form
              method="post"
              action="${path}"
            >
              ${hidden(
                "csrf",
                csrfToken(
                  env,
                  user.id,
                  path,
                ),
              )}

              ${hidden(
                "id",
                id ?? "",
              )}

              ${hidden(
                "revision",
                record.updated_at ??
                  "",
              )}

              <div class="grid">
                ${fields}
              </div>

              ${
                entity ===
                "shipments"
                  ? `
                    <p class="muted">
                      Tracking number is the unique public shipment identifier.
                      Legacy cargo code is optional and is retained only for older records.
                    </p>
                  `
                  : ""
              }

              <p class="muted">
                * Required. Optional blank
                values clear the saved field.
              </p>

              <div class="actions">
                <button
                  type="submit"
                >
                  Save ${
                    entity ===
                    "customers"
                      ? "customer"
                      : "shipment"
                  }
                </button>

                <a
                  href="${path}${
                    id
                      ? `?id=${esc(
                          id,
                        )}`
                      : ""
                  }"
                >
                  Cancel
                </a>
              </div>
            </form>
          </section>
        `,
        user.name,
      );
    }

    /*
     * RECORD DETAILS
     */
    if (id) {
      let customer =
        "";

      if (
        entity ===
        "shipments"
      ) {
        const foundCustomer =
          await db
            .prepare(
              `
              SELECT
                customer_code,
                full_name
              FROM customers
              WHERE id = ?
              `,
            )
            .bind(
              record.customer_id,
            )
            .first<RecordData>();

        customer =
          `<p>
            Customer:
            <a
              href="/admin/customers?id=${esc(
                record.customer_id,
              )}"
            >
              ${esc(
                foundCustomer?.customer_code,
              )}
              —
              ${esc(
                foundCustomer?.full_name,
              )}
            </a>
          </p>`;
      }

      const details =
        schemaKeys[entity]
          .filter(
            (key) =>
              key !==
              "customer_id",
          )
          .concat([
            "created_at",
            "updated_at",
          ])
          .map(
            (key) => {
              const monetary =
                [
                  "shipping_charge",
                  "delivery_charge",
                  "nihao_cost",
                ].includes(
                  key,
                );

              const value =
                monetary
                  ? record[
                        key
                      ] ===
                      null
                    ? "Not entered"
                    : pesos(
                        record[
                          key
                        ],
                      )
                  : esc(
                      record[
                        key
                      ],
                    ) ||
                    "—";

              return `
                <dt>
                  ${esc(
                    labels[
                      key
                    ] ??
                      key.replaceAll(
                        "_",
                        " ",
                      ),
                  )}
                </dt>

                <dd>
                  ${value}
                </dd>
              `;
            },
          )
          .join("");

      const margin =
        entity ===
        "shipments"
          ? `
            <dt>
              Freight margin
            </dt>

            <dd>
              ${
                record.nihao_cost ===
                null
                  ? "Enter Ni Hao cost to calculate"
                  : pesos(
                      Number(
                        record.shipping_charge,
                      ) -
                        Number(
                          record.nihao_cost,
                        ),
                    )
              }
            </dd>
          `
          : "";

      const relatedLinks =
        entity ===
        "customers"
          ? `
            <a
              href="/admin/shipments?customer_id=${esc(
                id,
              )}"
            >
              View shipments
            </a>

            <a
              href="/admin/shipments?new=1&customer_id=${esc(
                id,
              )}"
            >
              Add shipment
            </a>
          `
          : `
            <a
              href="/admin/invoices?new=1&shipment_id=${esc(
                id,
              )}"
            >
              Create or view invoice
            </a>
          `;

      return page(
        title,
        `
          ${notice}

          <section>
            ${customer}

            <dl>
              ${details}
              ${margin}
            </dl>

            <div class="actions">
              <a
                class="button"
                href="${path}?id=${esc(
                  id,
                )}&edit=1"
              >
                Edit ${
                  entity ===
                  "customers"
                    ? "customer"
                    : "shipment"
                }
              </a>

              ${relatedLinks}

              <a
                href="/admin/activity?entity_type=${entity}&entity_id=${esc(
                  id,
                )}"
              >
                View activity
              </a>
            </div>
          </section>
        `,
        user.name,
      );
    }

    /*
     * SEARCH / LIST
     */
    const q =
      (
        url.searchParams.get(
          "q",
        ) ?? ""
      ).trim();

    const status =
      url.searchParams.get(
        "status",
      ) ?? "";

    const customer =
      url.searchParams.get(
        "customer_id",
      ) ?? "";

    const pageNumber =
      Number(
        url.searchParams.get(
          "page",
        ) ?? 1,
      );

    if (
      q.length > 160 ||
      (
        status &&
        !statuses.includes(
          status as (
            typeof statuses
          )[number],
        )
      ) ||
      !Number.isSafeInteger(
        pageNumber,
      ) ||
      pageNumber < 1 ||
      pageNumber >
        100_000
    ) {
      throw new AdminError(
        "Invalid search or filter.",
      );
    }

    const offset =
      (pageNumber - 1) *
      25;

    let rows:
      RecordData[];

    if (
      entity ===
      "customers"
    ) {
      rows =
        (
          await db
            .prepare(
              `
              SELECT
                id,
                customer_code,
                full_name,
                mobile,
                email
              FROM customers
              WHERE
                instr(
                  lower(customer_code),
                  lower(?)
                ) > 0

                OR instr(
                  lower(full_name),
                  lower(?)
                ) > 0

                OR instr(
                  mobile,
                  ?
                ) > 0

                OR instr(
                  lower(
                    COALESCE(
                      company_name,
                      ''
                    )
                  ),
                  lower(?)
                ) > 0

                OR instr(
                  lower(
                    COALESCE(
                      email,
                      ''
                    )
                  ),
                  lower(?)
                ) > 0

              ORDER BY
                created_at DESC,
                id

              LIMIT 26
              OFFSET ?
              `,
            )
            .bind(
              q,
              q,
              q,
              q,
              q,
              offset,
            )
            .all<RecordData>()
        ).results;
    } else {
      rows =
        (
          await db
            .prepare(
              `
              SELECT
                s.id,
                s.tracking_number,
                s.cargo_code,
                c.full_name,
                s.status,
                s.cbm,
                s.weight_kg
              FROM shipments s
              JOIN customers c
                ON c.id =
                   s.customer_id
              WHERE
                (
                  instr(
                    lower(
                      s.tracking_number
                    ),
                    lower(?)
                  ) > 0

                  OR

                  instr(
                    lower(
                      COALESCE(
                        s.cargo_code,
                        ''
                      )
                    ),
                    lower(?)
                  ) > 0

                  OR

                  instr(
                    lower(
                      c.full_name
                    ),
                    lower(?)
                  ) > 0
                )

                AND (
                  ? = ''
                  OR s.status = ?
                )

                AND (
                  ? = ''
                  OR s.customer_id = ?
                )

              ORDER BY
                s.created_at DESC,
                s.id

              LIMIT 26
              OFFSET ?
              `,
            )
            .bind(
              q,
              q,
              q,
              status,
              status,
              customer,
              customer,
              offset,
            )
            .all<RecordData>()
        ).results;
    }

    const keys =
      entity ===
      "customers"
        ? [
            "customer_code",
            "full_name",
            "mobile",
            "email",
          ]
        : [
            "tracking_number",
            "cargo_code",
            "full_name",
            "status",
            "cbm",
            "weight_kg",
          ];

    const table =
      rows.length
        ? `
          <div class="table">
            <table>
              <thead>
                <tr>
                  ${keys
                    .map(
                      (key) =>
                        `<th>${esc(
                          labels[
                            key
                          ] ??
                            key.replaceAll(
                              "_",
                              " ",
                            ),
                        )}</th>`,
                    )
                    .join("")}

                  <th>
                    Details
                  </th>
                </tr>
              </thead>

              <tbody>
                ${rows
                  .slice(
                    0,
                    25,
                  )
                  .map(
                    (row) =>
                      `<tr>
                        ${keys
                          .map(
                            (
                              key,
                            ) =>
                              `<td>${esc(
                                row[
                                  key
                                ],
                              ) || "—"}</td>`,
                          )
                          .join("")}

                        <td>
                          <a
                            href="${path}?id=${esc(
                              row.id,
                            )}"
                          >
                            View
                            <span
                              class="muted"
                            >
                              ${esc(
                                row[
                                  keys[
                                    0
                                  ]
                                ],
                              )}
                            </span>
                          </a>
                        </td>
                      </tr>`,
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        `
        : "<p>No matching records.</p>";

    const pageLink =
      (
        number:
          number,
      ) => {
        const params =
          new URLSearchParams(
            url.searchParams,
          );

        params.set(
          "page",
          String(
            number,
          ),
        );

        return `${path}?${esc(
          params.toString(),
        )}`;
      };

    return page(
      title,
      `
        ${notice}

        <section>
          <form
            method="get"
            action="${path}"
            class="search"
          >
            <label>
              Search ${entity}

              <input
                name="q"
                maxlength="160"
                value="${esc(
                  q,
                )}"
              >
            </label>

            ${
              customer
                ? hidden(
                    "customer_id",
                    customer,
                  )
                : ""
            }

            ${
              entity ===
              "shipments"
                ? `
                  <label>
                    Status

                    <select
                      name="status"
                    >
                      <option
                        value=""
                      >
                        All statuses
                      </option>

                      ${statuses
                        .map(
                          (
                            value,
                          ) =>
                            `<option${
                              status ===
                              value
                                ? " selected"
                                : ""
                            }>${esc(
                              value,
                            )}</option>`,
                        )
                        .join("")}
                    </select>
                  </label>
                `
                : ""
            }

            <button
              type="submit"
            >
              Search
            </button>

            <a
              href="${path}"
            >
              Clear
            </a>
          </form>

          <div class="actions">
            <a
              class="button"
              href="${path}?new=1"
            >
              Add ${
                entity ===
                "customers"
                  ? "customer"
                  : "shipment"
              }
            </a>
          </div>
        </section>

        <section>
          ${table}

          <div class="actions">
            ${
              pageNumber >
              1
                ? `<a
                    href="${pageLink(
                      pageNumber -
                        1,
                    )}"
                  >
                    Previous
                  </a>`
                : ""
            }

            <span>
              Page ${pageNumber}
            </span>

            ${
              rows.length >
              25
                ? `<a
                    href="${pageLink(
                      pageNumber +
                        1,
                    )}"
                  >
                    Next
                  </a>`
                : ""
            }
          </div>
        </section>
      `,
      user.name,
    );
  } catch (error) {
    const known =
      error instanceof
      AdminError;

    const invalid =
      error instanceof
      ZodError;

    if (
      !known &&
      !invalid
    ) {
      console.error(
        "KargoDoor admin request failed",
        {
          path:
            new URL(
              request.url,
            ).pathname,

          error:
            error instanceof
            Error
              ? error.message
              : "Unknown error",
        },
      );
    }

    const message =
      known
        ? error.message
        : invalid
          ? error.issues
              .map(
                (
                  issue,
                ) =>
                  `${issue.path.join(
                    " ",
                  )}: ${issue.message}`,
              )
              .join(
                "; ",
              )
          : "Unable to complete this request. Please try again. If it continues, ask the system owner to check the admin configuration.";

    const status =
      known
        ? error.status
        : invalid
          ? 400
          : 500;

    return page(
      "Admin",
      `
        <p
          class="notice"
          role="alert"
        >
          ${esc(
            message,
          )}
        </p>

        <p>
          For form errors, use your
          browser’s Back button to
          correct the values. For a
          conflicting edit, reload
          the record first.
        </p>

        <a
          href="/admin/dashboard"
        >
          Return to admin
        </a>
      `,
      "",
      status,
      status ===
          401 &&
        localChallenge
        ? {
            "WWW-Authenticate":
              'Basic realm="KargoDoor local admin", charset="UTF-8"',
          }
        : {},
    );
  }
}
