import {
  ArrowRight,
  Check,
  Container,
  GitBranch,
  LockKeyhole,
  Network,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { Cta } from "@/components/marketing/cta";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const steps = [
  [
    "01",
    "Connect your source",
    "Point DaStack at a containerized workload and keep your existing Docker workflow.",
  ],
  [
    "02",
    "Set the runtime",
    "Define environment and runtime configuration in one focused control plane.",
  ],
  [
    "03",
    "Ship with confidence",
    "Deploy, inspect status, and manage the service lifecycle from the same workspace.",
  ],
] as const;

export default function Home() {
  return (
    <>
      <section className="relative overflow-hidden border-b">
        <div className="page-grid absolute inset-0" aria-hidden="true" />
        <div
          className="absolute left-1/2 top-12 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-primary/10 blur-[110px]"
          aria-hidden="true"
        />
        <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-20 sm:px-6 sm:pb-24 sm:pt-28 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <Badge className="mb-6">
              <span className="size-1.5 rounded-full bg-primary" /> Phase 1
              control plane
            </Badge>
            <h1 className="text-balance text-5xl font-semibold tracking-[-0.055em] sm:text-6xl lg:text-7xl">
              Your Docker cloud.
              <br />
              <span className="text-muted-foreground">
                Minus the platform tax.
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-balance text-base leading-7 text-muted-foreground sm:text-lg">
              DaStack gives teams a direct path from container to managed
              service, with a control plane that stays out of the way.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/register">
                  Create an account{" "}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="secondary" size="lg">
                <Link href="/docs">Read the docs</Link>
              </Button>
            </div>
          </div>
          <div className="terminal-shadow relative mx-auto mt-16 max-w-4xl overflow-hidden rounded-xl border border-border-strong bg-[#080b0c] text-[#dce8e3]">
            <div className="flex h-11 items-center justify-between border-b border-white/10 px-4">
              <div className="flex gap-1.5" aria-hidden="true">
                <span className="size-2.5 rounded-full bg-white/20" />
                <span className="size-2.5 rounded-full bg-white/20" />
                <span className="size-2.5 rounded-full bg-white/20" />
              </div>
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
                control plane boundaries
              </span>
              <ShieldCheck
                className="size-3.5 text-white/30"
                aria-hidden="true"
              />
            </div>
            <div className="grid min-h-64 md:grid-cols-[1.2fr_0.8fr]">
              <div className="border-b border-white/10 p-5 font-mono text-xs leading-7 md:border-b-0 md:border-r">
                <p className="text-white/35">platform_contract:</p>
                <p className="mt-2">
                  <span className="text-emerald-400">identity</span>
                  server-authorized tenants
                </p>
                <p>
                  <span className="text-emerald-400">runtime</span> isolated
                  worker boundary
                </p>
                <p>
                  <span className="text-emerald-400">network</span> private
                  service plane
                </p>
                <p className="mt-3 text-white/50">
                  Desired state remains separate from Docker.
                </p>
              </div>
              <div className="p-5">
                <div className="mb-5 flex items-center justify-between">
                  <span className="text-xs font-medium">System topology</span>
                  <Badge>architecture</Badge>
                </div>
                <div className="space-y-3 font-mono text-[11px] text-white/55">
                  <div className="flex items-center gap-3 rounded-md border border-white/10 bg-white/[0.03] p-3">
                    <GitBranch className="size-4 text-emerald-400" /> control
                    plane
                  </div>
                  <div className="ml-4 h-4 border-l border-dashed border-white/20" />
                  <div className="flex items-center gap-3 rounded-md border border-emerald-400/20 bg-emerald-400/[0.05] p-3">
                    <Container className="size-4 text-emerald-400" /> worker
                    agent
                  </div>
                  <div className="ml-4 h-4 border-l border-dashed border-white/20" />
                  <div className="flex items-center gap-3 rounded-md border border-white/10 bg-white/[0.03] p-3">
                    <Network className="size-4 text-emerald-400" /> Docker
                    Engine
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="mb-10 max-w-xl">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">
            A shorter path to production
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em]">
            The workflow stays recognizable.
          </h2>
        </div>
        <div className="grid border-l border-t sm:grid-cols-3">
          {steps.map(([number, title, description]) => (
            <div key={number} className="border-b border-r p-6 sm:p-7">
              <span className="font-mono text-xs text-primary">{number}</span>
              <h3 className="mt-8 text-base font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            </div>
          ))}
        </div>
      </section>
      <section className="border-y bg-panel">
        <div className="mx-auto grid max-w-7xl gap-px bg-border md:grid-cols-3">
          {[
            [
              Container,
              "Container-native",
              "Your Docker image remains the unit of delivery.",
            ],
            [
              LockKeyhole,
              "Secure by default",
              "Clear boundaries for organization and service configuration.",
            ],
            [
              Check,
              "Operationally focused",
              "Only the controls needed to ship and understand workloads.",
            ],
          ].map(([Icon, title, text]) => {
            const ItemIcon = Icon as typeof Container;
            return (
              <div className="bg-panel p-7 sm:p-9" key={title as string}>
                <ItemIcon className="size-5 text-primary" aria-hidden="true" />
                <h3 className="mt-5 text-sm font-semibold">
                  {title as string}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {text as string}
                </p>
              </div>
            );
          })}
        </div>
      </section>
      <Cta />
    </>
  );
}
