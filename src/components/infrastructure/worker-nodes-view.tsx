"use client";

import { Activity, Cpu, MapPin, Server } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { EnvironmentBadge } from "@/components/environments/environment-badge";
import { ResourceUsageMeter } from "@/components/resources/quota-bar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import type { ResourceValues, Worker } from "@/hooks/use-phase-two";
import { useSelectedOrganization, useWorkers } from "@/hooks/use-phase-two";

function label(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/^./, (character) => character.toUpperCase());
}

function numeric(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

function capacity(worker: Worker): ResourceValues {
  return worker.resources?.capacity ?? worker.capacity ?? {};
}

function allocated(worker: Worker): ResourceValues {
  const current = worker.resources?.allocated ?? worker.allocated ?? {};
  const reserved = worker.reserved ?? {};
  return Object.fromEntries(
    Array.from(
      new Set([...Object.keys(current), ...Object.keys(reserved)]),
      (key) => [key, Number(current[key] ?? 0) + Number(reserved[key] ?? 0)],
    ),
  );
}

function heartbeat(value?: string | null): string {
  if (!value) return "Not reported";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function Allocation({ worker }: { worker: Worker }) {
  const maximum = capacity(worker);
  const usage = allocated(worker);
  const keys = Object.keys(maximum);
  if (keys.length === 0)
    return (
      <p className="text-xs text-muted-foreground">
        Capacity has not been reported by this worker.
      </p>
    );

  return (
    <div className="space-y-4">
      {keys.map((key) => {
        const limit = numeric(maximum[key]);
        const used = numeric(usage[key]);
        if (limit !== undefined && used !== undefined)
          return (
            <ResourceUsageMeter
              key={key}
              label={label(key)}
              used={used}
              limit={limit}
            />
          );
        return (
          <div
            key={key}
            className="flex items-baseline justify-between gap-3 text-xs"
          >
            <span className="text-muted-foreground">{label(key)}</span>
            <span className="break-all text-right font-mono">
              {String(maximum[key] ?? "Not reported")}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function WorkerNodesView() {
  const { organization, organizations } = useSelectedOrganization();
  const permitted = Boolean(
    organization?.role?.permissions.includes("environment:manage"),
  );
  const workers = useWorkers(organization?.id, permitted);

  if (organizations.isError)
    return (
      <ErrorState
        message="The organization list is unavailable."
        retry={() => organizations.refetch()}
      />
    );
  if (organization && !permitted)
    return (
      <ErrorState message="Your organization role cannot view worker infrastructure." />
    );

  return (
    <div>
      <PageHeader
        eyebrow="Infrastructure"
        title="Worker Nodes"
        description="Enrolled compute nodes and their most recently reported capacity and allocation."
      />
      {(organizations.isPending || (organization && workers.isPending)) && (
        <LoadingState label="Loading worker nodes" />
      )}
      {!organizations.isPending && !organization && (
        <EmptyState
          title="No organization selected"
          description="Create or select an organization before viewing worker capacity."
        />
      )}
      {organization && workers.isError && (
        <ErrorState
          message="Worker node data is unavailable. No capacity estimates are shown."
          retry={() => workers.refetch()}
        />
      )}
      {organization && workers.data?.length === 0 && (
        <EmptyState
          title="No workers enrolled"
          description="Enroll a worker through the operator workflow before creating regional environments."
        />
      )}
      {organization && workers.data && workers.data.length > 0 && (
        <div className="grid gap-4 xl:grid-cols-2">
          {workers.data.map((worker) => (
            <Card key={worker.id} className="min-w-0">
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Server className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold">
                      {worker.name ||
                        worker.hostname ||
                        worker.providerNodeId ||
                        worker.id}
                    </h2>
                    <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                      {worker.id}
                    </p>
                  </div>
                </div>
                <EnvironmentBadge value={worker.status} />
              </CardHeader>
              <CardContent>
                <dl className="mb-5 grid gap-3 border-b pb-5 sm:grid-cols-2">
                  <div className="flex items-start gap-2">
                    <MapPin
                      className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <div>
                      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Region
                      </dt>
                      <dd className="mt-0.5 text-xs">{worker.region}</dd>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Activity
                      className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <div>
                      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Last heartbeat
                      </dt>
                      <dd className="mt-0.5 text-xs">
                        {heartbeat(worker.lastHeartbeatAt)}
                      </dd>
                    </div>
                  </div>
                </dl>
                <div className="mb-4 flex items-center justify-between gap-2 text-xs font-semibold">
                  <span className="inline-flex items-center gap-2">
                    <Cpu className="size-3.5 text-primary" /> Reserved +
                    allocated
                  </span>
                  {worker.schedulable !== undefined && (
                    <span className="font-normal text-muted-foreground">
                      {worker.schedulable ? "Schedulable" : "Not schedulable"}
                    </span>
                  )}
                </div>
                <Allocation worker={worker} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
