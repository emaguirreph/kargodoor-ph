import Link from "next/link";
import { SiteShell } from "@/components/v5/chrome";
import { PasswordField } from "@/components/v5/password-field";
import { MessengerLink } from "@/components/messenger-link";

type LoginParams = { error?: string; mode?: string; step?: string; email?: string; notice?: string };

const codeErrors: Record<string, string> = {
  wrong: "That code is not right. Please check your email and try again.",
  expired: "That code has expired. Tap “Send a new code”.",
  locked: "Too many wrong tries. Tap “Send a new code”.",
  send: "We could not send the code right now. Please try again or sign in with your password.",
  email: "Please enter a valid email.",
  "1": "Something went wrong. Please try again.",
};

function CodeSignIn({ step, email, error, notice }: LoginParams) {
  const safeEmail = String(email ?? "").slice(0, 320);
  return (
    <>
      <h2>Sign in with an email code</h2>
      {step === "code" ? (
        <>
          <p className="pmuted">If <strong>{safeEmail}</strong> has a KargoDoor account, we sent a 6-digit code to it. Check your inbox (and Spam).</p>
          {notice === "wait" && <p className="pnote" role="status">A code was just sent. Please wait a minute before asking for another.</p>}
          {error && codeErrors[error] && <p className="err" role="alert">{codeErrors[error]}</p>}
          <form action="/api/customer/login-code" method="post">
            <input type="hidden" name="action" value="verify" />
            <input type="hidden" name="email" value={safeEmail} />
            <div className="field">
              <label htmlFor="login-code">6-digit code</label>
              <input id="login-code" type="text" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus placeholder="123456" />
            </div>
            <button className="pbtn pbtn-blue" type="submit">SIGN IN</button>
          </form>
          <form action="/api/customer/login-code" method="post">
            <input type="hidden" name="email" value={safeEmail} />
            <button className="plink" type="submit" style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }}>Send a new code</button>
          </form>
        </>
      ) : (
        <>
          <p className="pmuted">Enter the email you gave KargoDoor. We&apos;ll send you a one-time code, no password needed.</p>
          {error && codeErrors[error] && <p className="err" role="alert">{codeErrors[error]}</p>}
          <form action="/api/customer/login-code" method="post">
            <div className="field">
              <label htmlFor="login-email">Email</label>
              <input id="login-email" type="email" name="email" autoComplete="email" required maxLength={320} defaultValue={safeEmail} />
            </div>
            <button className="pbtn pbtn-blue" type="submit">EMAIL ME A CODE</button>
          </form>
        </>
      )}
      <Link href="/customer/login" className="plink">Sign in with password instead</Link>
    </>
  );
}

export default async function CustomerLoginPage({ searchParams }: { searchParams: Promise<LoginParams> }) {
  const params = await searchParams;
  const { error } = params;
  const codeMode = params.mode === "code";
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
          {codeMode ? <CodeSignIn {...params} /> : (<>
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
            <Link href="/customer/login?mode=code" className="plink">Sign in with an email code instead</Link>
          </>)}
          <MessengerLink className="plink" target="_blank" rel="noopener noreferrer">Forgot password? Message us on Messenger</MessengerLink>
          <p className="newbox">Wala pang account? <Link href="/customer/signup">Sign up here</Link>. We check every sign-up and message you your KDOOR cargo code once it&apos;s approved. Or <Link href="/chat">book your first shipment</Link> in the chat.</p>
        </div>
      </div>
    </SiteShell>
  );
}
