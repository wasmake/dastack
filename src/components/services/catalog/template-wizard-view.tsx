"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Boxes, Network } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { WizardEngine } from "@/components/services/catalog/wizard-engine";
import { PageHeader } from "@/components/dashboard/page-header";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import {
  type ServiceDraft,
  useEnvironments,
  useProjects,
  useServiceDrafts,
  useSelectedOrganization,
  useServiceTemplate,
} from "@/hooks/use-phase-two";
import { apiErrorMessage, apiRequest } from "@/lib/api-client";
import { useShellStore } from "@/stores/shell-store";

type Configuration = Record<string, unknown>;

export function TemplateWizardView({ templateId }: { templateId: string }) {
  const { organization } = useSelectedOrganization();
  return (
    <TemplateWizardContent
      key={organization?.id ?? "no-organization"}
      templateId={templateId}
    />
  );
}

function TemplateWizardContent({ templateId }: { templateId: string }) {
  const { organization, organizations } = useSelectedOrganization();
  const canCreateService = Boolean(
    organization?.role?.permissions.includes("service:create"),
  );
  const selectedProjectId = useShellStore((state) => state.selectedProjectId);
  const projects = useProjects(organization?.id, canCreateService);
  const template = useServiceTemplate(templateId);
  const [saveRevision, setSaveRevision] = useState(0);
  const [projectChoice, setProjectChoice] = useState("");
  const projectId =
    projects.data?.find((project) => project.id === projectChoice)?.id ||
    projects.data?.find((project) => project.id === selectedProjectId)?.id ||
    projects.data?.[0]?.id ||
    "";
  const environments = useEnvironments(organization?.id, projectId);
  const [environmentChoice, setEnvironmentChoice] = useState("");
  const environmentId = environments.data?.some(
    (environment) => environment.id === environmentChoice,
  )
    ? environmentChoice
    : (environments.data?.[0]?.id ?? "");
  const drafts = useServiceDrafts(organization?.id, projectId, environmentId);
  const queryClient = useQueryClient();
  const existing = drafts.data?.find(
    (draft) =>
      draft.templateId === templateId &&
      draft.manifestVersion === template.data?.manifestVersion &&
      draft.status === "active",
  );
  const save = useMutation({
    mutationFn: (configuration: Configuration) => {
      const base = `/api/organizations/${encodeURIComponent(organization!.id)}/projects/${encodeURIComponent(projectId)}/environments/${encodeURIComponent(environmentId)}/drafts`;
      return apiRequest<ServiceDraft>(
        existing ? `${base}/${encodeURIComponent(existing.id)}` : base,
        {
          method: existing ? "PATCH" : "POST",
          body: JSON.stringify(
            existing
              ? { values: configuration, version: existing.version }
              : {
                  name: `${template.data!.manifest.displayName} draft`,
                  templateId,
                  manifestVersion: template.data!.manifestVersion,
                  values: configuration,
                },
          ),
        },
      );
    },
    onSuccess: async () => {
      setSaveRevision((revision) => revision + 1);
      await queryClient.invalidateQueries({
        queryKey: [
          "service-drafts",
          organization?.id,
          projectId,
          environmentId,
        ],
      });
    },
  });
  function resetSaveState() {
    save.reset();
    setSaveRevision(0);
  }

  if (organizations.isPending)
    return <LoadingState label="Loading template wizard" />;
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
        title="No organization selected"
        description="Select an organization before configuring a deployment draft."
      />
    );
  if (!canCreateService)
    return (
      <ErrorState message="Your organization role cannot create deployment drafts." />
    );
  if (template.isPending || projects.isPending)
    return <LoadingState label="Loading template wizard" />;
  if (template.isError)
    return (
      <ErrorState
        message="The selected service template could not be loaded."
        retry={() => template.refetch()}
      />
    );
  if (!template.data)
    return (
      <ErrorState message="The selected service template was not found." />
    );
  if (template.data.publicationState !== "published")
    return (
      <ErrorState message="Only published service templates can be configured." />
    );
  if (projects.isError)
    return (
      <ErrorState
        message="Projects could not be loaded for the deployment target."
        retry={() => projects.refetch()}
      />
    );
  if (!projects.data?.length)
    return (
      <EmptyState
        title="Create a project first"
        description="A deployment draft must map to a real project and environment."
        action={
          <Link
            className="text-sm font-medium text-primary"
            href="/dashboard/projects"
          >
            Open projects
          </Link>
        }
      />
    );

  return (
    <div>
      <Link
        href="/dashboard/services/catalog"
        className="mb-5 inline-flex min-h-10 items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Service catalog
      </Link>
      <PageHeader
        eyebrow="Deployment draft"
        title={template.data.manifest.displayName}
        description={template.data.manifest.description}
      />
      <Card className="mb-5">
        <CardContent className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <div className="space-y-1.5">
            <label
              htmlFor="draft-project"
              className="flex items-center gap-2 text-[13px] font-medium"
            >
              <Boxes className="size-3.5 text-primary" /> Target project
            </label>
            <select
              id="draft-project"
              value={projectId}
              disabled={save.isPending}
              onChange={(event) => {
                setProjectChoice(event.target.value);
                setEnvironmentChoice("");
                resetSaveState();
              }}
              className="h-10 w-full rounded-md border border-border-strong bg-background px-3 text-sm"
            >
              {projects.data.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="draft-environment"
              className="flex items-center gap-2 text-[13px] font-medium"
            >
              <Network className="size-3.5 text-primary" /> Target environment
            </label>
            {environments.isPending ? (
              <div className="flex h-10 items-center rounded-md border px-3 text-xs text-muted-foreground">
                Loading environments...
              </div>
            ) : (
              <select
                id="draft-environment"
                value={environmentId}
                disabled={save.isPending}
                onChange={(event) => {
                  setEnvironmentChoice(event.target.value);
                  resetSaveState();
                }}
                className="h-10 w-full rounded-md border border-border-strong bg-background px-3 text-sm"
              >
                {environments.data?.map((environment) => (
                  <option key={environment.id} value={environment.id}>
                    {environment.name} ({environment.region})
                  </option>
                ))}
              </select>
            )}
          </div>
        </CardContent>
      </Card>
      {environments.isError && (
        <ErrorState
          message="Target environments could not be loaded."
          retry={() => environments.refetch()}
        />
      )}
      {!environments.isPending &&
        !environments.isError &&
        !environments.data?.length && (
          <EmptyState
            title="No target environment"
            description="Create an environment in this project before saving a deployment draft."
            action={
              <Link
                className="text-sm font-medium text-primary"
                href={`/dashboard/projects/${encodeURIComponent(projectId)}?organization=${encodeURIComponent(organization.id)}`}
              >
                Open project
              </Link>
            }
          />
        )}
      {environmentId && drafts.isPending && (
        <LoadingState label="Checking for a saved draft" />
      )}
      {environmentId && drafts.isError && (
        <ErrorState
          message="Saved deployment drafts are unavailable. Configuration is withheld because it cannot be persisted."
          retry={() => drafts.refetch()}
        />
      )}
      {environmentId &&
        !drafts.isPending &&
        !drafts.isError &&
        !template.data.manifest.wizard.steps.length && (
          <Alert tone="danger">
            This template has no wizard schema, so no configuration fields can
            be mapped or saved.
          </Alert>
        )}
      {environmentId &&
        !drafts.isPending &&
        !drafts.isError &&
        template.data.manifest.wizard.steps.length > 0 && (
          <WizardEngine
            key={`${organization.id}:${templateId}:${projectId}:${environmentId}:${existing?.id ?? "new"}`}
            template={template.data}
            savedConfiguration={existing?.values}
            saving={save.isPending}
            saveError={
              save.isError
                ? apiErrorMessage(
                    save.error,
                    "The deployment draft could not be saved.",
                  )
                : undefined
            }
            saveRevision={saveRevision}
            onSave={(configuration) => save.mutate(configuration)}
          />
        )}
    </div>
  );
}
