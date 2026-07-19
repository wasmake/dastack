"use client";

import { Building2, Check, ChevronsUpDown, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useOrganizations } from "@/hooks/use-organizations";
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

export function OrganizationSwitcher({
  collapsed = false,
}: {
  collapsed?: boolean;
}) {
  const router = useRouter();
  const query = useOrganizations();
  const selectedId = useShellStore((state) => state.selectedOrganizationId);
  const setSelectedId = useShellStore(
    (state) => state.setSelectedOrganizationId,
  );
  const organizations = query.data ?? [];
  const selected =
    organizations.find((organization) => organization.id === selectedId) ??
    organizations[0];

  if (query.isPending)
    return <Skeleton className={collapsed ? "size-9" : "h-10 w-full"} />;

  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <button
          className={`flex min-h-10 items-center rounded-md border bg-surface-raised text-left text-xs hover:bg-muted ${collapsed ? "w-10 justify-center" : "w-full gap-2 px-2.5"}`}
          aria-label="Select organization"
        >
          <span className="grid size-6 shrink-0 place-items-center rounded bg-primary/10 text-primary">
            <Building2 className="size-3.5" aria-hidden="true" />
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 truncate font-medium">
                {query.isError
                  ? "Unavailable"
                  : (selected?.name ?? "No organization")}
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
        <DropdownLabel>Organizations</DropdownLabel>
        {query.isError && (
          <DropdownItem disabled>Could not load organizations</DropdownItem>
        )}
        {organizations.map((organization) => (
          <DropdownItem
            key={organization.id}
            onSelect={() => setSelectedId(organization.id)}
          >
            <span className="grid size-6 place-items-center rounded bg-muted">
              <Building2 className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1 truncate">{organization.name}</span>
            {organization.id === selected?.id && (
              <Check className="size-3.5 text-primary" />
            )}
          </DropdownItem>
        ))}
        <DropdownSeparator />
        <DropdownItem onSelect={() => router.push("/onboarding")}>
          <Plus className="size-4" />
          Create organization
        </DropdownItem>
      </DropdownContent>
    </Dropdown>
  );
}
