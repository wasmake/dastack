import type { Metadata } from "next";
import {
  ArrowRight,
  BookOpen,
  Container,
  KeyRound,
  Waypoints,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/marketing/page-header";

export const metadata: Metadata = {
  title: "Documentation",
  description: "Get oriented with the DaStack workflow.",
};

const sections = [
  {
    id: "organizations",
    icon: Waypoints,
    title: "1. Create an organization",
    copy: "Organizations are the workspace boundary for services, configuration, and team access. After account verification, onboarding checks for an existing organization before asking you to create one.",
  },
  {
    id: "containers",
    icon: Container,
    title: "2. Prepare the workload",
    copy: "Package your application as a Docker workload. Keep build inputs reproducible and avoid baking runtime secrets into the image.",
  },
  {
    id: "configuration",
    icon: KeyRound,
    title: "3. Define runtime configuration",
    copy: "Treat runtime values separately from the image. Scope sensitive configuration to the organization and service that needs it.",
  },
] as const;

export default function DocsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Documentation"
        title="Start with the operating model."
        description="A concise guide to the DaStack workspace and container delivery workflow."
      />
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-[220px_minmax(0,1fr)] lg:px-8">
        <aside className="md:sticky md:top-24 md:self-start">
          <p className="mb-2 px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            On this page
          </p>
          <nav aria-label="Documentation sections">
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="flex min-h-10 items-center rounded-md px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {section.title.slice(3)}
              </a>
            ))}
          </nav>
        </aside>
        <article className="min-w-0 max-w-3xl">
          <div className="mb-10 flex items-center gap-3 border-b pb-6">
            <span className="grid size-10 place-items-center rounded-lg border bg-muted/40">
              <BookOpen className="size-4 text-primary" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Guide</p>
              <h2 className="font-semibold">From account to first workload</h2>
            </div>
          </div>
          <div className="space-y-14">
            {sections.map((section) => (
              <section
                id={section.id}
                key={section.id}
                className="scroll-mt-24"
              >
                <section.icon
                  className="size-5 text-primary"
                  aria-hidden="true"
                />
                <h2 className="mt-4 text-xl font-semibold">{section.title}</h2>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  {section.copy}
                </p>
              </section>
            ))}
          </div>
          <div className="mt-14 border-t pt-8">
            <Link
              href="/register"
              className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary hover:text-accent"
            >
              Create your workspace <ArrowRight className="size-4" />
            </Link>
          </div>
        </article>
      </div>
    </>
  );
}
