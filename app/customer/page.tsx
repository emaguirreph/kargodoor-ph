import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { Footer, Header } from "@/components/site-chrome";
import { MessengerLink } from "@/components/messenger-link";
import { customerSession, customerSessionCookie } from "@/lib/customer/security";

export const dynamic = "force-dynamic";

export default async function CustomerPage() {
  const { env } = await getCloudflareContext();
  const token = (await cookies()).get(customerSessionCookie)?.value;
  const customer = await customerSession(env.ADMIN_DB, token);
  if (!customer) redirect("/customer/login");
  return <div className="kd-site-shell"><Header /><main className="kd-customer-page"><section className="kd-customer-card"><h1>MY KARGODOOR</h1><h2>Welcome, {customer.full_name}</h2><p>Customer dashboard coming soon.</p><div className="kd-customer-actions"><MessengerLink target="_blank" rel="noopener noreferrer">CONTACT KARGODOOR</MessengerLink><form action="/customer/logout" method="post"><button type="submit">LOG OUT</button></form></div></section></main><Footer /></div>;
}
