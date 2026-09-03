import Link from "next/link";
import { Calculator, FileText } from "lucide-react";
import { Footer, Header } from "@/components/site-chrome";
import { TrackedLink } from "@/components/tracked-link";

const services = [
  {
    icon: "🚢",
    title: "SEA FREIGHT",
    description: "Affordable shipping for larger, heavier, or non-urgent cargo.",
    details: [
      "Larger or heavier shipments",
      "Bulkier and commercial cargo",
      "Shipments where cost matters more than speed",
    ],
    transit: "Estimated transit time: 21–30 days",
  },
  {
    icon: "✈",
    title: "AIR FREIGHT",
    description: "Fast shipping for smaller, lightweight, or urgent cargo.",
    details: [
      "Smaller and lightweight shipments",
      "Urgent but cost-sensitive cargo",
      "Goods that need faster transportation",
    ],
    transit: "Estimated transit time: 3–7 days",
  },
];

export default function ServicesPage() {
  return (
    <div className="kd-site-shell">
      <Header />

      <main className="kd-services-page">
        <section className="kd-services-intro" aria-labelledby="services-title">
          <div className="kd-container kd-services-container">
            <header className="kd-services-heading">
              <h1 id="services-title">SERVICES</h1>
              <p>Choose the shipping service that fits your cargo.</p>
              <p className="kd-services-heading-green">
                Simple options. Clear rates. Reliable shipping from China to the Philippines.
              </p>
            </header>

            <div className="kd-services-cards">
              {services.map((service) => (
                <article className="kd-services-card" key={service.title}>
                  <h2>
                    <span aria-hidden="true">{service.icon}</span>
                    {service.title}
                  </h2>
                  <p className="kd-services-card-description">{service.description}</p>
                  <ul>
                    {service.details.map((detail) => (
                      <li key={detail}>{detail}</li>
                    ))}
                  </ul>
                  <p className="kd-services-transit">{service.transit}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="kd-services-visuals" aria-label="Warehouses and all-in shipping inclusions">
          <div className="kd-container kd-services-container">
            <img
              className="kd-services-warehouse-image"
              src="/assets/kargodoor-services-warehouses-approved.png"
              alt="KargoDoor warehouses in Guangzhou, Yiwu, Shishi, Hong Kong, and Taiwan"
              width={1229}
              height={709}
              loading="lazy"
              decoding="async"
            />
            <img
              className="kd-services-inclusions-image"
              src="/assets/kargodoor-services-all-in-approved.png"
              alt="All-in shipping includes international shipping, customs clearance, taxes and duties, processing and handling, warehouse receiving, and shipment coordination"
              width={1366}
              height={356}
              loading="lazy"
              decoding="async"
            />
          </div>
        </section>

        <section className="kd-services-cta" aria-labelledby="service-cta-title">
          <div className="kd-container kd-services-container kd-services-cta-inner">
            <div>
              <h2 id="service-cta-title">WHICH SERVICE IS RIGHT FOR YOU?</h2>
              <p>Not sure whether to ship by sea or air?</p>
              <p>Tell us about your cargo and we’ll help you choose the option that best fits your shipment.</p>
            </div>
            <div className="kd-services-cta-actions">
              <TrackedLink className="kd-button kd-button-green" href="/contact-us" analyticsEvent="generate_lead">
                <FileText aria-hidden="true" />
                GET A QUOTE
              </TrackedLink>
              <Link className="kd-button kd-button-white" href="/rates-calculator">
                <Calculator aria-hidden="true" />
                CALCULATOR
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
