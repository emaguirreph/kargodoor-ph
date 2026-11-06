import { headers } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { SiteShell } from "@/components/v5/chrome";
import { PortalShell } from "@/components/portal/shell";
import { isPortalSection, portalViews, type PortalLinks } from "@/components/portal/views";
import { Notice } from "@/components/portal/views";
import { loadPortal } from "@/lib/customer/portal";
import { cleanQuery } from "@/lib/customer/portal-page";
import { AdminError, authenticate, type AdminEnv } from "@/lib/admin/security";

export const dynamic = "force-dynamic";

/** Admin view of exactly what one customer sees in the portal. Forms are switched off. */
export default async function CustomerPreview({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = cleanQuery(await searchParams);
  const customerId = query.customer_id ?? "";
  if (!/^[\da-f-]{36}$/i.test(customerId)) throw new AdminError("Choose a valid customer to preview.");
  const { env: rawEnv } = await getCloudflareContext();
  const env = rawEnv as unknown as AdminEnv;
  await authenticate(new Request(`${env.ADMIN_ORIGIN}/admin/customer-preview`, { headers: await headers() }), env);
  const data = await loadPortal(env.ADMIN_DB, customerId);
  if (!data) throw new AdminError("Customer not found.", 404);
  const section = query.page && isPortalSection(query.page) ? query.page : "dashboard";
  const links: PortalLinks = {
    preview: true,
    href: (target, extra) => `/admin/customer-preview?${new URLSearchParams({ customer_id: customerId, page: target })}${extra ? `&${extra}` : ""}`,
  };
  const View = portalViews[section];
  return (
    <SiteShell>
      <PortalShell data={data} links={links} active={section} banner={
        <Notice kind="err"><strong>Admin preview only.</strong> This is exactly what {data.customer.full_name} sees. Buttons and forms are switched off. <a className="plink" href={`/admin/customers?id=${encodeURIComponent(customerId)}`}>← Back to customer</a></Notice>
      }>
        <View data={data} links={links} query={query} />
      </PortalShell>
    </SiteShell>
  );
}
