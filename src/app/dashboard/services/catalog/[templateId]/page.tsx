import type { Metadata } from "next";
import { TemplateWizardView } from "@/components/services/catalog/template-wizard-view";

export const metadata: Metadata = {
  title: "Configure Service",
  robots: { index: false, follow: false },
};

export default async function TemplatePage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;
  return <TemplateWizardView templateId={templateId} />;
}
