"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/dashboard/page-header";
import { ProjectCreateDialog } from "@/components/projects/project-create-dialog";
import { ProjectIcon } from "@/components/projects/project-icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { useProjects, useSelectedOrganization } from "@/hooks/use-phase-two";

export function ProjectsView() {
  const { organization, organizations } = useSelectedOrganization();
  const permitted = Boolean(
    organization?.role?.permissions.includes("project:view"),
  );
  const projects = useProjects(organization?.id, permitted);

  if (organizations.isPending)
    return <LoadingState label="Loading workspace" />;
  if (organizations.isError)
    return (
      <ErrorState
        message="The organization list is unavailable."
        retry={() => organizations.refetch()}
      />
    );
  if (!organization)
    return (
      <EmptyState
        title="Create an organization first"
        description="Projects belong to an organization workspace."
        action={
          <Button asChild>
            <Link href="/onboarding">Create organization</Link>
          </Button>
        }
      />
    );
  if (!permitted)
    return (
      <ErrorState message="Your organization role cannot view projects." />
    );
  const canCreateProject = Boolean(
    organization.role?.permissions.includes("project:create"),
  );

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Projects"
        description={`Organize environments and deployment drafts for ${organization.name}.`}
        action={
          canCreateProject ? (
            <ProjectCreateDialog organizationId={organization.id} />
          ) : undefined
        }
      />
      {projects.isPending && <LoadingState label="Loading projects" />}
      {projects.isError && (
        <ErrorState
          message="Projects could not be loaded. The project API may not be available in this environment."
          retry={() => projects.refetch()}
        />
      )}
      {projects.data?.length === 0 && (
        <EmptyState
          title="No projects yet"
          description="Create a project to define your first isolated environment."
          action={
            canCreateProject ? (
              <ProjectCreateDialog organizationId={organization.id} />
            ) : undefined
          }
        />
      )}
      {projects.data && projects.data.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {projects.data.map((project) => (
            <Card key={project.id} className="group min-w-0">
              <CardContent className="flex h-full flex-col gap-5">
                <div className="flex min-w-0 items-start gap-3">
                  <ProjectIcon icon={project.icon} />
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-sm font-semibold">
                      {project.name}
                    </h2>
                    <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                      {project.slug}
                    </p>
                  </div>
                </div>
                <p className="line-clamp-3 flex-1 text-sm leading-6 text-muted-foreground">
                  {project.description ||
                    "No project description has been added."}
                </p>
                <div className="flex items-center justify-between gap-3 border-t pt-4 text-xs text-muted-foreground">
                  <span>Project environments</span>
                  <Link
                    href={`/dashboard/projects/${encodeURIComponent(project.id)}?organization=${encodeURIComponent(organization.id)}`}
                    className="inline-flex min-h-10 items-center gap-1.5 font-medium text-foreground hover:text-primary"
                  >
                    Open <ArrowRight className="size-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
