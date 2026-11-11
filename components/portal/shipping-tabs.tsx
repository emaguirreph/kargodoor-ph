"use client";

import { useState, type ReactNode } from "react";
import { CopyButton } from "./copy-button";

export type ShippingTabWarehouse = {
  name: string;
  mode: "Sea" | "Air";
  /** Supplier message (same text as the admin Supplier Message) for this warehouse. */
  supplierMessage: string;
};

/** Below the cargo code: Supplier Instructions (per China warehouse), Packaging Instructions and, optionally, the courier waybill example. */
export function ShippingTabs({ warehouses, packaging, waybill }: { warehouses: ShippingTabWarehouse[]; packaging: ReactNode; waybill?: ReactNode }) {
  const tabs: Array<[string, string]> = [["supplier", "Supplier Instructions"], ["packaging", "Packaging Instructions"]];
  if (waybill) tabs.push(["waybill", "Courier Waybill Example"]);
  const [tab, setTab] = useState("supplier");
  const [picked, setPicked] = useState(warehouses[0]?.name ?? "");
  const current = warehouses.find((w) => w.name === picked) ?? warehouses[0];
  return (
    <div className="ptabs">
      <div className="ptabbar" role="tablist" aria-label="Shipping instructions">
        {tabs.map(([key, label]) => (
          <button key={key} type="button" role="tab" id={`ptab-${key}`} aria-selected={tab === key} aria-controls="ptab-panel" onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      <div className="ptabpanel" role="tabpanel" id="ptab-panel" aria-labelledby={`ptab-${tab}`}>
        {tab === "supplier" && current ? (
          <>
            <p className="pmuted">Pick your China warehouse, then copy this and send it to your supplier. Change the item line to what you are buying.</p>
            <div className="ppicks" role="group" aria-label="China warehouse">
              {warehouses.map((w) => (
                <button key={w.name} type="button" className={`ppick${w.name === current.name ? " on" : ""}`} aria-pressed={w.name === current.name} onClick={() => setPicked(w.name)}>
                  <span className={`pmode ${w.mode.toLowerCase()}`}>{w.mode === "Air" ? "✈️ AIR" : "🚢 SEA"}</span>
                  <span className="wn">{w.name}</span>
                </button>
              ))}
            </div>
            <pre className="ppre">{current.supplierMessage}</pre>
            <div className="pbtns"><CopyButton text={current.supplierMessage} label="COPY SUPPLIER INSTRUCTIONS" className="pbtn pbtn-blue" /></div>
          </>
        ) : null}
        {tab === "packaging" ? packaging : null}
        {tab === "waybill" ? waybill : null}
      </div>
    </div>
  );
}
