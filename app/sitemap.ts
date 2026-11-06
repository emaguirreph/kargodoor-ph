import type { MetadataRoute } from "next";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { AdminEnv } from "@/lib/admin/security";
import { insights } from "@/lib/insights";
import { publishedInsights } from "@/lib/published-insights";
import { siteUrl } from "@/lib/seo";

// Built on each request so articles published from the admin show up right away.
export const dynamic = "force-dynamic";

const pages: Array<[path: string, changeFrequency: "weekly" | "monthly", priority: number]> = [
  ["/", "weekly", 1],
  ["/shipping-from-china-to-philippines", "weekly", 1],
  ["/rates-calculator", "weekly", 0.9],
  ["/services", "monthly", 0.9],
  ["/how-it-works", "monthly", 0.9],
  ["/faq", "monthly", 0.8],
  ["/contact-us", "monthly", 0.8],
  ["/insights", "weekly", 0.8],
  ["/track", "monthly", 0.6],
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = pages.map(([path, changeFrequency, priority]) => ({
    url: siteUrl + path,
    changeFrequency,
    priority,
  }));

  for (const insight of insights) {
    entries.push({
      url: `${siteUrl}/insights/${insight.slug}`,
      lastModified: insight.publishedAt,
      changeFrequency: "monthly",
      priority: 0.7,
    });
  }

  try {
    const { env } = await getCloudflareContext({ async: true });
    const managed = await publishedInsights((env as unknown as AdminEnv).ADMIN_DB);
    for (const insight of managed) {
      if (insights.some((i) => i.slug === insight.slug)) continue;
      entries.push({
        url: `${siteUrl}/insights/${insight.slug}`,
        lastModified: insight.publishedAt,
        changeFrequency: "monthly",
        priority: 0.7,
      });
    }
  } catch {
    // The database is not reachable (e.g. during a local build): list the built-in pages only.
  }

  return entries;
}
