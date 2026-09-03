import Link from "next/link";
import { Footer, Header } from "@/components/site-chrome";
import { TrackedLink } from "@/components/tracked-link";

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
      "Estimated transit time: 21–30 days.",
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

export default function HowItWorksPage() {
  return (
    <div className="kd-site-shell">
      <Header />

      <main>
        <section className="kd-process" aria-labelledby="process-title">
          <div className="kd-container kd-process-container">
            <div className="kd-process-heading">
              <h1 id="process-title">HOW IT WORKS?</h1>
              <p>Shipping from China to the Philippines doesn’t have to be complicated.</p>
              <p>
                With KargoDoor PH, it’s as simple as <strong>SOURCE · SHIP · RECEIVE</strong>
              </p>
            </div>

            <div className="kd-process-list">
              {processSteps.map((step) => (
                <article className="kd-process-card" key={step.number}>
                  <header className="kd-process-card-title">
                    <span>{step.number}</span>
                    <span aria-hidden="true">—</span>
                    <h2>{step.title}</h2>
                  </header>
                  <p className="kd-process-introduction">{step.introduction}</p>
                  <ul>
                    {step.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="kd-ready" aria-labelledby="ready-title">
          <div className="kd-container kd-ready-inner">
            <div className="kd-ready-copy">
              <h2 id="ready-title">READY TO SHIP?</h2>
              <p>From China to the Philippines, we make cargo simple.</p>
            </div>
            <TrackedLink className="kd-button kd-button-green kd-ready-button" href="/contact-us" analyticsEvent="generate_lead">
              GET A QUOTE
            </TrackedLink>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
