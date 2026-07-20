import type { Metadata } from "next";
import { ResourceLimitsView } from "@/components/resources/resource-limits-view";

export const metadata: Metadata = {
  title: "Resource Limits",
  robots: { index: false, follow: false },
};

export default function ResourceLimitsPage() {
  return <ResourceLimitsView />;
}
