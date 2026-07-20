"use client";

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api-client";
import { useOrganizations } from "@/hooks/use-organizations";
import { useShellStore } from "@/stores/shell-store";

export type Project = {
  id: string;
  organizationId?: string;
  name: string;
  slug: string;
  description?: string | null;
  icon?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  version?: number;
};

export type Environment = {
  id: string;
  projectId?: string;
  name: string;
  slug?: string;
  type: string;
  isDefault?: boolean;
  region: string;
  networkId?: string;
  status?: string;
  networkMode?: string;
  privateNetwork?: { isolated?: boolean };
  createdAt?: string;
  updatedAt?: string;
  version?: number;
};

export type ResourceValues = Record<string, number | string | null | undefined>;

export type Worker = {
  id: string;
  name?: string;
  hostname?: string;
  providerNodeId?: string;
  status: string;
  region: string;
  schedulable?: boolean;
  lastHeartbeatAt?: string | null;
  capacity?: ResourceValues;
  allocated?: ResourceValues;
  reserved?: ResourceValues;
  available?: ResourceValues;
  resources?: {
    capacity?: ResourceValues;
    allocated?: ResourceValues;
    available?: ResourceValues;
  };
};

export type WizardField = {
  id?: string;
  name?: string;
  key?: string;
  title?: string;
  label?: string;
  description?: string;
  type?: string;
  format?: string;
  default?: unknown;
  enum?: unknown[];
  enumNames?: string[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  placeholder?: string;
  advanced?: boolean;
  readOnly?: boolean;
  secret?: boolean;
  required?: boolean;
  options?: Array<{ label: string; value: string | number | boolean | null }>;
};

export type WizardStep = {
  id?: string;
  title: string;
  description?: string;
  fields: WizardField[];
};

export type WizardSchema = {
  type?: string;
  title?: string;
  description?: string;
  properties?: Record<string, WizardField>;
  required?: string[];
  fields?: WizardField[];
  steps?: WizardStep[];
  additionalProperties?: boolean;
};

export type ServiceTemplateManifest = {
  id: string;
  manifestVersion: number;
  displayName: string;
  description: string;
  category: string;
  image: { repository: string; tag: string; digest?: string };
  ports: Array<{
    name: string;
    port: number;
    protocol: "tcp" | "udp";
    public: boolean;
  }>;
  variables: Array<{
    key: string;
    label: string;
    description?: string;
    type: "string" | "number" | "boolean" | "secret";
    required: boolean;
    default?: string | number | boolean | null;
  }>;
  volumes: Array<{
    name: string;
    mountPath: string;
    minimumSizeGiB: number;
    defaultSizeGiB: number;
  }>;
  health?: Record<string, unknown>;
  backups: { supported: boolean; consistency: string; paths: string[] };
  configurationSchema: Record<string, unknown>;
  wizard: {
    steps: WizardStep[];
    fieldMappings: Array<{ fieldId: string; path: string }>;
  };
  resourceProfiles: Array<{
    id: string;
    label: string;
    cpuMillicores: number;
    memoryMiB: number;
  }>;
  generatedConfigs: Array<{ path: string; template: string; mode?: number }>;
};

export type ServiceTemplate = {
  id: string;
  manifestVersion: number;
  publicationState: "published" | "draft" | "deprecated";
  publishedAt?: string | null;
  manifest: ServiceTemplateManifest;
};

export type Entitlements = {
  organizationId: string;
  status: "active" | "suspended" | "canceled";
  billingStatus: string;
  validFrom: string;
  validUntil: string | null;
  limits: Record<string, number>;
  reserved: Record<string, number>;
  allocated: Record<string, number>;
};

export type ServiceDraft = {
  id: string;
  organizationId: string;
  projectId: string;
  environmentId: string;
  templateId: string;
  manifestVersion: number;
  name: string;
  values: Record<string, string | number | boolean | null>;
  desiredConfiguration: Record<string, unknown>;
  status: "active" | "submitted" | "abandoned";
  createdAt: string;
  updatedAt: string;
  version: number;
};

export type Member = {
  id: string;
  user: {
    id: string;
    name?: string | null;
    email: string;
    image?: string | null;
  } | null;
  role: { id: string; key: string; name: string } | null;
  status: string;
  joinedAt?: string;
};

function collection<T>(value: T[] | Record<string, unknown>, key: string): T[] {
  if (Array.isArray(value)) return value;
  const nested = value[key];
  return Array.isArray(nested) ? (nested as T[]) : [];
}

function id(value: string): string {
  return encodeURIComponent(value);
}

export function useSelectedOrganization() {
  const organizations = useOrganizations();
  const selectedId = useShellStore((state) => state.selectedOrganizationId);
  const organization =
    organizations.data?.find((item) => item.id === selectedId) ??
    organizations.data?.[0];
  return { organization, organizations };
}

export function useProjects(organizationId?: string, permitted = true) {
  return useQuery({
    queryKey: ["projects", organizationId],
    queryFn: async () =>
      collection<Project>(
        await apiRequest<Project[] | Record<string, unknown>>(
          `/api/organizations/${id(organizationId!)}/projects`,
        ),
        "projects",
      ),
    enabled: Boolean(organizationId && permitted),
  });
}

export function useProject(
  organizationId?: string,
  projectId?: string,
  permitted = true,
) {
  return useQuery({
    queryKey: ["projects", organizationId, projectId],
    queryFn: () =>
      apiRequest<Project>(
        `/api/organizations/${id(organizationId!)}/projects/${id(projectId!)}`,
      ),
    enabled: Boolean(organizationId && projectId && permitted),
  });
}

export function useEnvironments(
  organizationId?: string,
  projectId?: string,
  permitted = true,
) {
  return useQuery({
    queryKey: ["environments", organizationId, projectId],
    queryFn: async () =>
      collection<Environment>(
        await apiRequest<Environment[] | Record<string, unknown>>(
          `/api/organizations/${id(organizationId!)}/projects/${id(projectId!)}/environments`,
        ),
        "environments",
      ),
    enabled: Boolean(organizationId && projectId && permitted),
  });
}

export function useWorkers(organizationId?: string, permitted = true) {
  return useQuery({
    queryKey: ["workers", organizationId],
    queryFn: async () =>
      collection<Worker>(
        await apiRequest<Worker[] | Record<string, unknown>>(
          `/api/workers?organizationId=${id(organizationId!)}`,
        ),
        "workers",
      ),
    enabled: Boolean(organizationId && permitted),
  });
}

export function useServiceTemplates() {
  return useQuery({
    queryKey: ["service-templates"],
    queryFn: async () =>
      collection<ServiceTemplate>(
        await apiRequest<ServiceTemplate[] | Record<string, unknown>>(
          "/api/templates",
        ),
        "templates",
      ),
  });
}

export function useServiceTemplate(templateId?: string) {
  return useQuery({
    queryKey: ["service-templates", templateId],
    queryFn: () =>
      apiRequest<ServiceTemplate>(`/api/templates/${id(templateId!)}`),
    enabled: Boolean(templateId),
  });
}

export function useEntitlements(organizationId?: string, permitted = true) {
  return useQuery({
    queryKey: ["entitlements", organizationId],
    queryFn: () =>
      apiRequest<Entitlements>(
        `/api/organizations/${id(organizationId!)}/entitlements`,
      ),
    enabled: Boolean(organizationId && permitted),
  });
}

export function useServiceDrafts(
  organizationId?: string,
  projectId?: string,
  environmentId?: string,
) {
  return useQuery({
    queryKey: ["service-drafts", organizationId, projectId, environmentId],
    queryFn: async () =>
      collection<ServiceDraft>(
        await apiRequest<ServiceDraft[] | Record<string, unknown>>(
          `/api/organizations/${id(organizationId!)}/projects/${id(projectId!)}/environments/${id(environmentId!)}/drafts`,
        ),
        "drafts",
      ),
    enabled: Boolean(organizationId && projectId && environmentId),
  });
}

export function useMembers(organizationId?: string) {
  return useQuery({
    queryKey: ["members", organizationId],
    queryFn: async () =>
      collection<Member>(
        await apiRequest<Member[] | Record<string, unknown>>(
          `/api/organizations/${id(organizationId!)}/members`,
        ),
        "members",
      ),
    enabled: Boolean(organizationId),
  });
}
