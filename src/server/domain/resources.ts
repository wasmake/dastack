export type ReservableResources = {
  cpuMillicores: number;
  memoryMiB: number;
  storageGiB: number;
  transferGiB: number;
  backups: number;
  concurrentOperations: number;
};

export type ResourceQuotaLimits = ReservableResources & {
  projects: number;
  environments: number;
  services: number;
};

export type ResourceQuotaCounters = ResourceQuotaLimits;

export type ResourceEntitlements = {
  organizationId: string;
  status: "active" | "suspended" | "canceled";
  billingStatus: "trialing" | "active" | "past_due" | "suspended" | "canceled";
  validFrom: Date;
  validUntil: Date | null;
  limits: ResourceQuotaLimits;
  reserved: ResourceQuotaCounters;
  allocated: ResourceQuotaCounters;
};

export type WorkerResourceCapacity = Pick<
  ReservableResources,
  "cpuMillicores" | "memoryMiB" | "storageGiB" | "concurrentOperations"
>;

export type ResourceReservationState = "reserved" | "confirmed" | "released";
