import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";

export const metadata: Metadata = { title: "Privacy Policy" };

const sections = [
  {
    title: "Information we process",
    paragraphs: [
      "DaStack processes account details you provide, organization and service configuration, authentication records, and technical data needed to operate and secure the service.",
    ],
  },
  {
    title: "How information is used",
    paragraphs: [
      "Information is used to provide the product, authenticate users, maintain security, support customers, process billing when selected, and meet legal obligations.",
    ],
  },
  {
    title: "Service providers",
    paragraphs: [
      "Specialized providers may process limited information on DaStack's behalf for functions such as authentication, infrastructure, email delivery, and payment processing. Stripe payment setup occurs only during the relevant onboarding flow.",
    ],
  },
  {
    title: "Retention and deletion",
    paragraphs: [
      "Information is retained for as long as needed to provide the service, meet legitimate operational and security needs, and comply with legal obligations. Retention may vary by data type and account status.",
    ],
  },
  {
    title: "Security",
    paragraphs: [
      "DaStack applies technical and organizational safeguards appropriate to the information processed. No online service can guarantee absolute security, and customers remain responsible for protecting their credentials and workload configuration.",
    ],
  },
  {
    title: "Your choices",
    paragraphs: [
      "You may review and update account information through available product controls. Additional privacy rights may apply depending on your location.",
    ],
  },
] as const;

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      description="Last updated July 19, 2026. This policy explains how DaStack handles information associated with the service."
      sections={[...sections]}
    />
  );
}
