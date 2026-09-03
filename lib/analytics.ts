export type AnalyticsEvent = "generate_lead" | "contact" | "click_phone" | "click_email" | "calculate_shipping" | "click_facebook" | "click_instagram" | "click_tiktok";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function trackEvent(eventName: AnalyticsEvent) {
  if (typeof window !== "undefined") window.gtag?.("event", eventName);
}
