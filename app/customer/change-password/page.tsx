import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { Footer, Header } from "@/components/site-chrome";
import { customerSession, customerSessionCookie } from "@/lib/customer/security";

export const dynamic = "force-dynamic";

export default async function ChangePassword({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { env } = await getCloudflareContext();
  const account = await customerSession(env.ADMIN_DB, (await cookies()).get(customerSessionCookie)?.value);
  if (!account) redirect("/customer/login");
  const temporary = account.password_state === "temporary";
  const { error } = await searchParams;
  return <div className="kd-site-shell"><Header/><main className="kd-customer-page"><section className="kd-customer-card"><h1>MY KargoDoorPH</h1><h2>{temporary ? "Create Your New Password" : "Change Password"}</h2><p>{temporary ? "Set a password that only you know." : "Enter your current password, then choose a new one."}</p>{error === "1" && <p className="kd-customer-error" role="alert">Please check your current password and make sure the new passwords match.</p>}<form action="/customer/change-password/save" method="post">{!temporary && <label>Current Password<input name="current_password" type="password" autoComplete="current-password" required maxLength={1024}/></label>}<label>New Password<input name="password" type="password" autoComplete="new-password" minLength={8} required maxLength={1024}/></label><label>Confirm New Password<input name="confirm_password" type="password" autoComplete="new-password" minLength={8} required maxLength={1024}/></label><button type="submit">{temporary ? "SET NEW PASSWORD" : "CHANGE PASSWORD"}</button></form></section></main><Footer/></div>;
}
