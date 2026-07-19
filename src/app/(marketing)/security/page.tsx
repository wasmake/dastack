import type { Metadata } from "next";
import {
  Eye,
  Fingerprint,
  KeySquare,
  LockKeyhole,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { PageHeader } from "@/components/marketing/page-header";

export const metadata: Metadata = {
  title: "Security",
  description: "The security principles behind DaStack.",
};

const principles = [
  [
    LockKeyhole,
    "Secure defaults",
    "Product flows should make the safe path the direct path, especially around credentials, access, and public exposure.",
  ],
  [
    KeySquare,
    "Secret boundaries",
    "Sensitive runtime configuration belongs outside source control and inside explicit organization and service scopes.",
  ],
  [
    UsersRound,
    "Workspace isolation",
    "Organizations provide the primary boundary for team access and workload ownership.",
  ],
  [
    Fingerprint,
    "Strong authentication",
    "Password and provider-based authentication support established account security workflows.",
  ],
  [
    Eye,
    "Minimal disclosure",
    "Authentication errors use generic language to avoid revealing whether an account exists.",
  ],
  [
    ShieldCheck,
    "Defense in depth",
    "Application controls are designed as layers rather than relying on a single security mechanism.",
  ],
] as const;

export default function SecurityPage() {
  return (
    <>
      <PageHeader
        eyebrow="Security"
        title="Trust starts with clear boundaries."
        description="DaStack is designed around secure defaults, intentional access, and minimal exposure of sensitive information."
      />
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="grid gap-x-10 gap-y-12 md:grid-cols-2 lg:grid-cols-3">
          {principles.map(([Icon, title, description]) => (
            <article key={title}>
              <Icon className="size-5 text-primary" aria-hidden="true" />
              <h2 className="mt-4 text-sm font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            </article>
          ))}
        </div>
        <div className="mt-16 rounded-xl border bg-panel p-6 sm:p-8">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-primary">
            Responsible disclosure
          </p>
          <h2 className="mt-3 text-xl font-semibold">
            Found a potential security issue?
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Please use the verified support channel associated with your DaStack
            account and avoid including secrets or customer data in an initial
            report.
          </p>
        </div>
      </section>
    </>
  );
}
