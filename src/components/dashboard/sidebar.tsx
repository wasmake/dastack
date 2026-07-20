"use client";

import {
  BookOpen,
  Boxes,
  ChevronLeft,
  Gauge,
  LayoutDashboard,
  Library,
  Server,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo, Mark } from "@/components/logo";
import { OrganizationSwitcher } from "@/components/dashboard/organization-switcher";
import { ProjectSwitcher } from "@/components/projects/project-switcher";
import { useSelectedOrganization } from "@/hooks/use-phase-two";
import { useShellStore } from "@/stores/shell-store";
import { cn } from "@/lib/utils";

const sections = [
  {
    label: "Workspace",
    links: [
      {
        label: "Overview",
        href: "/dashboard",
        icon: LayoutDashboard,
        permission: null,
      },
      {
        label: "Projects",
        href: "/dashboard/projects",
        icon: Boxes,
        permission: "project:view",
      },
    ],
  },
  {
    label: "Operate",
    links: [
      {
        label: "Service catalog",
        href: "/dashboard/services/catalog",
        icon: Library,
        permission: null,
      },
      {
        label: "Worker Nodes",
        href: "/dashboard/infrastructure/workers",
        icon: Server,
        permission: "environment:manage",
      },
      {
        label: "Resource limits",
        href: "/dashboard/resources",
        icon: Gauge,
        permission: "billing:read",
      },
    ],
  },
  {
    label: "Access",
    links: [
      {
        label: "Members",
        href: "/dashboard/members",
        icon: Users,
        permission: "member:list",
      },
      {
        label: "Documentation",
        href: "/docs",
        icon: BookOpen,
        permission: null,
      },
    ],
  },
] as const;

export function Sidebar({
  mobile = false,
  onNavigate,
}: {
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { organization } = useSelectedOrganization();
  const collapsed = useShellStore((state) => state.sidebarCollapsed) && !mobile;
  const toggle = useShellStore((state) => state.toggleSidebar);

  return (
    <aside
      className={cn(
        "flex h-full flex-col bg-panel transition-[width]",
        collapsed ? "w-[68px]" : "w-[244px]",
        mobile && "w-full",
      )}
    >
      <div
        className={cn(
          "flex h-16 items-center border-b px-4",
          collapsed && "justify-center px-2",
        )}
      >
        {collapsed ? (
          <Link
            href="/"
            aria-label="DaStack home"
            className="grid min-h-11 place-items-center"
          >
            <Mark />
          </Link>
        ) : (
          <Logo />
        )}
      </div>
      <div className={cn("space-y-2 p-3", collapsed && "px-3")}>
        <OrganizationSwitcher collapsed={collapsed} />
        <ProjectSwitcher collapsed={collapsed} />
      </div>
      <nav
        className="min-h-0 flex-1 overflow-y-auto px-3 pb-3"
        aria-label="Dashboard navigation"
      >
        <div className="space-y-4">
          {sections.map((section) => (
            <div key={section.label}>
              <p
                className={cn(
                  "mb-1.5 px-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground",
                  collapsed && "sr-only",
                )}
              >
                {section.label}
              </p>
              <div className="space-y-0.5">
                {section.links
                  .filter(
                    (link) =>
                      !link.permission ||
                      !organization ||
                      organization.role?.permissions.includes(link.permission),
                  )
                  .map(({ label, href, icon: Icon }) => {
                    const active =
                      href === "/dashboard"
                        ? pathname === href
                        : pathname.startsWith(href);
                    return (
                      <Link
                        title={collapsed ? label : undefined}
                        onClick={onNavigate}
                        key={href}
                        href={href}
                        className={cn(
                          "flex min-h-10 items-center rounded-md text-[13px] transition-colors",
                          collapsed ? "justify-center" : "gap-3 px-2.5",
                          active
                            ? "bg-muted font-medium text-foreground"
                            : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                        )}
                      >
                        <Icon className="size-4 shrink-0" aria-hidden="true" />
                        {!collapsed && label}
                      </Link>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      </nav>
      {!mobile && (
        <div className="border-t p-3">
          <button
            type="button"
            onClick={toggle}
            className={cn(
              "flex min-h-10 w-full items-center rounded-md text-xs text-muted-foreground hover:bg-muted hover:text-foreground",
              collapsed ? "justify-center" : "gap-2.5 px-2.5",
            )}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <ChevronLeft
              className={cn(
                "size-4 transition-transform",
                collapsed && "rotate-180",
              )}
              aria-hidden="true"
            />
            {!collapsed && "Collapse"}
          </button>
        </div>
      )}
    </aside>
  );
}
