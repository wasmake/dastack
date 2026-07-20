"use client";

import { ArrowLeft, Network } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { EnvironmentCreateDialog } from "@/components/environments/environment-create-dialog";
import { EnvironmentList } from "@/components/environments/environment-list";
import { ProjectIcon } from "@/components/projects/project-icon";
import { ProjectSettingsDialog } from "@/components/projects/project-settings-dialog";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import {
  useEnvironments,
  useProject,
  useSelectedOrganization,
  useWorkers,
} from "@/hooks/use-phase-two";
import { useShellStore } from "@/stores/shell-store";

export function ProjectDetailView({
  projectId,
  organizationId,
}: {
  projectId: string;
  organizationId?: string;
}) {
  const { organization: selectedOrganization, organizations } =
    useSelectedOrganization();
  const organization = organizationId
    ? organizations.data?.find((candidate) => candidate.id === organizationId)
    : selectedOrganization;
  const canViewProject = Boolean(
    organization?.role?.permissions.includes("project:view"),
  );
  const canManageEnvironments = Boolean(
    organization?.role?.permissions.includes("environment:manage"),
  );
  const project = useProject(organization?.id, projectId, canViewProject);
  const environments = useEnvironments(
    organization?.id,
    projectId,
    canViewProject,
  );
  const workers = useWorkers(organization?.id, canManageEnvironments);
  const setSelectedProject = useShellStore(
    (state) => state.setSelectedProjectId,
  );
  const setSelectedOrganization = useShellStore(
    (state) => state.setSelectedOrganizationId,
  );

  useEffect(
    () => setSelectedProject(projectId),
    [projectId, setSelectedProject],
  );
  useEffect(() => {
    if (organizationId && organization?.id === organizationId) {
      setSelectedOrganization(organizationId);
      setSelectedProject(projectId);
    }
  }, [
    organization?.id,
    organizationId,
    projectId,
    setSelectedOrganization,
    setSelectedProject,
  ]);

  if (organizations.isPending) return <LoadingState label="Loading project" />;
  if (organizations.isError)
    return (
      <ErrorState
        message="The organization list is unavailable."
        retry={() => organizations.refetch()}
      />
    );
  if (!organization)
    return (
      <ErrorState message="Select an organization to open this project." />
    );
  if (!canViewProject)
    return (
      <ErrorState message="Your organization role cannot view this project." />
    );
  if (project.isPending) return <LoadingState label="Loading project" />;
  if (project.isError)
    return (
      <ErrorState
        message="The project could not be loaded."
        retry={() => project.refetch()}
      />
    );
  if (!project.data) return <ErrorState message="The project was not found." />;
  const canManageProject = Boolean(
    organization.role?.permissions.includes("project:create"),
  );

  return (
    <div>
      <Link
        href="/dashboard/projects"
        className="mb-5 inline-flex min-h-10 items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" /> All projects
      </Link>
      <PageHeader
        eyebrow="Project"
        title={project.data.name}
        description={
          project.data.description || "No project description has been added."
        }
        action={
          canManageEnvironments ? (
            <EnvironmentCreateDialog
              organizationId={organization.id}
              projectId={project.data.id}
              workers={workers.data ?? []}
              workersUnavailable={workers.isError || workers.isPending}
            />
          ) : undefined
        }
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_auto]">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <ProjectIcon icon={project.data.icon} className="size-9" />
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground">Project slug</p>
              <p className="truncate font-mono text-xs">{project.data.slug}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <Network className="size-4" />
            </span>
            <div>
              <p className="text-[11px] text-muted-foreground">Environments</p>
              <p className="text-sm font-medium">
                {environments.data?.length ??
                  (environments.isPending ? "Loading" : "Unavailable")}
              </p>
            </div>
          </CardContent>
        </Card>
        {canManageProject && (
          <div className="flex items-center sm:col-span-2 xl:col-span-1">
            <ProjectSettingsDialog
              project={project.data}
              organizationId={organization.id}
            />
          </div>
        )}
      </div>
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold">Environments</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Isolated runtime boundaries recorded for this project.
          </p>
        </CardHeader>
        <CardContent>
          {environments.isPending && (
            <LoadingState label="Loading environments" />
          )}
          {environments.isError && (
            <ErrorState
              message="Environments could not be loaded."
              retry={() => environments.refetch()}
            />
          )}
          {environments.data?.length === 0 && (
            <EmptyState
              title="No environments"
              description="Create an environment in a region served by an online worker node."
            />
          )}
          {environments.data && environments.data.length > 0 && (
            <EnvironmentList environments={environments.data} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
