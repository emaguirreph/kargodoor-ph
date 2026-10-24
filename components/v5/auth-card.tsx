import type { CSSProperties, ReactNode } from "react";

const lockIcon = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;
const keyIcon = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M17 6l3 3M15 8l2 2" /></svg>;

/** Navy backdrop with a centered white card, used by the customer login and password pages. */
export function AuthCard({ children, icon = "lock" }: { children: ReactNode; icon?: "lock" | "key" }) {
  return (
    <div className="auth">
      <div className="grid-bg" />
      <div className="blob b1" /><div className="blob b2" />
      <span className="fbox" style={{ "--s": "40px", left: "10%", top: "24%", "--d": "8s" } as CSSProperties} />
      <span className="fbox" style={{ "--s": "54px", right: "10%", top: "56%", "--d": "11s", "--rot": "-8deg" } as CSSProperties} />
      <section className="acard">
        <span className="lock" aria-hidden="true">{icon === "lock" ? lockIcon : keyIcon}</span>
        {children}
      </section>
    </div>
  );
}
