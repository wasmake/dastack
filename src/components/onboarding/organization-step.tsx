"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  LoaderCircle,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { useOrganizations, type Organization } from "@/hooks/use-organizations";
import { useShellStore } from "@/stores/shell-store";
import { FormMessage } from "@/components/auth/form-message";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorState, LoadingState } from "@/components/ui/states";

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Use at least 2 characters")
    .max(80, "Organization name is too long"),
});
type Values = z.infer<typeof schema>;

export function OrganizationStep() {
  const organizations = useOrganizations();
  const queryClient = useQueryClient();
  const setSelectedId = useShellStore(
    (state) => state.setSelectedOrganizationId,
  );
  const [creatingAnother, setCreatingAnother] = useState(false);
  const [error, setError] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "" },
  });

  async function submit(values: Values) {
    setError(false);
    try {
      const response = await fetch("/api/organizations", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: values.name }),
      });
      if (!response.ok) {
        setError(true);
        return;
      }
      const organization = (await response.json()) as { data?: Organization };
      const created = organization.data ?? (organization as Organization);
      if (created?.id) setSelectedId(created.id);
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
      setCreatingAnother(false);
      form.reset();
    } catch {
      setError(true);
    }
  }

  if (organizations.isPending)
    return <LoadingState label="Checking your workspace" />;
  if (organizations.isError)
    return (
      <ErrorState
        message="DaStack could not check your organization state. No changes were made."
        retry={() => organizations.refetch()}
      />
    );
  const existing = organizations.data[0];
  if (existing && !creatingAnother)
    return (
      <div className="rounded-xl border bg-surface p-6 sm:p-8">
        <span className="grid size-11 place-items-center rounded-lg border border-success/25 bg-success/10 text-success">
          <CheckCircle2 className="size-5" />
        </span>
        <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.14em] text-success">
          Workspace found
        </p>
        <h2 className="mt-2 text-xl font-semibold">
          Continue with {existing.name}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Your organization is already persisted, so this setup step does not
          need to be repeated.
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <Button asChild>
            <Link href="/dashboard">
              Open dashboard <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setCreatingAnother(true)}
          >
            <Plus className="size-4" />
            Create another
          </Button>
        </div>
      </div>
    );

  return (
    <form
      className="rounded-xl border bg-surface p-6 sm:p-8"
      onSubmit={form.handleSubmit(submit)}
      noValidate
    >
      <span className="grid size-11 place-items-center rounded-lg border bg-muted/40 text-primary">
        <Building2 className="size-5" />
      </span>
      <h2 className="mt-6 text-xl font-semibold">Name your organization</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Use the team or company name that should own your services. You can
        create additional organizations later.
      </p>
      {error && (
        <Alert tone="danger" className="mt-5">
          The organization could not be created. Check the name or try again
          later.
        </Alert>
      )}
      <div className="mt-6">
        <Label htmlFor="organization-name">Organization name</Label>
        <Input
          id="organization-name"
          className="mt-1.5"
          autoComplete="organization"
          placeholder="Acme Engineering"
          aria-invalid={!!form.formState.errors.name}
          aria-describedby={
            form.formState.errors.name
              ? "organization-error"
              : "organization-hint"
          }
          {...form.register("name")}
        />
        <FormMessage
          id="organization-error"
          message={form.formState.errors.name?.message}
        />
        <p
          id="organization-hint"
          className="mt-1.5 text-xs text-muted-foreground"
        >
          DaStack generates a unique workspace identifier from this name.
        </p>
      </div>
      <Alert className="mt-5">
        No payment details are required for this step. Stripe setup occurs later
        only when a paid plan is selected.
      </Alert>
      <div className="mt-6 flex gap-3">
        {creatingAnother && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setCreatingAnother(false)}
          >
            Cancel
          </Button>
        )}
        <Button
          className="flex-1"
          type="submit"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting && (
            <LoaderCircle className="size-4 animate-spin" />
          )}
          Create organization
        </Button>
      </div>
    </form>
  );
}
