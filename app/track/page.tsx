"use client";

import {
  CSSProperties,
  FormEvent,
  Suspense,
  useCallback,
  useEffect,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import { Footer, Header } from "@/components/site-chrome";

type Shipment = {
  tracking_number: string;
  freight_type: string;
  origin_warehouse: string | null;
  warehouse_received_date: string | null;
  current_status: string;
  status_message: string | null;
  remarks: string | null;
  last_updated: string;
  standard_transit: string;
};

const seaStages = [
  "Awaiting Supplier Dispatch",
  "China Warehouse",
  "China Port",
  "Sea Transit",
  "Manila Port",
  "Gatepass",
  "Malabon Warehouse",
  "Delivered",
];

function seaStageIndex(status: string) {
  const legacyPositions: Record<string, number> = {
    "Received at Warehouse": 1,
    "In Transit": 3,
    "Arrived in Philippines": 4,
    "Ready for Release": 6,
  };
  return Math.max(0, seaStages.indexOf(status), legacyPositions[status] ?? -1);
}

function TrackContent() {
  const searchParams = useSearchParams();

  const trackingFromUrl =
    searchParams.get("tracking")?.trim().toUpperCase() ?? "";

  const [code, setCode] = useState(trackingFromUrl);
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const trackShipment = useCallback(async (trackingNumber: string) => {
    const normalized = trackingNumber.trim().toUpperCase();

    if (!normalized) {
      setShipment(null);
      setError("Please enter your KargoDoor tracking number.");
      return;
    }

    setLoading(true);
    setError("");
    setShipment(null);

    try {
      const response = await fetch(
        `/api/track?code=${encodeURIComponent(normalized)}`,
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
  }, []);

  useEffect(() => {
    if (!trackingFromUrl) {
      return;
    }

    const timer = window.setTimeout(() => {
      void trackShipment(trackingFromUrl);
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [trackingFromUrl, trackShipment]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await trackShipment(code);
  }

  const stageIndex = shipment?.freight_type === "Sea Freight"
    ? seaStageIndex(shipment.current_status)
    : -1;
  const progress = stageIndex >= 0
    ? `${(stageIndex / (seaStages.length - 1)) * 100}%`
    : "0%";

  return (
    <>
      <header className="kd-track-heading">
        <h1>TRACK YOUR SHIPMENT</h1>

        <p>
          Enter your KargoDoor tracking number to check your latest shipment
          status.
        </p>
      </header>

      <form className="kd-track-form" onSubmit={handleSubmit}>
        <label htmlFor="tracking-number">
          TRACKING NUMBER
        </label>

        <div className="kd-track-input-row">
          <input
            id="tracking-number"
            type="text"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="Example: KDSEA-482731"
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
          </div>

          {stageIndex >= 0 && (
            <section
              className="kd-track-progress"
              aria-label={`Shipment progress: ${shipment.current_status}`}
              style={{ "--kd-track-progress": progress } as CSSProperties}
            >
              <span>SHIPMENT PROGRESS</span>
              <ol>
                {seaStages.map((stage, index) => (
                  <li
                    className={index <= stageIndex ? "is-complete" : ""}
                    key={stage}
                  >
                    <i aria-hidden="true" />
                    <small>{stage}</small>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <div className="kd-track-details">
            <div>
              <span>FREIGHT TYPE</span>
              <strong>{shipment.freight_type}</strong>
            </div>

            <div>
              <span>ORIGIN WAREHOUSE</span>
              <strong>
                {shipment.origin_warehouse || "—"}
              </strong>
            </div>

            <div>
              <span>CHINA WAREHOUSE RECEIVED</span>
              <strong>
                {shipment.warehouse_received_date || "—"}
              </strong>
            </div>

            <div>
              <span>STANDARD TRANSIT</span>
              <strong>{shipment.standard_transit}</strong>
            </div>
          </div>

          <div className="kd-track-remarks">
            <div className="kd-track-current-status">
              <span>CURRENT STATUS</span>
              <strong>{shipment.current_status}</strong>
            </div>

            {shipment.status_message && (
              <>
              <span>STATUS UPDATE</span>
              <p>{shipment.status_message}</p>
              </>
            )}
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
    </>
  );
}

export default function TrackPage() {
  return (
    <div className="kd-site-shell">
      <Header />

      <main className="kd-track-page">
        <section className="kd-track-section">
          <div className="kd-container">
            <Suspense
              fallback={
                <header className="kd-track-heading">
                  <h1>TRACK YOUR SHIPMENT</h1>
                  <p>Loading tracking...</p>
                </header>
              }
            >
              <TrackContent />
            </Suspense>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
