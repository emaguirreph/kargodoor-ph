import type {
  D1Database,
  D1PreparedStatement,
} from "@cloudflare/workers-types";
import { randomUUID } from "node:crypto";
import { AdminError } from "./security";
import type { Entity, RecordData } from "./validation";

export async function generatedIdentifier(db: D1Database, entity: Entity, values: RecordData) {
  const field = entity === "customers" ? "customer_code" : "tracking_number";
  if (entity === "shipments" && values.status === "Awaiting Supplier Dispatch") return undefined;
  if (values[field]) return undefined;
  const prefix = entity === "customers" ? "KDOOR" : values.service_type === "Air Freight" ? "KDAIR" : "KDSEA";
  const pattern = entity === "customers"
    ? /^KDOOR-?(\d+)$/i
    : values.service_type === "Air Freight"
      ? /^KD-?AIR-?(\d+)$/i
      : /^KD-?SEA-?(\d+)$/i;
  const rows = (await db.prepare(`SELECT ${field} FROM ${entity}`).all<RecordData>()).results;
  const highest = rows.reduce((max, row) => {
    const match = pattern.exec(String(row[field] ?? ""));
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `${prefix}${String(highest + 1).padStart(entity === "customers" ? 4 : 6, "0")}`;
}

export async function saveRecord(
  db: D1Database,
  entity: Entity,
  values: RecordData,
  user: string,
  id: string,
  revision: string,
  attempt = 0,
) {
  const existing = id
    ? await db
        .prepare(`SELECT * FROM ${entity} WHERE id = ?`)
        .bind(id)
        .first<RecordData>()
    : null;
  if (id && !existing) throw new AdminError("Record not found.", 404);
  if (existing && existing.updated_at !== revision)
    throw new AdminError(
      "Another admin changed this record. Reload it before saving.",
      409,
    );
  const generatedField = entity === "customers" ? "customer_code" : "tracking_number";
  const generated = !existing ? await generatedIdentifier(db, entity, values) : undefined;
  const persistedValues: RecordData = existing
    ? { ...values, [generatedField]: existing[generatedField] }
    : generated
      ? { ...values, [generatedField]: generated }
      : values;
  const recordId = id || randomUUID();
  const now = new Date(
    Math.max(
      Date.now(),
      existing ? Date.parse(String(existing.updated_at)) + 1 : 0,
    ),
  ).toISOString();
  const next: RecordData = {
    ...persistedValues,
    id: recordId,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  const statements: D1PreparedStatement[] = [];
  const changed = existing
    ? Object.keys(persistedValues).filter((key) => persistedValues[key] !== existing[key])
    : [];
  if (existing && !changed.length) return recordId;
  const logs = [
    { action: existing ? "update" : "create", old: existing, new: next },
    ...changed
      .filter((key) =>
        ["status", "cbm", "weight_kg", "shipping_charge", "delivery_charge", "nihao_cost"].includes(key),
      )
      .map((key) => ({
        action: `change_${key}`,
        old: { [key]: existing![key] },
        new: { [key]: persistedValues[key] },
      })),
  ];
  if (!existing) {
    const keys = Object.keys(next);
    statements.push(
      db
        .prepare(
          `INSERT INTO ${entity} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
        )
        .bind(...keys.map((k) => next[k])),
    );
  }
  // D1 batch is a transaction. Conditional logs and the update see the same revision.
  for (const log of logs)
    statements.push(
      db
        .prepare(
          `INSERT INTO activity_log (id,admin_user_id,action,entity_type,entity_id,old_value,new_value,notes,created_at) SELECT ?,?,?,?,?,?,?,NULL,? ${existing ? `WHERE EXISTS (SELECT 1 FROM ${entity} WHERE id = ? AND updated_at = ?)` : ""}`,
        )
        .bind(
          randomUUID(),
          user,
          log.action,
          entity,
          recordId,
          log.old ? JSON.stringify(log.old) : null,
          JSON.stringify(log.new),
          now,
          ...(existing ? [recordId, revision] : []),
        ),
    );
  if (existing) {
    const keys = Object.keys(persistedValues);
    statements.push(
      db
        .prepare(
          `UPDATE ${entity} SET ${keys.map((key) => `${key} = ?`).join(",")}, updated_at = ? WHERE id = ? AND updated_at = ?`,
        )
        .bind(...keys.map((k) => persistedValues[k]), now, recordId, revision),
    );
  }
  try {
    const result = await db.batch(statements);
    if (existing && !result.at(-1)?.meta.changes)
      throw new AdminError(
        "Another admin changed this record. Reload it before saving.",
        409,
      );
  } catch (error) {
    if (error instanceof AdminError) throw error;
    const message = String(error);
    if (!existing && generated && message.includes("UNIQUE constraint")) {
      if (attempt < 7) return saveRecord(db, entity, values, user, id, revision, attempt + 1);
      throw new AdminError("Unable to reserve an identifier. Please try again.", 409);
    }
    if (message.includes("UNIQUE constraint"))
      throw new AdminError(
        "This account number or tracking number already exists.",
        409,
      );
    if (message.includes("FOREIGN KEY"))
      throw new AdminError(
        "Choose an existing customer. A shipment with an invoice cannot be reassigned to a different customer.",
        409,
      );
    throw error;
  }
  return recordId;
}

export async function deleteRecord(
  db: D1Database,
  entity: Entity,
  id: string,
  revision: string,
  user: string,
) {
  if (entity !== "customers" && entity !== "shipments") {
    throw new AdminError("Deletion is not supported for this record.");
  }

  const existing = await db
    .prepare(`SELECT * FROM ${entity} WHERE id = ?`)
    .bind(id)
    .first<RecordData>();

  if (!existing) {
    throw new AdminError("Record not found.", 404);
  }

  if (existing.updated_at !== revision) {
    throw new AdminError(
      "Another admin changed this record. Reload it before deleting.",
      409,
    );
  }

  const now = new Date().toISOString();

  try {
    const results = await db.batch([
      db
        .prepare(
          `INSERT INTO activity_log
          (id, admin_user_id, action, entity_type, entity_id, old_value, new_value, notes, created_at)
          SELECT ?, ?, 'delete', ?, ?, ?, NULL, NULL, ?
          WHERE EXISTS (
            SELECT 1 FROM ${entity}
            WHERE id = ? AND updated_at = ?
          )`,
        )
        .bind(
          randomUUID(),
          user,
          entity,
          id,
          JSON.stringify(existing),
          now,
          id,
          revision,
        ),
      db
        .prepare(
          `DELETE FROM ${entity}
           WHERE id = ? AND updated_at = ?`,
        )
        .bind(id, revision),
    ]);

    if (!results.at(-1)?.meta.changes) {
      throw new AdminError(
        "Another admin changed this record. Reload it before deleting.",
        409,
      );
    }
  } catch (error) {
    if (error instanceof AdminError) throw error;

    if (String(error).includes("FOREIGN KEY")) {
      throw new AdminError(
        entity === "customers"
          ? "This customer cannot be deleted because it has related records."
          : "This shipment cannot be deleted because it has related records, such as an invoice.",
        409,
      );
    }

    throw error;
  }
}
