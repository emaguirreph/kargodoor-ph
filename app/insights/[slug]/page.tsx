import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Footer, Header } from "@/components/site-chrome";
import { getInsight, insights } from "@/lib/insights";
import { pageMetadata, siteUrl } from "@/lib/seo";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return insights.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const insight = getInsight(slug);
  if (!insight) return {};
  return pageMetadata(insight.seoTitle, insight.description, `/insights/${insight.slug}`);
}

export default async function InsightArticlePage({ params }: Props) {
  const { slug } = await params;
  const insight = getInsight(slug);
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
    <div className="kd-site-shell">
      <Header />
      <main className="kd-article-page">
        <article>
          <header className="kd-article-header kd-container">
            <Link className="kd-article-back" href="/insights">← ALL INSIGHTS</Link>
            <p className="kd-eyebrow">KARGODOOR PH INSIGHTS</p>
            <h1>{insight.title}</h1>
            <p className="kd-article-meta">By KargoDoor PH · {publishedDate}</p>
            <p className="kd-article-dek">{insight.description}</p>
          </header>

          <div className="kd-article-content kd-container">
            {insight.sections.map((section) => (
              <section key={section.heading}>
                <h2>{section.heading}</h2>
                {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                {section.bullets && (
                  <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>
                )}
              </section>
            ))}
            <aside className="kd-article-cta">
              <h2>Kailangan ng shipping quotation?</h2>
              <p>I-send ang product details, cartons, dimensions, weight, pickup address sa China, at delivery address sa Pilipinas.</p>
              <Link className="kd-button kd-button-green" href="/contact-us">CONTACT KARGODOOR PH</Link>
            </aside>
          </div>
        </article>
      </main>
      <Footer />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />
    </div>
  );
}
