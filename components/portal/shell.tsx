import type { ReactNode } from "react";
import { Icon, portalSections, type PortalLinks, type PortalSection } from "./views";
import type { PortalData } from "@/lib/customer/portal";

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "KD";

/** Side menu + page area. On phones the menu folds into a "Menu" button. */
export function PortalShell({ data, links, active, banner, children }: {
  data: PortalData; links: PortalLinks; active: PortalSection; banner?: ReactNode; children: ReactNode;
}) {
  const unpaid = data.bills.filter((bill) => bill.balance > 0).length;
  const current = portalSections.find(([key]) => key === active)?.[1] ?? "My Dashboard";
  const nav = (
    <nav className="pnav" aria-label="Portal menu">
      {portalSections.map(([key, label, icon]) => (
        <a key={key} href={links.href(key)} aria-current={key === active ? "page" : undefined}>
          <Icon name={icon} />{label}
          {key === "payments" && unpaid ? <span className="pbadge" aria-label={`${unpaid} unpaid`}>{unpaid}</span> : null}
        </a>
      ))}
    </nav>
  );
  const who = (
    <div className="pwho">
      <div><span className="av">{initials(data.customer.full_name)}</span><span className="em">{data.customer.login_email || data.customer.email || data.customer.mobile}</span></div>
      {links.preview ? <span className="pbtn pbtn-line">LOG OUT</span> : (
        <form action="/customer/logout" method="post"><button className="pbtn pbtn-line" type="submit">LOG OUT</button></form>
      )}
    </div>
  );
  return (
    <div className="portal">
      {banner}
      <div className="papp">
        <aside className="pside">
          <div className="pbrand">
            <img src="/assets/kargodoor-logo-tagline-transparent.webp" alt="KargoDoor PH" width="520" height="192" />
            <small>MY KargoDoorPH · CUSTOMER PORTAL</small>
          </div>
          {nav}
          {who}
        </aside>
        <details className="pmobile">
          <summary><span>☰ Menu</span><b>{current}</b>{unpaid ? <span className="pbadge">{unpaid}</span> : null}</summary>
          {nav}
          {who}
        </details>
        <div className="pmain">{children}</div>
      </div>
    </div>
  );
}
