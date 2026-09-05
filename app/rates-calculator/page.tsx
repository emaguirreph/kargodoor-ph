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

type Service = "sea" | "air";

type Estimate =
  | { service: "sea"; tier: string; amount: number }
  | { service: "air"; tier: string; amount: number };

const peso = (amount: number) =>
  `₱${amount.toLocaleString("en-PH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;

function seaEstimate(cbm: number, weight: number): Estimate {
  // Fixed small-package tiers.
  // Weight does NOT override these rates.
  if (cbm <= 0.01) {
    return {
      service: "sea",
      tier: "KD MINI",
      amount: 250,
    };
  }

  if (cbm <= 0.05) {
    return {
      service: "sea",
      tier: "KD LITE",
      amount: 750,
    };
  }

  if (cbm <= 0.125) {
    return {
      service: "sea",
      tier: "KD PLUS",
      amount: 1400,
    };
  }

  // Any CBM above 0.125 uses KD Standard / KD Max comparison.
  const standardVolumeCharge = Math.max(cbm * 7999, 1700);
  const weightCharge = weight * 19;

  // Tie stays KD Standard.
  const weightWins = weightCharge > standardVolumeCharge;

  return {
    service: "sea",
    tier: weightWins ? "KD MAX" : "KD STANDARD",
    amount: weightWins ? weightCharge : standardVolumeCharge,
  };
}

export default function RatesCalculatorPage() {
  const [service, setService] = useState<Service>("sea");
  const [cbm, setCbm] = useState("");
  const [weight, setWeight] = useState("");
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [error, setError] = useState("");

  const numericCbm = Number(cbm);
  const numericWeight = Number(weight);

  const density = useMemo(() => {
    if (
      service !== "sea" ||
      !Number.isFinite(numericCbm) ||
      !Number.isFinite(numericWeight) ||
      numericCbm <= 0 ||
      numericWeight <= 0
    ) {
      return "";
    }

    const calculatedDensity = numericWeight / numericCbm;

    if (!Number.isFinite(calculatedDensity) || calculatedDensity <= 0) {
      return "";
    }

    return `${calculatedDensity.toLocaleString("en-PH", {
      maximumFractionDigits: 2,
    })} kg/CBM`;
  }, [service, numericCbm, numericWeight]);

  const switchService = (next: Service) => {
    setService(next);
    setEstimate(null);
    setError("");
    setCbm("");
    setWeight("");
  };

  const handleCbmChange = (value: string) => {
    setCbm(value);
    setEstimate(null);
    setError("");
  };

  const handleWeightChange = (value: string) => {
    setWeight(value);
    setEstimate(null);
    setError("");
  };

  const calculate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const currentWeight = Number(weight);

    if (!Number.isFinite(currentWeight) || currentWeight <= 0) {
      setEstimate(null);
      setError("Enter a positive weight in kilograms.");
      return;
    }

    if (service === "sea") {
      const currentCbm = Number(cbm);

      if (!Number.isFinite(currentCbm) || currentCbm <= 0) {
        setEstimate(null);
        setError("Enter a positive CBM value.");
        return;
      }

      setEstimate(seaEstimate(currentCbm, currentWeight));
      setError("");
      trackEvent("calculate_shipping");
      return;
    }

    setEstimate({
      service: "air",
      tier: "AIR FREIGHT",
      amount: currentWeight * 500,
    });

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
                  </span>{" "}
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
                        <span>CBM (CUBIC METER)</span>
                        <input
                          aria-label="CBM cubic meter"
                          type="number"
                          min="0"
                          step="any"
                          inputMode="decimal"
                          placeholder="Example: 0.05"
                          value={cbm}
                          onChange={(event) =>
                            handleCbmChange(event.target.value)
                          }
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
                          placeholder="Example: 100"
                          value={weight}
                          onChange={(event) =>
                            handleWeightChange(event.target.value)
                          }
                        />
                      </label>
                    </div>

                    <label className="kd-density-field">
                      <span>DENSITY (KG/CBM)</span>
                      <input
                        aria-label="Density kilograms per cubic meter"
                        type="text"
                        value={density}
                        placeholder="Calculated automatically"
                        readOnly
                        tabIndex={-1}
                      />
                    </label>

                    <p className="kd-calculator-helper">
                      <Info aria-hidden="true" />
                      Both CBM and weight are required for Sea Freight. Your
                      package tier is calculated automatically.
                    </p>
                  </>
                ) : (
                  <>
                    <label>
                      <span>WEIGHT (KG)</span>
                      <input
                        aria-label="Weight kilograms"
                        type="number"
                        min="0"
                        step="any"
                        inputMode="decimal"
                        placeholder="Example: 10"
                        value={weight}
                        onChange={(event) =>
                          handleWeightChange(event.target.value)
                        }
                      />
                    </label>

                    <p className="kd-calculator-helper">
                      <Info aria-hidden="true" />
                      Weight is required for Air Freight.
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
                  <span className="kd-result-icon" aria-hidden="true" />{" "}
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
                    <ResultRow label="PACKAGE" value={estimate.tier} />

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
                  <strong>Disclaimer:</strong> The calculated shipping fee is
                  an estimate only and is provided for reference. Final
                  shipping charges are subject to actual weight, dimensions,
                  CBM, cargo type, density, warehouse measurement, and other
                  applicable shipping requirements.
                </p>

                <p className="kd-density-formula">
                  <strong>Density Formula:</strong> Weight (kg) ÷ CBM =
                  Density (kg/CBM)
                  <br />
                  Example: 100 kg ÷ 0.50 CBM = 200 kg/CBM
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
                width={1088}
                height={696}
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
