import type { Metadata } from "next";

export const siteUrl = "https://kargodoorph.com";

export const socialTitle =
  "KargoDoor PH | China to Philippines Shipping";

export const socialDescription =
  "SOURCE · SHIP · RECEIVE. Simple, reliable, and affordable shipping from China to the Philippines.";

export const socialImage =
  "/assets/kargodoor-social-share.png";

export function pageMetadata(
  title: string,
  description: string,
  path: string,
): Metadata {
  return {
    title,
    description,

    alternates: {
      canonical: path,
    },

    openGraph: {
      type: "website",
      url: path,
      siteName: "KargoDoor PH",
      locale: "en_PH",
      title,
      description,
      images: [
        {
          url: socialImage,
          width: 1200,
          height: 630,
          alt: "KargoDoor PH - China to Philippines Shipping",
        },
      ],
    },

    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [socialImage],
    },
  };
}

/** For private pages (customer portal, short links): keep them out of Google. */
export const noIndex: Metadata = {
  robots: { index: false, follow: false },
};
