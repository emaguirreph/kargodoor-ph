"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

/* Sea Freight package tiers. Box sizes are drawn to scale: side = cube root of CBM. */
export const tiers = [
  { id: "mini", name: "KD Mini", from: "", price: "₱250", unit: "", range: "Up to 0.01 CBM · Fixed", cbm: 0.01 },
  { id: "lite", name: "KD Lite", from: "", price: "₱750", unit: "", range: "Above 0.01 to 0.05 CBM · Fixed", cbm: 0.05 },
  { id: "plus", name: "KD Plus", from: "", price: "₱1,400", unit: "", range: "Above 0.05 to 0.125 CBM · Fixed", cbm: 0.125 },
  { id: "std", name: "KD Standard", from: "Starts at", price: "₱7,999", unit: "/CBM", range: "Above 0.125 CBM · minimum charge: ₱1,700", cbm: 1 },
  { id: "max", name: "KD Max", from: "Starts at", price: "₱19", unit: "/kg", range: "High-density cargo", cbm: null },
] as const;

export type TierId = (typeof tiers)[number]["id"];

const side = (cbm: number) => Math.cbrt(cbm);

export const sizeText = (cbm: number) => {
  if (cbm >= 1) return "1 m × 1 m × 1 m";
  const cm = Math.round(side(cbm) * 1000) / 10;
  return `≈ ${cm} × ${cm} × ${cm} cm`;
};

type Point = [number, number, number];

function iso(points: Point[], unit: number, cx: number, cy: number) {
  return points
    .map(([x, y, z]) => `${(cx + (x - y) * unit * 0.866).toFixed(1)},${(cy + (x + y) * unit * 0.5 - z * unit).toFixed(1)}`)
    .join(" ");
}

function boxFaces(s: number, unit: number, cx: number, cy: number) {
  const top: Point[] = [[0, 0, s], [s, 0, s], [s, s, s], [0, s, s]];
  const right: Point[] = [[s, 0, 0], [s, s, 0], [s, s, s], [s, 0, s]];
  const left: Point[] = [[0, s, 0], [s, s, 0], [s, s, s], [0, s, s]];
  const tape: Point[] = [[s * 0.44, 0, s], [s * 0.56, 0, s], [s * 0.56, s, s], [s * 0.44, s, s]];
  const tapeSide: Point[] = [[s, s * 0.44, s], [s, s * 0.56, s], [s, s * 0.56, s * 0.6], [s, s * 0.44, s * 0.6]];
  return `<polygon points="${iso(left, unit, cx, cy)}" fill="#b77b38"/><polygon points="${iso(right, unit, cx, cy)}" fill="#d39a55"/><polygon points="${iso(top, unit, cx, cy)}" fill="#ebbb7d"/><polygon points="${iso(tape, unit, cx, cy)}" fill="#55a430"/><polygon points="${iso(tapeSide, unit, cx, cy)}" fill="#55a430" opacity=".9"/>`;
}

function tierArt(cbm: number | null) {
  if (cbm === null) {
    return `<svg viewBox="0 0 120 120" width="96" aria-hidden="true"><g fill="var(--blue)"><circle cx="60" cy="30" r="12" fill="none" stroke="var(--blue)" stroke-width="6"/><path d="M34 46h52l14 60H20z"/></g><text x="60" y="92" text-anchor="middle" font-family="Poppins,sans-serif" font-weight="900" font-size="22" fill="#fff">kg</text></svg>`;
  }
  const width = Math.max(30, side(cbm) * 120);
  return `<svg viewBox="-50 -58 100 116" width="${width.toFixed(0)}" aria-hidden="true">${boxFaces(1, 54, 0, 0)}</svg>`;
}

function TierContent({ tier }: { tier: (typeof tiers)[number] }) {
  return (
    <>
      <span className="vis" dangerouslySetInnerHTML={{ __html: tierArt(tier.cbm) }} />
      <span className="nm">{tier.name}</span>
      {tier.from && <span className="from">{tier.from}</span>}
      <span className="pr">{tier.price}{tier.unit && <small>{tier.unit}</small>}</span>
      <span className="cb">{tier.range}</span>
      {tier.cbm !== null && <span className="dm">{sizeText(tier.cbm)}</span>}
    </>
  );
}

/** Tier cards. On the home page each card links to the size guide; on the rates page it selects the size. */
export function TierGrid({ selected, onPick }: { selected?: string; onPick?: (id: TierId) => void }) {
  return (
    <div className="tiers rv-g">
      {tiers.map((tier) =>
        onPick ? (
          <button type="button" key={tier.id} className={`tier${selected === tier.id ? " on" : ""}`} onClick={() => onPick(tier.id)}>
            <TierContent tier={tier} />
          </button>
        ) : (
          <Link key={tier.id} className="tier" href={`/rates-calculator?size=${tier.id}#guide`}>
            <TierContent tier={tier} />
          </Link>
        ),
      )}
    </div>
  );
}

const UNIT = 170;
const CX = 200;
const CY = 210;

function frame(front: boolean) {
  const edge = (a: Point, b: Point) => `<polyline points="${iso([a, b], UNIT, CX, CY)}" />`;
  if (front) {
    return `<g stroke="var(--blue)" stroke-width="2.5" fill="none" stroke-linecap="round">${edge([1, 0, 0], [1, 1, 0])}${edge([0, 1, 0], [1, 1, 0])}${edge([1, 1, 0], [1, 1, 1])}${edge([1, 0, 0], [1, 0, 1])}${edge([0, 1, 0], [0, 1, 1])}${edge([1, 0, 1], [1, 1, 1])}${edge([0, 1, 1], [1, 1, 1])}${edge([0, 0, 1], [1, 0, 1])}${edge([0, 0, 1], [0, 1, 1])}</g>`;
  }
  return `<polygon points="${iso([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], UNIT, CX, CY)}" fill="color-mix(in srgb,var(--blue) 8%,transparent)"/><g stroke="var(--blue)" stroke-width="2" stroke-dasharray="5 6" fill="none" opacity=".55">${edge([0, 0, 0], [1, 0, 0])}${edge([0, 0, 0], [0, 1, 0])}${edge([0, 0, 0], [0, 0, 1])}</g>`;
}

const cubeMarkup = (s: number) =>
  frame(false) + boxFaces(s, UNIT, CX, CY) + frame(true) +
  `<text x="${CX + UNIT * 0.95}" y="${CY + UNIT * 0.25}" font-family="Plus Jakarta Sans,sans-serif" font-weight="800" font-size="15" fill="var(--blue)">1 m</text>`;

/** A package drawn to scale inside a 1 CBM wireframe; the box grows or shrinks when the selection changes. */
export function SizeCube({ cbm }: { cbm: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const current = useRef(side(0.01));

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const target = side(Math.min(Math.max(cbm, 0.000001), 1));
    const from = current.current;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduce ? 1 : 700;
    const start = performance.now();
    let frameId = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = p < 1 ? 1 + 2.2 * Math.pow(p - 1, 3) + 1.2 * Math.pow(p - 1, 2) : 1;
      current.current = from + (target - from) * eased;
      svg.innerHTML = cubeMarkup(Math.max(0.01, current.current));
      if (p < 1) frameId = requestAnimationFrame(step);
    };
    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [cbm]);

  return <svg ref={ref} viewBox="0 0 400 400" role="img" aria-label="Package size compared with 1 CBM" dangerouslySetInnerHTML={{ __html: cubeMarkup(side(0.01)) }} />;
}
