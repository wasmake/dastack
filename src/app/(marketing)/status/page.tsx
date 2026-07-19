import type { Metadata } from "next";
import { LiveStatus } from "@/components/marketing/live-status";
import { PageHeader } from "@/components/marketing/page-header";

export const metadata: Metadata = {
  title: "Status",
  description: "Current DaStack API health.",
};

export default function StatusPage() {
  return (
    <>
      <PageHeader
        eyebrow="System status"
        title="Current service health, directly from the source."
        description="This page reports the live DaStack health endpoint. It does not estimate or invent historical uptime."
      />
      <section className="px-4 py-16 sm:px-6 sm:py-20">
        <LiveStatus />
      </section>
    </>
  );
}
