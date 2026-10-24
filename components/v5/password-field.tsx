"use client";

import { useState, type InputHTMLAttributes } from "react";

/** Password input with a show/hide button. */
export function PasswordField({ label, id, ...input }: { label: string; id: string } & InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="field pw">
      <label htmlFor={id}>{label}</label>
      <input id={id} type={visible ? "text" : "password"} {...input} />
      <button type="button" className="eye" aria-label={visible ? "Hide password" : "Show password"} onClick={() => setVisible((v) => !v)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
      </button>
    </div>
  );
}
