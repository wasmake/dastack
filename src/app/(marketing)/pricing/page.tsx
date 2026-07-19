import type { Metadata } from "next";
import { Check } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/marketing/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Pricing",
  description: "DaStack plans for teams operating Docker workloads.",
};

const plans = [
  {
    name: "Starter",
    eyebrow: "For an initial workload",
    description:
      "Start an organization and establish your deployment workflow.",
    features: [
      "Organization workspace",
      "Container deployment workflow",
      "Service configuration",
      "Community support",
    ],
  },
  {
    name: "Team",
    eyebrow: "For production teams",
    description: "Operate multiple services with a shared team workflow.",
    features: [
      "Everything in Starter",
      "Multiple services",
      "Team access controls",
      "Standard support",
    ],
  },
  {
    name: "Enterprise",
    eyebrow: "For custom requirements",
    description:
      "Plan controls and support around your operational requirements.",
    features: [
      "Everything in Team",
      "Custom access requirements",
      "Support planning",
      "Commercial terms",
    ],
  },
] as const;

export default function PricingPage() {
  return (
    <>
      <PageHeader
        eyebrow="Pricing"
        title="Start small. Add capacity when the work demands it."
        description="Choose a plan around your operating model. Usage and billing details are confirmed before any paid commitment."
      />
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <Alert className="mx-auto mb-8 max-w-3xl">
          Stripe billing setup happens securely during onboarding when a paid
          plan is selected. Payment details are never collected on this page.
        </Alert>
        <div className="grid gap-4 lg:grid-cols-3">
          {plans.map((plan, index) => (
            <article
              key={plan.name}
              className={`flex flex-col rounded-xl border bg-surface p-6 sm:p-7 ${index === 1 ? "border-primary/50 shadow-[0_0_0_1px_color-mix(in_srgb,var(--primary)_18%,transparent)]" : ""}`}
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">
                {plan.eyebrow}
              </p>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight">
                {plan.name}
              </h2>
              <p className="mt-3 min-h-12 text-sm leading-6 text-muted-foreground">
                {plan.description}
              </p>
              <p className="mt-8 border-y py-5 text-sm font-medium">
                Pricing confirmed in onboarding
              </p>
              <ul className="my-6 flex-1 space-y-3 text-sm text-muted-foreground">
                {plan.features.map((feature) => (
                  <li className="flex gap-2.5" key={feature}>
                    <Check
                      className="mt-0.5 size-4 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    {feature}
                  </li>
                ))}
              </ul>
              <Button asChild variant={index === 1 ? "primary" : "secondary"}>
                <Link href="/register">Start onboarding</Link>
              </Button>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
