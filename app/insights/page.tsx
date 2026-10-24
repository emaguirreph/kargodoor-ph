import Link from "next/link";
import { PageHero, SiteShell } from "@/components/v5/chrome";
import { InsightArt } from "@/components/v5/insight-art";
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

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const { env: cf } = await getCloudflareContext();
  const managed = await publishedInsights((cf as unknown as AdminEnv).ADMIN_DB);
  const cards = [
    ...insights.map((insight) => ({ slug: insight.slug, title: insight.title, text: insight.description, icon: insight.icon, cover: undefined as string | undefined })),
    ...managed.map((insight) => ({ slug: insight.slug, title: insight.title, text: excerpt(insight.body), icon: "package" as const, cover: insight.coverImageKey ? `/api/insights/images/${insight.coverImageKey}` : undefined })),
  ];

  return (
    <SiteShell>
      <PageHero>
        <span className="pill"><i />KARGODOOR PH</span>
        <h1 id="insights-title">Insights</h1>
        <p className="lead">
          Easy-to-understand guides tungkol sa importing from China to the
          Philippines, cargo preparation, at shipping options.
        </p>
      </PageHero>

      <section className="band" style={{ paddingTop: 30 }} aria-label="KargoDoor PH guides">
        <div className="wrap">
          <div className="igrid rv-g">
            {cards.map((card, i) => (
              <Link className={`icard${i === 0 ? " feat" : ""}`} href={`/insights/${card.slug}`} key={card.slug}>
                <InsightArt icon={card.icon} cover={card.cover} />
                <div className="icopy">
                  <span className="ilabel">INSIGHTS GUIDE</span>
                  <h2>{card.title}</h2>
                  <p>{card.text}</p>
                  <span className="link-arr">READ THE GUIDE <span className="arr">→</span></span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
