"use client";

import { MAP_CHINA, MAP_H, MAP_OTHER, MAP_PH, MAP_POINTS, MAP_TAIWAN, MAP_W } from "@/components/v5/map-data";
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

const warehouses = ["Guangzhou", "Yiwu", "Shishi", "Fujian Air", "Hong Kong", "Taiwan"] as const;

/** Real map of southeast China, Taiwan and the Philippines, with a route from each China warehouse to the Philippines. */
export function WarehouseMap() {
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (!auto || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setActive((i) => (i + 1) % warehouses.length), 3200);
    return () => window.clearInterval(timer);
  }, [auto]);

  const [x, y] = MAP_POINTS[warehouses[active]];
  const [mx, my] = MAP_POINTS.Malabon;
  const route = `M${x} ${y} Q ${mx - 70} ${(y + my) / 2 + 40} ${mx} ${my}`;

  return (
    <div className="wh">
      <div className="map rv">
        <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} role="img" aria-label="Map of KargoDoor warehouses in Guangzhou, Yiwu, Shishi, Fujian Air, Hong Kong, and Taiwan, shipping to the Philippines">
          <rect width={MAP_W} height={MAP_H} rx="18" className="sea" />
          <path d={MAP_OTHER} className="land other" />
          <path d={MAP_CHINA} className="land cn" />
          <path d={MAP_TAIWAN} className="land cn" />
          <path d={MAP_PH} className="land ph" />
          <text x="70" y="120" className="country">CHINA</text>
          <text x="432" y="292" textAnchor="end" className="country ph">PHILIPPINES</text>
          <path className="mapline" d={route} stroke="var(--green)" strokeWidth="3" fill="none" />
          <circle r="6" fill="var(--brand)" key={active}>
            <animateMotion dur="2.6s" repeatCount="indefinite" path={route} />
          </circle>
          {warehouses.map((name, i) => {
            const [px, py] = MAP_POINTS[name];
            return (
              <g key={name} className={i === active ? "pin on" : "pin"}>
                <circle cx={px} cy={py} r="8" fill="var(--green)" className="pulse-ring" />
                <circle cx={px} cy={py} r="6.5" fill="var(--green)" stroke="#fff" strokeWidth="2" />
              </g>
            );
          })}
          <text x={x - 12} y={y - 12} textAnchor="end" className="pinlabel">{warehouses[active]}</text>
          <circle cx={mx} cy={my} r="9" fill="var(--brand)" stroke="#fff" strokeWidth="2" />
          <circle cx={mx} cy={my} r="9" fill="var(--brand)" className="pulse-ring" />
        </svg>
      </div>
      <div className="whlist rv">
        {warehouses.map((name, i) => (
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

/**
 * Sets --p (0 to 1) on its element as the page scrolls, for scroll-linked progress lines.
 * "page": progress over the first screen of scrolling. "view": progress of the element through the viewport.
 */
export function ScrollFill({ className, mode, children }: { className: string; mode: "page" | "view"; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const vh = window.innerHeight;
      let p: number;
      if (mode === "page") {
        p = window.scrollY / (vh * 0.55);
      } else {
        const rect = el.getBoundingClientRect();
        p = (vh * 0.6 - rect.top) / rect.height;
      }
      p = Math.min(1, Math.max(0, p));
      el.style.setProperty("--p", p.toFixed(3));
      el.dataset.step = String(p >= 0.98 ? 3 : p >= 0.48 ? 2 : 1);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [mode]);

  return <div ref={ref} className={className}>{children}</div>;
}
