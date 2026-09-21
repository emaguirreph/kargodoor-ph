import Link from "next/link";
import { ClipboardList, Clock3, PackageOpen, Ship } from "lucide-react";
import { Footer, Header } from "@/components/site-chrome";
import { insights } from "@/lib/insights";
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

export default function InsightsPage() {
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
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
