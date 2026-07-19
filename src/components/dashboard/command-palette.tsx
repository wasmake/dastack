"use client";

import { BookOpen, LayoutDashboard, Search, Waypoints } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

const actions = [
  {
    label: "Go to overview",
    href: "/dashboard",
    icon: LayoutDashboard,
    hint: "Dashboard",
  },
  {
    label: "Open organization setup",
    href: "/onboarding",
    icon: Waypoints,
    hint: "Organization",
  },
  { label: "Read documentation", href: "/docs", icon: BookOpen, hint: "Docs" },
] as const;

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const filtered = actions.filter((action) =>
    `${action.label} ${action.hint}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

  function changeOpen(nextOpen: boolean) {
    if (!nextOpen) setQuery("");
    onOpenChange(nextOpen);
  }
  function navigate(href: string) {
    changeOpen(false);
    router.push(href);
  }
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="top-[18%] translate-y-0 p-0 sm:max-w-xl">
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Navigate to a DaStack page
        </DialogDescription>
        <div className="flex h-14 items-center gap-3 border-b px-4">
          <Search className="size-4 text-muted-foreground" aria-hidden="true" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search navigation..."
            className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div
          className="max-h-72 overflow-y-auto p-2"
          role="listbox"
          aria-label="Navigation actions"
        >
          {filtered.map(({ label, href, icon: Icon, hint }) => (
            <button
              key={href}
              type="button"
              role="option"
              aria-selected="false"
              onClick={() => navigate(href)}
              className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Icon className="size-4" />
              <span className="flex-1">{label}</span>
              <span className="text-[10px]">{hint}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              No navigation actions found.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
