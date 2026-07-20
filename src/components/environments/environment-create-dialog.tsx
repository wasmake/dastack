"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
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
import type { Environment, Worker } from "@/hooks/use-phase-two";
import { apiErrorMessage, apiRequest } from "@/lib/api-client";

const schema = z.object({
  name: z.string().trim().min(2, "Use at least 2 characters.").max(80),
  type: z.enum(["development", "preview", "production", "custom"]),
  region: z.string().min(1, "Select an available region."),
});

type Values = z.infer<typeof schema>;

function isOnline(worker: Worker): boolean {
  if (worker.status.toLowerCase() !== "online" || worker.schedulable === false)
    return false;
  if (!worker.lastHeartbeatAt) return true;
  return (
    Date.now() - new Date(worker.lastHeartbeatAt).getTime() < 2 * 60 * 1_000
  );
}

export function EnvironmentCreateDialog({
  organizationId,
  projectId,
  workers,
  workersUnavailable = false,
}: {
  organizationId: string;
  projectId: string;
  workers: Worker[];
  workersUnavailable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const regions = [
    ...new Set(workers.filter(isOnline).map((worker) => worker.region)),
  ].sort();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: { name: "", type: "development", region: regions[0] ?? "" },
  });
  const regionKey = regions.join("|");
  useEffect(() => {
    if (regions[0] && !form.getValues("region"))
      form.setValue("region", regions[0], { shouldValidate: true });
  }, [form, regionKey, regions]);
  const mutation = useMutation({
    mutationFn: (values: Values) =>
      apiRequest<Environment>(
        `/api/organizations/${encodeURIComponent(organizationId)}/projects/${encodeURIComponent(projectId)}/environments`,
        { method: "POST", body: JSON.stringify(values) },
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["environments", organizationId, projectId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["projects", organizationId],
        }),
      ]);
      form.reset({ name: "", type: "development", region: regions[0] ?? "" });
      setOpen(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" aria-hidden="true" /> Create environment
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Create environment</DialogTitle>
        <DialogDescription>
          Choose a region currently served by an online worker node.
        </DialogDescription>
        {workersUnavailable || regions.length === 0 ? (
          <Alert tone="danger" className="mt-5">
            {workersUnavailable
              ? "Worker regions are unavailable. Environment creation cannot safely continue."
              : "No online worker reports a region. Enroll or restore a worker before creating an environment."}
          </Alert>
        ) : (
          <form
            className="mt-5 space-y-4"
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          >
            <div className="space-y-1.5">
              <Label htmlFor="environment-name">Environment name</Label>
              <Input
                id="environment-name"
                autoFocus
                {...form.register("name")}
                aria-invalid={Boolean(form.formState.errors.name)}
              />
              {form.formState.errors.name && (
                <p className="text-xs text-danger">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="environment-type">Type</Label>
                <select
                  id="environment-type"
                  className="h-10 w-full rounded-md border border-border-strong bg-background px-3 text-sm"
                  {...form.register("type")}
                >
                  <option value="development">Development</option>
                  <option value="preview">Preview</option>
                  <option value="production">Production</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="environment-region">Region</Label>
                <select
                  id="environment-region"
                  className="h-10 w-full rounded-md border border-border-strong bg-background px-3 text-sm"
                  {...form.register("region")}
                >
                  {regions.map((region) => (
                    <option key={region} value={region}>
                      {region}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <Alert>
              <span className="font-medium text-foreground">
                Isolated private network desired state
              </span>
              <span className="mt-0.5 block">
                DaStack records the environment as an isolated network boundary.
                Runtime reconciliation begins only when provisioning is
                available.
              </span>
            </Alert>
            {mutation.isError && (
              <Alert tone="danger">
                {apiErrorMessage(
                  mutation.error,
                  "The environment could not be created.",
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
                {mutation.isPending ? "Creating..." : "Create environment"}
              </Button>
            </div>
          </form>
        )}
        {(workersUnavailable || regions.length === 0) && (
          <div className="mt-4 flex justify-end">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
