import type { ReactNode } from "react";
import Link from "next/link";
import { MessengerLink } from "@/components/messenger-link";
import { CopyButton } from "./copy-button";
import { ShippingTabs, type ShippingTabWarehouse } from "./shipping-tabs";
import { WaybillExample } from "./illustrations";
import { kargodoorBankAccounts } from "@/lib/admin/bank-accounts";
import { riderPickupMessage } from "@/lib/admin/customer-messages";
import { onceShippedMessage, supplierShipmentMessage } from "@/lib/admin/shipping-instructions";
import { hongKongMark, malabonWarehouseAddress, warehouseAddresses, type WarehouseName } from "@/lib/warehouse-addresses";
import {
  concernTopics, formatDate, formatMonth, formatPeso, portalStages, stageIndex,
  type PortalBill, type PortalData, type PortalShipment,
} from "@/lib/customer/portal";

export const portalSections = [
  ["dashboard", "My Dashboard", "home"],
  ["shipments", "My Shipments", "box"],
  ["how-to-ship", "Shipping Process", "how"],
  ["warehouses", "Warehouses", "house"],
  ["book", "Book a Shipment", "plus"],
  ["payments", "Payments", "card"],
  ["refer", "Refer & Earn", "award"],
  ["support", "Support", "chat"],
  ["account", "Account", "user"],
  ["track", "Track Shipment", "track"],
] as const;
/** Pages that still work (dashboard Track box) but are not in the side menu: My Shipments covers tracking. */
export const hiddenSections: readonly string[] = ["track"];
export type PortalSection = (typeof portalSections)[number][0];
export const isPortalSection = (value: string): value is PortalSection => portalSections.some(([key]) => key === value);

/** Where links and forms go: the real portal, or the admin preview (read-only). */
export type PortalLinks = { href: (section: PortalSection, query?: string) => string; preview: boolean };
export type ViewProps = { data: PortalData; links: PortalLinks; query: Record<string, string | undefined> };

const iconPaths: Record<string, ReactNode> = {
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  how: <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 19h16" />,
  box: <path d="M3 7l9-4 9 4-9 4-9-4zm0 0v10l9 4 9-4V7M12 11v10" />,
  track: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-5-5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  card: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /></>,
  award: <><circle cx="12" cy="8" r="5" /><path d="M9 13l-2 8 5-3 5 3-2-8" /></>,
  house: <path d="M3 21V9l9-6 9 6v12M8 21v-7h8v7" />,
  chat: <path d="M4 5h16v11H8l-4 4z" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4-6 8-6s7 2 8 6" /></>,
};
export const Icon = ({ name }: { name: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name]}</svg>
);

const Pill = ({ children, tone = "" }: { children: ReactNode; tone?: string }) => <span className={`ppill ${tone}`}>{children}</span>;
const payTone = (payment: string) => payment === "PAID" ? "paid" : payment === "UNPAID" || payment === "PARTIAL" ? "unpaid" : "";

function PageHead({ title, sub, eyebrow, action }: { title: string; sub?: ReactNode; eyebrow?: string; action?: ReactNode }) {
  return (
    <div className="phead">
      <div>{eyebrow ? <span className="peyebrow">{eyebrow}</span> : null}<h1>{title}</h1>{sub ? <p>{sub}</p> : null}</div>
      {action}
    </div>
  );
}

export function Notice({ kind = "ok", children }: { kind?: "ok" | "err"; children: ReactNode }) {
  return <p className={`pnotice ${kind}`} role={kind === "err" ? "alert" : "status"}>{children}</p>;
}

/** The 7 stages as a progress line. */
function Stages({ shipment }: { shipment: PortalShipment }) {
  if (shipment.status === "Cancelled") return <p className="pmuted">This shipment was cancelled.</p>;
  const current = stageIndex(shipment.status);
  return (
    <>
      {current < 0 ? <p className="pmuted">Waiting for your supplier to send the cargo to our China warehouse.</p> : null}
      <ol className="psteps" aria-label="Shipment progress">
        {portalStages(shipment.service).map((name, index) => {
          const state = index < current || (index === current && index === 6) ? "done" : index === current ? "now" : "";
          return <li key={name} className={state}><span className="dot">{state === "done" ? "✓" : ""}</span><span>{name}</span></li>;
        })}
      </ol>
    </>
  );
}

function ShipmentCard({ shipment, links, code, customer }: { shipment: PortalShipment; links: PortalLinks; code: string; customer: PortalData["customer"] }) {
  const supplierText = supplierShipmentMessage({ customerName: customer.full_name, customerCode: code, service: shipment.service, warehouse: shipment.warehouse, item: shipment.item, clientPhone: customer.mobile });
  const owes = shipment.payment === "UNPAID" || shipment.payment === "PARTIAL";
  return (
    <article className="pcard" id={shipment.trackingNumber}>
      <div className="prow">
        <div>
          <span className="ptn big">{shipment.trackingNumber}</span>
          {shipment.item ? <div className="pstrong">{shipment.item}</div> : null}
          {shipment.category ? <small className="pmuted">{shipment.category}</small> : null}
        </div>
        <div className="ppills"><Pill>{shipment.service}</Pill><Pill>{shipment.status}</Pill><Pill tone={payTone(shipment.payment)}>{shipment.payment}</Pill></div>
      </div>
      <Stages shipment={shipment} />
      <dl className="pfacts">
        <div><dt>Est. arrival</dt><dd>{shipment.eta ?? (shipment.arrivedDate ? `Arrived ${formatDate(shipment.arrivedDate)}` : "—")}{shipment.etaSpan ? <small>{shipment.service === "Air Freight" ? "Air" : "Sea"} {shipment.etaSpan}</small> : null}</dd></div>
        <div><dt>CN warehouse</dt><dd>{shipment.warehouse || "—"}<small>{shipment.receivedDate ? `Received ${formatDate(shipment.receivedDate)}` : "Pending warehouse receipt"}</small></dd></div>
        <div><dt>Declared</dt><dd>{shipment.declared ?? "—"}</dd></div>
        <div><dt>Verified</dt><dd>{shipment.verified ?? "Pending"}</dd></div>
      </dl>
      <div className="prow">
        <div className="pmoney">
          <div><span>Freight</span><b>{formatPeso(shipment.freight)}</b></div>
          <div><span>Delivery</span><b>{formatPeso(shipment.delivery)}</b></div>
          {owes ? <div className="bal"><span>Balance</span><b>{formatPeso(shipment.balance)}</b></div> : null}
        </div>
        <div className="pbtns">
          {owes ? <a className="pbtn pbtn-blue" href={links.href("payments", `bill=${shipment.invoiceId}`)}>PAY NOW</a> : null}
          {shipment.invoiceId && !links.preview ? <a className="pbtn pbtn-line" href={`/customer/invoice?id=${shipment.invoiceId}`}>{shipment.payment === "PAID" ? "RECEIPT (PDF)" : "VIEW BILL (PDF)"}</a> : null}
        </div>
      </div>
      <details className="pdetails">
        <summary>Shipping instructions for this package</summary>
        {/* Same text as the admin Supplier Message for this shipment. */}
        <pre>{supplierText}</pre>
        <div className="pbtns"><CopyButton text={supplierText} label="COPY SUPPLIER INSTRUCTIONS" className="pbtn pbtn-blue" /></div>
      </details>
    </article>
  );
}

function CodeBox({ data }: { data: PortalData }) {
  const code = data.customer.customer_code;
  const phone = data.customer.mobile;
  const copyText = `SHIPPING MARK / CARGO CODE: ${code}\nITEM: [your item name]\nCUSTOMER PHONE NUMBER: ${phone}`;
  return (
    <div className="pcode pcodewide">
      <div className="pcodemain">
        <h3>Put your code on every carton</h3>
        <div className="inner">
          <div>
            <small>SHIPPING MARK / CARGO CODE</small><strong>{code}</strong>
            <div className="pcodelines"><span>Item: <b>your item name</b></span><span>Customer Phone Number: <b>{phone}</b></span></div>
            <div className="pcodelines"><span>Sea: <b>SEA {code}</b></span><span>Air: <b>AIR {code}</b></span><span>Hong Kong: <b>{hongKongMark(code)}</b></span></div>
          </div>
        </div>
        <p>This code is how the warehouse knows the box is <b>yours</b>. Boxes without it can be refused or lost. Send it to your supplier and ask them to write it on <b>every</b> carton, not just the first one.</p>
        <div className="pbtns"><CopyButton text={copyText} label="COPY" className="pbtn pbtn-blue" /></div>
      </div>
      <CartonLabel data={data} />
    </div>
  );
}

const tabWarehouses: Array<[WarehouseName, "Sea" | "Air"]> = [["Guangzhou", "Sea"], ["Yiwu", "Sea"], ["Shishi", "Sea"], ["Hong Kong", "Sea"], ["Tongda Air Cargo", "Air"]];

/** Packing list + packaging rules with drawn examples. */
function PackagingInstructions({ code }: { code: string }) {
  return (
    <>
      <div className="psplit">
        <div className="pstack">
      <p className="pmuted">Show this to your supplier so your goods are protected and accepted by the warehouse.</p>
      <ol className="plist">
        <li><b>Label every carton</b> with your shipping mark ({code}), item name, supplier&apos;s phone number and your PH phone number.</li>
        <li><b>Packing list</b> in every shipment: product description in Chinese, material, quantity and weight, and the supplier&apos;s phone number.</li>
        <li><b>Proper packaging:</b> securely packed and undamaged. Fragile items need extra protection.</li>
      </ol>
      <p className="phint">⚠️ Packages with incomplete labels or damaged packaging will NOT be accepted by the warehouse.</p>
        </div>
        <figure className="pphoto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/portal-packing-instructions.webp" alt="Packaging examples: insulation inside the box and fully wooden crates" width="982" height="1280" loading="lazy" />
          <figcaption>Protect your shipment: proper insulation inside, or a full wooden crate for fragile and heavy items.</figcaption>
        </figure>
      </div>
    </>
  );
}

/** Courier waybill example: what to send us once the supplier ships. */
function WaybillBlock() {
  const waybill = onceShippedMessage();
  return (
    <div className="psplit">
      <div className="pstack">
        <p className="pmuted">Once your supplier ships, send us these details so we can watch for your boxes:</p>
        <ul className="plist">
          <li><b>Courier</b> (e.g. SF Express)</li>
          <li><b>Tracking / Waybill No.</b></li>
          <li><b>Total packages</b></li>
          <li><b>Receipt or package photo</b> 📸</li>
        </ul>
        <div className="pbtns">
          <MessengerLink className="pbtn pbtn-blue" target="_blank" rel="noopener noreferrer">💬 SEND ON MESSENGER</MessengerLink>
          <CopyButton text={waybill} label="COPY EXAMPLE" className="pbtn pbtn-line" />
        </div>
      </div>
      <WaybillExample />
    </div>
  );
}

/** Supplier Instructions, Packaging Instructions (and on the dashboard, Courier Waybill Example) tabs, shown below the cargo code. */
function ShippingGuide({ data, showWaybill = true }: { data: PortalData; showWaybill?: boolean }) {
  const code = data.customer.customer_code;
  const warehouses: ShippingTabWarehouse[] = tabWarehouses.map(([name, mode]) => ({
    name, mode,
    // Same text as the admin Supplier Message, without the "Hi …, please send this to your supplier" lines.
    supplierMessage: supplierShipmentMessage({ customerCode: code, service: `${mode} Freight`, warehouse: name, clientPhone: data.customer.mobile })
      .replace(/^Hi [^\n]*\n[^\n]*\n\n/, "")
      .replace("[Add the item / product name]", "[Your item name]"),
  }));
  return <ShippingTabs warehouses={warehouses} packaging={<PackagingInstructions code={code} />} waybill={showWaybill ? <WaybillBlock /> : undefined} />;
}

function DashboardCodeBox({ data, children }: { data: PortalData; children?: ReactNode }) {
  const code = data.customer.customer_code;
  return (
    <div className="pcode">
      <h3>Put your code on every carton</h3>
      <div className="inner">
        <div><small>YOUR ACCOUNT / CARGO CODE</small><strong>{code}</strong></div>
        <div className="labels">Sea: <b>SEA {code}</b><br />Air: <b>AIR {code}</b></div>
      </div>
      <p>This code is how the warehouse knows the box is <b>yours</b>. Boxes without it can be refused or lost. Send it to your supplier and ask them to write it on <b>every</b> carton, not just the first one.</p>
      {children}
    </div>
  );
}

const checkFirst = ["Batteries", "Liquids", "Chemicals", "Food", "Medicines", "Cosmetics", "Branded goods", "Hazardous materials", "Other regulated products"];

function Reminders() {
  return (
    <div className="pstack">
      <div className="phint pask">
        <b>Message us first before buying any of these:</b>
        <div className="pchips">{checkFirst.map((item) => <span key={item}>{item}</span>)}</div>
        <p>Some of these can&apos;t be shipped or need special handling. Contact us about these packages <b>before</b> your supplier sends them, and we&apos;ll tell you if we can ship it.</p>
        <div className="pbtns"><MessengerLink className="pbtn pbtn-blue" target="_blank" rel="noopener noreferrer">💬 MESSAGE US ON MESSENGER</MessengerLink></div>
      </div>
    </div>
  );
}

export function DashboardView({ data, links }: ViewProps) {
  const active = data.shipments.filter((s) => s.active);
  const unpaid = data.bills.filter((b) => b.balance > 0);
  return (
    <>
      <div className="pbanner">
        <div>
          <h1>MY KargoDoorPH</h1>
          <div className="hi">Welcome, {data.customer.full_name}</div>
        </div>
        <a className="pbtn pbtn-green" href={links.href("book")}>+ BOOK A SHIPMENT</a>
      </div>
      <section className="pcard">
        <div className="prow"><h2>📦 How to ship with us</h2><a className="plink" href={links.href("warehouses")}>Warehouse addresses →</a></div>
        <DashboardCodeBox data={data} />
        <details className="pdetails"><summary>Reminders: items to check with us first</summary><Reminders /></details>
      </section>
      <div className="pgrid2">
        <section className="pcard">
          <h2>Track your shipment</h2>
          <form className="ptrack" method="get" action={links.preview ? undefined : "/customer/track"}>
            <label className="sr" htmlFor="dash-track">Tracking number</label>
            <input id="dash-track" name="q" placeholder="Your tracking number, e.g. KDSEA-123456" />
            <button className="pbtn pbtn-blue" type="submit" disabled={links.preview}>TRACK</button>
          </form>
        </section>
        <section className="pcard">
          <h2>Payment due</h2>
          {unpaid.length ? (
            <>
              {unpaid.slice(0, 3).map((bill) => (
                <div className="prow" key={bill.invoiceId}>
                  <div><span className="ptn">{bill.trackingNumber}</span><div className="pdue">{formatPeso(bill.balance)}</div></div>
                  <a className="pbtn pbtn-blue" href={links.href("payments", `bill=${bill.invoiceId}`)}>PAY NOW</a>
                </div>
              ))}
            </>
          ) : <div className="pempty"><span className="big">🎉</span>Nothing to pay right now.</div>}
          <a className="plink" href={links.href("payments")}>View payment history</a>
        </section>
      </div>
      <div className="pgrid2">
        <section className="pcard">
          <h2>Active shipments</h2>
          {active.length ? (
            <div className="ptable"><table><thead><tr><th>Shipment</th><th>Type</th><th>Status</th><th>Est. arrival</th></tr></thead><tbody>
              {active.slice(0, 5).map((s) => <tr key={s.id}><td><a className="ptn" href={links.href("shipments") + `#${s.trackingNumber}`}>{s.trackingNumber}</a>{s.item ? <small>{s.item}</small> : null}</td><td>{s.service}</td><td>{s.status}</td><td>{s.eta ?? "—"}</td></tr>)}
            </tbody></table></div>
          ) : <div className="pempty">No active shipments yet. <a className="plink" href={links.href("book")}>Book your next shipment →</a></div>}
          {data.bookings.length ? <p className="pmuted">Waiting for approval: {data.bookings.map((b) => b.ref).join(", ")}</p> : null}
          <a className="plink" href={links.href("shipments")}>View all shipments</a>
        </section>
        <section className="pcard pref">
          <h2>Refer &amp; Earn</h2>
          <p>Invite a friend. Earn <b>10% commission</b> on their first 3 shipments. Not for your own shipments. Terms apply.</p>
          <div className="prefnums"><div><b>{data.referrals}</b><small>FRIENDS</small></div></div>
          <a className="plink" href={links.href("refer")}>See how it works</a>
        </section>
      </div>
      <nav className="pcard pquick" aria-label="Quick actions">
        <a href={links.href("book")}><Icon name="plus" />Book a Shipment</a>
        <a href={links.href("track")}><Icon name="track" />Track Shipment</a>
        <a href={links.href("payments")}><Icon name="card" />Make Payment</a>
        <a href={links.href("support")}><Icon name="chat" />Contact Support</a>
      </nav>
    </>
  );
}

/** Picture of a carton with the shipping mark label: code, item and the customer's phone number. */
function CartonLabel({ data }: { data: PortalData }) {
  const code = data.customer.customer_code;
  return (
    <figure className="pcarton" aria-label="Example carton label">
      <div className="box">
        <div className="tape" />
        <div className="label">
          <small>SHIPPING MARK / CARGO CODE</small>
          <strong>{code}</strong>
          <span>ITEM: <b>your item name</b></span>
          <span>PHONE: <b>{data.customer.mobile}</b></span>
        </div>
      </div>
      <figcaption>Example: write this on <b>every</b> carton</figcaption>
    </figure>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className={`pcard pstepcard s${n}`}>
      <div className="pstephead"><span className="n">STEP {n}</span><h2>{title}</h2></div>
      {children}
    </section>
  );
}

export function HowToShipView({ data, links }: ViewProps) {
  return (
    <>
      <PageHead eyebrow="Getting started" title="Shipping Process" sub="Ganito lang mag-import with KargoDoor PH." />
      <section className="pcard"><h2>⚠️ Reminders before you buy</h2><Reminders /></section>
      <Step n={1} title="Send your code to your supplier">
        <CodeBox data={data} />
        <ShippingGuide data={data} showWaybill={false} />
      </Step>
      <Step n={2} title="Notify Us With Your Shipment">
        <WaybillBlock />
      </Step>
      <Step n={3} title="China warehouse receives and measures">
        <p>Our China warehouse receives your boxes and measures the <b>actual</b> CBM and weight. Your final bill uses these verified numbers. Sea takes 3–5 weeks, air 5–7 days.</p>
        <a className="plink" href={links.href("shipments")}>See my shipments →</a>
      </Step>
      <Step n={4} title="Malabon warehouse receives, pay and release">
        <p>When your cargo reaches our Malabon warehouse, we send your bill. Pay by UnionBank or GCash and upload your proof. Once it shows <b>PAID</b>, we release it for pickup or delivery.</p>
        <div className="pbtns"><a className="pbtn pbtn-blue" href={links.href("payments")}>GO TO PAYMENTS</a><a className="pbtn pbtn-line" href={links.href("warehouses")}>MALABON ADDRESS →</a></div>
      </Step>
    </>
  );
}

export function ShipmentsView({ data, links }: ViewProps) {
  const active = data.shipments.filter((s) => s.active);
  const history = data.shipments.filter((s) => !s.active);
  return (
    <>
      <PageHead title="My Shipments" sub={<>Your code: <b>{data.customer.customer_code}</b> · {active.length} active, {history.length} done</>} />
      {data.bookings.length ? <section className="pcard"><h2>Waiting for approval</h2><p className="pmuted">We&apos;re checking these bookings. Once approved, they show here with live status.</p>
        <div className="ptable"><table><thead><tr><th>Booking no.</th><th>Item</th><th>Type</th><th>Sent</th></tr></thead><tbody>
          {data.bookings.map((b) => <tr key={b.ref}><td className="ptn">{b.ref}</td><td>{b.item}</td><td>{b.service}</td><td>{formatDate(b.createdAt)}</td></tr>)}
        </tbody></table></div></section> : null}
      {active.length ? active.map((s) => <ShipmentCard key={s.id} shipment={s} links={links} code={data.customer.customer_code} customer={data.customer} />) : (
        <section className="pcard pempty">No active shipments yet.<br />Already shipping with us and expecting to see cargo here? <MessengerLink className="plink" target="_blank" rel="noopener noreferrer">Message us</MessengerLink> with your name and we&apos;ll link it.</section>
      )}
      <section className="pcard">
        <h2>Shipment history</h2>
        {history.length ? (
          <div className="ptable"><table><thead><tr><th>Shipment</th><th>Type</th><th>Status</th><th>Delivered</th><th>Total</th><th></th></tr></thead><tbody>
            {history.map((s) => <tr key={s.id}><td><span className="ptn">{s.trackingNumber}</span>{s.item ? <small>{s.item}</small> : null}</td><td>{s.service}</td><td>{s.status}</td><td>{formatDate(s.deliveredDate ?? (s.status === "Delivered" ? s.updatedAt : null))}</td><td>{formatPeso(s.total)}</td>
              <td>{s.invoiceId && !links.preview ? <a className="plink" href={`/customer/invoice?id=${s.invoiceId}`}>{s.payment === "PAID" ? "Receipt PDF" : "Bill PDF"}</a> : null}</td></tr>)}
          </tbody></table></div>
        ) : <p className="pempty">No delivered shipments yet. Your history builds up here.</p>}
      </section>
    </>
  );
}

export function TrackView({ data, links, query }: ViewProps) {
  const q = String(query.q ?? "").trim().toUpperCase().replace(/\s+/g, "");
  const found = q ? data.shipments.find((s) => s.trackingNumber.toUpperCase().replace(/\s+/g, "") === q) : null;
  return (
    <>
      <PageHead title="Track Shipment" sub="Search by your KargoDoor tracking number (KDSEA-… or KDAIR-…)." />
      <section className="pcard">
        <form className="ptrack" method="get" action={links.preview ? undefined : "/customer/track"}>
          <label className="sr" htmlFor="track-q">Tracking number</label>
          <input id="track-q" name="q" defaultValue={query.q ?? ""} placeholder="e.g. KDSEA-123456" />
          <button className="pbtn pbtn-blue" type="submit" disabled={links.preview}>TRACK</button>
        </form>
        {!q && data.shipments.some((s) => s.active) ? <div className="ppills">{data.shipments.filter((s) => s.active).map((s) => <a key={s.id} className="ppill link" href={links.href("track", `q=${encodeURIComponent(s.trackingNumber)}`)}>{s.trackingNumber}</a>)}</div> : null}
      </section>
      {q && !found ? <Notice kind="err">We couldn&apos;t find {q} in your account. Check the number, or try the <a className="plink" href={`/track?tracking=${encodeURIComponent(q)}`}>public tracker</a>.</Notice> : null}
      {found ? <ShipmentCard shipment={found} links={links} code={data.customer.customer_code} customer={data.customer} /> : null}
    </>
  );
}

const warehouseChoices = ["Guangzhou", "Yiwu", "Shishi", "Hong Kong", "Tongda Air Cargo", "Not sure"];

export function BookView({ data, links, query }: ViewProps) {
  const disabled = links.preview;
  return (
    <>
      <PageHead title="Book a Shipment" sub="Tell us what your supplier is sending so we can watch for it. Your name, mobile and code are added automatically." />
      {query.done === "1" ? <Notice>Booking sent! Your booking number is <b>{query.ref}</b>. We&apos;ll check it and message you on Messenger. It shows under My Shipments while we review it.</Notice> : null}
      {query.error ? <Notice kind="err">{query.error}</Notice> : null}
      <form className="pcard pform" method="post" action="/customer/actions/book" encType="multipart/form-data">
        <fieldset disabled={disabled}>
          <div className="pgrid2 tight">
            <label className="pfield"><span>Sea or air</span><select name="service" defaultValue="sea"><option value="sea">Sea Freight</option><option value="air">Air Freight</option></select></label>
            <label className="pfield"><span>China warehouse</span><select name="warehouse" defaultValue="Guangzhou">{warehouseChoices.map((w) => <option key={w}>{w}</option>)}</select></label>
            <label className="pfield"><span>Item</span><input name="item" required maxLength={300} placeholder="e.g. Phone cases" /></label>
            <label className="pfield"><span>Quantity</span><input name="quantity" required maxLength={120} placeholder="e.g. 6 cartons" /></label>
            <label className="pfield"><span>Estimated CBM (sea)</span><input name="cbm" inputMode="decimal" placeholder="e.g. 0.5" /></label>
            <label className="pfield"><span>Estimated weight (kg)</span><input name="weight" required inputMode="decimal" placeholder="e.g. 80" /></label>
            <label className="pfield"><span>Supplier name or contact</span><input name="supplier" required maxLength={300} placeholder="e.g. Supplier Li · WeChat li88" /></label>
            <label className="pfield"><span>Item value (₱, optional)</span><input name="itemValue" inputMode="decimal" placeholder="e.g. 25000" /></label>
            <label className="pfield"><span>In the Philippines</span><select name="deliveryMode" defaultValue="pickup"><option value="pickup">Pickup at Malabon</option><option value="delivery">Deliver to my address</option></select></label>
            <label className="pfield"><span>Delivery address (if delivery)</span><input name="deliveryAddress" maxLength={400} defaultValue={data.customer.address ?? ""} /></label>
          </div>
          <label className="pfield"><span>Product photos (1 to 5, required)</span><input type="file" name="photos" accept="image/jpeg,image/png,image/webp" multiple required /></label>
          <label className="pfield"><span>Packing list or supplier invoice (optional)</span><input type="file" name="packing" accept="image/jpeg,image/png,image/webp,application/pdf" /></label>
          <label className="pfield"><span>Notes (optional)</span><textarea name="notes" maxLength={1000} /></label>
          <p className="pmuted">Final charges are based on the CBM and weight verified by our China warehouse.</p>
          <div className="pbtns"><button className="pbtn pbtn-green" type="submit">SEND BOOKING</button></div>
        </fieldset>
      </form>
    </>
  );
}

function BillRow({ bill, links }: { bill: PortalBill; links: PortalLinks }) {
  return (
    <tr>
      <td><span className="ptn">{bill.trackingNumber}</span><small>{bill.invoiceNumber}</small></td>
      <td>{formatDate(bill.issuedAt)}</td><td>{formatPeso(bill.total)}</td><td>{formatPeso(bill.paid)}</td>
      <td className={bill.balance ? "pred" : ""}>{formatPeso(bill.balance)}</td>
      <td><Pill tone={bill.status === "Paid" ? "paid" : "unpaid"}>{bill.status === "Paid" ? "PAID" : bill.status === "Partial" ? "PARTIAL" : "UNPAID"}</Pill>
        {bill.proof?.status === "Pending" && bill.balance ? <small>Proof sent, checking</small> : bill.proof?.status === "Rejected" && bill.balance ? <small className="pred">Proof not accepted. Please send again.</small> : null}</td>
      <td>{links.preview ? null : <a className="plink" href={`/customer/invoice?id=${bill.invoiceId}`}>{bill.status === "Paid" ? "Receipt PDF" : "View PDF"}</a>}</td>
    </tr>
  );
}

export function PaymentsView({ data, links, query }: ViewProps) {
  const open = data.bills.filter((b) => b.balance > 0);
  const chosen = open.find((b) => b.invoiceId === query.bill)?.invoiceId ?? open[0]?.invoiceId;
  return (
    <>
      <PageHead title="Billing & Pay" sub="Pay by UnionBank or GCash, then upload your screenshot. Your bills show here once we send them." />
      {query.done === "1" ? <Notice>Salamat! We got your proof of payment. We&apos;ll check it and mark your bill PAID, usually within the day.</Notice> : null}
      {query.error ? <Notice kind="err">{query.error}</Notice> : null}
      <section className="pcard">
        {data.bills.length ? (
          <div className="ptable"><table><thead><tr><th>Bill for</th><th>Date</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th></th></tr></thead>
            <tbody>{data.bills.map((bill) => <BillRow key={bill.invoiceId} bill={bill} links={links} />)}</tbody></table></div>
        ) : <p className="pempty">No bills yet. When we bill a shipment, it shows up here to review and pay.</p>}
      </section>
      <div className="ppay3">
        {kargodoorBankAccounts.map((account) => (
          <section className="pcard" key={account.id}>
            <h3>{account.bank === "GCash" ? "GCash" : "UnionBank"}</h3>
            <dl className="pdl"><div><dt>Account name</dt><dd>{account.accountName}</dd></div><div><dt>{account.bank === "GCash" ? "GCash number" : "Account number"}</dt><dd>{account.accountNumber}</dd></div></dl>
            <CopyButton text={account.accountNumber.replace(/\s/g, "")} label="COPY NUMBER" />
          </section>
        ))}
        <form className="pcard pform" method="post" action="/customer/actions/proof" encType="multipart/form-data">
          <h3>Nakapagbayad na? Send your proof</h3>
          {open.length ? (
            <fieldset disabled={links.preview}>
              <label className="pfield"><span>For which bill</span>
                <select name="invoice_id" defaultValue={chosen}>{open.map((b) => <option key={b.invoiceId} value={b.invoiceId}>{b.trackingNumber} · {formatPeso(b.balance)}</option>)}</select></label>
              <label className="pfield"><span>Screenshot or receipt (JPG, PNG, WebP or PDF, up to 1.5 MB)</span><input type="file" name="file" required accept="image/jpeg,image/png,image/webp,application/pdf" /></label>
              <button className="pbtn pbtn-green" type="submit">SEND PROOF OF PAYMENT</button>
              <small className="pmuted">We check it, then mark your bill PAID, usually within the day.</small>
            </fieldset>
          ) : <p className="pmuted">No open bills right now. 🎉</p>}
        </form>
      </div>
    </>
  );
}

export function ReferView({ data }: ViewProps) {
  const code = data.customer.customer_code;
  return (
    <>
      <PageHead title="Refer & Earn" sub="Invite friends who import from China. Earn 10% commission on their first 3 shipments." />
      <section className="pcard pref">
        <div className="prow">
          <div><span className="peyebrow">Your referral code</span><h2 className="pcodebig">{code}</h2></div>
          <div className="prefnums"><div><b>{data.referrals}</b><small>FRIENDS</small></div></div>
        </div>
        <p>Your friend gives this code when they book their first shipment. You earn after their shipment is delivered and fully paid. You can&apos;t use your own code on your own shipment.</p>
        <div className="pbtns"><CopyButton text={code} label="COPY CODE" className="pbtn pbtn-green" /></div>
      </section>
      <section className="pcard" id="terms">
        <h2>Terms</h2>
        <ol className="plist">
          <li><b>You can&apos;t use your own code on your own shipment.</b> The code is only for new friends you invite.</li>
          <li>Your friend must be a new KargoDoor customer and give your code when they book their first shipment. Codes can&apos;t be added after booking.</li>
          <li>You earn 10% commission on your friend&apos;s first 3 shipments only.</li>
          <li>Commission is paid only after each shipment is delivered and fully paid.</li>
          <li>Accounts with the same person, family name, address, or phone number as you don&apos;t count as referrals.</li>
          <li>KargoDoor may cancel a referral or commission if the program is misused.</li>
          <li>KargoDoor may change these terms anytime. The latest version is always on this page.</li>
        </ol>
      </section>
    </>
  );
}

const seaWarehouses: WarehouseName[] = ["Guangzhou", "Yiwu", "Shishi", "Hong Kong"];
const airWarehouses: WarehouseName[] = ["Tongda Air Cargo"];

export function WarehousesView({ data, links, query }: ViewProps) {
  const code = data.customer.customer_code;
  const mode = query.mode === "air" ? "air" : "sea";
  const list = mode === "air" ? airWarehouses : seaWarehouses;
  const selected = list.find((w) => w === query.wh) ?? list[0];
  const label = (name: WarehouseName) => mode === "air" ? `AIR ${code} · Item · Supplier no. · PH mobile`
    : name === "Hong Kong" ? `${hongKongMark(code)} · Item · Supplier no. · PH mobile` : `SEA ${code} · Item · Supplier no. · PH mobile`;
  const address = warehouseAddresses[selected].replace(/（?\+客户唛头\.?）?/, `（+${code}）`);
  const q = (next: Record<string, string>) => new URLSearchParams({ mode, ...next }).toString();
  // Malabon: contact persons/phones stay in the admin only.
  const malabonAddress = malabonWarehouseAddress.replace(/\n*Contact person:[^\n]*\n[^\n]*/, "");
  // Same rider message as the admin's "Lalamove Rider Pickup" (Em's wording); item = cargo waiting in Malabon, if any.
  const ready = data.shipments.filter((s) => s.status === "Malabon Warehouse" || s.status === "Ready for Release");
  const riderText = riderPickupMessage({ cargoCode: code, item: ready.map((s) => s.item).filter(Boolean).join(", ") || undefined });
  return (
    <>
      <PageHead title="Warehouse Addresses" sub={<>Pick sea or air, then copy the address. Your code <b>{code}</b> is already added to the label.</>} />
      <div className="pseg" role="group" aria-label="Shipping mode">
        <a href={links.href("warehouses", "mode=sea")} aria-current={mode === "sea" ? "true" : undefined}>SEA FREIGHT</a>
        <a href={links.href("warehouses", "mode=air")} aria-current={mode === "air" ? "true" : undefined}>AIR FREIGHT</a>
      </div>
      <div className="pwh">
        <div className="pstack">
          <p className="phint">{mode === "air" ? <>Air freight: write <b>AIR {code}</b> on every carton, plus item, supplier phone and your PH mobile.</> : <>Sea freight: write <b>SEA {code}</b> on every carton (Hong Kong warehouse: <b>{hongKongMark(code)}</b>), plus item, supplier phone and your PH mobile.</>}</p>
          {list.map((name) => (
            <a key={name} className="pwhitem" aria-current={name === selected ? "true" : undefined} href={links.href("warehouses", q({ wh: name }))}>
              {name}<small>Label: {label(name)}</small>
            </a>
          ))}
        </div>
        <section className="pcard">
          <div><h2>{selected}</h2><small className="pmuted">China · {mode === "air" ? "Air" : "Sea"} Freight</small></div>
          <div><span className="pk">Label</span><div className="plabel">{label(selected)}</div></div>
          <div><span className="pk">Address</span><pre className="ppre">{address}</pre></div>
          <div className="pbtns"><CopyButton text={address} label="COPY ADDRESS" className="pbtn pbtn-blue" />
            <CopyButton text={supplierShipmentMessage({ customerName: data.customer.full_name, customerCode: code, service: mode === "air" ? "Air Freight" : "Sea Freight", warehouse: selected, clientPhone: data.customer.mobile })} label="COPY FOR MY SUPPLIER" /></div>
        </section>
      </div>
      <section className="pcard">
        <h2>Philippine warehouse (pickup)</h2>
        <pre className="ppre">{malabonAddress}</pre>
        <div className="pbtns"><CopyButton text={malabonAddress} label="COPY ADDRESS" className="pbtn pbtn-blue" /></div>
        <h3 className="psub">Pickup instructions for your rider</h3>
        <p className="pmuted">Booking a Lalamove or other rider? Copy this and send it to them. The warehouse address is included when you copy.</p>
        <pre className="ppre">{riderText}</pre>
        <div className="pbtns"><CopyButton text={`${riderText}\n\n📍 ${malabonAddress}`} label="COPY FOR MY RIDER" className="pbtn pbtn-blue" /></div>
        <p className="phint"><b>Payment before pickup:</b> please pay your bill in full and upload your proof first. We release your cargo once your bill shows <b>PAID</b>. <a className="plink" href={links.href("payments")}>Go to Payments →</a></p>
      </section>
    </>
  );
}

export function SupportView({ data, links, query }: ViewProps) {
  return (
    <>
      <PageHead title="Support" sub="Send us your concern and we'll follow up, or message us right away on Messenger." />
      {query.done === "1" ? <Notice>Salamat! We got your concern and will follow up soon.</Notice> : null}
      {query.error ? <Notice kind="err">{query.error}</Notice> : null}
      <form className="pcard pform narrow" method="post" action="/customer/actions/support">
        <fieldset disabled={links.preview}>
          <label className="pfield"><span>What is this about?</span><select name="topic">{concernTopics.map((t) => <option key={t}>{t}</option>)}</select></label>
          <label className="pfield"><span>Which shipment (optional)</span><select name="shipment_id" defaultValue=""><option value="">—</option>{data.shipments.map((s) => <option key={s.id} value={s.id}>{s.trackingNumber}{s.item ? ` · ${s.item}` : ""}</option>)}</select></label>
          <label className="pfield"><span>Your concern</span><textarea name="message" required minLength={3} maxLength={2000} placeholder="Tell us what's going on…" /></label>
          <div className="pbtns">
            <button className="pbtn pbtn-blue" type="submit">SEND CONCERN →</button>
            <MessengerLink className="pbtn pbtn-line" target="_blank" rel="noopener noreferrer">💬 CHAT NOW ON MESSENGER</MessengerLink>
          </div>
        </fieldset>
      </form>
      {data.concerns.length ? (
        <section className="pcard">
          <h2>Your concerns</h2>
          <div className="ptable"><table><thead><tr><th>Sent</th><th>About</th><th>Concern</th><th>Status</th></tr></thead><tbody>
            {data.concerns.map((c, i) => <tr key={i}><td>{formatDate(c.createdAt)}</td><td>{c.topic}{c.trackingNumber ? <small>{c.trackingNumber}</small> : null}</td><td className="pwrap">{c.message}{c.adminNote ? <small>KargoDoor: {c.adminNote}</small> : null}</td><td><Pill tone={c.status === "Done" ? "paid" : ""}>{c.status === "Done" ? "DONE" : "OPEN"}</Pill></td></tr>)}
          </tbody></table></div>
        </section>
      ) : null}
    </>
  );
}

export function AccountView({ data, links }: ViewProps) {
  const c = data.customer;
  return (
    <>
      <PageHead title="Account" sub="Your details and password." />
      <section className="pcard">
        <h2>Account overview</h2>
        <dl className="pdl two">
          <div><dt>Name</dt><dd>{c.full_name}</dd></div>
          <div><dt>Account / Cargo Code</dt><dd>{c.customer_code}</dd></div>
          {c.company_name ? <div><dt>Company</dt><dd>{c.company_name}</dd></div> : null}
          <div><dt>Sign-in email</dt><dd>{c.login_email || c.email || "—"}</dd></div>
          <div><dt>Mobile</dt><dd>{c.mobile}</dd></div>
          <div><dt>Delivery address</dt><dd>{c.address || "—"}</dd></div>
          <div><dt>Customer since</dt><dd>{formatMonth(c.created_at)}</dd></div>
        </dl>
        <p className="pmuted">Need to change these? <a className="plink" href={links.href("support")}>Send us a concern</a> or message us and we&apos;ll update it.</p>
      </section>
      <section className="pcard narrow">
        <h2>Password</h2>
        <p className="pmuted">Change your password anytime. You&apos;ll stay signed in on this device.</p>
        <div className="pbtns">{links.preview ? <span className="pbtn pbtn-line">CHANGE PASSWORD</span> : <Link className="pbtn pbtn-blue" href="/customer/change-password">CHANGE PASSWORD</Link>}</div>
      </section>
    </>
  );
}

export const portalViews: Record<PortalSection, (props: ViewProps) => ReactNode> = {
  dashboard: DashboardView, "how-to-ship": HowToShipView, shipments: ShipmentsView, track: TrackView, book: BookView,
  payments: PaymentsView, refer: ReferView, warehouses: WarehousesView, support: SupportView, account: AccountView,
};
