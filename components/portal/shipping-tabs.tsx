"use client";

import { useState } from "react";
import { CopyButton } from "./copy-button";

export type ShippingTabWarehouse = {
  name: string;
  mode: "Sea" | "Air";
  /** Box label for this warehouse, e.g. SEA KDOOR-1234 or TD KDOOR-1234. */
  label: string;
  address: string;
  /** Supplier message (same text as the admin Supplier Message) for this warehouse. */
  supplierMessage: string;
};

const tabs = [
  ["supplier", "Supplier Instructions"],
  ["warehouse", "Warehouse Addresses"],
  ["waybill", "Courier Waybill Example"],
] as const;
type Tab = (typeof tabs)[number][0];

/** Below the cargo code: supplier message, China warehouse addresses and the courier details example, each with Copy. */
export function ShippingTabs({ warehouses, waybill, warehousesHref, showWaybill = true }: { warehouses: ShippingTabWarehouse[]; waybill: string; warehousesHref: string; showWaybill?: boolean }) {
  const [tab, setTab] = useState<Tab>("supplier");
  const [picked, setPicked] = useState(warehouses[0]?.name ?? "");
  const current = warehouses.find((w) => w.name === picked) ?? warehouses[0];
  const picker = (
    <div className="ppills" role="group" aria-label="China warehouse">
      <span className="pk">China warehouse:</span>
      {warehouses.map((w) => (
        <button key={w.name} type="button" className={`ppick${w.name === current?.name ? " on" : ""}`} aria-pressed={w.name === current?.name} onClick={() => setPicked(w.name)}>
          {w.name} <small>{w.mode}</small>
        </button>
      ))}
    </div>
  );
  return (
    <div className="ptabs">
      <div className="ptabbar" role="tablist" aria-label="Shipping steps">
        {tabs.filter(([key]) => showWaybill || key !== "waybill").map(([key, label]) => (
          <button key={key} type="button" role="tab" id={`ptab-${key}`} aria-selected={tab === key} aria-controls="ptab-panel" onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      <div className="ptabpanel" role="tabpanel" id="ptab-panel" aria-labelledby={`ptab-${tab}`}>
        {tab === "supplier" && current ? (
          <>
            <p className="pmuted">Copy this and send it to your supplier. Pick the China warehouse first. Change the item line to what you are buying.</p>
            {picker}
            <pre className="ppre">{current.supplierMessage}</pre>
            <div className="pbtns"><CopyButton text={current.supplierMessage} label="COPY SUPPLIER INSTRUCTIONS" className="pbtn pbtn-blue" /></div>
          </>
        ) : null}
        {tab === "warehouse" && current ? (
          <>
            <p className="pmuted">Your code is already in the address. Sea goes to Guangzhou, Yiwu, Shishi or Hong Kong. Air goes to Tongda Air Cargo.</p>
            {picker}
            <div><span className="pk">Box label</span><div className="plabel">{current.label}</div></div>
            <pre className="ppre">{current.address}</pre>
            <div className="pbtns">
              <CopyButton text={current.address} label="COPY ADDRESS" className="pbtn pbtn-blue" />
              <a className="pbtn pbtn-line" href={warehousesHref}>ALL WAREHOUSES →</a>
            </div>
          </>
        ) : null}
        {tab === "waybill" ? (
          <>
            <p className="pmuted">Once your supplier ships, send us their courier details like this example so we can watch for your boxes.</p>
            <pre className="ppre">{waybill}</pre>
            <div className="pbtns"><CopyButton text={waybill} label="COPY EXAMPLE" className="pbtn pbtn-blue" /></div>
          </>
        ) : null}
      </div>
    </div>
  );
}
