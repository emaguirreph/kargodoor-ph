"use client";

import { useMemo, useState, type FormEvent } from "react";
import { ArrowRight, Calculator, Info, PackageOpen, ShieldCheck } from "lucide-react";
import { Footer, Header } from "@/components/site-chrome";
import { trackEvent } from "@/lib/analytics";

type Service = "sea" | "air";

type Estimate =
  | { service: "sea"; package: string; amount: number }
  | { service: "air"; package: string; amount: number };

const peso = (amount: number) => `₱${amount.toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;

function higherSeaEstimate(cbmPackage: string, cbmAmount: number, weight: number): Estimate {
  const weightAmount = weight * 21;
  return weightAmount > cbmAmount
    ? { service: "sea", package: "KD MAX", amount: weightAmount }
    : { service: "sea", package: cbmPackage, amount: cbmAmount };
}

function seaEstimate(cbm: number, weight: number): Estimate {
  if (cbm <= 0.01) return higherSeaEstimate("KD MINI", 250, weight);
  if (cbm <= 0.05) return higherSeaEstimate("KD LITE", 750, weight);
  if (cbm <= 0.125) return higherSeaEstimate("KD PLUS", 1400, weight);

  const volumeAmount = Math.max(cbm * 8000, 1700);
  return higherSeaEstimate("KD STANDARD", volumeAmount, weight);
}

export default function RatesCalculatorPage() {
  const [service, setService] = useState<Service>("sea");
  const [cbm, setCbm] = useState("");
  const [weight, setWeight] = useState("");
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [error, setError] = useState("");

  const serviceLabel = useMemo(() => (service === "sea" ? "SEA FREIGHT" : "AIR FREIGHT"), [service]);

  const switchService = (next: Service) => {
    setService(next);
    setEstimate(null);
    setError("");
    setCbm("");
    setWeight("");
  };

  const calculate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const numericWeight = Number(weight);
    if (!Number.isFinite(numericWeight) || numericWeight <= 0) {
      setEstimate(null);
      setError("Enter a positive weight in kilograms.");
      return;
    }

    if (service === "sea") {
      const numericCbm = Number(cbm);
      if (!Number.isFinite(numericCbm) || numericCbm <= 0) {
        setEstimate(null);
        setError("Enter a positive CBM value.");
        return;
      }
      setEstimate(seaEstimate(numericCbm, numericWeight));
      setError("");
      trackEvent("calculate_shipping");
      return;
    }

    setEstimate({ service: "air", package: "AIR FREIGHT", amount: numericWeight * 500 });
    setError("");
    trackEvent("calculate_shipping");
  };

  return (
    <div className="kd-site-shell">
      <Header />
      <main className="kd-rates-page">
        <section className="kd-rates-intro" aria-labelledby="rates-title">
          <div className="kd-container kd-rates-container">
            <header className="kd-rates-heading">
              <h1 id="rates-title">RATES &amp; CALCULATOR</h1>
              <p className="kd-rates-tagline">Know your estimated shipping cost before you ship.</p>
              <p>Choose your shipping service and enter your cargo details to get an estimated rate.</p>
            </header>
            <h2 className="kd-rates-method">CHOOSE YOUR SHIPPING METHOD</h2>

            <div className="kd-calculator-grid">
              <form className="kd-calculator-card" onSubmit={calculate} noValidate>
                <h2><span className="kd-calculator-icon"><Calculator aria-hidden="true" /></span> SHIPPING CALCULATOR</h2>
                <label>
                  <span>SELECT SERVICE</span>
                  <select aria-label="Select service" value={service} onChange={(event) => switchService(event.target.value as Service)}>
                    <option value="sea">SEA FREIGHT</option>
                    <option value="air">AIR FREIGHT</option>
                  </select>
                </label>
                {service === "sea" ? (
                  <>
                    <label>
                      <span>CBM (CUBIC METER)</span>
                      <input aria-label="CBM cubic meter" type="number" min="0" step="any" inputMode="decimal" placeholder="Example: 0.05" value={cbm} onChange={(event) => { setCbm(event.target.value); setEstimate(null); setError(""); }} />
                    </label>
                    <label>
                      <span>WEIGHT (KG)</span>
                      <input aria-label="Weight kilograms" type="number" min="0" step="any" inputMode="decimal" placeholder="Example: 100" value={weight} onChange={(event) => { setWeight(event.target.value); setEstimate(null); setError(""); }} />
                    </label>
                    <p className="kd-calculator-helper"><Info aria-hidden="true" /> Both CBM and weight are required for Sea Freight. Your estimate automatically uses whichever applicable rate is higher.</p>
                  </>
                ) : (
                  <>
                    <label>
                      <span>WEIGHT (KG)</span>
                      <input aria-label="Weight kilograms" type="number" min="0" step="any" inputMode="decimal" placeholder="Example: 10" value={weight} onChange={(event) => { setWeight(event.target.value); setEstimate(null); setError(""); }} />
                    </label>
                    <p className="kd-calculator-helper"><Info aria-hidden="true" /> Weight is required for Air Freight.</p>
                  </>
                )}
                {error && <p className="kd-calculator-error" role="alert">{error}</p>}
                <button className="kd-calculate-button" type="submit"><span>CALCULATE RATE</span><ArrowRight aria-hidden="true" /></button>
              </form>

              <section className="kd-result-card" aria-live="polite" aria-labelledby="estimate-title">
                <h2 id="estimate-title"><span className="kd-result-icon" aria-hidden="true" /> ESTIMATED ALL-IN RATE</h2>
                {!estimate ? (
                  <div className="kd-result-empty">
                    <PackageOpen aria-hidden="true" />
                    <p>Enter your shipment details to calculate your estimated all-in shipping rate.</p>
                  </div>
                ) : (
                  <div className="kd-result-filled">
                    <p className="kd-result-service">{serviceLabel}</p>
                    <ResultRow label="PACKAGE" value={estimate.package} />
                    <div className="kd-result-total"><span>ESTIMATED ALL-IN RATE</span><strong>{peso(estimate.amount)}</strong></div>
                  </div>
                )}
              </section>
            </div>
            <aside className="kd-rates-disclaimer"><ShieldCheck aria-hidden="true" /><p>This is an estimated all-in shipping rate. Final charges remain subject to cargo inspection, verified measurements, weight, item classification, and applicable shipping restrictions.</p></aside>
          </div>
        </section>

        <section className="kd-size-guide" aria-label="Package size guide">
          <div className="kd-container kd-rates-container">
            <p className="kd-size-guide-mobile-hint">Swipe to view full size guide →</p>
            <div className="kd-size-guide-scroll">
              <img
                src="/assets/kargodoor-package-size-guide-approved.png"
                alt="Package size guide for KD Mini, KD Lite, KD Plus, KD Standard, and KD Max"
                width={1643}
                height={1044}
                loading="lazy"
                decoding="async"
              />
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return <p className="kd-result-row"><span>{label}</span><strong>{value}</strong></p>;
}
