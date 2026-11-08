import Link from "next/link";
import { SiteShell } from "@/components/v5/chrome";
import { PasswordField } from "@/components/v5/password-field";
import { MessengerLink } from "@/components/messenger-link";

export default async function CustomerLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <SiteShell>
      <div className="plogin">
        <div className="lpanel">
          <span className="peyebrow" style={{ color: "#8fd36a" }}>MY KargoDoorPH · Customer Portal</span>
          <h1>Your China cargo, <em>all in one page.</em></h1>
          <p>See where your boxes are, how much you owe, and where to send your supplier. Sea and air freight from China to the Philippines.</p>
          <ul className="perks">
            <li><i aria-hidden="true">📍</i>Live status for every shipment</li>
            <li><i aria-hidden="true">₱</i>Pay by UnionBank or GCash, upload your proof</li>
            <li><i aria-hidden="true">📄</i>Download your bill and receipt anytime</li>
            <li><i aria-hidden="true">🏭</i>China warehouse address with your code, ready to copy</li>
          </ul>
          <div className="route" aria-hidden="true"><span>CHINA</span><span className="line" /><span>PHILIPPINES</span></div>
        </div>
        <div className="lform">
          <Link href="/" className="plink">← Back to KargoDoorPH</Link>
          <img src="/assets/kargodoor-logo-tagline-approved.webp" alt="KargoDoor PH" width="520" height="192" />
          <h2>Sign in to your account</h2>
          <p className="pmuted">Use the email or mobile number you gave KargoDoor.</p>
          {error === "1" && <p className="err" role="alert">Invalid email, mobile number, or password.</p>}
          {error === "pending" && <p className="pnote" role="status">⏳ Your sign-up is still waiting for approval. We&apos;ll message you your KDOOR cargo code once it&apos;s approved, then you can sign in.</p>}
          {error === "declined" && <p className="err" role="alert">We could not approve your sign-up. Please message us on Messenger so we can help.</p>}
          <form action="/api/customer/login" method="post">
            <div className="field">
              <label htmlFor="login-identifier">Email or mobile number</label>
              <input id="login-identifier" type="text" name="identifier" autoComplete="username" inputMode="email" required maxLength={320} />
            </div>
            <PasswordField label="Password" id="login-password" name="password" autoComplete="current-password" required maxLength={1024} />
            <button className="pbtn pbtn-blue" type="submit">SIGN IN</button>
          </form>
          <MessengerLink className="plink" target="_blank" rel="noopener noreferrer">Forgot password? Message us on Messenger</MessengerLink>
          <p className="newbox">Wala pang account? <Link href="/customer/signup">Sign up here</Link>. We check every sign-up and message you your KDOOR cargo code once it&apos;s approved. Or <Link href="/chat">book your first shipment</Link> in the chat.</p>
        </div>
      </div>
    </SiteShell>
  );
}
