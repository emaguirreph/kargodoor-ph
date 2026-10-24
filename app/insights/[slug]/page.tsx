import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHero, SiteShell } from "@/components/v5/chrome";
import { ArticleProgress } from "@/components/v5/article-progress";
import { getInsight, insights } from "@/lib/insights";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { AdminEnv } from "@/lib/admin/security";
import { excerpt, publishedInsight } from "@/lib/published-insights";
import { pageMetadata, siteUrl } from "@/lib/seo";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return insights.map(({ slug }) => ({ slug }));
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const insight = getInsight(slug);
  if (!insight) return pageMetadata("Insights | KargoDoor PH", "Shipping and importing guides from KargoDoor PH.", `/insights/${slug}`);
  return pageMetadata(insight.seoTitle, insight.description, `/insights/${insight.slug}`);
}

export default async function InsightArticlePage({ params }: Props) {
  const { slug } = await params;
  const insight = getInsight(slug);
  const { env: cf } = await getCloudflareContext();
  const managed = insight ? undefined : await publishedInsight((cf as unknown as AdminEnv).ADMIN_DB, slug);
  if (!insight && !managed) notFound();

  if (managed) {
    const publishedDate = new Intl.DateTimeFormat("en-PH", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${managed.publishedAt}T00:00:00+08:00`));
    return (
      <SiteShell>
        <ArticleProgress headings={[]} />
        <article>
          <ArticleHeader title={managed.title} date={publishedDate} dek={excerpt(managed.body, 240)} />
          <section className="band" style={{ paddingTop: 30 }}>
            <div className="abody single">
              <div className="acontent">
                {managed.coverImageKey && <img className="acover" src={`/api/insights/images/${managed.coverImageKey}`} alt="" />}
                <section>
                  {managed.body.split(/\n\s*\n/).filter(Boolean).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                </section>
                <QuotationCta />
              </div>
            </div>
          </section>
        </article>
      </SiteShell>
    );
  }

  if (!insight) notFound();

  const publishedDate = new Intl.DateTimeFormat("en-PH", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${insight.publishedAt}T00:00:00+08:00`));

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: insight.title,
    description: insight.description,
    datePublished: insight.publishedAt,
    dateModified: insight.publishedAt,
    mainEntityOfPage: `${siteUrl}/insights/${insight.slug}`,
    author: { "@type": "Organization", name: "KargoDoor PH" },
    publisher: { "@type": "Organization", name: "KargoDoor PH" },
  };

  return (
    <SiteShell>
      <article>
        <ArticleHeader title={insight.title} date={publishedDate} dek={insight.description} />
        <section className="band" style={{ paddingTop: 30 }}>
          <div className="abody">
            <ArticleProgress headings={insight.sections.map((section) => section.heading)} />
            <div className="acontent">
              {insight.sections.map((section, i) => (
                <section key={section.heading} id={`section-${i + 1}`}>
                  <h2>{section.heading}</h2>
                  {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                  {section.bullets && (
                    <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>
                  )}
                </section>
              ))}
              <QuotationCta />
            </div>
          </div>
        </section>
      </article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />
    </SiteShell>
  );
}

function ArticleHeader({ title, date, dek }: { title: string; date: string; dek: string }) {
  return (
    <PageHero className="ahead">
      <Link className="back" href="/insights">← ALL INSIGHTS</Link>
      <span className="pill"><i />KARGODOOR PH INSIGHTS</span>
      <h1>{title}</h1>
      <p className="meta"><i aria-hidden="true">KD</i>By KargoDoor PH · {date}</p>
      <p className="lead">{dek}</p>
    </PageHero>
  );
}

function QuotationCta() {
  return (
    <aside className="cta acta">
      <h2 style={{ fontSize: "clamp(1.4rem,3vw,2rem)" }}>Kailangan ng shipping quotation?</h2>
      <p>I-send ang product details, cartons, dimensions, weight, pickup address sa China, at delivery address sa Pilipinas.</p>
      <Link className="btn btn-green glow" href="/contact-us">CONTACT KARGODOOR PH <span className="arr">→</span></Link>
    </aside>
  );
}
