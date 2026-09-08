"use client";

import { FormEvent, useState } from "react";
import { Footer, Header } from "@/components/site-chrome";

type Shipment = {
  tracking_number: string;
  freight_type: string;
  origin_warehouse: string | null;
  warehouse_received_date: string | null;
  departure_date: string | null;
  current_status: string;
  eta: string | null;
  remarks: string | null;
  last_updated: string;
  standard_transit: string;
};

export default function TrackPage() {
  const [code, setCode] = useState("");
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trackingNumber = code.trim().toUpperCase();

    setError("");
    setShipment(null);

    if (!trackingNumber) {
      setError("Please enter your KargoDoor tracking number.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `/api/track?code=${encodeURIComponent(trackingNumber)}`,
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Tracking number not found.");
        return;
      }

      setShipment(data);
    } catch {
      setError(
        "We couldn't retrieve your shipment right now. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="kd-site-shell">
      <Header />

      <main className="kd-track-page">
        <section className="kd-track-section">
          <div className="kd-container">
            <header className="kd-track-heading">
              <h1>TRACK YOUR SHIPMENT</h1>
              <p>
                Enter your KargoDoor tracking number to check your latest shipment
                status.
              </p>
            </header>

            <form className="kd-track-form" onSubmit={handleSubmit}>
              <label htmlFor="tracking-number">TRACKING NUMBER</label>

              <div className="kd-track-input-row">
                <input
                  id="tracking-number"
                  type="text"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="Example: KD-SEA-000001"
                  autoComplete="off"
                />

                <button type="submit" disabled={loading}>
                  {loading ? "TRACKING..." : "TRACK SHIPMENT"}
                </button>
              </div>
            </form>

            {error && (
              <div className="kd-track-error" role="alert">
                {error}
              </div>
            )}

            {shipment && (
              <article className="kd-track-result">
                <div className="kd-track-result-header">
                  <span>TRACKING NUMBER</span>
                  <h2>{shipment.tracking_number}</h2>
                  <strong>{shipment.current_status}</strong>
                </div>

                <div className="kd-track-details">
                  <div>
                    <span>FREIGHT TYPE</span>
                    <strong>{shipment.freight_type}</strong>
                  </div>

                  <div>
                    <span>ORIGIN WAREHOUSE</span>
                    <strong>{shipment.origin_warehouse || "—"}</strong>
                  </div>

                  <div>
                    <span>WAREHOUSE RECEIVED</span>
                    <strong>{shipment.warehouse_received_date || "—"}</strong>
                  </div>

                  <div>
                    <span>DEPARTURE DATE</span>
                    <strong>{shipment.departure_date || "Not yet departed"}</strong>
                  </div>

                  <div>
                    <span>ESTIMATED ARRIVAL</span>
                    <strong>{shipment.eta || "To be updated"}</strong>
                  </div>

                  <div>
                    <span>STANDARD TRANSIT</span>
                    <strong>{shipment.standard_transit}</strong>
                  </div>
                </div>

                {shipment.remarks && (
                  <div className="kd-track-remarks">
                    <span>LATEST UPDATE</span>
                    <p>{shipment.remarks}</p>
                  </div>
                )}

                <p className="kd-track-updated">
                  Last updated: {shipment.last_updated}
                </p>
              </article>
            )}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
