"use client";

import { useId, useState, type ReactNode } from "react";
import { Footer, Header } from "@/components/site-chrome";
import { MESSENGER_URL } from "@/lib/contact-links";

const trackingUrl =
  "https://kargodoor-ph.em-aguirreph.workers.dev/track";

function ContactLink({
  children = "Contact KargoDoor",
}: {
  children?: ReactNode;
}) {
  return (
    <a
      href={MESSENGER_URL}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  );
}

function TrackingLink() {
  return (
    <a
      href={trackingUrl}
      target="_blank"
      rel="noopener noreferrer"
    >
      Track Your Package
    </a>
  );
}

function PartnerLink({
  name,
  href,
  delivery = false,
}: {
  name: string;
  href: string;
  delivery?: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        style={{
          display: "inline-block",
          verticalAlign: "-0.15em",
          marginRight: "0.3em",
        }}
      >
        {delivery ? (
          <>
            <path d="M3 6h11v12H3zM14 10h4l3 4v4h-7" />
            <circle cx="7" cy="18" r="2" />
            <circle cx="18" cy="18" r="2" />
          </>
        ) : (
          <>
            <path d="m3 8 2-5h14l2 5v3a3 3 0 0 1-4 2 3 3 0 0 1-5 0 3 3 0 0 1-5 0 3 3 0 0 1-4-2V8ZM5 14v7h14v-7M9 21v-6h6v6M3 8h18" />
          </>
        )}
      </svg>
      {name}
    </a>
  );
}

const faqs = [
  {
    question: "What is the complete KargoDoor shipping process?",
    answer: (
      <>
        <p>Shipping with KargoDoor is simple:</p>

        <ol className="kd-faq-steps">
          <li>
            <strong>1 — SOURCE YOUR PRODUCTS</strong>
            <span>
              Find and purchase products from your preferred supplier in China.
              Popular sourcing platforms:{" "}
              <PartnerLink
                name="Alibaba"
                href="https://www.alibaba.com"
              />
              ,{" "}
              <PartnerLink
                name="1688"
                href="https://www.1688.com"
              />
              , and{" "}
              <PartnerLink
                name="Made-in-China"
                href="https://www.made-in-china.com"
              />
              .
            </span>
          </li>

          <li>
            <strong>2 — CONTACT KARGODOOR</strong>
            <span>
              Before shipping, <ContactLink /> for your final rate and shipping
              instructions. Send us photos of the items, a product description,
              supplier information, quantity, and estimated size and weight, if
              available.
            </span>
          </li>

          <li>
            <strong>3 — PROPERLY PACKAGE YOUR ITEMS</strong>
            <span>
              Ask your supplier to properly pack and secure your goods before
              sending them to the KargoDoor warehouse.
              <br />
              <br />
              Please follow standard shipping and packaging practices:
              <br />
              <br />
              • Use a{" "}
              <b>strong, appropriately sized box or protective packaging</b>{" "}
              suitable for the item.
              <br />
              • Use{" "}
              <b>bubble wrap, foam, padding, or other protective materials</b>{" "}
              for fragile or breakable items.
              <br />
              • Fill empty spaces inside boxes to prevent items from moving during
              transportation.
              <br />
              • Protect sharp edges, corners, glass, electronics, and other
              delicate components.
              <br />
              • Seal boxes securely with <b>strong packing tape</b>.
              <br />
              • Use wooden crates, pallets, or reinforced packaging for fragile,
              heavy, oversized, or high-value cargo when appropriate.
              <br />
              • Liquids must be properly sealed and protected against leakage.
              <br />
              • Do not place loose or inadequately protected items inside
              packages.
              <br />
              • Packaging must be suitable for normal handling, stacking,
              warehouse movement, and international transportation.
              <br />
              <br />
              Customers should inform their supplier of the type of goods being
              shipped and request packaging appropriate for international freight.
              <br />
              <br />
              <b>
                Proper packaging is the responsibility of the customer and/or
                supplier.
              </b>{" "}
              KargoDoor may recommend additional packaging or reinforcement when
              necessary to help protect the shipment.
            </span>
          </li>

          <li>
            <strong>4 — GET YOUR WAREHOUSE</strong>
            <span>
              Once your goods are ready, contact us so we can confirm the
              appropriate warehouse for your shipment. Available warehouse
              locations include{" "}
              <b>Guangzhou, Yiwu, Shishi, Hong Kong, and Taiwan</b>.
            </span>
          </li>

          <li>
            <strong>5 — GET YOUR CARGO CODE / PACKAGE LABEL</strong>
            <span>
              We’ll provide your unique{" "}
              <b>KargoDoor Cargo Code / Package Label</b>.
              <br />
              <b>Sea Freight:</b> KDOOR XXXX
              <br />
              <b>Air Freight:</b> AIR KDOOR XXXX
              <br />
              Your supplier must attach the correct Cargo Code / Package Label to{" "}
              <b>EVERY package</b> before shipping.
            </span>
          </li>

          <li>
            <strong>6 — SUPPLIER SENDS YOUR PACKAGES</strong>
            <span>
              Your supplier sends your goods to the assigned warehouse. Once
              received, your packages are{" "}
              <b>identified, measured, and verified</b>.
            </span>
          </li>

          <li>
            <strong>7 — INTERNATIONAL SHIPPING</strong>
            <span>
              Your cargo is shipped to the Philippines via{" "}
              <b>Sea Freight or Air Freight</b>. KargoDoor handles the applicable{" "}
              <b>
                international freight, customs clearance, duties, taxes, and
                processing
              </b>
              .
            </span>
          </li>

          <li>
            <strong>8 — TRACKING &amp; ARRIVAL</strong>
            <span>
              We provide available shipment information and status updates during
              transit. For available shipment information, select{" "}
              <TrackingLink /> to message our team on Messenger. We’ll notify you
              when your cargo arrives in the Philippines and is ready for release.
            </span>
          </li>

          <li>
            <strong>9 — RECEIVE YOUR CARGO</strong>
            <span>
              Receive or pick up your cargo at our <b>Malabon Warehouse</b>.
              <br />
              <b>
                FREE delivery is available for shipments of 2 CBM or more within a
                20 km radius of our Malabon Warehouse.
              </b>
              <br />
              For locations outside the free-delivery area, delivery may be
              arranged through third-party delivery or trucking services such as{" "}
              <PartnerLink
                name="Lalamove"
                href="https://web.lalamove.com/"
                delivery
              />{" "}
              and{" "}
              <PartnerLink
                name="Transportify"
                href="https://www.transportify.com.ph/"
                delivery
              />
              , subject to availability and applicable delivery charges.
            </span>
          </li>
        </ol>
      </>
    ),
  },

  {
    question: "What are the KargoDoor PH package tiers?",
    answer: (
      <>
        <p>
          <b>Sea Freight</b>
        </p>

        <p>Our promotional Sea Freight package rates are:</p>

        <ul className="kd-faq-list">
          <li>
            <b>KD Mini</b> — Up to 0.01 CBM: <b>₱250 Fixed</b>
          </li>
          <li>
            <b>KD Lite</b> — Above 0.01 to 0.05 CBM: <b>₱750 Fixed</b>
          </li>
          <li>
            <b>KD Plus</b> — Above 0.05 to 0.125 CBM: <b>₱1,400 Fixed</b>
          </li>
          <li>
            <b>KD Standard</b> — Above 0.125 CBM: starts at{" "}
            <b>₱7,999/CBM</b>, minimum charge: <b>₱1,700</b>
          </li>
          <li>
            <b>KD Max</b> — High-density cargo: starts at <b>₱19/kg</b>,
            subject to the applicable rate calculation.
          </li>
        </ul>

        <p>
          <b>1 CBM = 1 m × 1 m × 1 m</b>
        </p>

        <p>
          Final CBM is based on verified warehouse measurements and may differ
          from your estimate.
        </p>

        <p>
          <b>Air Freight</b>
        </p>

        <p>
          Air Freight is charged at <b>₱500 per kilogram</b>.
        </p>

        <p>
          Charges are based on whichever is higher:{" "}
          <b>Actual Weight or Volumetric Weight</b>.
        </p>

        <p>
          <b>
            Volumetric Weight (kg) = Length (cm) × Width (cm) × Height (cm) ÷
            6,000
          </b>
        </p>

        <p>
          Special rates may be available for bulk shipments.{" "}
          <ContactLink>Contact KargoDoor for a quotation.</ContactLink>
        </p>

        <p>
          <em>
            Final charges are subject to actual warehouse measurements, weight,
            cargo type, inspection, and applicable shipping requirements.
          </em>
        </p>
      </>
    ),
  },

  {
    question: "Which warehouse should my supplier send my goods to?",
    answer: (
      <>
        <p>
          Please{" "}
          <b>
            <ContactLink /> before your supplier ships your goods
          </b>
          .
        </p>

        <p>
          We’ll confirm the appropriate warehouse for your shipment. Available
          locations include:
        </p>

        <p>
          <b>Guangzhou • Yiwu • Shishi • Hong Kong • Taiwan</b>
        </p>

        <p>
          We’ll also provide your{" "}
          <b>KargoDoor Cargo Code / Package Label</b>, which must be attached to{" "}
          <b>EVERY package</b>.
        </p>

        <p>
          <b>Sea Freight:</b> KDOOR XXXX
          <br />
          <b>Air Freight:</b> AIR KDOOR XXXX
        </p>
      </>
    ),
  },

  {
    question: "What is included in KargoDoor's all-in shipping rate?",
    answer: (
      <>
        <p>Our all-in shipping rate covers the applicable:</p>

        <p>
          <b>
            International Freight • Customs Clearance • Duties • Taxes •
            Processing
          </b>
        </p>

        <p>
          These charges cover shipping from the assigned warehouse to the
          Philippines.
        </p>

        <p>
          <b>
            FREE delivery is available for shipments of 2 CBM or more within a
            20 km radius of our Malabon Warehouse.
          </b>
        </p>

        <p>
          Extended delivery may also be arranged for locations outside the
          free-delivery area, subject to applicable delivery charges.
        </p>
      </>
    ),
  },

  {
    question: "How long does shipping take?",
    answer: (
      <>
        <p>
          <b>Sea Freight:</b> approximately <b>3–5 weeks</b>
        </p>

        <p>
          <b>Air Freight:</b> approximately <b>5–7 days</b>
        </p>

        <p>
          Transit times are estimates and may vary due to shipping schedules,
          customs processing, weather, holidays, port or airport conditions, and
          other circumstances beyond our control.
        </p>
      </>
    ),
  },

  {
    question: "What items are restricted or prohibited?",
    answer: (
      <>
        <p>
          Certain products may be{" "}
          <b>
            restricted, prohibited, or require special handling or documentation
          </b>{" "}
          depending on the product, shipping method, and applicable regulations.
        </p>

        <p>
          Please <ContactLink /> <b>before purchasing or shipping</b> items such
          as:
        </p>

        <p>
          Batteries • Liquids • Chemicals • Food • Medicines • Cosmetics •
          Branded Goods • Hazardous Materials • Other Regulated Products
        </p>

        <p>
          When in doubt,{" "}
          <b>send us the product details or a photo first</b> so our team can
          check whether the item can be accepted.
        </p>
      </>
    ),
  },

  {
    question: "Can I track my shipment?",
    answer: (
      <>
        <p>
          Yes. KargoDoor provides available{" "}
          <b>shipment information and status updates</b> throughout the shipping
          process.
        </p>

        <p>
          For available shipment information, select <TrackingLink /> to message
          our team on Messenger.
        </p>

        <p>
          We’ll notify you when your cargo arrives in the Philippines and is
          ready for release.
        </p>
      </>
    ),
  },

  {
    question: "What payment methods do you accept?",
    answer: (
      <>
        <p>We currently accept:</p>

        <p>
          <b>GCash • Bank Transfer • Maya</b>
        </p>

        <p>
          Payment instructions and account details will be provided directly by
          the KargoDoor team.
        </p>
      </>
    ),
  },

  {
    question: "What happens if my shipment is damaged or lost?",
    answer: (
      <>
        <p>
          KargoDoor offers coverage for <b>eligible shipments</b>, subject to
          verification and applicable coverage terms, conditions, and
          exclusions.
        </p>

        <p>Please keep your:</p>

        <p>
          <b>
            Photos • Receipts • Invoices • Shipment Records • Supporting
            Documents
          </b>
        </p>

        <p>
          These may be required to verify and process a claim.
        </p>

        <p>
          <b>
            <ContactLink>Message KargoDoor immediately</ContactLink> if you
            discover any loss or damage so our team can assist you.
          </b>
        </p>
      </>
    ),
  },

  {
    question: "What are your operating hours?",
    answer: (
      <>
        <p>
          <b>Customer Service</b>
        </p>

        <p>
          <b>
            8:00 AM – 10:00 PM
            <br />
            7 Days a Week
          </b>
        </p>

        <p>
          You may message KargoDoor anytime. Our team will respond to inquiries
          during operating hours.
        </p>

        <p>
          <b>Malabon Warehouse</b>
        </p>

        <p>
          <b>Pickup Hours:</b> 7:00 AM – 5:00 PM
        </p>

        <p>For cargo pickup, please bring:</p>

        <p>
          <b>Valid ID • Invoice / Proof of Shipment</b>
        </p>
      </>
    ),
  },
];

export default function FaqPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const regionId = useId();

  return (
    <div className="kd-site-shell">
      <Header />

      <main className="kd-faq-page">
        <section
          className="kd-faq-intro"
          aria-labelledby="faq-title"
        >
          <div className="kd-container kd-faq-container">
            <header className="kd-faq-heading">
              <h1 id="faq-title">FREQUENTLY ASKED QUESTIONS</h1>
              <p>
                Everything you need to know about shipping with KargoDoor PH.
              </p>
            </header>

            <div className="kd-faq-listing">
              {faqs.map((faq, index) => {
                const isOpen = openIndex === index;
                const answerId = `${regionId}-${index}`;

                return (
                  <article
                    className={`kd-faq-item${isOpen ? " is-open" : ""}`}
                    key={faq.question}
                  >
                    <h2>
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-controls={answerId}
                        onClick={() =>
                          setOpenIndex(isOpen ? null : index)
                        }
                      >
                        <span>
                          <b>{index + 1}.</b> {faq.question}
                        </span>

                        <i aria-hidden="true">
                          {isOpen ? "−" : "+"}
                        </i>
                      </button>
                    </h2>

                    <div
                      id={answerId}
                      className="kd-faq-answer"
                      aria-hidden={!isOpen}
                    >
                      <div>{faq.answer}</div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
