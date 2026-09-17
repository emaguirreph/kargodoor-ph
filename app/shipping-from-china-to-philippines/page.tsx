import Link from "next/link";
import { Footer, Header } from "@/components/site-chrome";
import { MessengerLink } from "@/components/messenger-link";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata(
  "Shipping from China to Philippines | Sea & Air Freight | KargoDoor PH",
  "Shipping from China to the Philippines by sea or air. KargoDoor PH offers all-in freight, customs clearance, duties and taxes coordination, rate estimates, and delivery options.",
  "/shipping-from-china-to-philippines",
);

const benefits = [
  {
    title: "SEA FREIGHT",
    body: "A practical option for larger, heavier, bulk, or less urgent shipments from China to the Philippines.",
  },
  {
    title: "AIR FREIGHT",
    body: "Faster shipping for smaller, lighter, or urgent cargo that needs to reach the Philippines sooner.",
  },
  {
    title: "ALL-IN SHIPPING",
    body: "KargoDoor coordinates international shipping, customs clearance, applicable taxes and duties, processing, and shipment handling.",
  },
];

const steps = [
  {
    number: "01",
    title: "SOURCE",
    body: "Purchase products from your preferred supplier in China.",
  },
  {
    number: "02",
    title: "SHIP",
    body: "Send your cargo to the assigned KargoDoor warehouse using your unique Cargo Code.",
  },
  {
    number: "03",
    title: "RECEIVE",
    body: "KargoDoor manages the international shipment and notifies you once your cargo is ready in the Philippines.",
  },
];

export default function ShippingFromChinaToPhilippinesPage() {
  return (
    <div className="kd-site-shell">
      <Header />

      <main>
        <section className="kd-section" aria-labelledby="china-ph-title">
          <div className="kd-container">
            <h1 id="china-ph-title">Shipping from China to the Philippines</h1>

            <p className="kd-section-lead">
              KargoDoor PH helps businesses and individuals ship cargo from
              China to the Philippines by sea or air with a simple,
              coordinated process.
            </p>

            <p>
              Source from your preferred supplier, send your goods to the
              assigned KargoDoor warehouse, and let our team coordinate the
              international shipping, customs clearance, processing, and cargo
              handling.
            </p>

            <div className="kd-hero-actions">
              <MessengerLink
                className="kd-button kd-button-green"
                target="_blank"
                rel="noopener noreferrer"
                analyticsEvent="generate_lead"
              >
                GET A QUOTE
              </MessengerLink>

              <Link
                className="kd-button kd-button-white"
                href="/rates-calculator"
              >
                CALCULATOR
              </Link>
            </div>
          </div>
        </section>

        <section className="kd-section" aria-labelledby="shipping-options-title">
          <div className="kd-container">
            <h2 id="shipping-options-title">
              China to Philippines Shipping Options
            </h2>

            <p className="kd-section-lead">
              Choose the shipping method that best fits your cargo, budget, and
              timeline.
            </p>

            <div className="kd-why-grid">
              {benefits.map((benefit) => (
                <article className="kd-info-card" key={benefit.title}>
                  <h3>{benefit.title}</h3>
                  <p>{benefit.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="kd-section" aria-labelledby="process-title">
          <div className="kd-container">
            <h2 id="process-title">
              How Shipping from China to the Philippines Works
            </h2>

            <p className="kd-section-lead">
              KargoDoor keeps the process simple: SOURCE · SHIP · RECEIVE.
            </p>

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
              VIEW THE FULL SHIPPING PROCESS →
            </Link>
          </div>
        </section>

        <section className="kd-section" aria-labelledby="warehouse-title">
          <div className="kd-container">
            <h2 id="warehouse-title">KargoDoor China Warehouse Network</h2>

            <p className="kd-section-lead">
              Your supplier can send cargo to the warehouse assigned for your
              shipment.
            </p>

            <p>
              Available warehouse locations include Guangzhou, Yiwu, Shishi,
              Hong Kong, and Taiwan. KargoDoor will confirm the appropriate
              warehouse and provide your unique Cargo Code before your supplier
              ships.
            </p>
          </div>
        </section>

        <section className="kd-section" aria-labelledby="rates-title">
          <div className="kd-container">
            <h2 id="rates-title">China to Philippines Shipping Rates</h2>

            <p className="kd-section-lead">
              Shipping cost depends on cargo size, weight, service type, and
              other shipment requirements.
            </p>

            <p>
              Use the KargoDoor shipping calculator for an estimate, or send us
              your cargo dimensions, weight, quantity, and item details for a
              quotation.
            </p>

            <Link className="kd-text-link" href="/rates-calculator">
              CHECK SHIPPING RATES →
            </Link>
          </div>
        </section>

        <section className="kd-ready" aria-labelledby="ready-title">
          <div className="kd-container kd-ready-inner">
            <div className="kd-ready-copy">
              <h2 id="ready-title">READY TO SHIP FROM CHINA?</h2>
              <p>
                Tell us about your cargo and we’ll help you get started.
              </p>
            </div>

            <MessengerLink
              className="kd-button kd-button-green kd-ready-button"
              target="_blank"
              rel="noopener noreferrer"
              analyticsEvent="generate_lead"
            >
              GET A QUOTE
            </MessengerLink>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
