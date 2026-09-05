import { ArrowRight, Clock3, Mail, MessageCircle } from "lucide-react";
import { Footer, Header } from "@/components/site-chrome";
import { TrackedAnchor, TrackedLink } from "@/components/tracked-link";

type ContactCard = {
  icon: typeof MessageCircle;
  title: string;
  details: Array<{ label: string; href?: string }>;
  text: string;
  messagingApps?: boolean;
};

const contactCards: ContactCard[] = [
  {
    icon: MessageCircle,
    title: "MESSAGE US",
    details: [
      {
        label: "0917 157 7370",
        href: "tel:+639171577370",
      },
      {
        label: "0908 889 0664",
        href: "tel:+639088890664",
      },
    ],
    text: "Chat with our Team for shipping inquiries and assistance.",
    messagingApps: true,
  },
  {
    icon: Mail,
    title: "EMAIL US",
    details: [
      {
        label: "support@kargodoorph.com",
        href: "mailto:support@kargodoorph.com",
      },
    ],
    text: "Send us your shipment details and we’ll get back to you.",
  },
  {
    icon: Clock3,
    title: "SUPPORT HOURS",
    details: [
      { label: "8:00 AM to 10:00 PM" },
      { label: "7 Days a Week" },
    ],
    text: "We’re here to assist you everyday.",
  },
];

const messagingApps = [
  {
    name: "Viber",
    href: "https://www.viber.com/en/",
    icon: "https://cdn.simpleicons.org/viber/7360F2",
  },
  {
    name: "WhatsApp",
    href: "https://www.whatsapp.com",
    icon: "https://cdn.simpleicons.org/whatsapp/25D366",
  },
  {
    name: "Telegram",
    href: "https://web.telegram.org/a/",
    icon: "https://cdn.simpleicons.org/telegram/26A5E4",
  },
  {
    name: "WeChat",
    href: "https://www.wechat.com/en",
    icon: "https://cdn.simpleicons.org/wechat/07C160",
  },
];

export default function ContactUsPage() {
  return (
    <div className="kd-site-shell">
      <Header />

      <main className="kd-contact-page">
        <section
          className="kd-contact-intro"
          aria-labelledby="contact-title"
        >
          <div className="kd-container kd-contact-container">
            <header className="kd-contact-heading">
              <h1 id="contact-title">CONTACT US</h1>
              <h2>Ready when you are</h2>
              <p>
                Have a question or ready to ship? Our team is here to help.
              </p>
            </header>

            <div className="kd-contact-cards">
              {contactCards.map(
                ({ icon: Icon, title, details, text, messagingApps: showApps }) => (
                  <article className="kd-contact-card" key={title}>
                    <span className="kd-contact-icon" aria-hidden="true">
                      <Icon />
                    </span>

                    <h2>{title}</h2>

                    <div className="kd-contact-details">
                      {details.map((detail) =>
                        detail.href ? (
                          <TrackedAnchor
                            href={detail.href}
                            key={detail.label}
                            analyticsEvent={
                              detail.href.startsWith("tel:")
                                ? "click_phone"
                                : "click_email"
                            }
                          >
                            {detail.label}
                          </TrackedAnchor>
                        ) : (
                          <span key={detail.label}>{detail.label}</span>
                        ),
                      )}
                    </div>

                    {showApps && (
                      <div
                        className="kd-contact-messaging-apps"
                        aria-label="Messaging apps"
                      >
                        {messagingApps.map((app) => (
                          <a
                            className="kd-contact-messaging-app"
                            href={app.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            key={app.name}
                            aria-label={`Open ${app.name}`}
                          >
                            <span className="kd-contact-messaging-logo">
                              <img
                                src={app.icon}
                                alt=""
                                aria-hidden="true"
                              />
                            </span>
                            <span>{app.name}</span>
                          </a>
                        ))}
                      </div>
                    )}

                    <p>{text}</p>
                  </article>
                ),
              )}
            </div>
          </div>
        </section>

        <section
          className="kd-contact-ready"
          aria-labelledby="contact-ready-title"
        >
          <div className="kd-container kd-contact-ready-inner">
            <div>
              <h2 id="contact-ready-title">READY TO SHIP?</h2>
              <p>Tell us about your cargo and we’ll help you get started.</p>
            </div>

            <TrackedLink
              className="kd-contact-ready-button"
              href="/contact-us"
              analyticsEvent="generate_lead"
            >
              <span>GET A QUOTE</span>
              <ArrowRight aria-hidden="true" />
            </TrackedLink>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
