import type { Metadata } from "next";
import { SiteShell } from "@/components/v5/chrome";
import { FollowRedirect } from "@/components/v5/follow-us";

const title = "Follow KargoDoor PH on Facebook";
const description = "Shipping from China? Follow us for the latest shipping updates, announcements, and import tips! China to PH, made SIMPLE.";
const image = { url: "/assets/kargodoor-follow-us-share.jpg", width: 640, height: 640, alt: "Shipping from China? Follow KargoDoor PH on Facebook and Instagram!" };

/**
 * Share link for Messenger and chats: kargodoorph.com/follow shows the FOLLOW US
 * graphic as the link preview, and opening it goes straight to our Facebook Page.
 */
export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/follow" },
  robots: { index: false, follow: true },
  openGraph: { type: "website", url: "/follow", siteName: "KargoDoor PH", title, description, images: [image] },
  twitter: { card: "summary_large_image", title, description, images: [image.url] },
};

export default function FollowPage() {
  return (
    <SiteShell>
      <FollowRedirect />
    </SiteShell>
  );
}
