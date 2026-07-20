import type { Metadata } from "next";
import { CatalogView } from "@/components/services/catalog/catalog-view";

export const metadata: Metadata = {
  title: "Service Catalog",
  robots: { index: false, follow: false },
};

export default function ServiceCatalogPage() {
  return <CatalogView />;
}
