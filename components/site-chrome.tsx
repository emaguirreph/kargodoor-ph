"use client";

import Link from "next/link";
import { useState } from "react";
import { trackEvent } from "@/lib/analytics";

const navigation = [
  { label: "HOME", href: "/" },
  { label: "HOW IT WORKS", href: "/how-it-works" },
  { label: "SERVICES", href: "/services" },
  { label: "RATES & CALCULATOR", href: "/rates-calculator" },
  { label: "FAQ", href: "/faq" },
  { label: "CONTACT US", href: "/contact-us" },
];

function Brand({ variant = "header" }: { variant?: "header" | "footer" }) {
  return (
    <Link className={`kd-brand kd-brand-${variant}`} href="/" aria-label="KargoDoor PH home">
      <img
        src="/assets/kargodoor-logo-tagline-approved.png"
        alt="KargoDoor PH — China to PH, made SIMPLE"
      />
    </Link>
  );
}

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="kd-header">
      <div className="kd-header-inner">
        <Brand />
        <nav className="kd-desktop-nav" aria-label="Primary navigation">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <Link className="kd-header-quote" href="/contact-us" onClick={() => trackEvent("generate_lead")}>
          GET A QUOTE
        </Link>
        <div className="kd-mobile-menu">
          <button
            type="button"
            className="kd-mobile-menu-toggle"
            aria-label="Open navigation menu"
            aria-controls="kd-mobile-navigation"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            <span />
            <span />
            <span />
          </button>
          <nav id="kd-mobile-navigation" aria-label="Mobile navigation" hidden={!mobileMenuOpen}>
            {navigation.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)}>
                {item.label}
              </Link>
            ))}
            <Link className="kd-mobile-quote" href="/contact-us" onClick={() => { setMobileMenuOpen(false); trackEvent("generate_lead"); }}>
              GET A QUOTE
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="kd-footer">
      <div className="kd-container">
        <Brand variant="footer" />
        <div className="kd-footer-grid">
          <section>
            <h2>CONTACT INFORMATION</h2>
            <p>Mobile: 0917 157 7370</p>
            <p>Mobile: 0908 889 0664</p>
            <p>
              Email: <a href="mailto:support@kargodoorph.com">support@kargodoorph.com</a>
            </p>
            <p>Support: 8:00 AM–10:00 PM · 7 Days/Week</p>
          </section>
          <nav aria-label="Footer navigation">
            <h2>NAVIGATION</h2>
            {navigation.map((item) => (
              <Link key={item.href} href={item.href}>
                {item.label}
              </Link>
            ))}
          </nav>
          <section className="kd-follow">
            <h2>FOLLOW US</h2>
            <div>
              <a href="https://www.facebook.com/KargoDoorPH" target="_blank" rel="noopener noreferrer" aria-label="KargoDoor PH on Facebook" onClick={() => trackEvent("click_facebook")}>
                <span aria-hidden="true">f</span>
              </a>
              <a href="https://www.instagram.com/kargodoorph/" target="_blank" rel="noopener noreferrer" aria-label="KargoDoor PH on Instagram" onClick={() => trackEvent("click_instagram")}>
                <span aria-hidden="true">◎</span>
              </a>
              <a href="https://www.tiktok.com/@kargodoor.ph" target="_blank" rel="noopener noreferrer" aria-label="KargoDoor PH on TikTok" onClick={() => trackEvent("click_tiktok")}>
                <span aria-hidden="true">♪</span>
              </a>
            </div>
          </section>
        </div>
        <p className="kd-copyright">© 2026 KARGODOOR PH. ALL RIGHTS RESERVED.</p>
      </div>
      <a
        className="kd-floating-message"
        href="https://m.me/KargoDoorPH"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Message KargoDoor PH"
        onClick={() => trackEvent("contact")}
      >
        <video autoPlay loop muted playsInline preload="metadata" aria-hidden="true">
          <source src="/assets/kargodoor-message-us-approved.webm" type="video/webm" />
        </video>
      </a>
    </footer>
  );
}
