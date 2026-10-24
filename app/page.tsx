import Link from "next/link";
import { SiteShell } from "@/components/v5/chrome";
import { HERO_ROUTE, Scene } from "@/components/v5/art";
import { TierGrid } from "@/components/v5/sizes";
import { QuickCalculator, WhenVisible } from "@/components/v5/widgets";
import { MessengerLink } from "@/components/messenger-link";
import { faqs } from "@/lib/faq-content";
import { pageMetadata } from "@/lib/seo";
import { icon, stepIcons } from "@/components/v5/icons";

export const metadata = pageMetadata(
  "Shipping from China to the Philippines | KargoDoor PH",
  "Ship from China to the Philippines by sea or air with KargoDoor PH. Get all-in shipping, customs clearance, taxes, cargo coordination, and an easy rate calculator.",
  "/",
);

const whyCards = [
  {
    title: "CLEAR CHOICES",
    body: "Choose fast air freight or fully coordinated sea freight.",
    icon: icon(<path d="M16 3h5v5M8 21H3v-5M21 3l-7 7M3 21l7-7" />),
    green: false,
  },
  {
    title: "FRIENDLY GUIDANCE",
    body: "Get dedicated support from a team that helps manage your shipment.",
    icon: icon(<><path d="M3 18v-6a9 9 0 0 1 18 0v6" /><path d="M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3z" /></>),
    green: true,
  },
  {
    title: "ALL-INCLUSIVE RATES",
    body: "One rate covers international shipping, taxes, and customs clearance. No hidden fees.",
    icon: icon(<><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z" /><circle cx="7" cy="7" r="1.5" /></>),
    green: false,
  },
  {
    title: "100% SIMPLE",
    body: "Send your goods to our assigned warehouse, and we’ll handle the rest.",
    icon: icon(<><circle cx="12" cy="12" r="10" /><path d="M8 12l3 3 5-6" /></>),
    green: true,
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
] as const;

const services = [
  { kind: "sea", title: "SEA FREIGHT", body: "Affordable shipping for larger, heavier, or non-urgent cargo." },
  { kind: "air", title: "AIR FREIGHT", body: "Fast shipping for smaller, lightweight, or urgent cargo." },
  { kind: "road", title: "DOOR-TO-DOOR", body: "Free delivery for 2 CBM+ within 20 km of our Malabon Warehouse." },
] as const;

const homeFaqQuestions = [
  "What items are restricted or prohibited?",
  "What happens if my shipment is damaged or lost?",
  "How long does shipping take?",
];

export default function HomePage() {
  return (
    <SiteShell>
      <section className="hero2" aria-labelledby="hero-title">
        <div className="h2-photo" role="img" aria-label="KargoDoor PH truck at the port with a container ship and a plane" />
        <div className="h2-wash" />
        <div className="wrap hero-in">
          <span className="pill"><i />SOURCE · SHIP · RECEIVE</span>
          <span className="zh" lang="zh">采购 · 运输 · 收货</span>
          <h1 id="hero-title"><span className="l1">China to PH,</span><span className="l2">made SIMPLE</span></h1>
          <p className="lead">Simple, reliable, and affordable shipping from China to the Philippines.</p>
          <div className="ctas">
            <MessengerLink className="btn btn-green glow" target="_blank" rel="noopener noreferrer" analyticsEvent="generate_lead">
              GET A QUOTE <span className="arr">→</span>
            </MessengerLink>
            <Link className="btn btn-outline btn-solid" href="/rates-calculator">CALCULATOR</Link>
          </div>
          <div className="chips">
            <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M3 17l2 4h14l2-4H3zM6 17V9h12v8M12 9V4" /></svg>Sea Freight — 3–5 weeks</span>
            <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M2 14l20-7-6 13-4-5-5 3 1-5z" /></svg>Air Freight — 5–7 days</span>
            <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>No hidden fees.</span>
          </div>
        </div>
        <div className="h2-spacer" />
        <div className="h2-floor" />
        <div className="wrap h2-route" dangerouslySetInnerHTML={{ __html: HERO_ROUTE }} />
      </section>

      <div className="wrap q-blue">
        <QuickCalculator />
      </div>

      <section className="band why" aria-labelledby="why-title">
        <div className="wrap">
          <div className="head rv">
            <h2 id="why-title">Why <span className="u">KargoDoorPH?</span></h2>
            <p className="lead">
              Shipping from China to the Philippines made effortless. We help
              manage your cargo every step of the way.
            </p>
            <Link className="link-arr" href="/shipping-from-china-to-philippines">
              LEARN ABOUT CHINA TO PHILIPPINES SHIPPING <span className="arr">→</span>
            </Link>
          </div>
          <div className="grid g4 rv-g">
            {whyCards.map((card) => (
              <article className="card" key={card.title}>
                <div className={`ico${card.green ? " g" : ""}`}>{card.icon}</div>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="band tint" aria-labelledby="how-title">
        <div className="wrap">
          <div className="head rv">
            <h2 id="how-title">HOW IT WORKS?</h2>
            <p className="lead">Three clear steps from supplier to release.</p>
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
            <Link className="btn btn-blue" href="/how-it-works">VIEW ALL STEPS <span className="arr">→</span></Link>
          </p>
        </div>
      </section>

      <section className="band" aria-labelledby="services-title">
        <div className="wrap">
          <div className="head rv">
            <h2 id="services-title">OUR SERVICES</h2>
            <p className="lead">Choose the shipping service that fits your cargo.</p>
          </div>
          <div className="grid g3 rv-g">
            {services.map((service) => (
              <article className="card svc" key={service.kind}>
                <Scene kind={service.kind} className={`scene ${service.kind}`} />
                <div className="txt"><h3>{service.title}</h3><p>{service.body}</p></div>
              </article>
            ))}
          </div>
          <p className="center" style={{ marginTop: 40 }}>
            <Link className="link-arr" href="/services">EXPLORE OUR SERVICES <span className="arr">→</span></Link>
          </p>
        </div>
      </section>

      <section className="band tint" aria-labelledby="tiers-title">
        <div className="wrap">
          <div className="head rv">
            <h2 id="tiers-title">What are the KargoDoor PH package tiers?</h2>
            <p className="lead">Our promotional Sea Freight package rates are:</p>
          </div>
          <TierGrid />
          <p className="center" style={{ marginTop: 22, fontWeight: 800 }}>1 CBM = 1 m × 1 m × 1 m</p>
        </div>
      </section>

      <section className="band story" aria-labelledby="story-title">
        <div className="wrap story-grid">
          <div className="stage photo rv">
            <img src="/assets/kargodoor-team-at-work.webp" alt="A KargoDoor PH kargador carrying cargo at the warehouse" width="1000" height="1191" loading="lazy" />
          </div>
          <div className="story-txt rv">
            <span className="pill" style={{ alignSelf: "flex-start" }}><i />OUR STORY</span>
            <h2 id="story-title"><span className="one">Inspired by the Filipino</span> <span>“Kargador”</span></h2>
            <p className="lead">
              A <strong>kargador</strong> carries the load, makes the heavy
              work lighter, and helps others move forward.
            </p>
            <p className="lead">
              At <strong>KargoDoor PH</strong>, we bring that same spirit to
              logistics. We handle the complexities of shipping from China
              to the Philippines, so you can focus on what matters most—your
              business, your customers, and your next opportunity.
            </p>
            <p className="sign">From China to the Philippines,<br /> we make cargo simple.</p>
          </div>
        </div>
      </section>

      <section className="band" aria-labelledby="rates-title">
        <div className="wrap">
          <div className="cta rv">
            <span className="pill" style={{ background: "rgba(255,255,255,.12)", color: "#7fd34c" }}><i />RATES &amp; CALCULATOR</span>
            <h2 id="rates-title">Know your estimated rate before you ship.</h2>
            <p><b>Use our Calculator, then contact us for your final quote.</b></p>
            <Link className="btn btn-green glow" href="/rates-calculator">CALCULATE RATE <span className="arr">→</span></Link>
          </div>
        </div>
      </section>

      <section className="band tint" aria-labelledby="faq-title">
        <div className="wrap">
          <div className="head rv">
            <h2 id="faq-title">FREQUENTLY ASKED QUESTIONS</h2>
            <p className="lead">
              Quick answers about shipping, rates, warehouses, restricted
              goods, and more.
            </p>
          </div>
          <div className="acc">
            {homeFaqQuestions.map((question) => {
              const faq = faqs.find((item) => item.question === question);
              if (!faq) return null;
              return (
                <details name="home-faq" key={question}>
                  <summary><span>{faq.question}</span><span className="pl" aria-hidden="true">+</span></summary>
                  <div className="ans">{faq.answer}</div>
                </details>
              );
            })}
          </div>
          <div className="which" style={{ marginTop: 40, boxShadow: "none" }}>
            <h3 className="q">Need more information about shipping with KargoDoor PH?</h3>
            <p className="lead">
              Find answers to our most common questions, or contact our team
              if you need help with your shipment.
            </p>
            <Link className="btn btn-blue" href="/faq">VIEW ALL FAQS <span className="arr">→</span></Link>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
