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
import { PageHero, SiteShell } from "@/components/v5/chrome";

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

  return (
    <>
      <PageHero>
        <h1>TRACK YOUR SHIPMENT</h1>
        <p className="lead">
          Enter your KargoDoor tracking number to check your latest shipment
          status.
        </p>
        <label htmlFor="tracking-number" className="tlab">
          TRACKING NUMBER
        </label>
        <form className="tsearch" onSubmit={handleSubmit}>
          <input
            id="tracking-number"
            type="text"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="Example: KDSEA-482731"
            autoComplete="off"
          />
          <button className="btn btn-green" type="submit" disabled={loading}>
            {loading ? "TRACKING..." : "TRACK SHIPMENT"}
          </button>
        </form>
      </PageHero>

      <section className="band" style={{ paddingTop: 20 }}>
        <div className="wrap lift">
          {error && (
            <div className="terr">
              <div className="err" role="alert">{error}</div>
            </div>
          )}

          {shipment && (
            <article className="tcard">
              <div className="thead">
                <div>
                  <div className="k">TRACKING NUMBER</div>
                  <h2 className="code">{shipment.tracking_number}</h2>
                </div>
                <span className="status"><i />{shipment.current_status}</span>
              </div>

              {stageIndex >= 0 && (
                <section aria-label={`Shipment progress: ${shipment.current_status}`}>
                  <div className="k" style={{ marginTop: 26 }}>SHIPMENT PROGRESS</div>
                  <div className="tmap" aria-hidden="true">
                    <svg viewBox="0 0 1000 90" preserveAspectRatio="none">
                      <path d="M40 60 Q500 0 960 60" stroke="var(--line)" strokeWidth="4" fill="none" strokeDasharray="10 10" />
                      <path className="tdone" d="M40 60 Q500 0 960 60" stroke="var(--green)" strokeWidth="5" fill="none" pathLength={1} strokeDasharray="1" style={{ "--to": 1 - stageIndex / (seaStages.length - 1) } as CSSProperties} />
                    </svg>
                  </div>
                  <ol className="tsteps">
                    {seaStages.map((stage, index) => (
                      <li
                        className={`${index <= stageIndex ? "done" : ""} ${index === stageIndex ? "now" : ""}`}
                        key={stage}
                      >
                        <i aria-hidden="true">{index < stageIndex ? "✓" : index + 1}</i>
                        <span>{stage}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              <dl className="tdetails">
                <div>
                  <dt>FREIGHT TYPE</dt>
                  <dd>{shipment.freight_type}</dd>
                </div>
                <div>
                  <dt>ORIGIN WAREHOUSE</dt>
                  <dd>{shipment.origin_warehouse || "—"}</dd>
                </div>
                <div>
                  <dt>CHINA WAREHOUSE RECEIVED</dt>
                  <dd>{shipment.warehouse_received_date || "—"}</dd>
                </div>
                <div>
                  <dt>STANDARD TRANSIT</dt>
                  <dd>{shipment.standard_transit}</dd>
                </div>
              </dl>

              <div className="tnote">
                <div className="k">CURRENT STATUS</div>
                <strong>{shipment.current_status}</strong>
                {shipment.status_message && (
                  <>
                    <div className="k">STATUS UPDATE</div>
                    <p>{shipment.status_message}</p>
                  </>
                )}
              </div>

              {shipment.remarks && (
                <div className="tnote">
                  <div className="k">LATEST UPDATE</div>
                  <p>{shipment.remarks}</p>
                </div>
              )}

              <p className="tupdated">
                Last updated: {shipment.last_updated}
              </p>
            </article>
          )}
        </div>
      </section>
    </>
  );
}

export default function TrackPage() {
  return (
    <SiteShell>
      <Suspense
        fallback={
          <PageHero>
            <h1>TRACK YOUR SHIPMENT</h1>
            <p className="lead">Loading tracking...</p>
          </PageHero>
        }
      >
        <TrackContent />
      </Suspense>
    </SiteShell>
  );
}
