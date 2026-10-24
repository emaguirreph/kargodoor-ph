import Link from "next/link";
import { SiteShell } from "@/components/v5/chrome";
import { AuthCard } from "@/components/v5/auth-card";
import { PasswordField } from "@/components/v5/password-field";

export default async function CustomerLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <SiteShell>
      <AuthCard>
        <Link className="back" href="/">← Back to KargoDoorPH</Link>
        <span className="alogo"><img src="/assets/kargodoor-logo-tagline-approved.png" alt="KargoDoor PH" /></span>
        <h1>MY KargoDoorPH</h1>
        <p>Sign in to access your KargoDoor account.</p>
        {error === "1" && <p className="err" role="alert">Invalid email, mobile number, or password.</p>}
        <form action="/api/customer/login" method="post">
          <div className="field">
            <label htmlFor="login-identifier">Email or mobile number</label>
            <input id="login-identifier" type="text" name="identifier" autoComplete="username" inputMode="email" required maxLength={320} />
          </div>
          <PasswordField label="Password" id="login-password" name="password" autoComplete="current-password" required maxLength={1024} />
          <button className="btn btn-blue" type="submit">LOGIN</button>
        </form>
        <Link className="alt" href="/contact-us">CONTACT KARGODOOR</Link>
      </AuthCard>
    </SiteShell>
  );
}
