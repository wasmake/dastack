"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Settings2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Project } from "@/hooks/use-phase-two";
import { apiErrorMessage, apiRequest } from "@/lib/api-client";
import { useShellStore } from "@/stores/shell-store";

const schema = z.object({
  name: z.string().trim().min(2, "Use at least 2 characters.").max(80),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers, and hyphens.",
    ),
  description: z.string().trim().max(500),
});

type Values = z.infer<typeof schema>;

export function ProjectSettingsDialog({
  project,
  organizationId,
}: {
  project: Project;
  organizationId: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const setSelectedProject = useShellStore(
    (state) => state.setSelectedProjectId,
  );
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: {
      name: project.name,
      slug: project.slug,
      description: project.description ?? "",
    },
  });
  const path = `/api/organizations/${encodeURIComponent(organizationId)}/projects/${encodeURIComponent(project.id)}`;
  const update = useMutation({
    mutationFn: (values: Values) =>
      apiRequest<Project>(path, {
        method: "PATCH",
        body: JSON.stringify({
          ...values,
          description: values.description || null,
          ...(typeof project.version === "number"
            ? { version: project.version }
            : {}),
        }),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["projects", organizationId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["projects", organizationId, project.id],
        }),
      ]);
      setOpen(false);
    },
  });
  const remove = useMutation({
    mutationFn: () => apiRequest<unknown>(path, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["projects", organizationId],
      });
      setSelectedProject(null);
      router.push("/dashboard/projects");
    },
  });

  function deleteProject() {
    if (window.confirm(`Delete ${project.name}? This action cannot be undone.`))
      remove.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <Settings2 className="size-4" /> Project settings
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Project settings</DialogTitle>
        <DialogDescription>
          Update project identity or remove the project.
        </DialogDescription>
        <form
          className="mt-5 space-y-4"
          onSubmit={form.handleSubmit((values) => update.mutate(values))}
        >
          <div className="space-y-1.5">
            <Label htmlFor="settings-project-name">Project name</Label>
            <Input
              id="settings-project-name"
              {...form.register("name")}
              aria-invalid={Boolean(form.formState.errors.name)}
            />
            {form.formState.errors.name && (
              <p className="text-xs text-danger">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="settings-project-slug">Slug</Label>
            <Input
              id="settings-project-slug"
              className="font-mono"
              {...form.register("slug")}
              aria-invalid={Boolean(form.formState.errors.slug)}
            />
            {form.formState.errors.slug && (
              <p className="text-xs text-danger">
                {form.formState.errors.slug.message}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="settings-project-description">Description</Label>
            <textarea
              id="settings-project-description"
              rows={3}
              className="w-full resize-y rounded-md border border-border-strong bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              {...form.register("description")}
            />
          </div>
          {(update.isError || remove.isError) && (
            <Alert tone="danger">
              {apiErrorMessage(
                update.error ?? remove.error,
                "Project settings could not be updated.",
              )}
            </Alert>
          )}
          <div className="flex flex-col-reverse justify-between gap-3 border-t pt-4 sm:flex-row">
            <Button
              type="button"
              variant="danger"
              onClick={deleteProject}
              disabled={remove.isPending}
            >
              <Trash2 className="size-4" />{" "}
              {remove.isPending ? "Deleting..." : "Delete project"}
            </Button>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={update.isPending || !form.formState.isValid}
              >
                {update.isPending ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
