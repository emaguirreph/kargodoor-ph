import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { SiteShell } from "@/components/v5/chrome";
import { AuthCard } from "@/components/v5/auth-card";
import { PasswordField } from "@/components/v5/password-field";
import { customerSession, customerSessionCookie } from "@/lib/customer/security";

export const dynamic = "force-dynamic";

export default async function ChangePassword({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { env } = await getCloudflareContext();
  const account = await customerSession(env.ADMIN_DB, (await cookies()).get(customerSessionCookie)?.value);
  if (!account) redirect("/customer/login");
  const temporary = account.password_state === "temporary";
  const { error } = await searchParams;
  return (
    <SiteShell>
      <AuthCard icon="key">
        {!temporary && <a className="back" href="/customer">← Back to my shipments</a>}
        <h1>MY KargoDoorPH</h1>
        <h2>{temporary ? "Create Your New Password" : "Change Password"}</h2>
        <p>{temporary ? "Set a password that only you know." : "Enter your current password, then choose a new one."}</p>
        {error === "1" && <p className="err" role="alert">Please check your current password and make sure the new passwords match.</p>}
        <form action="/customer/change-password/save" method="post">
          {!temporary && <PasswordField label="Current Password" id="current-password" name="current_password" autoComplete="current-password" required maxLength={1024} />}
          <PasswordField label="New Password" id="new-password" name="password" autoComplete="new-password" minLength={8} required maxLength={1024} />
          <PasswordField label="Confirm New Password" id="confirm-password" name="confirm_password" autoComplete="new-password" minLength={8} required maxLength={1024} />
          <button className="btn btn-blue" type="submit">{temporary ? "SET NEW PASSWORD" : "CHANGE PASSWORD"}</button>
        </form>
      </AuthCard>
    </SiteShell>
  );
}
