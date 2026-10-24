import Link from "next/link";
import { PageHero, SiteShell } from "@/components/v5/chrome";
import { WarehouseMap } from "@/components/v5/widgets";
import { clockIcon } from "@/components/v5/icons";
import { MessengerLink } from "@/components/messenger-link";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata(
  "China to Philippines Shipping Services | KargoDoor PH",
  "Sea freight, air freight, and door-to-door shipping from China to the Philippines with all-in rates, customs clearance, taxes, and shipment coordination.",
  "/services",
);

const services = [
  {
    icon: "sea" as const,
    title: "SEA FREIGHT",
    description: "Affordable shipping for larger, heavier, or non-urgent cargo.",
    details: [
      "Larger or heavier shipments",
      "Bulkier and commercial cargo",
      "Shipments where cost matters more than speed",
    ],
    transit: "Estimated transit time: 3–5 weeks",
  },
  {
    icon: "air" as const,
    title: "AIR FREIGHT",
    description: "Fast shipping for smaller, lightweight, or urgent cargo.",
    details: [
      "Smaller and lightweight shipments",
      "Urgent but cost-sensitive cargo",
      "Goods that need faster transportation",
    ],
    transit: "Estimated transit time: 5–7 days",
  },
  {
    icon: "road" as const,
    title: "DOOR-TO-DOOR",
    description: "Convenient delivery from our Malabon Warehouse to your location.",
    details: [
      "Free delivery for shipments of 2 CBM+ within 20 km of our Malabon Warehouse",
      "Extended delivery services are available with applicable fees",
    ],
    transit: "",
    deliveryLinks: true,
  },
];

const serviceIcons = {
  sea: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 17l2 4h14l2-4H3zM6 17V9h12v8M12 9V4M9 12h2M13 12h2" /></svg>,
  air: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 14l20-7-6 13-4-5-5 3 1-5z" /></svg>,
  road: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 6h11v10H2zM13 9h4l4 4v3h-8z" /><circle cx="6" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></svg>,
};

const inclusions = [
  "International shipping",
  "Customs clearance",
  "Taxes and duties",
  "Processing and handling",
  "Warehouse receiving",
  "Shipment coordination",
];

export default function ServicesPage() {
  return (
    <SiteShell>
      <PageHero>
        <h1 id="services-title">SERVICES</h1>
        <p className="lead">Choose the shipping service that fits your cargo.</p>
        <p className="lead hi">
          Simple options. Clear rates. Reliable shipping from China to the Philippines.
        </p>
        <Link className="link-arr" style={{ color: "#7fd34c" }} href="/shipping-from-china-to-philippines">
          LEARN MORE ABOUT CHINA TO PHILIPPINES SHIPPING <span className="arr">→</span>
        </Link>
      </PageHero>

      <section className="band" style={{ paddingTop: 40 }} aria-labelledby="services-title">
        <div className="wrap">
          <div className="grid g3 flips rv-g">
            {services.map((service) => (
              <div className="flip" tabIndex={0} key={service.title} aria-label={`${service.title}: tap or hover for details`}>
                <div className="flip-in">
                  <article className="face">
                    <span className={`fico i-${service.icon}`}>{serviceIcons[service.icon]}</span>
                    <h2>{service.title}</h2>
                    <p>{service.description}</p>
                    {service.transit && <span className="eta">{clockIcon}{service.transit}</span>}
                    <span className="flip-dots" aria-hidden="true"><i /><i /></span>
                  </article>
                  <article className="face back">
                    <h2>{service.title}</h2>
                    <ul>
                      {service.details.map((detail) => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </ul>
                    {service.transit && <span className="eta">{clockIcon}{service.transit}</span>}
                    {service.deliveryLinks && (
                      <p className="muted">
                        Delivery may also be arranged through{" "}
                        <a href="https://www.lalamove.com/en-ph/" target="_blank" rel="noopener noreferrer">Lalamove</a>{" "}
                        or{" "}
                        <a href="https://www.transportify.com.ph/" target="_blank" rel="noopener noreferrer">Transportify</a>
                        .
                      </p>
                    )}
                  </article>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="band tint" aria-label="Warehouses and all-in shipping inclusions">
        <div className="wrap">
          <WarehouseMap />
          <ul
            className="allin rv-g"
            aria-label="All-in shipping includes international shipping, customs clearance, taxes and duties, processing and handling, warehouse receiving, and shipment coordination"
          >
            {inclusions.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      </section>

      <section className="band" aria-labelledby="service-cta-title">
        <div className="wrap">
          <div className="which split rv">
            <div className="stack">
              <h2 id="service-cta-title">WHICH SERVICE IS RIGHT FOR YOU?</h2>
              <p className="q">Not sure whether to ship by sea or air?</p>
              <p className="lead">
                Tell us about your cargo and we’ll help you choose the option
                that best fits your shipment.
              </p>
            </div>
            <div className="ctas">
              <MessengerLink className="btn btn-green" target="_blank" rel="noopener noreferrer" analyticsEvent="generate_lead">
                GET A QUOTE <span className="arr">→</span>
              </MessengerLink>
              <Link className="btn btn-outline" href="/rates-calculator">CALCULATOR</Link>
            </div>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
