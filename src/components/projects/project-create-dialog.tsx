"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
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
import {
  ProjectIcon,
  projectIconOptions,
} from "@/components/projects/project-icon";
import { apiErrorMessage, apiRequest } from "@/lib/api-client";
import type { Project } from "@/hooks/use-phase-two";
import { useShellStore } from "@/stores/shell-store";

const schema = z.object({
  name: z.string().trim().min(2, "Use at least 2 characters.").max(80),
  slug: z
    .string()
    .trim()
    .min(2, "Use at least 2 characters.")
    .max(64)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers, and hyphens.",
    ),
  description: z
    .string()
    .trim()
    .max(500, "Keep the description under 500 characters."),
  icon: z.enum(["box", "boxes", "database", "globe", "layers"]),
});

type Values = z.infer<typeof schema>;

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

export function ProjectCreateDialog({
  organizationId,
}: {
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
    defaultValues: { name: "", slug: "", description: "", icon: "box" },
  });
  const nameField = form.register("name");
  const mutation = useMutation({
    mutationFn: (values: Values) =>
      apiRequest<Project>(
        `/api/organizations/${encodeURIComponent(organizationId)}/projects`,
        {
          method: "POST",
          body: JSON.stringify({
            ...values,
            description: values.description || null,
          }),
        },
      ),
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({
        queryKey: ["projects", organizationId],
      });
      setSelectedProject(project.id);
      setOpen(false);
      form.reset();
      router.push(
        `/dashboard/projects/${encodeURIComponent(project.id)}?organization=${encodeURIComponent(organizationId)}`,
      );
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" aria-hidden="true" /> Create project
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Create project</DialogTitle>
        <DialogDescription>
          Group related environments and deployment drafts within this
          organization.
        </DialogDescription>
        <form
          className="mt-5 space-y-4"
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        >
          <div className="space-y-1.5">
            <Label htmlFor="project-name">Project name</Label>
            <Input
              id="project-name"
              autoFocus
              {...nameField}
              onChange={(event) => {
                nameField.onChange(event);
                if (!form.formState.dirtyFields.slug)
                  form.setValue("slug", slugify(event.target.value), {
                    shouldValidate: true,
                  });
              }}
              aria-invalid={Boolean(form.formState.errors.name)}
            />
            {form.formState.errors.name && (
              <p className="text-xs text-danger">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="project-slug">Slug</Label>
            <Input
              id="project-slug"
              className="font-mono"
              {...form.register("slug")}
              aria-invalid={Boolean(form.formState.errors.slug)}
            />
            <p className="text-xs text-muted-foreground">
              Used as the stable project identifier in URLs and configuration.
            </p>
            {form.formState.errors.slug && (
              <p className="text-xs text-danger">
                {form.formState.errors.slug.message}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Icon</Label>
            <div className="grid grid-cols-5 gap-2">
              {projectIconOptions.map((icon) => (
                <label
                  key={icon}
                  className="grid min-h-11 cursor-pointer place-items-center rounded-md border has-[:checked]:border-primary has-[:checked]:bg-primary/10"
                >
                  <input
                    type="radio"
                    value={icon}
                    className="sr-only"
                    {...form.register("icon")}
                  />
                  <ProjectIcon
                    icon={icon}
                    className="size-8 border-0 bg-transparent"
                  />
                  <span className="sr-only">{icon} icon</span>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="project-description">Description</Label>
            <textarea
              id="project-description"
              rows={3}
              className="w-full resize-y rounded-md border border-border-strong bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              {...form.register("description")}
              aria-invalid={Boolean(form.formState.errors.description)}
            />
            {form.formState.errors.description && (
              <p className="text-xs text-danger">
                {form.formState.errors.description.message}
              </p>
            )}
          </div>
          {mutation.isError && (
            <Alert tone="danger">
              {apiErrorMessage(
                mutation.error,
                "The project could not be created.",
              )}
            </Alert>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending || !form.formState.isValid}
            >
              {mutation.isPending ? "Creating..." : "Create project"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
