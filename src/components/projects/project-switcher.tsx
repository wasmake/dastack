"use client";

import { Boxes, Check, ChevronsUpDown, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useProjects, useSelectedOrganization } from "@/hooks/use-phase-two";
import { useShellStore } from "@/stores/shell-store";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function ProjectSwitcher({
  collapsed = false,
}: {
  collapsed?: boolean;
}) {
  const router = useRouter();
  const { organization } = useSelectedOrganization();
  const permitted = Boolean(
    organization?.role?.permissions.includes("project:view"),
  );
  const projects = useProjects(organization?.id, permitted);
  const selectedId = useShellStore((state) => state.selectedProjectId);
  const setSelectedId = useShellStore((state) => state.setSelectedProjectId);
  const selected =
    projects.data?.find((project) => project.id === selectedId) ??
    projects.data?.[0];

  if (!organization || !permitted) return null;
  if (projects.isPending)
    return <Skeleton className={collapsed ? "size-9" : "h-10 w-full"} />;

  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <button
          className={cn(
            "flex min-h-10 items-center rounded-md border bg-surface-raised text-left text-xs hover:bg-muted",
            collapsed ? "w-10 justify-center" : "w-full gap-2 px-2.5",
          )}
          aria-label="Select project"
        >
          <span className="grid size-6 shrink-0 place-items-center rounded bg-muted text-muted-foreground">
            <Boxes className="size-3.5" aria-hidden="true" />
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 truncate font-medium">
                {projects.isError
                  ? "Projects unavailable"
                  : (selected?.name ?? "No project")}
              </span>
              <ChevronsUpDown
                className="size-3.5 text-muted-foreground"
                aria-hidden="true"
              />
            </>
          )}
        </button>
      </DropdownTrigger>
      <DropdownContent
        align={collapsed ? "start" : "center"}
        side={collapsed ? "right" : "bottom"}
        className="w-64"
      >
        <DropdownLabel>Projects</DropdownLabel>
        {projects.isError && (
          <DropdownItem disabled>Could not load projects</DropdownItem>
        )}
        {projects.data?.map((project) => (
          <DropdownItem
            key={project.id}
            onSelect={() => {
              setSelectedId(project.id);
              router.push(
                `/dashboard/projects/${encodeURIComponent(project.id)}?organization=${encodeURIComponent(organization.id)}`,
              );
            }}
          >
            <Boxes className="size-3.5" />
            <span className="min-w-0 flex-1 truncate">{project.name}</span>
            {project.id === selected?.id && (
              <Check className="size-3.5 text-primary" />
            )}
          </DropdownItem>
        ))}
        <DropdownSeparator />
        <DropdownItem onSelect={() => router.push("/dashboard/projects")}>
          <Plus className="size-4" />
          {projects.data?.length ? "View all projects" : "Create a project"}
        </DropdownItem>
      </DropdownContent>
    </Dropdown>
  );
}
