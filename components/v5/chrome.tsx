"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { trackEvent } from "@/lib/analytics";
import { MessengerLink } from "@/components/messenger-link";
import { TrackedAnchor } from "@/components/tracked-link";

const navigation = [
  { label: "HOME", href: "/" },
  { label: "HOW IT WORKS", href: "/how-it-works" },
  { label: "SERVICES", href: "/services" },
  { label: "RATES & CALCULATOR", href: "/rates-calculator" },
  { label: "TRACK YOUR SHIPMENT", href: "/track" },
  { label: "FAQ", href: "/faq" },
  { label: "CONTACT US", href: "/contact-us" },
];

const isCurrent = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname.startsWith(href);

export function Header() {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const close = () => setOpen(false);

  return (
    <header className={`site-hdr${scrolled ? " scrolled" : ""}`}>
      <div className="wrap nav">
        <Link className="logo" href="/" aria-label="KargoDoor PH home">
          <picture>
            <source srcSet="/assets/kargodoor-logo-tagline-dark.png" media="(prefers-color-scheme: dark)" width="685" height="222" />
            <img src="/assets/kargodoor-logo-tagline-transparent.png" alt="KargoDoor PH — China to PH, made SIMPLE" width="812" height="268" />
          </picture>
        </Link>

        <nav className={`links${open ? " open" : ""}`} id="kd-navigation" aria-label="Primary navigation">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href} className={isCurrent(pathname, item.href) ? "on" : undefined} onClick={close}>
              {item.label}
            </Link>
          ))}
          <div className="mx">
            <Link className="btn btn-outline" href="/customer/login" onClick={close}>LOGIN</Link>
            <MessengerLink className="btn btn-green" target="_blank" rel="noopener noreferrer" analyticsEvent="generate_lead" onClick={close}>
              GET A QUOTE
            </MessengerLink>
          </div>
        </nav>

        <Link className="btn btn-outline" href="/customer/login">LOGIN</Link>
        <MessengerLink className="btn btn-green" target="_blank" rel="noopener noreferrer" analyticsEvent="generate_lead">
          GET A QUOTE
        </MessengerLink>

        <button
          type="button"
          className="menu-btn"
          aria-label="Open navigation menu"
          aria-controls="kd-navigation"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h10" /></svg>
        </button>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <>
      <footer className="site-ftr">
        <svg className="wv" viewBox="0 0 1440 70" preserveAspectRatio="none" aria-hidden="true"><path d="M0 0h1440v20c-240 40-480 50-720 30S240 0 0 30z" fill="var(--bg)" /></svg>
        <div className="wrap fgrid">
          <div className="stack">
            <Link href="/" aria-label="KargoDoor PH home">
              <img className="flogo" src="/assets/kargodoor-footer-logo.png" alt="KargoDoor PH — China to PH, made SIMPLE" />
            </Link>
          </div>
          <div className="ci">
            <h2 className="fh">CONTACT INFORMATION</h2>
            <TrackedAnchor href="tel:+639171577370" analyticsEvent="click_phone">+63 917 157 7370</TrackedAnchor>
            <TrackedAnchor href="tel:+639088890664" analyticsEvent="click_phone">+63 908 889 0664</TrackedAnchor>
            <span>Email: <TrackedAnchor className="inl" href="mailto:support@kargodoorph.com" analyticsEvent="click_email">support@kargodoorph.com</TrackedAnchor></span>
            <span>Support: 8:00 AM–10:00 PM · 7 Days/Week</span>
          </div>
          <nav aria-label="Footer navigation">
            <h2 className="fh">NAVIGATION</h2>
            {navigation.map((item) => (
              <Link key={item.href} href={item.href}>{item.label}</Link>
            ))}
            <Link href="/insights">INSIGHTS</Link>
            {/* Plain link: /admin sits behind Cloudflare Access, so it needs a full page load, not client-side navigation. */}
            <a href="https://kargodoorph.com/admin">ADMIN</a>
          </nav>
          <div>
            <h2 className="fh">FOLLOW US</h2>
            <div className="soc">
              <a href="https://www.facebook.com/KargoDoorPH" target="_blank" rel="noopener noreferrer" aria-label="KargoDoor PH on Facebook" onClick={() => trackEvent("click_facebook")}>
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14 8.5V6.8c0-.8.2-1.3 1.4-1.3H17V2.2c-.3 0-1.3-.2-2.5-.2-2.5 0-4.2 1.5-4.2 4.3v2.2H7.6V12h2.7v10H14V12h2.7l.4-3.5z" /></svg>
              </a>
              <a href="https://www.instagram.com/kargodoorph/" target="_blank" rel="noopener noreferrer" aria-label="KargoDoor PH on Instagram" onClick={() => trackEvent("click_instagram")}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" /></svg>
              </a>
              <a href="https://www.tiktok.com/@kargodoor.ph" target="_blank" rel="noopener noreferrer" aria-label="KargoDoor PH on TikTok" onClick={() => trackEvent("click_tiktok")}>
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.6 2h-3.3v13.4a2.9 2.9 0 1 1-2.9-2.9c.3 0 .6 0 .9.1V9.2a6.3 6.3 0 1 0 5.3 6.2V8.7a7.8 7.8 0 0 0 4.4 1.4V6.8a4.5 4.5 0 0 1-4.4-4.8z" /></svg>
              </a>
            </div>
          </div>
        </div>
        <div className="wrap copy">© 2026 KARGODOOR PH. ALL RIGHTS RESERVED.</div>
      </footer>

      <div className="fab">
        <MessengerLink target="_blank" rel="noopener noreferrer" aria-label="Message KargoDoor PH" analyticsEvent="contact">
          <video autoPlay loop muted playsInline preload="auto" poster="/assets/kargodoor-message-us-poster.webp" aria-hidden="true">
            <source src="/assets/kargodoor-message-us-small.webm" type="video/webm" />
          </video>
        </MessengerLink>
      </div>
      <div className="mbar">
        <MessengerLink className="btn btn-green" target="_blank" rel="noopener noreferrer" analyticsEvent="generate_lead">GET A QUOTE</MessengerLink>
        <Link className="btn btn-outline" href="/rates-calculator">CALCULATOR</Link>
      </div>
    </>
  );
}

/** Page wrapper for every public page in the v5 design. */
export function SiteShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="v5">
      <Header />
      <main className={className}>{children}</main>
      <Footer />
    </div>
  );
}

/** Navy page header used at the top of inner pages. */
export function PageHero({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`phero ${className}`}>
      <div className="grid-bg" />
      <div className="wrap">{children}</div>
    </div>
  );
}
