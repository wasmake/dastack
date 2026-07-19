import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";

export const metadata: Metadata = { title: "Terms of Service" };

const sections = [
  {
    title: "Using DaStack",
    paragraphs: [
      "You must provide accurate account information, keep access credentials secure, and use the service only in compliance with applicable law. You are responsible for activity performed through your account and organizations.",
    ],
  },
  {
    title: "Your workloads",
    paragraphs: [
      "You retain responsibility for the applications, container images, configuration, and data you submit to the service. You must have the rights required to deploy and operate that content.",
    ],
  },
  {
    title: "Acceptable use",
    paragraphs: [
      "Do not use DaStack to compromise systems, distribute malicious software, interfere with other customers, evade service limits, or operate content that violates applicable law.",
    ],
  },
  {
    title: "Service changes",
    paragraphs: [
      "The service may evolve as features and infrastructure change. Material terms for a paid plan are presented before purchase or activation.",
    ],
  },
  {
    title: "Account termination",
    paragraphs: [
      "You may stop using DaStack at any time. Access may be limited or terminated when necessary to protect the service, comply with law, or address a material violation of these terms.",
    ],
  },
  {
    title: "Disclaimers",
    paragraphs: [
      "To the extent permitted by law, the service is provided without implied warranties. Liability limitations and any service commitments applicable to a paid plan will be stated in the commercial terms presented for that plan.",
    ],
  },
] as const;

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      description="Last updated July 19, 2026. These terms govern access to and use of DaStack."
      sections={[...sections]}
    />
  );
}
