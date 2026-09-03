import Link from "next/link";
import { Plane, Ship } from "lucide-react";
import { Footer, Header } from "@/components/site-chrome";
import { TrackedLink } from "@/components/tracked-link";

const whyCards = [
  {
    title: "CLEAR CHOICES",
    body: "Choose fast air freight or fully coordinated sea freight.",
  },
  {
    title: "FRIENDLY GUIDANCE",
    body: "Get dedicated support from a team that helps manage your shipment.",
  },
  {
    title: "ALL-INCLUSIVE RATES",
    body: "One rate covers international shipping, taxes, and customs clearance. No hidden fees.",
  },
  {
    title: "100% SIMPLE",
    body: "Send your goods to our assigned warehouse, and we’ll handle the rest.",
  },
];

const steps = [
  {
    number: "01",
    title: "SOURCE",
    body: "Find your products and purchase from your preferred supplier.",
  },
  {
    number: "02",
    title: "SHIP",
    body: "Send the goods to the assigned warehouse using your Cargo Code. We handle the international shipping.",
  },
  {
    number: "03",
    title: "RECEIVE",
    body: "We notify you when your cargo arrives in the Philippines and is ready for release.",
  },
];

export default function HomePage() {
  return (
    <div className="kd-site-shell">
      <Header />

      <main>
        <section className="kd-hero" aria-labelledby="hero-title">
          <span className="kd-hero-blur kd-hero-blur-plane" aria-hidden="true" />
          <span className="kd-hero-blur kd-hero-blur-ship" aria-hidden="true" />
          <span className="kd-hero-blur kd-hero-blur-boxes" aria-hidden="true" />
          <div className="kd-hero-inner">
            <div className="kd-hero-copy">
              <h1 className="kd-visually-hidden" id="hero-title">
                KargoDoor PH shipping from China to the Philippines
              </h1>
              <img
                className="kd-hero-branding"
                src="/assets/kargodoor-hero-branding-final.png"
                alt="SOURCE · SHIP · RECEIVE — 采购 · 运输 · 收货 — China to PH, made SIMPLE — Simple, reliable, and affordable shipping from China to the Philippines."
              />
              <div className="kd-hero-actions">
                <TrackedLink className="kd-button kd-button-green" href="/contact-us" analyticsEvent="generate_lead">
                  GET A QUOTE
                </TrackedLink>
                <Link className="kd-button kd-button-white" href="/rates-calculator">
                  CALCULATOR
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="kd-section kd-why" aria-labelledby="why-title">
          <div className="kd-container">
            <h2 id="why-title">WHY KARGODOOR PH?</h2>
            <p className="kd-section-lead">
              Shipping from China to the Philippines made effortless. We help manage your cargo every step of the way.
            </p>
            <div className="kd-why-grid">
              {whyCards.map((card) => (
                <article className="kd-info-card" key={card.title}>
                  <h3>{card.title}</h3>
                  <p>{card.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="kd-section kd-how" aria-labelledby="how-title">
          <div className="kd-container">
            <h2 id="how-title">HOW IT WORKS?</h2>
            <p className="kd-section-lead">Three clear steps from supplier to release.</p>
            <div className="kd-steps-grid">
              {steps.map((step) => (
                <article className="kd-step-card" key={step.number}>
                  <span>{step.number}</span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </article>
              ))}
            </div>
            <Link className="kd-text-link" href="/how-it-works">
              VIEW ALL STEPS →
            </Link>
          </div>
        </section>

        <section className="kd-section kd-services" aria-labelledby="services-title">
          <div className="kd-container">
            <h2 id="services-title">OUR SERVICES</h2>
            <p className="kd-section-lead">Choose the shipping service that fits your cargo.</p>
            <div className="kd-service-grid">
              <article className="kd-service-card">
                <span className="kd-service-icon" aria-hidden="true">
                  <Ship />
                </span>
                <div>
                  <h3>SEA FREIGHT</h3>
                  <p>Affordable shipping for larger, heavier, or non-urgent cargo.</p>
                </div>
              </article>
              <article className="kd-service-card">
                <span className="kd-service-icon kd-service-icon-dark" aria-hidden="true">
                  <Plane />
                </span>
                <div>
                  <h3>AIR FREIGHT</h3>
                  <p>Fast shipping for smaller, lightweight, or urgent cargo.</p>
                </div>
              </article>
            </div>
            <Link className="kd-text-link kd-text-link-green" href="/services">
              EXPLORE OUR SERVICES →
            </Link>
          </div>
        </section>

        <section className="kd-story" aria-labelledby="story-title">
          <div className="kd-container kd-story-grid">
            <div className="kd-story-heading">
              <p>OUR STORY</p>
              <h2 id="story-title">
                Inspired by the Filipino
                <br />
                “Kargador”
              </h2>
            </div>
            <div className="kd-story-copy">
              <p>A <strong>kargador</strong> carries the load, makes the heavy work lighter, and helps others move forward.</p>
              <p>
                At <strong>KargoDoor PH</strong>, we bring that same spirit to logistics. We handle the complexities of shipping from China to the Philippines, so you can focus on what matters most—your business, your customers, and your next opportunity.
              </p>
              <strong className="kd-story-closing">From China to the Philippines, we make cargo simple.</strong>
            </div>
          </div>
        </section>

        <section className="kd-rates" aria-labelledby="rates-title">
          <div className="kd-container">
            <h2 id="rates-title">RATES &amp; CALCULATOR</h2>
            <p>Know your estimated rate before you ship.</p>
            <strong>Use our Calculator, then contact us for your final quote.</strong>
            <Link className="kd-text-link" href="/rates-calculator">
              CALCULATE RATE →
            </Link>
          </div>
        </section>

        <section className="kd-section kd-faq" aria-labelledby="faq-title">
          <div className="kd-container">
            <h2 id="faq-title">FREQUENTLY ASKED QUESTIONS</h2>
            <p className="kd-section-lead">
              Quick answers about shipping, rates, warehouses, restricted goods, and more.
            </p>
            <div className="kd-faq-card">
              <h3>Need more information about shipping with KargoDoor PH?</h3>
              <p>
                Find answers to our most common questions, or contact our team if you need help with your shipment.
              </p>
            </div>
            <Link className="kd-text-link kd-text-link-green" href="/faq">
              VIEW ALL FAQS →
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
