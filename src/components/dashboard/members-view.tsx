"use client";

import { CalendarDays, Shield, UserRound } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { EnvironmentBadge } from "@/components/environments/environment-badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { useMembers, useSelectedOrganization } from "@/hooks/use-phase-two";

function joinedAt(value?: string): string {
  if (!value) return "Not reported";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

export function MembersView() {
  const { organization, organizations } = useSelectedOrganization();
  const members = useMembers(organization?.id);

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
        title="No organization selected"
        description="Members belong to an organization workspace."
      />
    );

  return (
    <div>
      <PageHeader
        eyebrow="Team"
        title="Members"
        description={`People with access to ${organization.name} and their assigned roles.`}
      />
      {members.isPending && <LoadingState label="Loading members" />}
      {members.isError && (
        <ErrorState
          message="Organization members could not be loaded."
          retry={() => members.refetch()}
        />
      )}
      {members.data?.length === 0 && (
        <EmptyState
          title="No members returned"
          description="The organization member API returned an empty list."
        />
      )}
      {members.data && members.data.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2">
          {members.data.map((member) => (
            <Card key={member.id}>
              <CardContent className="flex min-w-0 items-start gap-3 p-4 sm:p-5">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                  <UserRound className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-sm font-semibold">
                      {member.user?.name ||
                        member.user?.email ||
                        "Unavailable member"}
                    </h2>
                    <EnvironmentBadge value={member.status} />
                  </div>
                  {member.user?.email && (
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {member.user.email}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Shield className="size-3" />{" "}
                      {member.role?.name ?? "Role unavailable"}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarDays className="size-3" /> Joined{" "}
                      {joinedAt(member.joinedAt)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
