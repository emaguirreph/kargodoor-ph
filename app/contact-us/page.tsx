import { PageHero, SiteShell } from "@/components/v5/chrome";
import { SupportDial } from "@/components/v5/widgets";
import { icon } from "@/components/v5/icons";
import { TrackedAnchor } from "@/components/tracked-link";
import { MessengerLink } from "@/components/messenger-link";
import { pageMetadata } from "@/lib/seo";
export const metadata = pageMetadata(
  "Contact KargoDoor PH | China to Philippines Shipping",
  "Contact KargoDoor PH for sea freight, air freight, shipping rates, quotations, and cargo assistance from China to the Philippines.",
  "/contact-us",
);

const messagingApps = [
  {
    name: "Viber",
    href: "https://www.viber.com/en/",
    color: "#7360f2",
  },
  {
    name: "WhatsApp",
    href: "https://www.whatsapp.com",
    color: "#1a9e55",
  },
  {
    name: "Telegram",
    href: "https://web.telegram.org/a/",
    color: "#229ed9",
  },
  {
    name: "WeChat",
    href: "https://www.wechat.com/en",
    color: "#07a35a",
  },
];

const phoneIcon = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" /></svg>;

export default function ContactUsPage() {
  return (
    <SiteShell>
      <PageHero>
        <h1 id="contact-title">CONTACT US</h1>
        <h2 className="hi2">Ready when you are</h2>
        <p className="lead">
          Have a question or ready to ship? Our team is here to help.
        </p>
        <span className="online"><i />8:00 AM to 10:00 PM · 7 Days a Week</span>
      </PageHero>

      <section className="band" style={{ paddingTop: 0 }} aria-labelledby="contact-title">
        <div className="wrap lift">
          <div className="cgrid rv-g">
            <article className="ccard msg">
              <div className="top">
                <div className="ico g">{icon(<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />)}</div>
                <h2 className="h3">MESSAGE US</h2>
              </div>
              <p>Chat with our Team for shipping inquiries and assistance.</p>
              <div className="phones">
                <TrackedAnchor href="tel:+639171577370" analyticsEvent="click_phone">{phoneIcon}+63 917 157 7370</TrackedAnchor>
                <TrackedAnchor href="tel:+639088890664" analyticsEvent="click_phone">{phoneIcon}+63 908 889 0664</TrackedAnchor>
              </div>
              <div className="apps" aria-label="Messaging apps">
                {messagingApps.map((app) => (
                  <a key={app.name} href={app.href} target="_blank" rel="noopener noreferrer" aria-label={`Open ${app.name}`} style={{ background: app.color }}>
                    {app.name}
                  </a>
                ))}
              </div>
              <MessengerLink className="msgvid" target="_blank" rel="noopener noreferrer" aria-label="Message KargoDoor PH" analyticsEvent="contact">
                <video autoPlay loop muted playsInline preload="metadata" aria-hidden="true">
                  <source src="/assets/kargodoor-message-us-approved.webm" type="video/webm" />
                </video>
              </MessengerLink>
            </article>

            <article className="ccard">
              <div className="top">
                <div className="ico">{icon(<><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></>)}</div>
                <h2 className="h3">EMAIL US</h2>
              </div>
              <TrackedAnchor className="mail" href="mailto:support@kargodoorph.com" analyticsEvent="click_email">support@kargodoorph.com</TrackedAnchor>
              <p>Send us your shipment details and we’ll get back to you.</p>
            </article>

            <article className="ccard">
              <div className="top">
                <div className="ico g">{icon(<><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>)}</div>
                <h2 className="h3">SUPPORT HOURS</h2>
              </div>
              <div className="hours">
                <SupportDial />
                <div>
                  <div className="t">8:00 AM to 10:00 PM</div>
                  <div className="t" style={{ color: "var(--green)" }}>7 Days a Week</div>
                </div>
              </div>
              <p>We’re here to assist you everyday.</p>
            </article>
          </div>

          <div className="cta rv" style={{ marginTop: 40 }}>
            <h2 id="contact-ready-title">READY TO SHIP?</h2>
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
