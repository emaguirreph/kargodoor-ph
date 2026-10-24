"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Home page quick calculator: sends the values to the full calculator on the rates page. */
export function QuickCalculator() {
  const router = useRouter();
  const [service, setService] = useState<"sea" | "air">("sea");
  const [cbm, setCbm] = useState("");
  const [weight, setWeight] = useState("");
  const sea = service === "sea";

  return (
    <form
      className="qbar"
      aria-label="Shipping calculator"
      onSubmit={(event) => {
        event.preventDefault();
        const params = new URLSearchParams({ service });
        if (cbm) params.set("cbm", cbm);
        if (weight) params.set("weight", weight);
        router.push(`/rates-calculator?${params}`);
      }}
    >
      <h2 className="qh">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M8 6h8M8 11h2M14 11h2M8 15h2M14 15h2M8 19h2M14 19h2" /></svg>
        SHIPPING CALCULATOR
      </h2>
      <div className={`seg${sea ? "" : " air"}`} role="group" aria-label="Select service">
        <span className="thumb" />
        <button type="button" aria-pressed={sea} onClick={() => setService("sea")}>SEA FREIGHT</button>
        <button type="button" aria-pressed={!sea} onClick={() => setService("air")}>AIR FREIGHT</button>
      </div>
      <div className="field">
        <label htmlFor="quick-cbm">CBM (CUBIC METER)</label>
        <input id="quick-cbm" type="number" step="any" min="0" inputMode="decimal" placeholder={sea ? "0.05" : "Example: 1.00"} value={cbm} onChange={(e) => setCbm(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="quick-weight">{sea ? "WEIGHT (KG)" : "ACTUAL WEIGHT (KG)"}</label>
        <input id="quick-weight" type="number" step="any" min="0" inputMode="decimal" placeholder={sea ? "100" : "Example: 10"} value={weight} onChange={(e) => setWeight(e.target.value)} />
      </div>
      <button className="btn btn-blue" type="submit">CALCULATE RATE <span className="arr">→</span></button>
    </form>
  );
}

/** Adds the "go" class when the element scrolls into view, which starts its CSS animation. */
export function WhenVisible({ className, children }: { className: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setSeen(true);
        observer.disconnect();
      }
    }, { threshold: 0.35 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return <div ref={ref} className={`${className}${seen ? " go" : ""}`}>{children}</div>;
}

const warehouses: Array<[string, number, number]> = [
  ["Guangzhou", 150, 150],
  ["Yiwu", 228, 70],
  ["Shishi", 250, 112],
  ["Hong Kong", 168, 178],
  ["Taiwan", 328, 150],
];

/** Map of the China warehouses with a route to Malabon that cycles through each one. */
export function WarehouseMap() {
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (!auto || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setActive((i) => (i + 1) % warehouses.length), 2600);
    return () => window.clearInterval(timer);
  }, [auto]);

  const [, x, y] = warehouses[active];
  const route = `M${x} ${y} Q ${(x + 332) / 2 + 40} ${(y + 262) / 2 - 30} 332 262`;

  return (
    <div className="wh">
      <div className="map rv">
        <svg viewBox="0 0 420 340" role="img" aria-label="KargoDoor warehouses in Guangzhou, Yiwu, Shishi, Hong Kong, and Taiwan">
          <path d="M20 30 Q120 0 230 30 Q300 60 300 120 Q290 170 230 200 Q170 222 110 196 Q50 170 30 110 Q16 70 20 30Z" fill="var(--surface-2)" stroke="var(--line)" strokeWidth="2" />
          <path d="M318 146 q14 -10 22 6 q6 22 -6 36 q-14 6 -18 -14z" fill="var(--surface-2)" stroke="var(--line)" strokeWidth="2" />
          <path d="M318 236 q24 -14 34 10 q10 30 -8 54 q-20 12 -28 -16 q-6 -26 2 -48z" fill="var(--green-soft)" stroke="var(--green)" strokeWidth="2" />
          <path className="mapline" d={route} stroke="var(--green)" strokeWidth="3" fill="none" />
          {warehouses.map(([name, px, py]) => (
            <g key={name}>
              <circle cx={px} cy={py} r="8" fill="var(--green)" className="pulse-ring" />
              <circle cx={px} cy={py} r="7" fill="var(--green)" stroke="#fff" strokeWidth="2" />
            </g>
          ))}
          <circle cx="332" cy="262" r="10" fill="var(--brand)" />
          <circle cx="332" cy="262" r="10" fill="var(--brand)" className="pulse-ring" />
          <text x="332" y="326" textAnchor="middle" fontFamily="Plus Jakarta Sans,sans-serif" fontSize="13" fontWeight="800" fill="var(--fg)" letterSpacing="1">MALABON WAREHOUSE</text>
        </svg>
      </div>
      <div className="whlist rv">
        {warehouses.map(([name], i) => (
          <button type="button" key={name} aria-pressed={i === active} onClick={() => { setActive(i); setAuto(false); }}>
            <i />{name}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 24-hour dial with the 8 AM to 10 PM support window and a hand at the current Manila time. */
export function SupportDial() {
  const [hour, setHour] = useState<number | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const now = new Date(Date.now() + (8 * 60 + new Date().getTimezoneOffset()) * 60000);
      setHour(now.getHours() + now.getMinutes() / 60);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const r = 48;
  const c = 60;
  const point = (h: number) => {
    const a = (h / 24) * 2 * Math.PI - Math.PI / 2;
    return [c + r * Math.cos(a), c + r * Math.sin(a)];
  };
  const [x1, y1] = point(8);
  const [x2, y2] = point(22);
  const ticks = Array.from({ length: 8 }, (_, i) => {
    const a = ((i * 3) / 24) * 2 * Math.PI - Math.PI / 2;
    return <line key={i} x1={c + 40 * Math.cos(a)} y1={c + 40 * Math.sin(a)} x2={c + 34 * Math.cos(a)} y2={c + 34 * Math.sin(a)} stroke="var(--muted)" strokeWidth="2" />;
  });

  return (
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="10" />
      <path d={`M${x1} ${y1} A${r} ${r} 0 1 1 ${x2} ${y2}`} fill="none" stroke="var(--green)" strokeWidth="10" strokeLinecap="round" pathLength={1} strokeDasharray="1" className="dialarc" />
      {ticks}
      {hour !== null && (
        <g className="hand" style={{ transform: `rotate(${(hour / 24) * 360}deg)` }}>
          <line x1="60" y1="60" x2="60" y2="26" stroke="var(--blue)" strokeWidth="4" strokeLinecap="round" />
        </g>
      )}
      <circle cx="60" cy="60" r="5" fill="var(--blue)" />
    </svg>
  );
}
