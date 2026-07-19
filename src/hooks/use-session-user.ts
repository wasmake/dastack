"use client";

import { useQuery } from "@tanstack/react-query";

export type SessionUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

async function fetchSession(): Promise<SessionUser | null> {
  const response = await fetch("/api/auth/session", {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Session unavailable");
  const payload = (await response.json()) as { user?: SessionUser };
  return payload.user ?? null;
}

export function useSessionUser() {
  return useQuery({
    queryKey: ["session-user"],
    queryFn: fetchSession,
    retry: false,
    staleTime: 60_000,
  });
}
