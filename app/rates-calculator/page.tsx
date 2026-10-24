"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { SiteShell, PageHero } from "@/components/v5/chrome";
import { SizeCube, TierGrid, sizeText, tiers, type TierId } from "@/components/v5/sizes";
import { MessengerLink } from "@/components/messenger-link";
import { trackEvent } from "@/lib/analytics";
import { getAirEstimate, getSeaEstimate } from "@/lib/shipping-estimate.mjs";

type Service = "sea" | "air";

type Estimate = {
  packageName: string;
  amount: number;
};

const peso = (amount: number) =>
  `₱${amount.toLocaleString("en-PH", {
    maximumFractionDigits: 2,
  })}`;

function CountUp({ amount }: { amount: number }) {
  const [shown, setShown] = useState(amount);
  useEffect(() => {
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : 900;
    const start = performance.now();
    let id = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      setShown(p < 1 ? Math.round(amount * (1 - Math.pow(1 - p, 3))) : amount);
      if (p < 1) id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [amount]);
  return <span className="amt">{peso(shown)}</span>;
}

const seaIcon = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M2 20c2 1 4 1 6 0s4-1 6 0 4 1 6 0M4 17l-1-5h18l-2 5M6 12V6h6v6M12 9h5v3" /></svg>;
const airIcon = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M2 14l20-7-6 13-4-5-5 3 1-5z" /></svg>;

export default function RatesCalculatorPage() {
  const [service, setService] = useState<Service>("sea");
  const [cbm, setCbm] = useState("");
  const [weight, setWeight] = useState("");
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [pendingEstimate, setPendingEstimate] = useState<Estimate | null>(null);
  const [leadOpen, setLeadOpen] = useState(false);
  const [leadError, setLeadError] = useState("");
  const [submittingLead, setSubmittingLead] = useState(false);
  const [lead, setLead] = useState({ fullName: "", phone: "", email: "", consent: false });
  const [leadCaptured, setLeadCaptured] = useState(
    () => typeof window !== "undefined" && sessionStorage.getItem("kd-calculator-lead-captured") === "1",
  );
  const [error, setError] = useState("");
  const [size, setSize] = useState<TierId | "you">("mini");
  const [yourCbm, setYourCbm] = useState<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const autoSubmit = useRef(false);

  const density = useMemo(() => {
    const numericCbm = Number(cbm);
    const numericWeight = Number(weight);

    if (
      service !== "sea" ||
      !Number.isFinite(numericCbm) ||
      !Number.isFinite(numericWeight) ||
      numericCbm <= 0 ||
      numericWeight <= 0
    ) {
      return null;
    }

    return numericWeight / numericCbm;
  }, [cbm, service, weight]);

  const airVolumetricWeight = useMemo(() => {
    const numericCbm = Number(cbm);

    if (
      service !== "air" ||
      !Number.isFinite(numericCbm) ||
      numericCbm <= 0
    ) {
      return null;
    }

    return numericCbm * 167;
  }, [cbm, service]);

  // The home page's quick calculator and tier cards link here with their values in the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const timer = window.setTimeout(() => {
      const picked = tiers.find((tier) => tier.id === params.get("size"));
      if (picked?.cbm) setSize(picked.id);
      if (params.get("service") === "air") setService("air");
      const qCbm = params.get("cbm") ?? "";
      const qWeight = params.get("weight") ?? "";
      if (qCbm || qWeight) {
        setCbm(qCbm);
        setWeight(qWeight);
        autoSubmit.current = Boolean(qCbm && qWeight);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!autoSubmit.current) return;
    autoSubmit.current = false;
    formRef.current?.requestSubmit();
  }, [cbm, weight]);

  const resetResult = () => {
    setEstimate(null);
    setError("");
  };

  const switchService = (next: Service) => {
    setService(next);
    setEstimate(null);
    setError("");
    setCbm("");
    setWeight("");
  };

  const showEstimate = (calculated: Estimate) => {
    setEstimate(calculated);
    const numericCbm = Number(cbm);
    if (service === "sea" && numericCbm > 0) {
      setYourCbm(Number(numericCbm.toFixed(3)));
      setSize("you");
    }
  };

  const calculate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const numericWeight = Number(weight);

    if (!Number.isFinite(numericWeight) || numericWeight <= 0) {
      setEstimate(null);
      setError("Enter a positive weight in kilograms.");
      return;
    }

    const numericCbm = Number(cbm);

    if (!Number.isFinite(numericCbm) || numericCbm <= 0) {
      setEstimate(null);
      setError("Enter a positive CBM value.");
      return;
    }

    const calculated = service === "sea"
      ? getSeaEstimate(numericCbm, numericWeight)
      : getAirEstimate(Math.max(numericWeight, numericCbm * 167));

    // Air Freight billable weight is the higher of Actual Weight or
    // Volumetric Weight (CBM × 167), rounded up to the next whole kilogram.
    if (leadCaptured) showEstimate(calculated);
    else {
      setEstimate(null);
      setPendingEstimate(calculated);
      setLeadError("");
      setLeadOpen(true);
    }
    setError("");
    trackEvent("calculate_shipping");
  };

  const submitLead = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLeadError("");
    setSubmittingLead(true);
    try {
      const response = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...lead, service, cbm: Number(cbm), weight: Number(weight) }) });
      const body = await response.json() as { error?: string; estimate?: Estimate };
      if (!response.ok || !body.estimate) throw new Error(body.error || "We could not save your inquiry.");
      sessionStorage.setItem("kd-calculator-lead-captured", "1");
      setLeadCaptured(true);
      showEstimate(body.estimate);
      setPendingEstimate(null);
      setLeadOpen(false);
    } catch (cause) {
      setLeadError(cause instanceof Error ? cause.message : "We could not save your inquiry.");
    } finally { setSubmittingLead(false); }
  };

  const sea = service === "sea";
  const sized = tiers.filter((tier) => tier.cbm !== null);
  const pickedTier = sized.find((tier) => tier.id === size);
  const cubeCbm = size === "you" && yourCbm ? Math.min(yourCbm, 1) : pickedTier?.cbm ?? 0.01;

  return (
    <SiteShell>
      <PageHero>
        <h1>RATES &amp; CALCULATOR</h1>
        <p className="lead hi">Know your estimated shipping cost before you ship.</p>
        <p className="lead">
          Choose your shipping service and enter your cargo details to get an
          estimated rate.
        </p>
      </PageHero>

      <section className="band" style={{ paddingTop: 30 }}>
        <div className="wrap">
          <div className="head" style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: "clamp(1.4rem,2.6vw,1.9rem)" }}>CHOOSE YOUR SHIPPING METHOD</h2>
          </div>

          <div className="methods" role="group" aria-label="Select service">
            <button type="button" className="method" aria-pressed={sea} onClick={() => switchService("sea")}>
              <span className="mi">{seaIcon}</span>
              <span><b>SEA FREIGHT</b><span>Estimated transit time: 3–5 weeks</span></span>
            </button>
            <button type="button" className="method" aria-pressed={!sea} onClick={() => switchService("air")}>
              <span className="mi">{airIcon}</span>
              <span><b>AIR FREIGHT</b><span>Estimated transit time: 5–7 days</span></span>
            </button>
          </div>

          <div className="calc">
            <form className="panel" ref={formRef} onSubmit={calculate} noValidate>
              <h3>SHIPPING CALCULATOR</h3>
              <div className="row2">
                <div className="field">
                  <label htmlFor="calc-cbm">CBM (CUBIC METER)</label>
                  <input
                    id="calc-cbm"
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    placeholder={sea ? "0.05" : "Example: 1.00"}
                    value={cbm}
                    onChange={(event) => {
                      setCbm(event.target.value);
                      resetResult();
                    }}
                  />
                </div>
                <div className="field">
                  <label htmlFor="calc-weight">{sea ? "WEIGHT (KG)" : "ACTUAL WEIGHT (KG)"}</label>
                  <input
                    id="calc-weight"
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    placeholder={sea ? "100" : "Example: 10"}
                    value={weight}
                    onChange={(event) => {
                      setWeight(event.target.value);
                      resetResult();
                    }}
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="calc-derived">{sea ? "DENSITY (KG/CBM)" : "VOLUMETRIC WEIGHT (KG)"}</label>
                <input
                  id="calc-derived"
                  type="text"
                  readOnly
                  value={
                    sea
                      ? density === null ? "" : `${density.toLocaleString("en-PH", { maximumFractionDigits: 2 })} kg/CBM`
                      : airVolumetricWeight === null ? "" : `${airVolumetricWeight.toLocaleString("en-PH", { maximumFractionDigits: 2 })} kg`
                  }
                  placeholder={sea ? "Calculated automatically" : "CBM × 167"}
                />
              </div>

              <p className="helper">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
                <span>
                  {sea
                    ? "Both CBM and weight are required for Sea Freight."
                    : "Charges are based on the higher of Actual Weight or Volumetric Weight (CBM × 167 kg)."}
                </span>
              </p>

              {error && <p className="err" role="alert">{error}</p>}

              <button className="btn btn-blue" type="submit">CALCULATE RATE <span className="arr">→</span></button>
            </form>

            <section className="result" aria-live="polite" aria-labelledby="estimate-title">
              <h2 className="lbl" id="estimate-title">ESTIMATED ALL-IN RATE</h2>
              {!estimate ? (
                <div className="empty">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="M3 8l9 5 9-5M12 13v8" /></svg>
                  <p>Enter your shipment details to calculate your estimated all-in shipping rate.</p>
                </div>
              ) : (
                <div className="stack">
                  <CountUp amount={estimate.amount} />
                  <p className="meta"><span>PACKAGE</span><strong>{estimate.packageName}</strong></p>
                </div>
              )}
              <MessengerLink className="btn btn-green" target="_blank" rel="noopener noreferrer" analyticsEvent="generate_lead">
                GET A QUOTE <span className="arr">→</span>
              </MessengerLink>
            </section>
          </div>

          <aside className="disc">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" /></svg>
            <div>
              <p>
                Disclaimer: The calculated shipping fee is an estimate only
                and is provided for reference. Final shipping charges are
                subject to actual weight, dimensions, CBM, cargo type,
                density, warehouse measurement, and other applicable
                shipping requirements.
              </p>
              <p>
                Air Freight charges are based on the higher of Actual Weight
                (kg) or Volumetric Weight (CBM × 167 kg). Billable weight is
                rounded up to the next whole kilogram.
              </p>
              <p>
                Sea Freight remains subject to the applicable CBM,
                minimum-charge, and density-threshold rules.
              </p>
            </div>
          </aside>
        </div>
      </section>

      <section className="band tint" id="guide" aria-label="Sea and air freight rate guides">
        <div className="wrap">
          <div className="head rv">
            <h2>Sea Freight</h2>
            <p className="lead">Our promotional Sea Freight package rates are:</p>
          </div>

          <div className="explore rv">
            <div className="cubewrap">
              <SizeCube cbm={cubeCbm} />
              <p className="cap">1 CBM = 1 m × 1 m × 1 m</p>
            </div>
            <div className="xinfo">
              <div className="xbtns">
                {sized.map((tier) => (
                  <button type="button" key={tier.id} aria-pressed={size === tier.id} onClick={() => setSize(tier.id)}>
                    <b>{tier.name}</b>
                    <span>{tier.range.split(" · ")[0]}</span>
                  </button>
                ))}
                {yourCbm !== null && (
                  <button type="button" className="you" aria-pressed={size === "you"} onClick={() => setSize("you")}>
                    <b>{yourCbm} CBM</b>
                    <span>CBM (CUBIC METER)</span>
                  </button>
                )}
              </div>
              <div className="xread">
                <div>
                  <div className="k">{size === "you" ? "CBM (CUBIC METER)" : pickedTier?.name.toUpperCase()}</div>
                  {size !== "you" && pickedTier?.from && <div className="from">{pickedTier.from}</div>}
                  <div className="big">
                    {size === "you" ? `${yourCbm} CBM` : <>{pickedTier?.price}{pickedTier?.unit && <small>{pickedTier.unit}</small>}</>}
                  </div>
                </div>
                <div className="dm">{sizeText(cubeCbm)}</div>
              </div>
              <p style={{ color: "var(--muted)", fontSize: ".9rem" }}>
                Final CBM is based on verified warehouse measurements and may differ from your estimate.
              </p>
            </div>
          </div>

          <div style={{ marginTop: 24 }}>
            <TierGrid selected={size} onPick={(id) => { if (id !== "max") setSize(id); }} />
          </div>

          <div className="airc rv">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true" className="planef"><path d="M2 14l20-7-6 13-4-5-5 3 1-5z" /></svg>
            <div className="stack">
              <h2 style={{ fontSize: "clamp(1.5rem,3vw,2rem)" }}>Air Freight</h2>
              <span className="from">Starts at</span>
              <span className="big">₱500</span>
              <p>Air Freight is charged at <b>₱500 per kilogram</b>.</p>
              <p>Charges are based on whichever is higher: <b>Actual Weight or Volumetric Weight</b>.</p>
              <span className="formula">Volumetric Weight (kg) = Length (cm) × Width (cm) × Height (cm) ÷ 6,000</span>
            </div>
          </div>

          <div className="fcl rv">
            <svg viewBox="0 0 64 40" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" aria-hidden="true" className="cont"><rect x="3" y="5" width="58" height="30" rx="2" /><path d="M13 9v22M23 9v22M33 9v22M43 9v22M53 9v22" /></svg>
            <div className="stack">
              <h2 style={{ fontSize: "clamp(1.5rem,3vw,2rem)" }}>Full Container</h2>
              <p>Please contact KargoDoor PH.</p>
            </div>
            <MessengerLink className="btn btn-green" target="_blank" rel="noopener noreferrer" analyticsEvent="generate_lead">
              GET A QUOTE <span className="arr">→</span>
            </MessengerLink>
          </div>
        </div>
      </section>

      {leadOpen && pendingEstimate && (
        <div
          className="backdrop"
          role="presentation"
          onClick={(event) => { if (event.target === event.currentTarget) setLeadOpen(false); }}
        >
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="lead-title">
            <button className="x" type="button" aria-label="Close" onClick={() => setLeadOpen(false)}>×</button>
            <h2 id="lead-title">YOUR ESTIMATED RATE IS READY</h2>
            <p>Enter your details to view your shipping estimate.</p>
            <form onSubmit={submitLead} noValidate>
              <div className="field">
                <label htmlFor="lead-name">FULL NAME*</label>
                <input id="lead-name" required value={lead.fullName} onChange={(e) => setLead({ ...lead, fullName: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="lead-phone">MOBILE / VIBER / WHATSAPP*</label>
                <input id="lead-phone" required type="tel" value={lead.phone} onChange={(e) => setLead({ ...lead, phone: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="lead-email">EMAIL <span className="opt">(optional)</span></label>
                <input id="lead-email" type="email" value={lead.email} onChange={(e) => setLead({ ...lead, email: e.target.value })} />
              </div>
              <label className="consent">
                <input required type="checkbox" checked={lead.consent} onChange={(e) => setLead({ ...lead, consent: e.target.checked })} /> I agree to be contacted by KargoDoor PH regarding my shipping inquiry.
              </label>
              {leadError && <p className="err" role="alert">{leadError}</p>}
              <button className="btn btn-blue" disabled={submittingLead}>{submittingLead ? "SAVING…" : "SHOW MY ESTIMATED RATE"}</button>
              <small>Your information will only be used to assist with your shipping inquiry.</small>
            </form>
          </section>
        </div>
      )}
    </SiteShell>
  );
}
