import Link from "next/link";
import { PageHero, SiteShell } from "@/components/v5/chrome";
import { Scene } from "@/components/v5/art";
import { WarehouseMap, WhenVisible } from "@/components/v5/widgets";
import { stepIcons } from "@/components/v5/icons";
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

const steps: Array<{ number: string; title: keyof typeof stepIcons; body: string }> = [
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

const benefitScenes = ["sea", "air", "road"] as const;

export default function ShippingFromChinaToPhilippinesPage() {
  return (
    <SiteShell>
      <PageHero>
        <span className="pill"><i />SOURCE · SHIP · RECEIVE</span>
        <h1 id="china-ph-title">Shipping from China to the Philippines</h1>
        <p className="lead hi">
          KargoDoor PH helps businesses and individuals ship cargo from
          China to the Philippines by sea or air with a simple,
          coordinated process.
        </p>
        <p className="lead">
          Source from your preferred supplier, send your goods to the
          assigned KargoDoor warehouse, and let our team coordinate the
          international shipping, customs clearance, processing, and cargo
          handling.
        </p>
        <div className="ctas">
          <MessengerLink className="btn btn-green glow" target="_blank" rel="noopener noreferrer" analyticsEvent="generate_lead">
            GET A QUOTE <span className="arr">→</span>
          </MessengerLink>
          <Link className="btn btn-line" href="/rates-calculator">CALCULATOR</Link>
        </div>
      </PageHero>

      <section className="band" style={{ paddingTop: 40 }} aria-labelledby="shipping-options-title">
        <div className="wrap">
          <div className="head rv">
            <h2 id="shipping-options-title">China to Philippines Shipping Options</h2>
            <p className="lead">
              Choose the shipping method that best fits your cargo, budget, and
              timeline.
            </p>
          </div>
          <div className="grid g3 rv-g">
            {benefits.map((benefit, i) => (
              <article className="card svc" key={benefit.title}>
                <Scene kind={benefitScenes[i]} className={`scene ${benefitScenes[i]}`} />
                <div className="txt"><h3>{benefit.title}</h3><p>{benefit.body}</p></div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="band tint" aria-labelledby="process-title">
        <div className="wrap">
          <div className="head rv">
            <h2 id="process-title">How Shipping from China to the Philippines Works</h2>
            <p className="lead">KargoDoor keeps the process simple: SOURCE · SHIP · RECEIVE.</p>
          </div>
          <WhenVisible className="hsteps">
            <span className="bar" />
            {steps.map((step) => (
              <article className="hstep" key={step.number}>
                <div className="c">{stepIcons[step.title]}<b>{step.number}</b></div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </article>
            ))}
          </WhenVisible>
          <p className="center" style={{ marginTop: 44 }}>
            <Link className="btn btn-blue" href="/how-it-works">VIEW THE FULL SHIPPING PROCESS <span className="arr">→</span></Link>
          </p>
        </div>
      </section>

      <section className="band" aria-labelledby="warehouse-title">
        <div className="wrap">
          <div className="head rv">
            <h2 id="warehouse-title">KargoDoor China Warehouse Network</h2>
            <p className="lead">
              Your supplier can send cargo to the warehouse assigned for your
              shipment.
            </p>
            <p className="muted">
              Available warehouse locations include Guangzhou, Yiwu, Shishi,
              Hong Kong, and Taiwan. KargoDoor will confirm the appropriate
              warehouse and provide your unique Cargo Code before your supplier
              ships.
            </p>
          </div>
          <WarehouseMap />
        </div>
      </section>

      <section className="band tint" aria-labelledby="rates-title">
        <div className="wrap">
          <div className="which rv">
            <h2 id="rates-title">China to Philippines Shipping Rates</h2>
            <p className="q">
              Shipping cost depends on cargo size, weight, service type, and
              other shipment requirements.
            </p>
            <p className="lead">
              Use the KargoDoor shipping calculator for an estimate, or send us
              your cargo dimensions, weight, quantity, and item details for a
              quotation.
            </p>
            <div className="ctas">
              <Link className="btn btn-blue" href="/rates-calculator">CHECK SHIPPING RATES <span className="arr">→</span></Link>
            </div>
          </div>
        </div>
      </section>

      <section className="band" aria-labelledby="ready-title">
        <div className="wrap">
          <div className="cta rv">
            <h2 id="ready-title">READY TO SHIP FROM CHINA?</h2>
            <p>Tell us about your cargo and we’ll help you get started.</p>
            <MessengerLink className="btn btn-green glow" target="_blank" rel="noopener noreferrer" analyticsEvent="generate_lead">
              GET A QUOTE <span className="arr">→</span>
            </MessengerLink>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
