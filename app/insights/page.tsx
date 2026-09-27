import Link from "next/link";
import { ClipboardList, Clock3, PackageOpen, Ship } from "lucide-react";
import { Footer, Header } from "@/components/site-chrome";
import { insights } from "@/lib/insights";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { AdminEnv } from "@/lib/admin/security";
import { excerpt, publishedInsights } from "@/lib/published-insights";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata(
  "Insights | China to Philippines Shipping Guides | KargoDoor PH",
  "Easy-to-understand guides about importing from China to the Philippines, sea freight, air freight, shipping timelines, packaging, and quotations.",
  "/insights",
);

const icons = {
  package: PackageOpen,
  ship: Ship,
  clock: Clock3,
  clipboard: ClipboardList,
};

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const { env: cf } = await getCloudflareContext();
  const managed = await publishedInsights((cf as unknown as AdminEnv).ADMIN_DB);
  return (
    <div className="kd-site-shell">
      <Header />
      <main className="kd-insights-page">
        <section className="kd-insights-hero" aria-labelledby="insights-title">
          <div className="kd-container">
            <p className="kd-eyebrow">KARGODOOR PH</p>
            <h1 id="insights-title">Insights</h1>
            <p>
              Easy-to-understand guides tungkol sa importing from China to the
              Philippines, cargo preparation, at shipping options.
            </p>
          </div>
        </section>

        <section className="kd-insights-list" aria-label="KargoDoor PH guides">
          <div className="kd-container">
            {insights.map((insight) => {
              const Icon = icons[insight.icon];
              return (
                <article className="kd-insight-card" key={insight.slug}>
                  <div className="kd-insight-card-copy">
                    <p className="kd-insight-card-label">INSIGHTS GUIDE</p>
                    <h2>
                      <Link href={`/insights/${insight.slug}`}>{insight.title}</Link>
                    </h2>
                    <p>{insight.description}</p>
                    <Link className="kd-text-link kd-insight-read-more" href={`/insights/${insight.slug}`}>
                      READ THE GUIDE →
                    </Link>
                  </div>
                  <div className={`kd-insight-art kd-insight-art-${insight.icon}`} aria-hidden="true">
                    <Icon />
                  </div>
                </article>
              );
            })}
            {managed.map((insight) => (
              <article className="kd-insight-card" key={insight.slug}>
                <div className="kd-insight-card-copy">
                  <p className="kd-insight-card-label">INSIGHTS GUIDE</p>
                  <h2><Link href={`/insights/${insight.slug}`}>{insight.title}</Link></h2>
                  <p>{excerpt(insight.body)}</p>
                  <Link className="kd-text-link kd-insight-read-more" href={`/insights/${insight.slug}`}>READ THE GUIDE →</Link>
                </div>
                {insight.coverImageKey ? <img className="kd-insight-cover" src={`/api/insights/images/${insight.coverImageKey}`} alt="" /> : <div className="kd-insight-art" aria-hidden="true">KARGO<br />DOOR</div>}
              </article>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
