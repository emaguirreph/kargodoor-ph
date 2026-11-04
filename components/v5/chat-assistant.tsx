"use client";

// KargoDoor Assistant: the chat window behind the round "Message Us" button.
// Buttons and simple keyword answers only (no AI), so it is free to run.
// Live data comes from /api/track (shipment status) and /api/bookings/*.
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { preload } from "react-dom";
import { MessengerLink } from "@/components/messenger-link";
import { trackEvent } from "@/lib/analytics";
import { getAirEstimate, getSeaEstimate } from "@/lib/shipping-estimate.mjs";
import { warehouseAddresses, type WarehouseName } from "@/lib/warehouse-addresses";
import { kargodoorBankAccounts } from "@/lib/admin/bank-accounts";
import { bookingMaxPhotos, normalizeBookingRef, normalizePhMobile } from "@/lib/booking-rules";

type Msg = { id: number; from: "bot" | "me"; body: ReactNode };
type Say = (body: ReactNode, from?: "bot" | "me") => void;

const unionBank = kargodoorBankAccounts.find((account) => account.id === "kd-unionbank")!;
const peso = (n: number) => `₱${n.toLocaleString("en-PH", Number.isInteger(n) ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const trackingPattern = /^(KD-?(SEA|AIR|FCL)-?\d{6,}|(AIR-?)?KDOOR-?\d{4,})$/i;

// Tracking numbers and cargo codes are always capital letters.
const codeCase = (value: string, waitingFor?: string) =>
  waitingFor === "track" || waitingFor === "ref" || /^\s*kd[\w-]*$/i.test(value) ? value.toUpperCase() : value;

function copy(text: string) {
  try { void navigator.clipboard?.writeText(text); } catch { /* clipboard blocked: the text is still on screen */ }
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return <button type="button" className="kc-copy" onClick={() => { copy(text); setDone(true); window.setTimeout(() => setDone(false), 1600); }}>{done ? "✓ Copied" : `📋 ${label}`}</button>;
}

function TeamButton({ label = "💬 Talk to our team", className = "kc-btn kc-green" }: { label?: string; className?: string }) {
  return <MessengerLink className={className} target="_blank" rel="noopener noreferrer" analyticsEvent="contact">{label}</MessengerLink>;
}

// ---------- static answers ----------

const steps: Array<[string, string]> = [
  ["Source your products", "Buy from your supplier on 1688, Alibaba or Made-in-China."],
  ["Book your shipment", "Book here in the chat with your details, photos and cargo size."],
  ["Pack it well", "Use strong boxes, bubble wrap fragile items and seal everything properly."],
  ["Get your warehouse + cargo code", "Once approved, we send the warehouse address and your KDOOR code. It must be written on EVERY box."],
  ["Supplier sends to our warehouse", "We measure and check your cargo."],
  ["We ship to PH", "Sea 3–5 weeks, Air 5–7 days. Freight, customs, duties and taxes are all included."],
  ["Pay, then receive", "When it arrives in Malabon, pay the bill (UnionBank), then pick it up or we deliver. FREE delivery for 2 CBM+ within 20 km."],
];

const routes: Array<{ name: WarehouseName; label: string; who: string }> = [
  { name: "Guangzhou", label: "Guangzhou → Manila (sea)", who: "Suppliers in Guangdong (Guangzhou, Shenzhen, Foshan, Dongguan)" },
  { name: "Yiwu", label: "Yiwu → Manila (sea)", who: "Suppliers in Zhejiang (Yiwu, Hangzhou, Ningbo)" },
  { name: "Shishi", label: "Shishi → Manila (sea)", who: "Suppliers in Fujian" },
  { name: "Hong Kong", label: "Hong Kong → Manila (sea)", who: "Suppliers in Hong Kong" },
  { name: "Tongda Air Cargo", label: "Fujian → Manila (air)", who: "For faster shipments, from any supplier" },
];
const routeLabel = (name: string) => (name === "Tongda Air Cargo" ? "Air (Fujian)" : name);

function HowToImport({ act }: { act: (key: string) => void }) {
  return <>
    <p>It&apos;s easy! Here&apos;s how it works: 👇</p>
    <ol className="kc-steps">{steps.map(([title, text], i) => <li key={title}><i>{i + 1}</i><span><b>{title}</b>{text}</span></li>)}</ol>
    <div className="kc-quick"><button type="button" onClick={() => act("calc")}>🧮 Compute my rate</button><button type="button" onClick={() => act("book")}>📦 Book now</button><button type="button" onClick={() => act("supplier")}>📝 Supplier instructions</button></div>
  </>;
}

// Instructions for the customer's supplier in China: steps, code format, a sample carton label, and a copy-ready message.
type BoxLabel = { mark: string; item: string; supplier: string; phone: string };
const labelLines = (l: BoxLabel) => [l.mark, `Item: ${l.item}`, `Supplier no.: ${l.supplier}`, `PH phone: ${l.phone}`];

function supplierMessage(label: BoxLabel, address: string) {
  return [
    "Hi! Please ship my order to my forwarder's warehouse:",
    address,
    "",
    "Write this shipping mark on EVERY carton:",
    ...labelLines(label),
    "",
    "Please include a packing list (item, quantity, number of cartons) and send me the courier tracking number after shipping. Thank you!",
    "",
    "您好！请把货发到我们的货代仓库：",
    address,
    "",
    "每一箱都必须写上以下唛头：",
    label.mark,
    `品名：${label.item}`,
    `供应商电话：${label.supplier}`,
    `菲律宾电话：${label.phone}`,
    "",
    "请附上装箱单（品名、数量、箱数），发货后请把快递单号发给我。谢谢！",
  ].join("\n");
}

function SupplierGuide({ act, code, air, warehouse, item, supplier, phone }: { act: (key: string, data?: Record<string, string>) => void; code?: string; air?: boolean; warehouse?: string; item?: string; supplier?: string; phone?: string }) {
  const sample = code ?? "KDOOR-1234";
  const mark = air ? `AIR ${sample}` : sample;
  const address = warehouse && warehouse in warehouseAddresses ? warehouseAddresses[warehouse as WarehouseName] : "";
  const label: BoxLabel = code
    ? { mark, item: item || "(item name)", supplier: supplier || "(supplier phone)", phone: phone || "(your mobile)" }
    : { mark, item: "Phone cases", supplier: "138 0000 0000", phone: "0917 123 4567" };
  return <>
    <p><b>Shipping instructions for your supplier</b> 📝</p>
    <ol className="kc-steps">
      <li><i>1</i><span><b>Book and get your cargo code</b>Book here in the chat. Once approved, we send your cargo code (KDOOR-####) and warehouse.</span></li>
      <li><i>2</i><span><b>Send the address to your supplier</b>Copy the warehouse address for your route and send it to your supplier.</span></li>
      <li><i>3</i><span><b>Label every box</b>Your supplier writes your cargo code, item name, supplier number and your PH phone on EVERY box, and adds a packing list.</span></li>
    </ol>
    <p className="kc-lbl">USE THE RIGHT CODE FOR YOUR ROUTE</p>
    <div className="kc-fmt"><span className="kc-tag-sea">Sea → Manila</span><code>{code ?? "KDOOR-1234"}</code><small className="kc-small">3–5 weeks</small></div>
    <div className="kc-fmt"><span className="kc-tag-air">Air → Manila</span><code>AIR {code ?? "KDOOR-1234"}</code><small className="kc-small">Add &quot;AIR&quot; before the code · 5–7 days</small></div>
    <p className="kc-lbl">{code ? "YOUR BOX LABEL" : "EXAMPLE BOX LABEL"}</p>
    <div className="kc-label"><b>{label.mark}</b><span>Item: {label.item}</span><span>Supplier no.: {label.supplier}</span><span>PH phone: {label.phone}</span></div>
    {code
      ? <>
        <p className="kc-small">Send this to your supplier (English + Chinese):</p>
        <pre className="kc-addr">{supplierMessage(label, address || "(KargoDoor warehouse address)")}</pre>
        <CopyButton text={supplierMessage(label, address || "(KargoDoor warehouse address)")} label="Copy message for supplier" />
      </>
      : <>
        <p className="kc-warn">⚠️ <b>This is only an example.</b> Use your own cargo code. You get it once you book and we approve it. Boxes without a code can&apos;t be identified.</p>
        <div className="kc-quick"><button type="button" onClick={() => act("book")}>📦 Book now</button><button type="button" onClick={() => act("warehouse")}>🏭 Warehouse addresses</button></div>
      </>}
  </>;
}

function WarehouseList({ pick }: { pick: (name: WarehouseName) => void }) {
  return <>
    <p>Where is your supplier? Pick the closest warehouse: 👇</p>
    <div className="kc-routes">{routes.map((r) => <button type="button" key={r.name} onClick={() => pick(r.name)}><span>{r.label}</span><b>{r.who}</b></button>)}</div>
    <p className="kc-small">Not sure which one? <TeamButton label="💬 Ask our team" className="kc-link" /></p>
  </>;
}

function WarehouseAddress({ name, act }: { name: WarehouseName; act: (key: string) => void }) {
  const address = warehouseAddresses[name];
  return <>
    <p><b>{routeLabel(name)} warehouse</b> 🏭</p>
    <pre className="kc-addr">{address}</pre>
    <CopyButton text={address} label="Copy address" />
    <p className="kc-warn">⚠️ <b>You need a cargo code</b> (KDOOR-XXXX). You get it once you book and we approve it. Your supplier must write it on <b>every box</b>, or we can&apos;t identify your package.</p>
    <button type="button" className="kc-btn kc-green" onClick={() => act("book")}>📦 Book a shipment to get your code</button>
    <button type="button" className="kc-btn kc-line" onClick={() => act("supplier")}>📝 Instructions for your supplier</button>
  </>;
}

function Malabon() {
  const text = "KargoDoor Malabon Warehouse\nPIN: FSW Commercial Warehouse Rental\nOld 59, New 36 Rivera St, Brgy Tañong, Malabon City\nGate: Gray · Landmark: McDonald's Rizal Ave";
  return <>
    <p>This is where your cargo arrives in the Philippines: 🇵🇭</p>
    <pre className="kc-addr">{text}{"\n\n"}🕖 Mon–Sat, 7:00 AM – 7:00 PM</pre>
    <div className="kc-row">
      <CopyButton text={text} label="Copy address" />
      <a className="kc-copy" href="https://www.google.com/maps/search/?api=1&query=36+Rivera+St+Ta%C3%B1ong+Malabon+City" target="_blank" rel="noopener noreferrer">📍 Google Maps</a>
    </div>
    <p className="kc-warn">For pickup, bring a <b>valid ID</b> and your <b>invoice / proof of shipment</b>. Trucks over 16 ft are not allowed from 9 AM to 4 PM.</p>
    <p className="kc-ok">🚚 FREE delivery for 2 CBM+ within 20 km of Malabon.</p>
  </>;
}

function BankBox() {
  return <div className="kc-bank">
    <div><span>Bank</span><b>UnionBank</b></div>
    <div><span>Account name</span><b>{unionBank.accountName}</b></div>
    <div><span>Account no.</span><b>{unionBank.accountNumber.replace(/(\d{4})(?=\d)/g, "$1 ")}</b></div>
    <CopyButton text={unionBank.accountNumber} label="Copy account no." />
  </div>;
}

function Payment({ act }: { act: (key: string) => void }) {
  return <>
    <p>You only pay the shipping fee <b>once your cargo arrives in Malabon</b>, before it is released or delivered. The final amount is based on the actual size we measure. 📏</p>
    <p>Pay by <b>bank transfer</b>:</p>
    <BankBox />
    <p>Already have a bill? Check it and upload your proof of payment here:</p>
    <button type="button" className="kc-btn" onClick={() => act("status")}>🔎 Check my booking / bill</button>
  </>;
}

// ---------- live answers ----------

type TrackResult = { chat_booking?: boolean; tracking_number: string; freight_type: string; origin_warehouse: string | null; current_status: string; status_message: string | null; last_updated: string; standard_transit: string };

function TrackAnswer({ code, act }: { code: string; act: (key: string, data?: Record<string, string>) => void }) {
  const [state, setState] = useState<{ data?: TrackResult; error?: string }>({});
  useEffect(() => {
    let alive = true;
    fetch(`/api/track?code=${encodeURIComponent(code)}`).then(async (r) => {
      const body = await r.json().catch(() => ({}));
      if (alive) setState(r.ok ? { data: body } : { error: body.error || "Tracking is unavailable right now." });
    }).catch(() => alive && setState({ error: "Tracking is unavailable right now. Please try again." }));
    return () => { alive = false; };
  }, [code]);
  if (state.error) return <><p>{state.error}</p><TeamButton label="💬 Ask our team" /></>;
  if (!state.data) return <p className="kc-wait">Looking it up… 🔎</p>;
  const s = state.data;
  return <>
    <p><span className="kc-pill">{s.current_status.toUpperCase()}</span></p>
    {s.status_message && <p>{s.status_message}</p>}
    <div className="kc-card">
      <div><span>Tracking no.</span><b>{s.tracking_number}</b></div>
      {s.origin_warehouse && <div><span>From</span><b>{s.origin_warehouse}</b></div>}
      <div><span>Usual transit</span><b>{s.standard_transit}</b></div>
      <div><span>Last update</span><b>{new Date(s.last_updated).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}</b></div>
    </div>
    {s.chat_booking && <button type="button" className="kc-btn" onClick={() => act("bill", { ref: s.tracking_number })}>🔎 My booking, bill &amp; payment</button>}
    <a className="kc-btn kc-line" href={`/track?code=${encodeURIComponent(s.tracking_number)}`}>Open full tracking page</a>
  </>;
}

const sizes = [
  { name: "KD Mini", cbm: 0.01, price: 250 },
  { name: "KD Lite", cbm: 0.05, price: 750 },
  { name: "KD Plus", cbm: 0.125, price: 1400 },
];

function Calculator({ act }: { act: (key: string, data?: Record<string, string>) => void }) {
  const [service, setService] = useState<"sea" | "air">("sea");
  const [cbm, setCbm] = useState("");
  const [weight, setWeight] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [item, setItem] = useState("");
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState<{ amount: number; tier: string } | null>(null);
  const [error, setError] = useState("");
  const calculate = (event: FormEvent) => {
    event.preventDefault();
    const c = Number(cbm), w = Number(weight);
    if (fullName.trim().length < 2) return setError("Please enter your name.");
    if (!normalizePhMobile(phone)) return setError("Please enter a valid PH mobile number (09XX XXX XXXX).");
    if (item.trim().length < 2) return setError("What are you shipping?");
    if (!(w > 0) || (service === "sea" && !(c > 0)) || c < 0) return setError(service === "sea" ? "Please enter the CBM and weight." : "Please enter the weight (and CBM if you know it).");
    if (!consent) return setError("Please tick the box so we can contact you.");
    setError("");
    const estimate = service === "sea" ? getSeaEstimate(c, w) : getAirEstimate(Math.max(w, (c || 0) * 167));
    setResult({ amount: estimate.amount, tier: estimate.packageName });
    trackEvent("calculate_shipping");
    // Saved to admin Leads; the rate shows even if saving fails.
    void fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fullName: fullName.trim(), phone: phone.trim(), consent: true, service, cbm: c, weight: w, item: item.trim(), source: "chat" }) }).catch(() => undefined);
  };
  return <form className="kc-calc" onSubmit={calculate}>
    <div className="kc-seg">{(["sea", "air"] as const).map((s) => <button type="button" key={s} className={service === s ? "on" : ""} onClick={() => { setService(s); setResult(null); }}>{s === "sea" ? "🚢 Sea" : "✈️ Air"}</button>)}</div>
    <label><span className="kc-lbl">YOUR NAME</span><input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" maxLength={160} /></label>
    <div className="kc-two">
      <label><span className="kc-lbl">MOBILE</span><input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="09XX XXX XXXX" maxLength={20} /></label>
      <label><span className="kc-lbl">ITEM</span><input value={item} onChange={(e) => setItem(e.target.value)} placeholder="e.g. Phone cases" maxLength={300} /></label>
    </div>
    {service === "sea" && <>
      <div className="kc-lbl">PICK A SIZE OR TYPE YOUR OWN</div>
      <div className="kc-sizes">{sizes.map((size) => <button type="button" key={size.name} className={Number(cbm) === size.cbm ? "on" : ""} onClick={() => { setCbm(String(size.cbm)); setResult(null); }}>{size.name}<small>{peso(size.price)}</small></button>)}</div>
    </>}
    <div className="kc-two">
      <label><span className="kc-lbl">CBM{service === "air" ? " (optional)" : ""}</span><input inputMode="decimal" value={cbm} onChange={(e) => { setCbm(e.target.value); setResult(null); }} placeholder="0.5" /></label>
      <label><span className="kc-lbl">WEIGHT (KG)</span><input inputMode="decimal" value={weight} onChange={(e) => { setWeight(e.target.value); setResult(null); }} placeholder="60" /></label>
    </div>
    <label className="kc-check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> I agree that KargoDoor may contact me about this rate.</label>
    {error && <p className="kc-err">{error}</p>}
    <button className="kc-btn kc-blue">Calculate</button>
    {result && <div className="kc-res">
      <div className="kc-small">Estimated all-in rate</div>
      <div className="kc-big">{peso(result.amount)}</div>
      <p><span className="kc-pill">{result.tier.toUpperCase()}</span> {service === "sea" ? "Sea, 3–5 weeks" : "Air, 5–7 days"}</p>
      <p className="kc-small">Includes freight, customs, duties and taxes. The final price is set after we measure your cargo at the warehouse.</p>
      <button type="button" className="kc-btn kc-green" onClick={() => act("book", { service, cbm, weight, fullName, phone, item })}>📦 Book this shipment</button>
      <TeamButton label="💬 Ask our team" className="kc-btn kc-line" />
    </div>}
    <p className="kc-small"><a href="/rates-calculator">Open the full calculator and size guide →</a></p>
  </form>;
}

// ---------- booking ----------

async function compressPhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") || typeof createImageBitmap !== "function") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 700 * 1024) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

type BookingDraft = Record<string, string>;

function BookingForm({ preset, done }: { preset?: Record<string, string>; done: (ref: string, phone: string) => void }) {
  const [step, setStep] = useState(1);
  const [d, setD] = useState<BookingDraft>({ service: preset?.service ?? "sea", deliveryMode: "pickup", cbm: preset?.cbm ?? "", weight: preset?.weight ?? "", warehouse: "", fullName: preset?.fullName ?? "", phone: preset?.phone ?? "", item: preset?.item ?? "" });
  const [photos, setPhotos] = useState<File[]>([]);
  const [packing, setPacking] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const honeypot = useRef<HTMLInputElement>(null);
  const set = (key: string) => (e: { target: { value: string } }) => setD((old) => ({ ...old, [key]: e.target.value }));
  const field = (key: string, label: string, props: Record<string, unknown> = {}) =>
    <label><span className="kc-lbl">{label}</span><input value={d[key] ?? ""} onChange={set(key)} {...props} /></label>;

  const next = (event: FormEvent) => {
    event.preventDefault();
    if ((d.fullName ?? "").trim().length < 2) return setError("Please enter your full name.");
    if (!normalizePhMobile(d.phone)) return setError("Please enter a valid PH mobile number (09XX XXX XXXX).");
    if (d.deliveryMode === "delivery" && (d.deliveryAddress ?? "").trim().length < 8) return setError("Please enter your delivery address.");
    setError(""); setStep(2);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if ((d.item ?? "").trim().length < 2) return setError("What are you shipping?");
    if (!(d.quantity ?? "").trim()) return setError("Please enter the quantity.");
    if (!(Number(d.weight) > 0) || (d.service === "sea" && !(Number(d.cbm) > 0))) return setError("Please enter the estimated CBM and weight. Not sure? Tap Talk to our team.");
    if (!d.warehouse) return setError("Please choose a warehouse (or Not sure).");
    if ((d.supplier ?? "").trim().length < 2) return setError("Please enter your supplier's name or contact.");
    if (!photos.length) return setError("Please add at least 1 product photo.");
    if (!consent) return setError("Please tick the box so we can contact you.");
    setError(""); setSending(true);
    try {
      const form = new FormData();
      form.set("website", honeypot.current?.value ?? "");
      form.set("data", JSON.stringify({
        fullName: d.fullName, phone: d.phone, email: d.email ?? "", service: d.service, deliveryMode: d.deliveryMode,
        deliveryAddress: d.deliveryAddress ?? "", item: d.item, quantity: d.quantity, cbm: Number(d.cbm || 0), weight: Number(d.weight),
        itemValue: d.itemValue ? Number(d.itemValue.replace(/[^\d.]/g, "")) : undefined, warehouse: d.warehouse, supplier: d.supplier,
        notes: d.notes ?? "", consent,
      }));
      for (const [i, photo] of photos.entries()) form.append("photos", await compressPhoto(photo), photo.name || `photo-${i + 1}.jpg`);
      if (packing) form.append("packing", packing, packing.name);
      const response = await fetch("/api/bookings", { method: "POST", body: form });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Your booking was not sent. Please try again.");
      trackEvent("generate_lead");
      done(body.ref, normalizePhMobile(d.phone) ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your booking was not sent. Please try again.");
    } finally {
      setSending(false);
    }
  };
  const unsure = <p className="kc-small">🤔 Not sure about the CBM, value or warehouse? <TeamButton label="💬 Talk to our team" className="kc-link" /></p>;

  if (step === 1) return <form className="kc-form" onSubmit={next}>
    <div className="kc-stp">STEP 1 OF 2 · YOUR DETAILS</div>
    {field("fullName", "FULL NAME", { autoComplete: "name", required: true, maxLength: 160 })}
    <div className="kc-two">
      {field("phone", "MOBILE", { inputMode: "tel", autoComplete: "tel", placeholder: "09XX XXX XXXX", required: true })}
      {field("email", "EMAIL (OPTIONAL)", { type: "email", autoComplete: "email", maxLength: 254 })}
    </div>
    <div className="kc-lbl">SEA OR AIR?</div>
    <div className="kc-seg">{(["sea", "air"] as const).map((s) => <button type="button" key={s} className={d.service === s ? "on" : ""} onClick={() => setD((o) => ({ ...o, service: s }))}>{s === "sea" ? "🚢 Sea" : "✈️ Air"}</button>)}</div>
    <div className="kc-lbl">PICKUP OR DELIVERY IN PH?</div>
    <div className="kc-seg">{(["pickup", "delivery"] as const).map((s) => <button type="button" key={s} className={d.deliveryMode === s ? "on" : ""} onClick={() => setD((o) => ({ ...o, deliveryMode: s }))}>{s === "pickup" ? "🏠 Pickup Malabon" : "🚚 Deliver"}</button>)}</div>
    {d.deliveryMode === "delivery" && field("deliveryAddress", "DELIVERY ADDRESS", { autoComplete: "street-address", maxLength: 400 })}
    <input ref={honeypot} name="website" tabIndex={-1} autoComplete="off" className="kc-hp" aria-hidden="true" />
    {error && <p className="kc-err">{error}</p>}
    <button className="kc-btn kc-blue">Next</button>
  </form>;

  return <form className="kc-form" onSubmit={submit}>
    <div className="kc-stp">STEP 2 OF 2 · YOUR CARGO</div>
    {field("item", "WHAT ARE YOU SHIPPING?", { placeholder: "e.g. Phone cases (silicone)", maxLength: 300 })}
    <div className="kc-two">
      {field("quantity", "QUANTITY", { placeholder: "500 pcs · 5 boxes", maxLength: 120 })}
      {field("itemValue", "ITEM VALUE (₱)", { inputMode: "decimal", placeholder: "25000" })}
    </div>
    <div className="kc-two">
      {field("cbm", d.service === "air" ? "EST. CBM (OPTIONAL)" : "EST. CBM", { inputMode: "decimal", placeholder: "0.3" })}
      {field("weight", "EST. WEIGHT (KG)", { inputMode: "decimal", placeholder: "40" })}
    </div>
    <label><span className="kc-lbl">WAREHOUSE</span><select value={d.warehouse} onChange={set("warehouse")}>
      <option value="">Choose…</option>{routes.map((r) => <option key={r.name} value={r.name}>{routeLabel(r.name)}</option>)}<option value="Not sure">Not sure</option>
    </select></label>
    {field("supplier", "SUPPLIER NAME / CONTACT", { placeholder: "Shop name, WeChat or phone", maxLength: 300 })}
    {unsure}
    <div className="kc-lbl">PRODUCT PHOTOS (REQUIRED, UP TO {bookingMaxPhotos})</div>
    {photos.length > 0 && <div className="kc-thumbs">{photos.map((photo, i) => <button type="button" key={`${photo.name}-${i}`} title="Remove" onClick={() => setPhotos((list) => list.filter((_, j) => j !== i))}><Thumb file={photo} /><span>×</span></button>)}</div>}
    {photos.length < bookingMaxPhotos && <label className="kc-up">📷 {photos.length ? "Add more photos" : "Add photos"}<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => { const files = [...(e.target.files ?? [])]; setPhotos((list) => [...list, ...files].slice(0, bookingMaxPhotos)); e.target.value = ""; }} /></label>}
    <div className="kc-lbl">PACKING LIST / INVOICE (OPTIONAL)</div>
    <label className="kc-up">📎 {packing ? packing.name : "Upload file"}<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setPacking(e.target.files?.[0] ?? null)} /></label>
    {field("notes", "NOTES (OPTIONAL)", { maxLength: 1000 })}
    <label className="kc-check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> I agree that KargoDoor may contact me about this booking.</label>
    {error && <p className="kc-err">{error}</p>}
    <div className="kc-two">
      <button type="button" className="kc-btn kc-line" onClick={() => { setError(""); setStep(1); }}>Back</button>
      <button className="kc-btn kc-blue" disabled={sending}>{sending ? "Sending…" : "Book my shipment"}</button>
    </div>
  </form>;
}

function Thumb({ file }: { file: File }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" />;
}

type Status = {
  ref: string; name: string; status: "New" | "Approved" | "Declined"; messengerConfirmed: boolean; service: string; warehouse: string; estimate: number;
  shipment: { cargoCode: string; trackingNumber: string; status: string; warehouse: string; approvedAmount: number; item?: string; supplier?: string; phone?: string } | null;
  bill: { invoiceNumber: string; total: number; paid: number; balance: number; status: string } | null;
  proof: { status: string; uploadedAt: string } | null;
};

function ProofUpload({ bookingRef, last4, sent }: { bookingRef: string; last4: string; sent: () => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true); setError("");
    try {
      const form = new FormData();
      form.set("ref", bookingRef); form.set("last4", last4);
      form.append("file", file.type.startsWith("image/") ? await compressPhoto(file) : file, file.name);
      const r = await fetch("/api/bookings/proof", { method: "POST", body: form });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || "The upload failed. Please try again.");
      sent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return <>
    <label className="kc-up kc-up-strong">{busy ? "Uploading…" : "📷 Upload proof of payment"}<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={busy} onChange={(e) => void upload(e.target.files?.[0])} /></label>
    {error && <p className="kc-err">{error}</p>}
  </>;
}

function StatusAnswer({ bookingRef, last4, act }: { bookingRef: string; last4: string; act: (key: string, data?: Record<string, string>) => void }) {
  const [state, setState] = useState<{ data?: Status; error?: string }>({});
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let alive = true;
    fetch("/api/bookings/status", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ref: bookingRef, last4 }) })
      .then(async (r) => { const body = await r.json().catch(() => ({})); if (alive) setState(r.ok ? { data: body } : { error: body.error || "We couldn't find that booking." }); })
      .catch(() => alive && setState({ error: "We can't check right now. Please try again." }));
    return () => { alive = false; };
  }, [bookingRef, last4, reload]);
  const download = async () => {
    const r = await fetch("/api/bookings/invoice", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ref: bookingRef, last4 }) });
    if (!r.ok) return;
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement("a");
    a.href = url; a.download = `KargoDoor-${bookingRef}-paid-invoice.pdf`; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  if (state.error) return <><p>{state.error}</p><TeamButton label="💬 Ask our team" /></>;
  if (!state.data) return <p className="kc-wait">Checking… 🔎</p>;
  const s = state.data;
  if (s.status === "Declined") return <><p>Sorry, {s.name}. We can&apos;t process booking <b>{s.ref}</b> online. 🙏</p><TeamButton label="💬 Message our team" /></>;
  if (s.status === "New") return <>
    <p><span className="kc-pill kc-amber">FOR REVIEW</span></p>
    <p>Thanks, {s.name}! Our team is still reviewing booking <b>{s.ref}</b>. Estimated rate: <b>{peso(s.estimate)}</b>.</p>
    {!s.messengerConfirmed && <><p>To speed things up, send <b>{s.ref}</b> to our Messenger page to confirm. 👇</p><TeamButton label={`💬 Send ${s.ref} on Messenger`} /></>}
  </>;
  const sh = s.shipment!;
  const air = s.service === "Air Freight";
  const paid = s.bill?.status === "Paid";
  return <>
    <p><span className={`kc-pill${paid ? "" : " kc-blue-pill"}`}>{paid ? "PAID ✅" : s.bill ? "BILL READY" : "APPROVED ✅"}</span></p>
    {!s.bill && <p>Your booking is approved, {s.name}! 🎉</p>}
    <div className="kc-code"><small>YOUR KARGODOOR CARGO CODE</small><div>{sh.cargoCode}</div><CopyButton text={air ? `AIR ${sh.cargoCode}` : sh.cargoCode} label="Copy code" /></div>
    {!s.bill && <>
      <p><b>Ask your supplier to write this on EVERY box:</b></p>
      <div className="kc-fmt"><span className={air ? "kc-tag-air" : "kc-tag-sea"}>{air ? "Air → Manila" : "Sea → Manila"}</span><code>{air ? `AIR ${sh.cargoCode}` : sh.cargoCode}</code></div>
      <div className="kc-card"><div><span>Warehouse</span><b>{routeLabel(sh.warehouse)}</b></div><div><span>Estimated rate</span><b>{peso(sh.approvedAmount)}</b></div><div><span>Tracking no.</span><b>{sh.trackingNumber}</b></div><div><span>Status</span><b>{sh.status}</b></div></div>
      <p className="kc-small">💡 <b>Nothing to pay yet.</b> You pay once your cargo arrives in Malabon, before it is released or delivered.</p>
      {sh.warehouse in warehouseAddresses && <button type="button" className="kc-btn kc-green" onClick={() => act("address", { name: sh.warehouse })}>🏭 Get {routeLabel(sh.warehouse)} address</button>}
      <button type="button" className="kc-btn kc-line" onClick={() => act("supplier", { code: sh.cargoCode, air: air ? "1" : "", warehouse: sh.warehouse, item: sh.item ?? "", supplier: sh.supplier ?? "", phone: sh.phone ?? "" })}>📝 Instructions for your supplier</button>
    </>}
    {s.bill && !paid && <>
      <p>📦 Bill for <b>{sh.trackingNumber}</b>. Please pay before release or delivery:</p>
      <div className="kc-card"><div><span>Invoice</span><b>{s.bill.invoiceNumber}</b></div><div><span>Amount to pay</span><b className="kc-due">{peso(s.bill.balance)}</b></div>{s.bill.paid > 0 && <div><span>Paid so far</span><b>{peso(s.bill.paid)}</b></div>}</div>
      <BankBox />
      {s.proof?.status === "Pending"
        ? <p className="kc-ok">✅ We received your proof of payment. We&apos;ll check it, then release your cargo.</p>
        : <>{s.proof?.status === "Rejected" && <p className="kc-warn">We couldn&apos;t match your last proof to a payment. Please check and upload it again, or message us.</p>}<ProofUpload bookingRef={s.ref} last4={last4} sent={() => setReload((n) => n + 1)} /></>}
    </>}
    {paid && <>
      <div className="kc-card"><div><span>Invoice</span><b>{s.bill!.invoiceNumber}</b></div><div><span>Amount paid</span><b className="kc-paid">{peso(s.bill!.paid)}</b></div><div><span>Tracking no.</span><b>{sh.trackingNumber}</b></div></div>
      <button type="button" className="kc-btn kc-green" onClick={() => void download()}>📄 Download paid invoice (PDF)</button>
      <p className="kc-small">Thank you, {s.name}! 🙏 Your cargo is ready for release. We&apos;ll message you about the pickup or delivery schedule.</p>
    </>}
  </>;
}

// ---------- the chat ----------

const intents: Array<[RegExp, string]> = [
  [/\b(book|booking|magpa-?ship|mag-?ship|ipadala ko|start)\b/i, "book"],
  [/\b(track|tracking|nasaan|status|asan)\b/i, "track"],
  [/\b(rate|rates|magkano|presyo|price|calculat|cbm|singil|how much)\b/i, "calc"],
  [/\bmalabon|pick ?up|pickup|kunin\b/i, "malabon"],
  [/\b(supplier|label|labels|marking|shipping mark|cargo code|kdoor)\b/i, "supplier"],
  [/\b(warehouse|address|bodega|guangzhou|yiwu|shishi|hong ?kong)\b/i, "warehouse"],
  [/\b(paano|how to|process|import|steps?|mag-?import)\b/i, "how"],
  [/\b(bayad|payment|pay|gcash|bank|unionbank|bill|invoice)\b/i, "payment"],
  [/\b(gaano|tagal|how long|ilang araw|days|weeks|kailan|eta|transit)\b/i, "transit"],
  [/\b(bawal|prohibited|restricted|battery|batteries|liquid|perfume|pabango|cosmetic|food|gamot|medicine|branded|chemical)/i, "restricted"],
  [/\b(hi|hello|hey|good (morning|afternoon|evening)|kumusta)\b/i, "hello"],
];

const fabPoster = "/assets/kargodoor-message-us-poster.webp";

export function ChatAssistant() {
  // Fetch the button picture first so the button shows right away, before the video loads.
  preload(fabPoster, { as: "image", fetchPriority: "high" });
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [waiting, setWaiting] = useState<null | { kind: "track" } | { kind: "ref" } | { kind: "last4"; ref: string }>(null);
  const [teaser, setTeaser] = useState(true);
  const counter = useRef(0);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const say: Say = useCallback((body, from = "bot") => {
    counter.current += 1;
    const id = counter.current;
    setMsgs((old) => [...old, { id, from, body }]);
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const act = useCallback((key: string, data?: Record<string, string>) => run(key, data), []);

  function welcome() {
    say(<>
      <p>Hi! 👋 Welcome to <b>KargoDoor PH</b>.</p>
      <p>I&apos;m the KargoDoor Assistant. Ask me about <b>shipping rates</b>, <b>tracking</b>, <b>warehouse addresses</b>, and how to import from China.</p>
      <p>If I can&apos;t answer, tap <b>Talk to our team</b> and we&apos;ll reply on Messenger.</p>
      <p><b>How can I help you today?</b></p>
    </>);
  }

  function run(key: string, data?: Record<string, string>) {
    setWaiting(null);
    switch (key) {
      case "track": setWaiting({ kind: "track" }); return say(<p>Sure! Type your tracking number (e.g. KDSEA-123456 or KDOOR-1234). 📦</p>);
      case "calc": return say(<Calculator act={act} />);
      case "how": return say(<HowToImport act={act} />);
      case "warehouse": return say(<WarehouseList pick={(name) => { say(routeLabel(name), "me"); say(<WarehouseAddress name={name} act={act} />); }} />);
      case "address": return say(<WarehouseAddress name={data!.name as WarehouseName} act={act} />);
      case "supplier": return say(<SupplierGuide act={act} code={data?.code} air={data?.air === "1"} warehouse={data?.warehouse} item={data?.item} supplier={data?.supplier} phone={data?.phone} />);
      case "malabon": return say(<Malabon />);
      case "payment": return say(<Payment act={act} />);
      case "status": setWaiting({ kind: "ref" }); return say(<p>Type your tracking number (e.g. <b>KDSEA-123456</b>). 🔎</p>);
      case "bill": setWaiting({ kind: "last4", ref: data!.ref }); return say(<p>For privacy, type the <b>last 4 digits</b> of the mobile number you used for the booking. 🔒</p>);
      case "book": return say(<>
        <p>Let&apos;s book it! 🙌 Just 2 steps. Our team reviews it and sends your cargo code once approved.</p>
        <BookingForm preset={data} done={(ref, phone) => {
          say(<>
            <p>Booking sent! 🎉 Thank you!</p>
            <div className="kc-code"><small>YOUR TRACKING NUMBER</small><div>{ref}</div><CopyButton text={ref} label="Copy" /></div>
            <p className="kc-small">This is also your booking number. Use it to track your shipment from start to delivery.</p>
            <p>Our team will review it and compute your rate. Once <b>approved</b>, you&apos;ll get your <b>cargo code</b>, <b>warehouse address</b> and <b>estimated rate</b>.</p>
            <p><b>To confirm faster:</b> send <b>{ref}</b> to our Messenger page. 👇</p>
            <TeamButton label={`💬 Send ${ref} on Messenger`} />
            <p className="kc-small">Track it anytime: type <b>{ref}</b> here. To see your bill, you&apos;ll also need the last 4 digits of your mobile ({phone.slice(-4)}).</p>
          </>);
        }} />
      </>);
      case "transit": return say(<>
        <p>🚢 <b>Sea Freight:</b> about <b>3–5 weeks</b></p><p>✈️ <b>Air Freight:</b> about <b>5–7 days</b></p>
        <p className="kc-small">These are estimates. Times can change because of schedules, customs, weather or holidays.</p>
      </>);
      case "restricted": return say(<>
        <p>Our team needs to check items like <b>batteries, liquids, chemicals, food, medicines, cosmetics and branded goods</b> first. 🙏</p>
        <p>Send us a photo or details of the item before you buy or ship:</p><TeamButton />
      </>);
      case "hello": return say(<p>Hello! 😊 Pick a button below, or type your question.</p>);
      default: return say(<>
        <p>Sorry, I can&apos;t answer that yet. 🙏 Our team will reply on Messenger (8 AM – 10 PM, 7 days a week):</p><TeamButton />
      </>);
    }
  }

  const chip = (key: string, label: string) => () => { say(label, "me"); run(key); };

  const send = (event: FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    setText("");
    say(value, "me");
    const compact = value.replace(/\s+/g, "").toUpperCase();
    const ref = normalizeBookingRef(compact);
    if (waiting?.kind === "last4") {
      const digits = value.replace(/\D/g, "");
      if (digits.length !== 4) return say(<p>Please type just 4 digits, e.g. 4567.</p>);
      setWaiting(null);
      return say(<StatusAnswer bookingRef={waiting.ref} last4={digits} act={act} />);
    }
    // My Booking (or an old KD-BOOK number): go straight to the private booking/bill lookup.
    if (ref && (waiting?.kind === "ref" || ref.startsWith("KD-BOOK-"))) {
      setWaiting({ kind: "last4", ref });
      return say(<p>For privacy, type the <b>last 4 digits</b> of the mobile number you used for the booking. 🔒</p>);
    }
    if (trackingPattern.test(compact) || waiting?.kind === "track") {
      setWaiting(null);
      return say(<TrackAnswer code={ref || compact} act={act} />);
    }
    if (waiting?.kind === "ref") return say(<p>A tracking number looks like this: <b>KDSEA-123456</b>. Please type it again. 🙏</p>);
    const intent = intents.find(([pattern]) => pattern.test(value));
    run(intent ? intent[1] : "unknown");
  };

  function openChat() {
    setOpen(true);
    setTeaser(false);
    if (!msgs.length) welcome();
  }

  // kargodoorph.com/chat (→ /?chat=1) opens the assistant right away, for links shared on Facebook or Messenger.
  // A tap made before the page finished loading (caught by the small script in app/layout.tsx) opens it too.
  useEffect(() => {
    const w = window as typeof window & { __kcReady?: boolean; __kcOpen?: number };
    w.__kcReady = true;
    const url = new URL(window.location.href);
    if (w.__kcOpen) {
      w.__kcOpen = 0;
      document.querySelectorAll(".kc-wait").forEach((el) => el.classList.remove("kc-wait"));
      const timer = window.setTimeout(() => openChat(), 0);
      return () => window.clearTimeout(timer);
    }
    if (url.searchParams.get("chat") !== "1") return;
    url.searchParams.delete("chat");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    const timer = window.setTimeout(() => openChat(), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem("kd-chat-tease-closed") === "1"; } catch { /* storage blocked */ }
    if (seen) setTeaser(false);
  }, []);

  useEffect(() => {
    const el = list.current;
    if (!el) return;
    const last = el.lastElementChild as HTMLElement | null;
    if (!last) return;
    // Show the start of a new answer (long cards stay readable from the top),
    // again when an answer that was loading fills in during its first few seconds.
    const show = () => el.scrollTo({ top: Math.max(0, last.offsetTop - 12), behavior: "smooth" });
    show();
    const started = Date.now();
    const watch = new ResizeObserver(() => { if (Date.now() - started < 4000) show(); else watch.disconnect(); });
    watch.observe(last);
    return () => watch.disconnect();
  }, [msgs]);

  useEffect(() => {
    document.documentElement.classList.toggle("kc-open", open);
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return <>
    {teaser && !open && <button type="button" className="kc-tease" onClick={openChat}>Hi! 👋 Have a question?<br />Tracking, rates or booking,<br />I can help. 😊<span aria-hidden="true" onClick={(e) => { e.stopPropagation(); setTeaser(false); try { sessionStorage.setItem("kd-chat-tease-closed", "1"); } catch { /* storage blocked */ } }}>×</span></button>}
    <div className="fab">
      <button type="button" className="kc-fab" aria-label="Open the KargoDoor chat assistant" aria-expanded={open} onClick={() => (open ? setOpen(false) : openChat())}>
        <video autoPlay loop muted playsInline preload="auto" poster={fabPoster} aria-hidden="true">
          <source src="/assets/kargodoor-message-us-small.mp4" type="video/mp4" />
          <source src="/assets/kargodoor-message-us-small.webm" type="video/webm" />
        </video>
      </button>
    </div>
    {open && <div className="kdchat" role="dialog" aria-label="KargoDoor Assistant">
      <div className="kc-hd">
        <img src="/assets/kargodoor-message-us-poster.webp" alt="" />
        <div className="kc-t"><b>KargoDoor Assistant</b><small><span className="kc-dot" />Instant answers 24/7</small></div>
        <TeamButton label="💬 Talk to our team" className="kc-live" />
        <button type="button" className="kc-x" aria-label="Close chat" onClick={() => setOpen(false)}>×</button>
      </div>
      <div className="kc-body" ref={list} aria-live="polite">
        {msgs.map((m) => <div key={m.id} className={`kc-b ${m.from === "me" ? "kc-me" : "kc-bot"}`}>{m.body}</div>)}
      </div>
      <div className="kc-chips">
        <button type="button" onClick={chip("book", "📦 Book a Shipment")}>📦 Book a Shipment</button>
        <button type="button" onClick={chip("track", "🚚 Track Shipment")}>🚚 Track Shipment</button>
        <button type="button" onClick={chip("calc", "🧮 Rate Calculator")}>🧮 Rate Calculator</button>
        <button type="button" onClick={chip("how", "📋 How to Import")}>📋 How to Import</button>
        <button type="button" onClick={chip("warehouse", "🏭 China Warehouses")}>🏭 China Warehouses</button>
        <button type="button" onClick={chip("supplier", "📝 Supplier instructions")}>📝 Supplier instructions</button>
        <button type="button" onClick={chip("malabon", "🏠 Malabon Warehouse")}>🏠 Malabon Warehouse</button>
        <button type="button" onClick={chip("payment", "💳 Payment")}>💳 Payment</button>
        <button type="button" onClick={chip("transit", "⏱️ How long?")}>⏱️ How long?</button>
        <button type="button" onClick={chip("restricted", "🚫 Restricted items")}>🚫 Restricted items</button>
      </div>
      <form className="kc-in" onSubmit={send}>
        <input ref={input} value={text} onChange={(e) => setText(codeCase(e.target.value, waiting?.kind))} autoCapitalize={waiting?.kind === "track" || waiting?.kind === "ref" ? "characters" : "sentences"} placeholder={waiting?.kind === "last4" ? "Last 4 digits of your mobile" : waiting?.kind === "track" ? "Tracking number" : "Type your question or tracking no."} inputMode={waiting?.kind === "last4" ? "numeric" : "text"} maxLength={120} aria-label="Type your question" />
        <button aria-label="Send">➤</button>
      </form>
      <div className="kc-foot">Team replies 8 AM – 10 PM, 7 days a week</div>
    </div>}
  </>;
}
