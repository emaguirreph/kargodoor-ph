import Link from "next/link";
import { Footer, Header } from "@/components/site-chrome";

export default async function CustomerLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <div className="kd-site-shell"><Header /><main className="kd-customer-page"><section className="kd-customer-card"><h1>MY KargoDoorPH</h1><p>Sign in to access your KargoDoor account.</p>{error === "1" && <p className="kd-customer-error" role="alert">Invalid email or password.</p>}<form action="/api/customer/login" method="post"><label>Email<input type="email" name="email" autoComplete="email" required maxLength={320} /></label><label>Password<input type="password" name="password" autoComplete="current-password" required maxLength={1024} /></label><button type="submit">LOGIN</button></form><Link href="/contact-us">CONTACT KARGODOOR</Link></section></main><Footer /></div>;
}
