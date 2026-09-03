import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { AnalyticsPageViews } from "@/components/analytics-pageviews";
import { pageMetadata, siteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  ...pageMetadata(
    "KargoDoor PH | China to Philippines Shipping",
    "Simple, reliable, and affordable shipping from China to the Philippines. Ship by sea or air with KargoDoor PH's all-in shipping service.",
    "/",
  ),
  metadataBase: new URL(siteUrl),
  robots: { index: true, follow: true },
  other: {
    "codex-preview": "development",
  },
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: "KargoDoor PH",
      url: siteUrl,
      logo: `${siteUrl}/assets/kargodoor-logo-tagline-approved.png`,
      sameAs: [
        "https://www.facebook.com/KargoDoorPH",
        "https://www.instagram.com/kargodoorph/",
        "https://www.tiktok.com/@kargodoor.ph",
      ],
    },
    { "@type": "WebSite", name: "KargoDoor PH", url: siteUrl },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        <AnalyticsPageViews />
        <Script src="https://www.googletagmanager.com/gtag/js?id=G-N0SJG6R2VH" strategy="afterInteractive" />
        <Script id="google-analytics" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} gtag('js', new Date()); gtag('config', 'G-N0SJG6R2VH');`}
        </Script>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      </body>
    </html>
  );
}
