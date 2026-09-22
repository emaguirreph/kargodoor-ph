import { getCloudflareContext } from "@opennextjs/cloudflare";
import { ZodError } from "zod";

import {
  authenticate,
  AdminError,
  canonicalOrigin,
  adminOriginAllowed,
  csrfToken,
  checkCsrf,
  type AdminEnv,
  canMutateAdmin,
  canDeleteAdmin,
  requireAdminDelete,
  canManageStaffRecords,
  isRestrictedStaff,
  requireAdminMutation,
  requireOperationalAdmin,
} from "./security";

import {
  statuses,
  warehouses,
  schemaKeys,
  parseForm,
  type Entity,
  type RecordData,
} from "./validation";

import { financeDashboard } from "./finance-summary";
import { financeCsv } from "./finance-report";
import { expensesPage, mutateExpense } from "./expenses";
import { financeCashPage, mutateFinanceCash } from "./finance-cash";
import { saveRecord, archiveOrCancelRecord } from "./data";
import { page, esc, pesos, input, select, hidden } from "./ui";
import { dashboard, finance, activity, saveStaffFollowUp } from "./reports";
import { createPortal, disablePortal, portalFor, portalStatus, resetPortal } from "./customer-portal";
import { copyButton, copyScript, customerShippingInstructions, shipmentShippingInstructions } from "./shipping-instructions";
import { leadsPage } from "./leads";

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
  supplier_waybill_number: "Supplier waybill number",
  supplier_courier: "Supplier courier",
  verified_cbm: "Verified CBM",
  verified_weight_kg: "Verified weight (kg)",

  created_at: "Created",
  updated_at: "Updated",
};

function validateFormOrigin(
  request: Request,
  env: AdminEnv,
) {
  const requestOrigin = new URL(request.url).origin;

  if (!adminOriginAllowed(env, requestOrigin)) {
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

  if (submittedOrigin !== requestOrigin) {
    throw new AdminError(
      "Cross-site form submission rejected.",
      403,
    );
  }
}

export async function handleAdmin(
  request: Request,
  view?: Entity | "finance" | "finance/expenses" | "finance/cash" | "finance/export" | "activity" | "leads",
) {
  let localChallenge = false;

  try {
    const { env: cf } =
      await getCloudflareContext();

    const env =
      cf as unknown as AdminEnv;

    localChallenge = env.ADMIN_LOCAL_DEV === "true";

    const user =
      await authenticate(request, env);
    const canWrite = canMutateAdmin(user);
    const staff = isRestrictedStaff(user);

    const db = env.ADMIN_DB;
    const url = new URL(request.url);

    if (view === "leads") return await leadsPage(request, env);

    const entity =
      view === "customers" ||
      view === "shipments"
        ? view
        : undefined;

    const path = view
      ? `/admin/${view}`
      : "/admin/dashboard";

    if (staff && view !== "finance/expenses") {
      throw new AdminError("This account can access only Quotations and Expenses.", 403);
    }
    if (!canWrite && (view === "activity" || view === "finance/export")) {
      requireOperationalAdmin(user);
    }
    if (url.searchParams.has("archive")) {
      requireAdminDelete(user);
    }
    if (!canWrite && !staff && ["new", "edit"].some((key) => url.searchParams.has(key))) {
      if (!canWrite && !(staff && view === "finance/expenses")) requireAdminMutation(user);
    }

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
      requireAdminMutation(user);
      if (!entity && view !== "finance/expenses" && view !== "finance/cash" && view !== undefined) {
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

      const portalAction = form.get("action") ?? "";
      if (entity === "customers" && ["portal_create", "portal_reset", "portal_disable", "portal_reenable"].includes(portalAction)) {
        const allowed = new Set(["csrf", "action", "customer_id"]);
        for (const key of form.keys()) if (!allowed.has(key) || form.getAll(key).length !== 1) throw new AdminError("Unexpected or repeated form field.");
        const customerId = form.get("customer_id") ?? "";
        if (!/^[\da-f-]{36}$/i.test(customerId)) throw new AdminError("Invalid customer ID.");
        const customer = await db.prepare("SELECT email FROM customers WHERE id=?").bind(customerId).first<RecordData>();
        if (!customer) throw new AdminError("Record not found.", 404);
        if (portalAction === "portal_disable") { await disablePortal(db, customerId); return page("Saved", "", user.name, 303, { Location: `${path}?id=${customerId}&portal_saved=1` }); }
        const result = portalAction === "portal_create" ? await createPortal(db, customerId, customer.email) : await resetPortal(db, customerId, portalAction === "portal_reenable");
        return page("Customer account created", `<section><h2>Customer account created.</h2><p><strong>Login Email:</strong> ${esc(result.email)}</p><p><strong>Temporary Password:</strong> <code>${esc(result.password)}</code></p><p class="muted">Copy the temporary password now. It is shown only once and the customer must change it after first login.</p></section>`, user.name);
      }

      if (!entity && view === undefined) {
        const allowed = new Set(["csrf", "note"]);
        for (const key of form.keys()) {
          if (!allowed.has(key) || form.getAll(key).length !== 1)
            throw new AdminError("Unexpected or repeated form field.");
        }
        const note = (form.get("note") ?? "").trim();
        await saveStaffFollowUp(db, note, user);
        return page("Saved", "", user.name, 303, { Location: "/admin/dashboard?saved=1" });
      }

      if (view === "finance/expenses") {
        const outcome = await mutateExpense(db, form, user);
        return page("Saved", "", user.name, 303, { Location: `${path}?${outcome}=1` });
      }
      if (view === "finance/cash") {
        const outcome = await mutateFinanceCash(db, form);
        return page("Saved", "", user.name, 303, { Location: `${path}?${outcome}=1` });
      }

      const action = form.get("action") ?? "";

      if (action === "archive") {
        requireAdminDelete(user);

        const allowed = new Set([
          "csrf",
          "action",
          "id",
          "revision",
          "confirm",
        ]);

        for (const key of form.keys()) {
          if (
            !allowed.has(key) ||
            form.getAll(key).length !== 1
          ) {
            throw new AdminError(
              "Unexpected or repeated form field.",
            );
          }
        }

        const deleteId =
          form.get("id") ?? "";

        const deleteRevision =
          form.get("revision") ?? "";

        if (
          !/^[\da-f-]{36}$/i.test(deleteId) ||
          !deleteRevision ||
          deleteRevision.length > 40
        ) {
          throw new AdminError(
            "Invalid record revision.",
          );
        }

        if (form.get("confirm") !== "yes") {
          throw new AdminError(
            "Confirm the archive or cancellation.",
          );
        }

        await archiveOrCancelRecord(
          db,
          entity!,
          deleteId,
          deleteRevision,
          user.id,
        );

        return page(
          "Lifecycle updated",
          "",
          user.name,
          303,
          {
            Location: `${path}?lifecycle=1`,
          },
        );
      }

      const values =
        parseForm(
          entity!,
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
          entity!,
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

    if (view === "finance/expenses") {
      return await expensesPage(db, url, user, csrfToken(env, user.id, path), canManageStaffRecords(user));
    }
    if (view === "finance/cash") {
      return await financeCashPage(db, url, user.name, csrfToken(env, user.id, path), canWrite);
    }

    if (view === "finance/export") {
      return await financeCsv(db, url);
    }
    /*
     * REPORT PAGES
     */
    if (
      view ===
      "finance"
    ) {
      if (url.searchParams.get("report") === "freight" || ["q", "missing", "page"].some((key) => url.searchParams.has(key))) {
        return await finance(db, url, user.name, canWrite);
      }
      return await financeDashboard(db, url, user.name, undefined, canWrite);
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
      return await dashboard(db, user, csrfToken(env, user.id, path), canWrite);
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
          `<p class="wide muted"><strong>Account Number</strong><br>${id ? esc(record.customer_code) : "Automatically generated when saved."}</p>` +
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
          `<p class="wide muted"><strong>Tracking Number</strong><br>${id ? esc(record.tracking_number || "Not assigned at supplier intake") : "Automatically generated after supplier dispatch."}</p>` +
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

        fields +=
          input(
            "supplier_waybill_number",
            "Supplier waybill number",
            record,
            "text",
            false,
            120,
          ) +
          input(
            "supplier_courier",
            "Supplier courier",
            record,
            "text",
            false,
            120,
          ) +
          input(
            "verified_cbm",
            "Verified CBM",
            record,
            "number",
            false,
          ) +
          input(
            "verified_weight_kg",
            "Verified weight (kg)",
            record,
            "number",
            false,
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

                ${canWrite ? `<a
                  href="/admin/customers?new=1"
                >
                  Add a customer
                </a>` : ""}
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
        200,
        {},
        canWrite,
      );
    }

    /*
     * RECORD DETAILS
     */
    if (id) {
      const deleting =
        url.searchParams.get("archive") === "1";

      if (deleting) {
        requireAdminDelete(user);

        const recordName =
          entity === "customers"
            ? String(
                record.full_name ??
                record.customer_code ??
                "this customer",
              )
            : String(
                record.tracking_code ??
                "this shipment",
              );

        return page(
          `Archive ${
            entity === "customers"
              ? "Customer"
              : "Shipment"
          }`,
          `
            <section>
              <h2>
                Confirm archive
              </h2>

              <p>
                Are you sure you want to archive
                <strong>${esc(recordName)}</strong>?
              </p>

              <p class="muted">
                Archived records are removed from normal lists but retained
                for audit history and related records.
              </p>

              <div class="actions">
                <form
                  method="post"
                  action="${path}"
                >
                  ${hidden(
                    "csrf",
                    csrfToken(env, user.id, path),
                  )}
                  ${hidden("action", "archive")}
                  ${hidden("id", id)}
                  ${hidden(
                    "revision",
                    String(record.updated_at ?? ""),
                  )}
                  ${hidden("confirm", "yes")}

                  <button type="submit">
                    Archive ${
                      entity === "customers"
                        ? "customer"
                        : "shipment"
                    }
                  </button>
                </form>

                <a
                  class="button"
                  href="${path}?id=${esc(id)}"
                >
                  Cancel
                </a>
              </div>
            </section>
          `,
          user.name,
          200,
          {},
          canWrite,
        );
      }

      let customer =
        "";
      let linkedCustomer: RecordData | null = null;

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
        linkedCustomer = foundCustomer;

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
            ${canWrite ? `
            <a
              href="/admin/shipments?new=1&customer_id=${esc(
                id,
              )}"
            >
              Add shipment
            </a>` : ""}
          `
          : canWrite ? `
            <a
              href="/admin/invoices?new=1&shipment_id=${esc(
                id,
              )}"
            >
              Create or view invoice
            </a>
          ` : "";

      const portal = entity === "customers" ? await portalFor(db, id) : null;
      const portalSection = entity === "customers" ? `<section><h2>Customer Portal Access</h2><dl><dt>Status</dt><dd>${portalStatus(portal)}</dd><dt>Login Email</dt><dd>${esc(portal?.login_email ?? record.email) || "—"}</dd></dl>${canWrite ? !portal ? `<form method="post" action="${path}">${hidden("csrf",csrfToken(env,user.id,path))}${hidden("action","portal_create")}${hidden("customer_id",id)}<button>Create Customer Account</button></form>` : !portal.enabled ? `<form method="post" action="${path}">${hidden("csrf",csrfToken(env,user.id,path))}${hidden("action","portal_reenable")}${hidden("customer_id",id)}<button>Re-enable Access</button></form>` : `<form method="post" action="${path}">${hidden("csrf",csrfToken(env,user.id,path))}${hidden("action","portal_reset")}${hidden("customer_id",id)}<button>Generate New Temporary Password</button></form><form method="post" action="${path}">${hidden("csrf",csrfToken(env,user.id,path))}${hidden("action","portal_disable")}${hidden("customer_id",id)}<button>Disable Access</button></form>` : ""}</section>` : "";
      const instructionId = `shipping-instructions-${id}`;
      const instructionMessage = entity === "customers"
        ? customerShippingInstructions({ name: record.full_name, customerCode: record.customer_code })
        : shipmentShippingInstructions({
            name: linkedCustomer?.full_name,
            customerCode: linkedCustomer?.customer_code,
            warehouse: record.china_warehouse,
            supplierCourier: record.supplier_courier,
            supplierWaybill: record.supplier_waybill_number,
          });
      const shippingInstructions = canWrite ? `<section><h2>Shipping Instructions</h2><p class="muted">Review the message, add the warehouse address, then copy it into Messenger, WhatsApp, or another customer chat.</p><textarea id="${instructionId}" readonly aria-label="Shipping instructions">${esc(instructionMessage)}</textarea><div class="actions">${copyButton(instructionId, "Send shipping instructions")}</div>${copyScript()}</section>` : "";

      const customerNotifications = entity === "shipments" && canWrite ? (() => {
        const customerName = String(linkedCustomer?.full_name || "Customer");
        const tracking = String(record.tracking_number || "");
        const cargoCode = String(record.cargo_code || linkedCustomer?.customer_code || "");
        const service = String(record.service_type || "");
        const warehouse = String(record.china_warehouse || "");
        const received = String(record.warehouse_received_date || "");
        const departure = String(record.departure_date || "");
        const arrival = String(record.actual_arrival || record.estimated_arrival || "");
        const paymentStatus = String(record.payment_status || "");
        const verifiedCbm = String(record.verified_cbm || record.cbm || "");
        const verifiedWeight = String(record.verified_weight_kg || record.weight_kg || "");

        const common = [
          tracking ? `Tracking Number: ${tracking}` : "",
          cargoCode ? `Cargo Code: ${cargoCode}` : "",
        ].filter(Boolean).join("\n");

        const messages: Array<[string, string, string[]]> = [
          ["cargo-received", "Cargo Received in China", [
            `Hi ${customerName}! Your KargoDoor cargo has been received at our ${warehouse || "China"} warehouse.`,
            "",
            common,
            received ? `Received: ${received}` : "",
            verifiedCbm ? `Verified CBM: ${verifiedCbm}` : "",
            verifiedWeight ? `Verified Weight: ${verifiedWeight} kg` : "",
            "",
            "We are checking the actual cargo details. Final CBM, weight, and applicable charges may be updated after warehouse verification.",
            "",
            "We’ll keep you updated on the next step."
          ]],

          ["shipment-confirmed", "Shipment Confirmed", [
            `Hi ${customerName}! Your KargoDoor shipment has been confirmed.`,
            "",
            common,
            service ? `Service: ${service}` : "",
            warehouse ? `Origin Warehouse: ${warehouse}` : "",
            "",
            "Your cargo is being prepared for shipment. We’ll keep you updated once it is in transit."
          ]],

          ["shipment-departed", "Shipment Departed China", [
            `Hi ${customerName}! Good news — your KargoDoor shipment has departed China.`,
            "",
            common,
            service ? `Service: ${service}` : "",
            departure ? `Departure Date: ${departure}` : "",
            "",
            "Your cargo is now on the way to the Philippines.",
            "Track here: https://www.kargodoorph.com/track"
          ]],

          ["shipment-in-transit", "Shipment In Transit", [
            `Hi ${customerName}! Your KargoDoor shipment is currently in transit to the Philippines.`,
            "",
            common,
            service ? `Service: ${service}` : "",
            arrival ? `Estimated Arrival: ${arrival}` : "",
            "",
            "We’ll send you another update once your cargo arrives in the Philippines.",
            "Track here: https://www.kargodoorph.com/track"
          ]],

          ["arrived-philippines", "Arrived in Philippines", [
            `Hi ${customerName}! Your KargoDoor shipment has arrived in the Philippines.`,
            "",
            common,
            "",
            "Your cargo will now proceed through the required arrival and clearance processing. We’ll keep you updated on the next step."
          ]],

          ["customs-processing", "Customs Processing", [
            `Hi ${customerName}! Your KargoDoor shipment is currently undergoing customs processing.`,
            "",
            common,
            "",
            "No action is required from you at this time unless we contact you for additional information. We’ll notify you once your cargo is cleared and ready for the next step."
          ]],

          ["payment-request", "Payment Request", [
            `Hi ${customerName}! Your KargoDoor shipment is ready for payment processing.`,
            "",
            common,
            paymentStatus ? `Current Payment Status: ${paymentStatus}` : "",
            "",
            "Please coordinate with us for your invoice and payment details. Once payment is confirmed, we’ll proceed with the next release or delivery step."
          ]],

          ["ready-for-pickup", "Ready for Pickup", [
            `Hi ${customerName}! Your KargoDoor shipment is ready for pickup.`,
            "",
            common,
            "",
            "Please coordinate with us before pickup so we can have your cargo ready for release."
          ]],

          ["out-for-delivery", "Out for Delivery", [
            `Hi ${customerName}! Your KargoDoor shipment is now out for delivery.`,
            "",
            common,
            "",
            "Please make sure someone is available to receive the cargo. We’ll update you once delivery is completed."
          ]],

          ["delivered", "Shipment Delivered", [
            `Hi ${customerName}! Your KargoDoor shipment has been delivered.`,
            "",
            common,
            arrival ? `Delivery / Arrival Date: ${arrival}` : "",
            "",
            "Thank you for trusting KargoDoor PH with your shipment.",
            "",
            "SOURCE • SHIP • RECEIVE"
          ]],

          ["feedback", "Feedback / Referral", [
            `Hi ${customerName}! Thank you for choosing KargoDoor PH.`,
            "",
            "We hope you had a smooth shipping experience with us. We’d love to hear your feedback.",
            "",
            "If you know a friend, business owner, online seller, or entrepreneur who imports from China, we’d also appreciate your referral.",
            "",
            "Thank you for supporting KargoDoor PH!"
          ]]
        ];

        const footer = [
          "",
          "—",
          "KargoDoor PH",
          "China to PH, made SIMPLE.",
          "",
          "+63 917 157 7370 | +63 908 889 0664",
          "support@kargodoorph.com",
          "www.kargodoorph.com"
        ];

        return `<section>
          <h2>Customer Notifications</h2>
          <p class="muted">Messages are personalized from this shipment. Review before sending. Copying a message does not change the shipment status.</p>
          ${messages.map(([key,title,lines]) => {
            const messageId = `customer-notification-${id}-${key}`;
            const body = [...lines.filter((line,index,all) => line !== "" || index === 0 || all[index-1] !== ""), ...footer].join("\n");
            return `<details class="customer-notification">
              <summary>${esc(title)}</summary>
              <textarea id="${esc(messageId)}" readonly aria-label="${esc(title)} customer message" style="min-height:260px;white-space:pre-wrap">${esc(body)}</textarea>
              <div class="actions">${copyButton(messageId, `Copy ${title}`)}</div>
            </details>`;
          }).join("")}
          ${copyScript()}
        </section>`;
      })() : "";


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
              ${canWrite ? `<a
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
              </a>` : ""}

              ${canDeleteAdmin(user) ? `<a
                class="button"
                href="${path}?id=${esc(
                  id,
                )}&archive=1"
              >
                ${entity === "customers" ? "Archive customer" : "Archive shipment"}
              </a>` : ""}

              ${relatedLinks}

              ${canWrite ? `<a
                href="/admin/activity?entity_type=${entity}&entity_id=${esc(
                  id,
                )}"
              >
                View activity
              </a>` : ""}
            </div>
          </section>
          ${portalSection}
          ${shippingInstructions}
          ${customerNotifications}
        `,
        user.name,
        200,
        {},
        canWrite,
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
              WHERE archived_at IS NULL
                AND (
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
                )

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
      const shipmentStatusClause = status ? "AND s.status = ?" : "AND s.status != 'Cancelled'";
      const shipmentCustomerClause = customer ? "AND s.customer_id = ?" : "";
      const shipmentBindings = [q, q, q, ...(status ? [status] : []), ...(customer ? [customer] : []), offset];
      rows =
        (
          await db
            .prepare(
              `
              SELECT
                s.id,
                s.tracking_number,
                c.full_name,
                s.status,
                s.cbm,
                s.weight_kg
              FROM shipments s
              JOIN customers c
                ON c.id =
                   s.customer_id
              WHERE
                s.archived_at IS NULL
                AND (
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

                ${shipmentStatusClause}
                ${shipmentCustomerClause}

              ORDER BY
                s.created_at DESC,
                s.id

              LIMIT 26
              OFFSET ?
              `,
            )
            .bind(...shipmentBindings)
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

          ${canWrite ? `<div class="actions">
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
          </div>` : ""}
          </section>

        <details class="admin-collapsible"${entity === "shipments" ? " open" : ""}>
          <summary>${entity === "customers" ? "Customer records" : "Shipment records"}</summary>
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
        </details>
      `,
      user.name,
      200,
      {},
      canWrite,
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
