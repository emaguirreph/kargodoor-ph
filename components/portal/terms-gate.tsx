"use client";

import { useState } from "react";

/**
 * Pop-up shipping terms on Book a Shipment (Em, 2026-11-16). It opens when the
 * page loads (also before the page's script runs); I AGREE ticks the form's required "terms" box, I DON'T AGREE goes
 * back to the dashboard. The server refuses a booking without the box ticked.
 */
export function TermsGate({ terms, version, backHref, disabled = false }: { terms: readonly string[]; version: string; backHref: string; disabled?: boolean }) {
  const [open, setOpen] = useState(!disabled);
  const [agreed, setAgreed] = useState(false);
  return (
    <>
      <label className="pterms-check">
        <input type="checkbox" name="terms" value={version} required checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span>I have read and agree to the <button type="button" className="plink" onClick={() => setOpen(true)}>Shipping Terms</button>, including that refused packages are my responsibility.</span>
      </label>
      {open ? (
        <div className="pterms-back" role="dialog" aria-modal="true" aria-labelledby="pterms-title">
          <div className="pterms">
            <h2 id="pterms-title">⚠️ Shipping Terms</h2>
            <p className="pmuted">Please read before you book. Packages may NOT be accepted by the warehouse.</p>
            <ol>{terms.map((t) => <li key={t}>{t}</li>)}</ol>
            <div className="pbtns">
              <button type="button" className="pbtn pbtn-green" onClick={() => { setAgreed(true); setOpen(false); }}>I AGREE</button>
              <a className="pbtn pbtn-line" href={backHref}>I DON&apos;T AGREE</a>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/**
 * One-time Shipping Terms pop-up on the dashboard (Em, 2026-11-16): shows until
 * the account agrees to the current version. I AGREE posts the agreement (works
 * without JavaScript); I DON'T AGREE closes it and leaves a reminder on the page.
 */
export function TermsPopup({ terms, version }: { terms: readonly string[]; version: string }) {
  const [open, setOpen] = useState(true);
  return open ? (
    <div className="pterms-back" role="dialog" aria-modal="true" aria-labelledby="pterms-dash-title">
      <form className="pterms" method="post" action="/customer/actions/terms">
        <h2 id="pterms-dash-title">⚠️ Shipping Terms</h2>
        <p className="pmuted">Please read and agree before you ship with KargoDoor. Packages may NOT be accepted by the warehouse.</p>
        <ol>{terms.map((t) => <li key={t}>{t}</li>)}</ol>
        <input type="hidden" name="terms" value={version} />
        <div className="pbtns">
          <button type="submit" className="pbtn pbtn-green">I AGREE</button>
          <button type="button" className="pbtn pbtn-line" onClick={() => setOpen(false)}>I DON&apos;T AGREE</button>
        </div>
      </form>
    </div>
  ) : (
    <div className="pnotice err" role="alert">
      You haven&apos;t agreed to the Shipping Terms yet. We can only ship packages for customers who agree.{" "}
      <button type="button" className="plink" onClick={() => setOpen(true)}>Read the Shipping Terms</button>
    </div>
  );
}
