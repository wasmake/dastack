"use client";

import { Menu, Search } from "lucide-react";
import { usePathname } from "next/navigation";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { UserMenu } from "@/components/dashboard/user-menu";
import { Button } from "@/components/ui/button";
import { useShellStore } from "@/stores/shell-store";

function pageLabel(pathname: string): string {
  if (pathname === "/dashboard") return "Overview";
  if (pathname.startsWith("/dashboard/projects/")) return "Project";
  if (pathname === "/dashboard/projects") return "Projects";
  if (pathname.startsWith("/dashboard/services/catalog/"))
    return "Configure service";
  if (pathname === "/dashboard/services/catalog") return "Service catalog";
  if (pathname === "/dashboard/infrastructure/workers") return "Worker Nodes";
  if (pathname === "/dashboard/resources") return "Resource limits";
  if (pathname === "/dashboard/members") return "Members";
  return "Dashboard";
}

export function Topbar({ onOpenCommand }: { onOpenCommand: () => void }) {
  const pathname = usePathname();
  const setMobileOpen = useShellStore((state) => state.setMobileSidebarOpen);
  const label = pageLabel(pathname);

  return (
    <header className="flex h-16 items-center gap-3 border-b bg-background/82 px-3 backdrop-blur-xl sm:px-5">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        aria-label="Open sidebar"
        onClick={() => setMobileOpen(true)}
      >
        <Menu className="size-5" aria-hidden="true" />
      </Button>
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1 text-sm">
        <ol className="flex items-center gap-2">
          <li className="hidden text-muted-foreground sm:block">Workspace</li>
          <li
            className="hidden text-muted-foreground sm:block"
            aria-hidden="true"
          >
            /
          </li>
          <li className="truncate font-medium" aria-current="page">
            {label}
          </li>
        </ol>
      </nav>
      <button
        type="button"
        onClick={onOpenCommand}
        className="hidden h-9 w-52 items-center gap-2 rounded-md border bg-surface px-3 text-xs text-muted-foreground hover:border-border-strong md:flex"
      >
        <Search className="size-3.5" aria-hidden="true" />
        <span className="flex-1 text-left">Search navigation</span>
        <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[9px]">
          Ctrl K
        </kbd>
      </button>
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Open command palette"
        onClick={onOpenCommand}
      >
        <Search className="size-4" aria-hidden="true" />
      </Button>
      <ThemeSwitcher />
      <UserMenu />
    </header>
  );
}
