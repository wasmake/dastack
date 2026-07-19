"use client";

import { ArrowRight, Building2, BookOpen } from "lucide-react";
import Link from "next/link";
import { useOrganizations } from "@/hooks/use-organizations";
import { useShellStore } from "@/stores/shell-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Skeleton } from "@/components/ui/skeleton";

export function DashboardView() {
  const query = useOrganizations();
  const selectedId = useShellStore((state) => state.selectedOrganizationId);
  const selected =
    query.data?.find((organization) => organization.id === selectedId) ??
    query.data?.[0];

  if (query.isPending)
    return (
      <div aria-label="Loading dashboard" role="status">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="mt-2 h-4 w-80 max-w-full" />
        <Skeleton className="mt-8 h-64 w-full" />
      </div>
    );
  if (query.isError)
    return (
      <ErrorState
        message="DaStack could not load your organizations. Check your connection and try again."
        retry={() => query.refetch()}
      />
    );
  if (!selected)
    return (
      <>
        <div className="mb-7">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">
            Workspace
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">
            Overview
          </h1>
        </div>
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

  return (
    <div>
      <div className="mb-7">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">
          Organization overview
        </p>
        <h1 className="mt-2 truncate text-2xl font-semibold tracking-[-0.03em]">
          {selected.name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Workspace identity and getting-started resources.
        </p>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.6fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                <Building2 className="size-4" />
              </span>
              <div>
                <h2 className="text-sm font-semibold">Organization</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Current workspace
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-5 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Name</dt>
                <dd className="mt-1 font-medium">{selected.name}</dd>
              </div>
              {selected.slug && (
                <div>
                  <dt className="text-xs text-muted-foreground">Slug</dt>
                  <dd className="mt-1 font-mono text-xs">{selected.slug}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-muted-foreground">
                  Organization ID
                </dt>
                <dd className="mt-1 break-all font-mono text-xs">
                  {selected.id}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
        <Card className="flex flex-col">
          <CardHeader>
            <h2 className="text-sm font-semibold">Get oriented</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Review the container workflow before deploying.
            </p>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col justify-between gap-6">
            <BookOpen className="size-5 text-primary" aria-hidden="true" />
            <Button asChild variant="secondary" className="w-full">
              <Link href="/docs">
                Read documentation <ArrowRight className="size-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
