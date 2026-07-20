"use client";

import { useQueries } from "@tanstack/react-query";
import {
  ArrowRight,
  Boxes,
  Gauge,
  Library,
  Network,
  Server,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Skeleton } from "@/components/ui/skeleton";
import type { Environment } from "@/hooks/use-phase-two";
import {
  useEntitlements,
  useProjects,
  useSelectedOrganization,
  useServiceTemplates,
  useWorkers,
} from "@/hooks/use-phase-two";
import { apiRequest } from "@/lib/api-client";

function metricValue(pending: boolean, error: boolean, value: string | number) {
  if (pending) return <Skeleton className="h-7 w-14" />;
  if (error)
    return <span className="text-sm text-muted-foreground">Unavailable</span>;
  return (
    <span className="text-2xl font-semibold tabular-nums tracking-[-0.04em]">
      {value}
    </span>
  );
}

function MetricCard({
  label,
  description,
  value,
  href,
  icon: Icon,
}: {
  label: string;
  description: string;
  value: React.ReactNode;
  href: string;
  icon: typeof Boxes;
}) {
  return (
    <Card className="min-w-0">
      <CardContent className="flex h-full flex-col gap-5 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4" />
          </span>
          <Link
            href={href}
            aria-label={`Open ${label}`}
            className="grid size-10 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowRight className="size-4" />
          </Link>
        </div>
        <div>
          <div className="min-h-8">{value}</div>
          <h2 className="mt-2 text-sm font-semibold">{label}</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {description}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function environmentList(
  payload: Environment[] | { environments?: Environment[] },
): Environment[] {
  return Array.isArray(payload) ? payload : (payload.environments ?? []);
}

function entitlementCount(value?: { limits: Record<string, number> }): number {
  return Object.keys(value?.limits ?? {}).length;
}

export function DashboardView() {
  const { organization, organizations } = useSelectedOrganization();
  const canViewWorkers = Boolean(
    organization?.role?.permissions.includes("environment:manage"),
  );
  const canViewEntitlements = Boolean(
    organization?.role?.permissions.includes("billing:read"),
  );
  const canViewProjects = Boolean(
    organization?.role?.permissions.includes("project:view"),
  );
  const projects = useProjects(organization?.id, canViewProjects);
  const workers = useWorkers(organization?.id, canViewWorkers);
  const templates = useServiceTemplates();
  const entitlements = useEntitlements(organization?.id, canViewEntitlements);
  const environmentQueries = useQueries({
    queries: (projects.data ?? []).map((project) => ({
      queryKey: ["environments", organization?.id, project.id],
      queryFn: async () =>
        environmentList(
          await apiRequest<Environment[] | { environments?: Environment[] }>(
            `/api/organizations/${encodeURIComponent(organization!.id)}/projects/${encodeURIComponent(project.id)}/environments`,
          ),
        ),
      enabled: Boolean(organization),
      staleTime: 30_000,
    })),
  });

  if (organizations.isPending)
    return (
      <div aria-label="Loading dashboard" role="status">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="mt-2 h-4 w-80 max-w-full" />
        <Skeleton className="mt-8 h-64 w-full" />
      </div>
    );
  if (organizations.isError)
    return (
      <ErrorState
        message="DaStack could not load your organizations. Check your connection and try again."
        retry={() => organizations.refetch()}
      />
    );
  if (!organization)
    return (
      <>
        <PageHeader eyebrow="Workspace" title="Overview" />
        <EmptyState
          title="Create your first organization"
          description="An organization is the workspace boundary for services, configuration, and team access."
          action={
            <Button asChild>
              <Link href="/onboarding">
                Create organization <ArrowRight className="size-4" />
              </Link>
            </Button>
          }
        />
      </>
    );

  const environmentsPending =
    projects.isPending || environmentQueries.some((query) => query.isPending);
  const environmentsError =
    projects.isError || environmentQueries.some((query) => query.isError);
  const environmentCount = environmentQueries.reduce(
    (total, query) => total + (query.data?.length ?? 0),
    0,
  );
  const onlineWorkers =
    workers.data?.filter((worker) =>
      ["online", "ready", "active"].includes(worker.status.toLowerCase()),
    ).length ?? 0;
  const publishedTemplates =
    templates.data?.filter(
      (template) => template.publicationState === "published",
    ).length ?? 0;

  return (
    <div>
      <PageHeader
        eyebrow="Organization overview"
        title={organization.name}
        description="Live organization, environment, infrastructure, catalog, and entitlement state."
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {canViewProjects && (
          <>
            <MetricCard
              label="Projects"
              description="Organization workspaces"
              value={metricValue(
                projects.isPending,
                projects.isError,
                projects.data?.length ?? 0,
              )}
              href="/dashboard/projects"
              icon={Boxes}
            />
            <MetricCard
              label="Environments"
              description="Across all loaded projects"
              value={metricValue(
                environmentsPending,
                environmentsError,
                environmentCount,
              )}
              href="/dashboard/projects"
              icon={Network}
            />
          </>
        )}
        {canViewWorkers && (
          <MetricCard
            label="Worker Nodes"
            description={
              workers.isError
                ? "Status unavailable"
                : `${onlineWorkers} online of ${workers.data?.length ?? 0}`
            }
            value={metricValue(
              workers.isPending,
              workers.isError,
              workers.data?.length ?? 0,
            )}
            href="/dashboard/infrastructure/workers"
            icon={Server}
          />
        )}
        <MetricCard
          label="Published templates"
          description="Available in the service catalog"
          value={metricValue(
            templates.isPending,
            templates.isError,
            publishedTemplates,
          )}
          href="/dashboard/services/catalog"
          icon={Library}
        />
      </div>
      {canViewEntitlements && (
        <Card className="mt-4">
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <Gauge className="size-4" />
              </span>
              <div>
                <h2 className="text-sm font-semibold">
                  Entitlements and reservations
                </h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Quota data is shown only when reported by organization APIs.
                </p>
              </div>
            </div>
            <Button asChild variant="secondary" size="sm">
              <Link href="/dashboard/resources">
                View limits <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-md border bg-muted/25 p-4">
                <dt className="text-xs text-muted-foreground">
                  Quota categories
                </dt>
                <dd className="mt-2">
                  {metricValue(
                    entitlements.isPending,
                    entitlements.isError,
                    entitlementCount(entitlements.data),
                  )}
                </dd>
              </div>
              <div className="rounded-md border bg-muted/25 p-4">
                <dt className="text-xs text-muted-foreground">
                  Reserved quota categories
                </dt>
                <dd className="mt-2">
                  {metricValue(
                    entitlements.isPending,
                    entitlements.isError,
                    Object.values(entitlements.data?.reserved ?? {}).filter(
                      (value) => value > 0,
                    ).length,
                  )}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
