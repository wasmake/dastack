"use client";

import { useQueries } from "@tanstack/react-query";
import { CalendarClock, Gauge } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { EnvironmentBadge } from "@/components/environments/environment-badge";
import { QuotaBar } from "@/components/resources/quota-bar";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import {
  useEntitlements,
  useProjects,
  useSelectedOrganization,
} from "@/hooks/use-phase-two";
import type { Environment } from "@/hooks/use-phase-two";
import { apiRequest } from "@/lib/api-client";

function title(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (character) => character.toUpperCase());
}

function unit(key: string): string | undefined {
  if (key === "cpuMillicores") return "m";
  if (key === "memoryMiB") return "MiB";
  if (["storageGiB", "transferGiB"].includes(key)) return "GiB";
  return undefined;
}

function date(value: string | null): string {
  if (!value) return "No end date";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

export function ResourceLimitsView() {
  const { organization, organizations } = useSelectedOrganization();
  const permitted = Boolean(
    organization?.role?.permissions.includes("billing:read"),
  );
  const canViewProjects = Boolean(
    organization?.role?.permissions.includes("project:view"),
  );
  const entitlements = useEntitlements(organization?.id, permitted);
  const projects = useProjects(organization?.id, canViewProjects);
  const environmentQueries = useQueries({
    queries: (projects.data ?? []).map((project) => ({
      queryKey: ["environments", organization?.id, project.id],
      queryFn: () =>
        apiRequest<Environment[]>(
          `/api/organizations/${encodeURIComponent(organization!.id)}/projects/${encodeURIComponent(project.id)}/environments`,
        ),
      enabled: Boolean(organization),
      staleTime: 30_000,
    })),
  });

  if (organizations.isPending)
    return <LoadingState label="Loading workspace" />;
  if (organizations.isError)
    return (
      <ErrorState
        message="The organization list is unavailable."
        retry={() => organizations.refetch()}
      />
    );
  if (organization && !permitted)
    return (
      <ErrorState message="Your organization role cannot view resource entitlements." />
    );
  if (!organization)
    return (
      <EmptyState
        title="No organization selected"
        description="Resource entitlements belong to an organization."
      />
    );

  const environmentUsageUnavailable = environmentQueries.some(
    (query) => query.isError,
  );
  const environmentCount = environmentQueries.reduce(
    (total, query) => total + (query.data?.length ?? 0),
    0,
  );
  const rows = Object.entries(entitlements.data?.limits ?? {}).flatMap(
    ([key, limit]) => {
      if (key === "projects")
        return !canViewProjects || projects.isError
          ? []
          : [{ key, limit, used: projects.data?.length ?? 0 }];
      if (key === "environments")
        return !canViewProjects ||
          projects.isError ||
          environmentUsageUnavailable
          ? []
          : [{ key, limit, used: environmentCount }];
      return [
        {
          key,
          limit,
          used:
            (entitlements.data?.reserved[key] ?? 0) +
            (entitlements.data?.allocated[key] ?? 0),
        },
      ];
    },
  );

  return (
    <div>
      <PageHeader
        eyebrow="Governance"
        title="Resource limits"
        description={`Entitlements and current reserved plus allocated counters reported for ${organization.name}.`}
      />
      {(entitlements.isPending ||
        (canViewProjects && projects.isPending) ||
        environmentQueries.some((query) => query.isPending)) && (
        <LoadingState label="Loading resource limits" />
      )}
      {entitlements.isError && (
        <ErrorState
          message="Entitlement counters are unavailable. DaStack will not estimate limits from local defaults."
          retry={() => entitlements.refetch()}
        />
      )}
      {!entitlements.isPending &&
        !entitlements.isError &&
        rows.length === 0 && (
          <EmptyState
            title="No quota counters reported"
            description="The entitlement service returned no numeric limits. Ask the operator to assign organization entitlements."
          />
        )}
      {entitlements.data && rows.length > 0 && (
        <div className="space-y-4">
          {(projects.isError || environmentUsageUnavailable) && (
            <Alert tone="danger">
              Project or environment counts are unavailable, so those quota rows
              are omitted rather than estimated.
            </Alert>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-[11px] text-muted-foreground">
                  Entitlement status
                </p>
                <div className="mt-2">
                  <EnvironmentBadge value={entitlements.data.status} />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-[11px] text-muted-foreground">
                  Billing status
                </p>
                <div className="mt-2">
                  <EnvironmentBadge value={entitlements.data.billingStatus} />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-start gap-3 p-4">
                <CalendarClock className="mt-0.5 size-4 text-primary" />
                <div>
                  <p className="text-[11px] text-muted-foreground">
                    Valid until
                  </p>
                  <p className="mt-1 text-sm font-medium">
                    {date(entitlements.data.validUntil)}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader className="flex flex-row items-center gap-3">
              <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                <Gauge className="size-4" />
              </span>
              <div>
                <h2 className="text-sm font-semibold">Organization quota</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Reserved and allocated resources compared with API-provided
                  limits.
                </p>
              </div>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2">
              {rows.map((row) => (
                <QuotaBar
                  key={row.key}
                  label={title(row.key)}
                  used={row.used}
                  limit={row.limit}
                  unit={unit(row.key)}
                />
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
