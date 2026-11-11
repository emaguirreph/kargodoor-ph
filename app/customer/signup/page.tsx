import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/v5/chrome";
import { SignupForm } from "@/components/portal/signup-form";

export const metadata: Metadata = {
  title: "Sign up | MY KargoDoorPH",
  description: "Open your KargoDoorPH customer account for China to Philippines shipping.",
  robots: { index: false, follow: true },
};

export default function CustomerSignupPage() {
  return (
    <SiteShell>
      <div className="plogin psignup">
        <div className="lpanel">
          <span className="peyebrow" style={{ color: "#8fd36a" }}>MY KargoDoorPH · Sign up</span>
          <h1>Open your <em>KargoDoor account.</em></h1>
          <p>Fill in your details once. Confirm your email with the code we send, and you can sign in right away.</p>
          <ol className="perks">
            <li><i aria-hidden="true">1</i>Fill in this form and make your password</li>
            <li><i aria-hidden="true">2</i>Type the 6-digit code we email you</li>
            <li><i aria-hidden="true">3</i>Your account is ready (if we need to check anything, we&apos;ll message you)</li>
            <li><i aria-hidden="true">4</i>Sign in to see your China warehouse address and shipments</li>
          </ol>
          <div className="route" aria-hidden="true"><span>CHINA</span><span className="line" /><span>PHILIPPINES</span></div>
        </div>
        <div className="lform">
          <Link href="/customer/login" className="plink">← Already have an account? Sign in</Link>
          <h2>Create your account</h2>
          <SignupForm />
        </div>
      </div>
    </SiteShell>
  );
}
