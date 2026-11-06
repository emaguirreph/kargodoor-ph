import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import "@fontsource/poppins/latin-600.css";
import "@fontsource/poppins/latin-700.css";
import "@fontsource/poppins/latin-800.css";
import "@fontsource/poppins/latin-700-italic.css";
import "@fontsource/poppins/latin-800-italic.css";
import "@fontsource/poppins/latin-900-italic.css";
import "@fontsource/plus-jakarta-sans/latin-400.css";
import "@fontsource/plus-jakarta-sans/latin-500.css";
import "@fontsource/plus-jakarta-sans/latin-600.css";
import "@fontsource/plus-jakarta-sans/latin-700.css";
import "@fontsource/plus-jakarta-sans/latin-800.css";
import "./v5.css";
import "./v5-home.css";
import "./kardo.css";
import "./portal.css";
import { AnalyticsPageViews } from "@/components/analytics-pageviews";
import { pageMetadata, siteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  ...pageMetadata(
    "KargoDoor PH | China to Philippines Shipping",
    "Simple, reliable, and affordable shipping from China to the Philippines. Ship by sea or air with KargoDoor PH's all-in shipping service.",
    "/",
  ),

  metadataBase: new URL(siteUrl),

  icons: {
    icon: [
      { url: "/kargodoor-app-icon-v2.png", type: "image/png", sizes: "512x512" },
    ],
    apple: "/kargodoor-app-icon-v2.png",
  },

  openGraph: {
    title: "KargoDoor PH | China to Philippines Shipping",
    description:
      "Simple, reliable, and affordable shipping from China to the Philippines.",
    url: "/",
    siteName: "KargoDoor PH",
    type: "website",
    images: [
      {
        url: "/assets/kargodoor-social-share.png",
        width: 1200,
        height: 630,
        alt: "KargoDoor PH - China to Philippines Shipping",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: "KargoDoor PH | China to Philippines Shipping",
    description:
      "Simple, reliable, and affordable shipping from China to the Philippines.",
    images: ["/assets/kargodoor-social-share.png"],
  },

  robots: {
    index: true,
    follow: true,
  },

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
    {
      "@type": "WebSite",
      name: "KargoDoor PH",
      url: siteUrl,
    },
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
        {/* Remembers a tap on the chat button made before the page finishes loading; the assistant opens as soon as it is ready. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "try{if(sessionStorage.getItem('kd-chat-tease-closed')==='1')document.documentElement.classList.add('kc-tease-off')}catch(e){}document.addEventListener('click',function(e){if(window.__kcReady)return;if(e.target&&e.target.closest&&e.target.closest('.kc-tease span,.kd-x')){document.documentElement.classList.add('kc-tease-off');try{sessionStorage.setItem('kd-chat-tease-closed','1')}catch(x){}return;}var b=e.target&&e.target.closest&&e.target.closest('.kc-fab,.kc-tease,.kd-bub,.kd-mini');if(b){window.__kcOpen=1;b.classList.add('kc-wait');}},true);",
          }}
        />
        {children}

        <AnalyticsPageViews />

        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-N0SJG6R2VH"
          strategy="afterInteractive"
        />

        <Script id="google-analytics" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-N0SJG6R2VH');`}
        </Script>

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData),
          }}
        />
      </body>
    </html>
  );
}
