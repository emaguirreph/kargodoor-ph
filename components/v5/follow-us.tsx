"use client";

import { useEffect, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics";

export const FACEBOOK_URL = "https://www.facebook.com/KargoDoorPH";
export const INSTAGRAM_URL = "https://www.instagram.com/kargodoorph/";

/**
 * Facebook Page plugin (cover photo + Like/Share), loaded only when it scrolls
 * into view so it never slows the first paint. Uses Facebook's iframe embed, so
 * no Facebook SDK script runs on our page. Width follows the box, up to 380px.
 */
function FacebookPagePlugin() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setWidth(Math.max(180, Math.min(380, Math.floor(el.clientWidth))));
        observer.disconnect();
      }
    }, { rootMargin: "300px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const height = Math.round(width * 0.36) + 50;
  const src = width
    ? `https://www.facebook.com/plugins/page.php?${new URLSearchParams({
        href: FACEBOOK_URL,
        width: String(width),
        height: String(height),
        small_header: "false",
        hide_cover: "false",
        show_facepile: "false",
        adapt_container_width: "true",
      })}`
    : "";

  return (
    <div ref={ref} className="fb-box" style={{ minHeight: width ? height : 180 }}>
      {src ? (
        <iframe
          title="KargoDoor PH on Facebook"
          src={src}
          width={width}
          height={height}
          style={{ border: "none", overflow: "hidden" }}
          scrolling="no"
          loading="lazy"
          allow="encrypted-media; clipboard-write; web-share"
        />
      ) : null}
    </div>
  );
}

/** Homepage "Follow us" band: the Follow Us graphic, two follow buttons, and the Facebook Page plugin. */
export function FollowUs() {
  return (
    <section className="band follow" aria-labelledby="follow-title">
      <div className="wrap follow-grid">
        <a className="follow-art rv" href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer" onClick={() => trackEvent("click_facebook")}>
          <img
            src="/assets/kargodoor-follow-us.webp"
            alt="Shipping from China? Follow KargoDoor PH on Facebook and Instagram! Get the latest shipping updates, announcements, and import tips."
            width="640"
            height="640"
            loading="lazy"
            decoding="async"
          />
        </a>
        <div className="follow-txt rv">
          <span className="pill" style={{ alignSelf: "flex-start" }}><i />FOLLOW US</span>
          <h2 id="follow-title"><span className="one">Shipping from China?</span> <span>Follow us on Facebook and Instagram!</span></h2>
          <p className="lead">Get the latest shipping updates, announcements, and import tips!</p>
          <div className="follow-btns">
            <a className="btn btn-fb" href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer" onClick={() => trackEvent("click_facebook")}>
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14 8.5V6.8c0-.8.2-1.3 1.4-1.3H17V2.2c-.3 0-1.3-.2-2.5-.2-2.5 0-4.2 1.5-4.2 4.3v2.2H7.6V12h2.7v10H14V12h2.7l.4-3.5z" /></svg>
              FOLLOW ON FACEBOOK
            </a>
            <a className="btn btn-ig" href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" onClick={() => trackEvent("click_instagram")}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" /></svg>
              FOLLOW ON INSTAGRAM
            </a>
          </div>
          <FacebookPagePlugin />
        </div>
      </div>
    </section>
  );
}

/** Body of /follow: sends the visitor on to our Facebook Page, with the graphic and buttons as a fallback. */
export function FollowRedirect() {
  useEffect(() => {
    trackEvent("click_facebook");
    const timer = window.setTimeout(() => window.location.replace(FACEBOOK_URL), 600);
    return () => window.clearTimeout(timer);
  }, []);
  return <FollowUs />;
}
