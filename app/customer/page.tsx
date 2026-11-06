import { CustomerPortalPage, cleanQuery } from "@/lib/customer/portal-page";

export const dynamic = "force-dynamic";

export default async function CustomerDashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <CustomerPortalPage section="dashboard" query={cleanQuery(await searchParams)} />;
}
