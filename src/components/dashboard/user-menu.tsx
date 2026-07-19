"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { useState } from "react";
import { useSessionUser } from "@/hooks/use-session-user";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
  DropdownTrigger,
} from "@/components/ui/dropdown";

export function UserMenu() {
  const query = useSessionUser();
  const [pending, setPending] = useState(false);
  const user = query.data;
  const initial = user?.name?.charAt(0) ?? user?.email?.charAt(0) ?? "A";

  async function logout() {
    setPending(true);
    try {
      await signOut({ redirectTo: "/login" });
    } finally {
      setPending(false);
    }
  }
  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <button
          className="grid size-10 place-items-center rounded-full border bg-muted text-xs font-semibold uppercase hover:border-border-strong"
          aria-label="Open user menu"
        >
          {initial}
        </button>
      </DropdownTrigger>
      <DropdownContent align="end" className="w-60">
        <DropdownLabel>
          <span className="block truncate text-xs font-medium text-foreground">
            {user?.name ?? "Account"}
          </span>
          {user?.email && (
            <span className="mt-0.5 block truncate font-normal">
              {user.email}
            </span>
          )}
        </DropdownLabel>
        <DropdownSeparator />
        <DropdownItem
          disabled={pending}
          onSelect={(event) => {
            event.preventDefault();
            void logout();
          }}
          className="text-danger data-[highlighted]:text-danger"
        >
          <LogOut className="size-4" />
          {pending ? "Signing out..." : "Sign out"}
        </DropdownItem>
      </DropdownContent>
    </Dropdown>
  );
}
