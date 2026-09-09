"use client";

import Link from "next/link";
import { useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { MessengerLink } from "@/components/messenger-link";

const navigation = [
  { label: "HOME", href: "/" },
  { label: "HOW IT WORKS", href: "/how-it-works" },
  { label: "SERVICES", href: "/services" },
  { label: "RATES & CALCULATOR", href: "/rates-calculator" },
  { label: "TRACK YOUR SHIPMENT", href: "/track" },
  { label: "FAQ", href: "/faq" },
  { label: "CONTACT US", href: "/contact-us" },
];

function Brand({ variant = "header" }: { variant?: "header" | "footer" }) {
  const logoSrc =
    variant === "footer"
      ? "/assets/kargodoor-footer-logo.png"
      : "/assets/kargodoor-logo-tagline-approved.png";

  return (
    <Link
      className={`kd-brand kd-brand-${variant}`}
      href="/"
      aria-label="KargoDoor PH home"
    >
      <img
        src={logoSrc}
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

        <Link className="kd-header-login" href="/customer/login">LOGIN</Link>

        <MessengerLink
          className="kd-header-quote"
          target="_blank"
          rel="noopener noreferrer"
          analyticsEvent="generate_lead"
        >
          GET A QUOTE
        </MessengerLink>

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

          <nav
            id="kd-mobile-navigation"
            aria-label="Mobile navigation"
            hidden={!mobileMenuOpen}
          >
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}

            <Link href="/customer/login" onClick={() => setMobileMenuOpen(false)}>LOGIN</Link>

            <MessengerLink
              className="kd-mobile-quote"
              target="_blank"
              rel="noopener noreferrer"
              analyticsEvent="generate_lead"
              onClick={() => {
                setMobileMenuOpen(false);
              }}
            >
              GET A QUOTE
            </MessengerLink>
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
            <p><a href="tel:+639189434747">+63 918 943 4747</a></p>
            <p><a href="tel:+639088890664">+63 908 889 0664</a></p>
            <p>
              Email:{" "}
              <a href="mailto:support@kargodoorph.com">
                support@kargodoorph.com
              </a>
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
              <a
                href="https://www.facebook.com/KargoDoorPH"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="KargoDoor PH on Facebook"
                onClick={() => trackEvent("click_facebook")}
              >
                <span aria-hidden="true">f</span>
              </a>

              <a
                href="https://www.instagram.com/kargodoorph/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="KargoDoor PH on Instagram"
                onClick={() => trackEvent("click_instagram")}
              >
                <span aria-hidden="true">◎</span>
              </a>

              <a
                href="https://www.tiktok.com/@kargodoor.ph"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="KargoDoor PH on TikTok"
                onClick={() => trackEvent("click_tiktok")}
              >
                <span aria-hidden="true">♪</span>
              </a>
            </div>
          </section>
        </div>

        <p className="kd-copyright">
          © 2026 KARGODOOR PH. ALL RIGHTS RESERVED.
        </p>
      </div>

      <MessengerLink
        className="kd-floating-message"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Message KargoDoor PH"
        analyticsEvent="contact"
      >
        <video autoPlay loop muted playsInline preload="metadata" aria-hidden="true">
          <source
            src="/assets/kargodoor-message-us-approved.webm"
            type="video/webm"
          />
        </video>
      </MessengerLink>
    </footer>
  );
}
