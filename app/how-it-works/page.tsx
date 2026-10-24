import { PageHero, SiteShell } from "@/components/v5/chrome";
import { Scene, type SceneKind } from "@/components/v5/art";
import { stepIcons } from "@/components/v5/icons";
import { MessengerLink } from "@/components/messenger-link";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata(
  "How to Ship from China to the Philippines | KargoDoor PH",
  "Learn how KargoDoor PH handles shipping from China to the Philippines from supplier pickup to warehouse receiving, customs clearance, and final cargo release.",
  "/how-it-works",
);

const processSteps = [
  {
    number: "01",
    title: "SOURCE",
    introduction: "Find it. Buy it. We’ll help you ship it.",
    points: [
      "Source and purchase your products from your preferred supplier in China.",
      "Once your goods are ready, contact us and we’ll confirm the best warehouse for your shipment.",
    ],
  },
  {
    number: "02",
    title: "SHIP",
    introduction: "Send it to our warehouse. We handle the rest.",
    points: [
      "We’ll provide the correct warehouse address and your unique KargoDoor Cargo Code.",
      "Your supplier sends your packages to one of our warehouses in Guangzhou, Yiwu, Shishi, Hong Kong, or Taiwan.",
      "Make sure your KargoDoor Cargo Code is attached to every package so we can properly identify and track your shipment.",
      "From there, we handle the international shipping, customs clearance, taxes, and processing — all covered by one simple all-in shipping rate.",
      "Estimated transit time: Sea Freight — 3–5 weeks · Air Freight — 5–7 days.",
    ],
  },
  {
    number: "03",
    title: "RECEIVE",
    introduction: "Your cargo arrives. You choose how to receive it.",
    points: [
      "We’ll notify you once your shipment is ready in the Philippines.",
      "Pick up your cargo from our Malabon warehouse, or arrange door-to-door delivery for an applicable fee.",
    ],
  },
];

const art: Record<string, { kind: SceneKind; background?: string }> = {
  SOURCE: { kind: "source" },
  SHIP: { kind: "sea", background: "linear-gradient(#cfe3ff,#eaf3ff)" },
  RECEIVE: { kind: "road", background: "linear-gradient(#dff3d2,#f3fbee)" },
};

export default function HowItWorksPage() {
  return (
    <SiteShell>
      <PageHero>
        <span className="pill"><i />SOURCE · SHIP · RECEIVE</span>
        <h1 id="process-title">HOW IT WORKS?</h1>
        <p className="lead">Shipping from China to the Philippines doesn’t have to be complicated.</p>
        <p className="lead hi">
          With KargoDoor PH, it’s as simple as <strong>SOURCE · SHIP · RECEIVE</strong>
        </p>
      </PageHero>

      <section className="band" style={{ paddingTop: 40 }} aria-labelledby="process-title">
        <div className="wrap">
          <div className="tl">
            <span className="fillv" />
            {processSteps.map((step) => (
              <article className="trow rv" key={step.number}>
                <div className="num">{stepIcons[step.title as keyof typeof stepIcons]}<b>{step.number}</b></div>
                <div className="tc">
                  <h2 className="h3">{step.title}</h2>
                  <p className="intro">{step.introduction}</p>
                  <ul>
                    {step.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                  {step.title === "SHIP" && (
                    <div className="label" aria-hidden="true">
                      <div><small>SEA FREIGHT</small>KDOOR XXXX</div>
                      <div><small>AIR FREIGHT</small>AIR KDOOR XXXX</div>
                    </div>
                  )}
                </div>
                <div className="art">
                  <Scene kind={art[step.title].kind} className="fscene" style={{ width: "100%", maxWidth: 420, background: art[step.title].background }} />
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="band" style={{ paddingTop: 0 }} aria-labelledby="ready-title">
        <div className="wrap">
          <div className="cta rv">
            <h2 id="ready-title">READY TO SHIP?</h2>
            <p>From China to the Philippines, we make cargo simple.</p>
            <MessengerLink className="btn btn-green glow" target="_blank" rel="noopener noreferrer" analyticsEvent="generate_lead">
              GET A QUOTE <span className="arr">→</span>
            </MessengerLink>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
