import type { Metadata } from "next";
import {
  Boxes,
  GitPullRequestArrow,
  KeyRound,
  Layers3,
  Network,
  ScrollText,
} from "lucide-react";
import { Cta } from "@/components/marketing/cta";
import { PageHeader } from "@/components/marketing/page-header";

export const metadata: Metadata = {
  title: "Features",
  description: "A focused control plane for containerized services.",
};

const features = [
  [
    Boxes,
    "Container-first delivery",
    "Bring a Docker workload and keep the artifact you already know. DaStack organizes delivery around services rather than infrastructure primitives.",
  ],
  [
    GitPullRequestArrow,
    "Repeatable deployments",
    "Keep build and runtime configuration close to the service, so releases follow a consistent path from source to runtime.",
  ],
  [
    KeyRound,
    "Scoped configuration",
    "Manage environment configuration at the appropriate workspace and service boundary without putting secrets into source control.",
  ],
  [
    Network,
    "Service networking",
    "Connect workloads around clear service identities and intentional ingress configuration.",
  ],
  [
    ScrollText,
    "Operational context",
    "Read deployment and service state from a dense interface designed for diagnosis, not decorative dashboards.",
  ],
  [
    Layers3,
    "Organization workspaces",
    "Separate teams and workloads into organizations with a foundation for clear access boundaries.",
  ],
] as const;

export default function FeaturesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Product"
        title="The useful layer between Docker and production."
        description="DaStack brings delivery, runtime configuration, and operational context into one focused workflow."
      />
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="grid border-l border-t md:grid-cols-2 lg:grid-cols-3">
          {features.map(([Icon, title, description], index) => (
            <article key={title} className="group border-b border-r p-6 sm:p-8">
              <div className="flex items-start justify-between">
                <span className="grid size-10 place-items-center rounded-lg border bg-muted/40 text-primary">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  0{index + 1}
                </span>
              </div>
              <h2 className="mt-8 text-base font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            </article>
          ))}
        </div>
      </section>
      <Cta />
    </>
  );
}
