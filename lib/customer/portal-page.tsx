import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { SiteShell } from "@/components/v5/chrome";
import { PortalShell } from "@/components/portal/shell";
import { portalViews, type PortalLinks, type PortalSection } from "@/components/portal/views";
import { customerSession, customerSessionCookie } from "@/lib/customer/security";
import { loadPortal } from "@/lib/customer/portal";

export const customerLinks: PortalLinks = {
  preview: false,
  href: (section, query) => `${section === "dashboard" ? "/customer" : `/customer/${section}`}${query ? `?${query}` : ""}`,
};

/** One portal page for the logged-in customer (sends them to login or the new-password page first when needed). */
export async function CustomerPortalPage({ section, query }: { section: PortalSection; query: Record<string, string | undefined> }) {
  const { env } = await getCloudflareContext();
  const account = await customerSession(env.ADMIN_DB, (await cookies()).get(customerSessionCookie)?.value);
  if (!account) redirect("/customer/login");
  if (account.password_state === "temporary") redirect("/customer/change-password");
  const data = await loadPortal(env.ADMIN_DB, account.customer_id);
  if (!data) redirect("/customer/login");
  const View = portalViews[section];
  return (
    <SiteShell>
      <PortalShell data={data} links={customerLinks} active={section}>
        <View data={data} links={customerLinks} query={query} />
      </PortalShell>
    </SiteShell>
  );
}

/** Only short plain query values reach the views. */
export function cleanQuery(raw: Record<string, string | string[] | undefined>) {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(raw)) {
    const v = Array.isArray(value) ? value[0] : value;
    if (typeof v === "string" && /^[a-z_]{1,12}$/.test(key)) out[key] = v.slice(0, 300);
  }
  return out;
}
