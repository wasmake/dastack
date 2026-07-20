"use client";

import { useQuery } from "@tanstack/react-query";

export type Organization = {
  id: string;
  name: string;
  slug?: string;
  role?: {
    id: string;
    key: string;
    name: string;
    permissions: string[];
  } | null;
};

type OrganizationsPayload =
  Organization[] | { organizations?: Organization[]; data?: Organization[] };

async function fetchOrganizations(): Promise<Organization[]> {
  const response = await fetch("/api/organizations", {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Organizations are unavailable");
  const payload = (await response.json()) as OrganizationsPayload;
  const organizations = Array.isArray(payload)
    ? payload
    : (payload.organizations ?? payload.data ?? []);
  return organizations.filter(
    (organization) =>
      organization &&
      typeof organization.id === "string" &&
      typeof organization.name === "string",
  );
}

export function useOrganizations() {
  return useQuery({ queryKey: ["organizations"], queryFn: fetchOrganizations });
}
