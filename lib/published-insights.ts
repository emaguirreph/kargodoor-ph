import type { D1Database } from "@cloudflare/workers-types";

export type PublishedInsight = {
  slug: string;
  title: string;
  body: string;
  coverImageKey: string | null;
  publishedAt: string;
};

type Row = { slug: string; title: string; body: string; cover_image_key: string | null; published_at: string };
const map = (row: Row): PublishedInsight => ({ slug: row.slug, title: row.title, body: row.body, coverImageKey: row.cover_image_key, publishedAt: row.published_at });

export async function publishedInsights(db: D1Database) {
  const rows = await db.prepare("SELECT slug,title,body,cover_image_key,published_at FROM insights WHERE status='Published' ORDER BY published_at DESC").all<Row>();
  return rows.results.map(map);
}

export async function publishedInsight(db: D1Database, slug: string) {
  const row = await db.prepare("SELECT slug,title,body,cover_image_key,published_at FROM insights WHERE status='Published' AND slug=?").bind(slug).first<Row>();
  return row ? map(row) : undefined;
}

export const excerpt = (body: string, length = 180) => {
  const compact = body.replace(/\s+/g, " ").trim();
  return compact.length > length ? `${compact.slice(0, length).trimEnd()}…` : compact;
};
