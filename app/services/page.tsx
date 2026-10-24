import Link from "next/link";
import { PageHero, SiteShell } from "@/components/v5/chrome";
import { Scene, type SceneKind } from "@/components/v5/art";
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
    scene: "sea" as SceneKind,
    background: "linear-gradient(#cfe3ff,#eaf3ff)",
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
    scene: "air" as SceneKind,
    background: "linear-gradient(#bfe0ff,#f0f8ff)",
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
    scene: "road" as SceneKind,
    background: "linear-gradient(#dff3d2,#f3fbee)",
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
          {services.map((service) => (
            <article className="feat rv" key={service.title}>
              <Scene kind={service.scene} className="fscene" style={{ background: service.background }} />
              <div className="ftxt">
                <h2>{service.title}</h2>
                <p className="lead">{service.description}</p>
                <ul>
                  {service.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
                {service.transit && (
                  <span className="eta">{clockIcon}{service.transit}</span>
                )}
                {service.deliveryLinks && (
                  <p className="muted">
                    Delivery may also be arranged through{" "}
                    <a href="https://www.lalamove.com/en-ph/" target="_blank" rel="noopener noreferrer">Lalamove</a>{" "}
                    or{" "}
                    <a href="https://www.transportify.com.ph/" target="_blank" rel="noopener noreferrer">Transportify</a>
                    .
                  </p>
                )}
              </div>
            </article>
          ))}
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
          <div className="which rv">
            <h2 id="service-cta-title">WHICH SERVICE IS RIGHT FOR YOU?</h2>
            <p className="q">Not sure whether to ship by sea or air?</p>
            <p className="lead">
              Tell us about your cargo and we’ll help you choose the option
              that best fits your shipment.
            </p>
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
