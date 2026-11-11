"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { PasswordField } from "@/components/v5/password-field";
import { MessengerLink } from "@/components/messenger-link";


/** Sign-up form: sends to /api/customer/signup and keeps what was typed if something needs fixing. */
export function SignupForm() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState<{ id: string; email: string } | null>(null);
  const [verified, setVerified] = useState(false);
  const [approved, setApproved] = useState(false);
  const [info, setInfo] = useState("");

  async function codeAction(action: "verify" | "resend", code = "") {
    if (!pending) return;
    setBusy(true); setError(""); setInfo("");
    try {
      const body = new FormData();
      body.set("id", pending.id); body.set("action", action); body.set("code", code);
      const response = await fetch("/api/customer/signup/verify", { method: "POST", body });
      const result = (await response.json().catch(() => ({}))) as { error?: string; approved?: boolean };
      if (!response.ok) setError(result.error ?? "Please try again.");
      else if (action === "resend") setInfo("New code sent. Check your inbox (and Spam).");
      else { setVerified(true); setApproved(Boolean(result.approved)); setPending(null); setSent(true); }
    } catch {
      setError("No internet connection? Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get("password") !== form.get("confirm_password")) { setError("The two passwords do not match."); return; }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/customer/signup", { method: "POST", body: form });
      const body = (await response.json().catch(() => ({}))) as { error?: string; id?: string; codeSent?: boolean; email?: string };
      if (!response.ok) setError(body.error ?? "We could not send your sign-up. Please try again.");
      else {
        if (body.codeSent && body.id) setPending({ id: body.id, email: body.email ?? "" });
        else setSent(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch {
      setError("No internet connection? Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (pending) return (
    <form className="signup-code" onSubmit={(event) => { event.preventDefault(); codeAction("verify", String(new FormData(event.currentTarget).get("code") ?? "")); }}>
      <p className="big">📧 Check your email</p>
      <p>We sent a 6-digit code to <strong>{pending.email}</strong>. Type it below to confirm your email. Check Spam if you don&apos;t see it.</p>
      <div className="field"><label htmlFor="su-code">6-digit code</label><input id="su-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus placeholder="123456" /></div>
      {error && <p className="err" role="alert">{error}</p>}
      {info && <p className="pnote" role="status">{info}</p>}
      <button className="pbtn pbtn-blue" type="submit" disabled={busy}>{busy ? "CHECKING…" : "CONFIRM EMAIL"}</button>
      <button className="plink" type="button" disabled={busy} onClick={() => codeAction("resend")} style={{ background: "none", border: 0, padding: 0, cursor: "pointer", marginTop: 12 }}>Send a new code</button>
    </form>
  );

  if (sent && approved) return (
    <div className="signup-done" role="status">
      <p className="big">🎉 Your account is ready!</p>
      <p>📧 Your email is confirmed and your KargoDoor account is approved.</p>
      <p>Sign in with your email or mobile number and the password you just made. Inside, you&apos;ll find your China warehouse address and everything you need to start shipping.</p>
      <p><Link href="/customer/login" className="pbtn pbtn-blue">SIGN IN NOW</Link></p>
      <p className="pmuted">Questions? <MessengerLink target="_blank" rel="noopener noreferrer">Message us on Messenger</MessengerLink>.</p>
    </div>
  );

  if (sent) return (
    <div className="signup-done" role="status">
      <p className="big">✅ Salamat! We got your sign-up.</p>
      {verified && <p>📧 Your email is confirmed.</p>}
      <p>We&apos;ll check your details and message you once it&apos;s approved, usually within the day.</p>
      <p>After that, sign in with your email or mobile number and the password you just made.</p>
      <p><Link href="/customer/login" className="pbtn pbtn-blue">GO TO SIGN IN</Link></p>
      <p className="pmuted">Need it faster? <MessengerLink target="_blank" rel="noopener noreferrer">Message us on Messenger</MessengerLink>.</p>
    </div>
  );

  return (
    <form onSubmit={submit} noValidate={false}>
      <div className="field"><label htmlFor="su-name">Full name *</label><input id="su-name" name="full_name" autoComplete="name" required minLength={2} maxLength={160} /></div>
      <div className="field"><label htmlFor="su-company">Shop or business name <span className="opt">(optional)</span></label><input id="su-company" name="company_name" autoComplete="organization" maxLength={160} /></div>
      <div className="two">
        <div className="field"><label htmlFor="su-mobile">Mobile number *</label><input id="su-mobile" name="mobile" type="tel" inputMode="tel" autoComplete="tel" placeholder="09XX XXX XXXX" required maxLength={20} /></div>
        <div className="field"><label htmlFor="su-email">Email *</label><input id="su-email" name="email" type="email" autoComplete="email" required maxLength={254} /></div>
      </div>
      <div className="two">
        <PasswordField label="Make a password *" id="su-password" name="password" autoComplete="new-password" required minLength={8} maxLength={1024} />
        <PasswordField label="Type it again *" id="su-confirm" name="confirm_password" autoComplete="new-password" required minLength={8} maxLength={1024} />
      </div>
      <p className="pmuted" style={{ margin: 0 }}>At least 8 characters. You&apos;ll use this to sign in once we approve your account.</p>
      <input className="hp" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <label className="agree"><input type="checkbox" name="consent" value="1" required /> I agree that KargoDoor PH may contact me by Messenger, SMS, call or email about my account and shipments.</label>
      {error && <p className="err" role="alert">{error}</p>}
      <button className="pbtn pbtn-blue" type="submit" disabled={busy}>{busy ? "SENDING…" : "SIGN UP"}</button>
    </form>
  );
}
