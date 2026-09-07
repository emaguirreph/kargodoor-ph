import type {
  D1Database,
  D1PreparedStatement,
} from "@cloudflare/workers-types";
import { randomUUID } from "node:crypto";
import { AdminError } from "./security";
import type { Entity, RecordData } from "./validation";
export async function saveRecord(
  db: D1Database,
  entity: Entity,
  values: RecordData,
  user: string,
  id: string,
  revision: string,
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
  const recordId = id || randomUUID();
  const now = new Date(
    Math.max(
      Date.now(),
      existing ? Date.parse(String(existing.updated_at)) + 1 : 0,
    ),
  ).toISOString();
  const next: RecordData = {
    ...values,
    id: recordId,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  const statements: D1PreparedStatement[] = [];
  const changed = existing
    ? Object.keys(values).filter((key) => values[key] !== existing[key])
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
        new: { [key]: values[key] },
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
    const keys = Object.keys(values);
    statements.push(
      db
        .prepare(
          `UPDATE ${entity} SET ${keys.map((key) => `${key} = ?`).join(",")}, updated_at = ? WHERE id = ? AND updated_at = ?`,
        )
        .bind(...keys.map((k) => values[k]), now, recordId, revision),
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
    if (message.includes("UNIQUE constraint"))
      throw new AdminError(
        "This customer code or tracking number already exists.",
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
