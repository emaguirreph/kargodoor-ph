"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Calculator,
  Info,
  PackageOpen,
  ShieldCheck,
} from "lucide-react";
import { Footer, Header } from "@/components/site-chrome";
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

export default function RatesCalculatorPage() {
  const [service, setService] = useState<Service>("sea");
  const [cbm, setCbm] = useState("");
  const [weight, setWeight] = useState("");
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [error, setError] = useState("");

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

    const numericCbm = Number(cbm);

    if (!Number.isFinite(numericCbm) || numericCbm <= 0) {
      setEstimate(null);
      setError("Enter a positive CBM value.");
      return;
    }

    if (service === "sea") {
      setEstimate(getSeaEstimate(numericCbm, numericWeight));
      setError("");
      trackEvent("calculate_shipping");
      return;
    }

    // Air Freight:
    // Billable weight is the higher of Actual Weight or (CBM × 167),
    // rounded up to the next whole kilogram.
    const volumetricWeight = numericCbm * 167;
    const billableWeight = Math.ceil(
      Math.max(numericWeight, volumetricWeight),
    );

    setEstimate(getAirEstimate(billableWeight));
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
              <p className="kd-rates-tagline">
                Know your estimated shipping cost before you ship.
              </p>
              <p>
                Choose your shipping service and enter your cargo details to
                get an estimated rate.
              </p>
            </header>

            <h2 className="kd-rates-method">CHOOSE YOUR SHIPPING METHOD</h2>

            <div className="kd-calculator-grid">
              <form
                className="kd-calculator-card"
                onSubmit={calculate}
                noValidate
              >
                <h2>
                  <span className="kd-calculator-icon">
                    <Calculator aria-hidden="true" />
                  </span>
                  SHIPPING CALCULATOR
                </h2>

                <label>
                  <span>SELECT SERVICE</span>
                  <select
                    aria-label="Select service"
                    value={service}
                    onChange={(event) =>
                      switchService(event.target.value as Service)
                    }
                  >
                    <option value="sea">SEA FREIGHT</option>
                    <option value="air">AIR FREIGHT</option>
                  </select>
                </label>

                {service === "sea" ? (
                  <>
                    <div className="kd-calculator-input-row">
                      <label>
                        <span className="kd-cbm-label">CBM (CUBIC METER)</span>
                        <input
                          aria-label="CBM cubic meter"
                          type="number"
                          min="0"
                          step="any"
                          inputMode="decimal"
                          placeholder="0.05"
                          value={cbm}
                          onChange={(event) => {
                            setCbm(event.target.value);
                            setEstimate(null);
                            setError("");
                          }}
                        />
                      </label>

                      <label>
                        <span>WEIGHT (KG)</span>
                        <input
                          aria-label="Weight kilograms"
                          type="number"
                          min="0"
                          step="any"
                          inputMode="decimal"
                          placeholder="100"
                          value={weight}
                          onChange={(event) => {
                            setWeight(event.target.value);
                            setEstimate(null);
                            setError("");
                          }}
                        />
                      </label>
                    </div>

                    <label className="kd-density-field">
                      <span>DENSITY (KG/CBM)</span>
                      <input
                        aria-label="Calculated density kilograms per cubic meter"
                        type="text"
                        readOnly
                        value={
                          density === null
                            ? ""
                            : `${density.toLocaleString("en-PH", {
                                maximumFractionDigits: 2,
                              })} kg/CBM`
                        }
                        placeholder="Calculated automatically"
                      />
                    </label>

                    <p className="kd-calculator-helper">
                      <Info aria-hidden="true" />
                      Both CBM and weight are required for Sea Freight.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="kd-calculator-input-row">
                      <label>
                        <span className="kd-cbm-label">CBM (CUBIC METER)</span>
                        <input
                          aria-label="CBM cubic meter"
                          type="number"
                          min="0"
                          step="any"
                          inputMode="decimal"
                          placeholder="Example: 1.00"
                          value={cbm}
                          onChange={(event) => {
                            setCbm(event.target.value);
                            setEstimate(null);
                            setError("");
                          }}
                        />
                      </label>

                      <label>
                        <span>ACTUAL WEIGHT (KG)</span>
                        <input
                          aria-label="Actual weight kilograms"
                          type="number"
                          min="0"
                          step="any"
                          inputMode="decimal"
                          placeholder="Example: 10"
                          value={weight}
                          onChange={(event) => {
                            setWeight(event.target.value);
                            setEstimate(null);
                            setError("");
                          }}
                        />
                      </label>
                    </div>

                    <label className="kd-density-field">
                      <span>VOLUMETRIC WEIGHT (KG)</span>
                      <input
                        aria-label="Calculated volumetric weight"
                        type="text"
                        readOnly
                        value={
                          airVolumetricWeight === null
                            ? ""
                            : `${airVolumetricWeight.toLocaleString("en-PH", {
                                maximumFractionDigits: 2,
                              })} kg`
                        }
                        placeholder="CBM × 167"
                      />
                    </label>

                    <p className="kd-calculator-helper">
                      <Info aria-hidden="true" />
                      Charges are based on the higher of Actual Weight or
                      Volumetric Weight (CBM × 167 kg).
                    </p>
                  </>
                )}

                {error && (
                  <p className="kd-calculator-error" role="alert">
                    {error}
                  </p>
                )}

                <button className="kd-calculate-button" type="submit">
                  <span>CALCULATE RATE</span>
                  <ArrowRight aria-hidden="true" />
                </button>
              </form>

              <section
                className="kd-result-card"
                aria-live="polite"
                aria-labelledby="estimate-title"
              >
                <h2 id="estimate-title">
                  <span className="kd-result-icon" aria-hidden="true" />
                  ESTIMATED ALL-IN RATE
                </h2>

                {!estimate ? (
                  <div className="kd-result-empty">
                    <PackageOpen aria-hidden="true" />
                    <p>
                      Enter your shipment details to calculate your estimated
                      all-in shipping rate.
                    </p>
                  </div>
                ) : (
                  <div className="kd-result-filled">
                    <ResultRow
                      label="PACKAGE"
                      value={estimate.packageName}
                    />
                    <div className="kd-result-total">
                      <span>ESTIMATED ALL-IN RATE</span>
                      <strong>{peso(estimate.amount)}</strong>
                    </div>
                  </div>
                )}
              </section>
            </div>

            <aside className="kd-rates-disclaimer">
              <ShieldCheck aria-hidden="true" />
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

        <section className="kd-size-guide" aria-label="Package size guide">
          <div className="kd-container kd-rates-container">
            <p className="kd-size-guide-mobile-hint">
              Swipe to view full size guide →
            </p>

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
  return (
    <p className="kd-result-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </p>
  );
}
