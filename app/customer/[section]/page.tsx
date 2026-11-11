import { notFound, redirect } from "next/navigation";
import { isPortalSection } from "@/components/portal/views";
import { CustomerPortalPage, cleanQuery } from "@/lib/customer/portal-page";

export const dynamic = "force-dynamic";

export default async function CustomerSectionPage({ params, searchParams }: {
  params: Promise<{ section: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { section } = await params;
  // Track Shipment was removed from the portal (My Shipments shows the status); old links land there.
  if (section === "track") redirect("/customer/shipments");
  if (!isPortalSection(section) || section === "dashboard") notFound();
  return <CustomerPortalPage section={section} query={cleanQuery(await searchParams)} />;
}
