import type {
  ReservableResources,
  ResourceQuotaCounters,
  ResourceQuotaLimits,
} from "@/server/domain/resources";

export const reservableKeys = [
  "cpuMillicores",
  "memoryMiB",
  "storageGiB",
  "transferGiB",
  "backups",
  "concurrentOperations",
] as const;

export const quotaKeys = [
  ...reservableKeys,
  "projects",
  "environments",
  "services",
] as const;

export function reservationQuotaDelta(
  resources: ReservableResources,
): ResourceQuotaCounters {
  return {
    cpuMillicores: resources.cpuMillicores,
    memoryMiB: resources.memoryMiB,
    storageGiB: resources.storageGiB,
    transferGiB: resources.transferGiB,
    backups: resources.backups,
    concurrentOperations: resources.concurrentOperations,
    projects: 0,
    environments: 0,
    services: 1,
  };
}

export function quotaExceeded(
  limits: ResourceQuotaLimits,
  reserved: ResourceQuotaCounters,
  allocated: ResourceQuotaCounters,
  requested: ResourceQuotaCounters,
  currentCounts?: { projects: number; environments: number },
): (typeof quotaKeys)[number] | null {
  for (const key of quotaKeys) {
    const current =
      key === "projects" && currentCounts
        ? currentCounts.projects
        : key === "environments" && currentCounts
          ? currentCounts.environments
          : reserved[key] + allocated[key];
    if (current + requested[key] > limits[key]) return key;
  }
  return null;
}
