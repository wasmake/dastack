export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type ServiceTemplatePort = {
  name: string;
  port: number;
  protocol: "tcp" | "udp";
  public: boolean;
};

export type ServiceTemplateVariable = {
  key: string;
  label: string;
  description?: string;
  type: "string" | "number" | "boolean" | "secret";
  required: boolean;
  default?: JsonPrimitive;
};

export type ServiceTemplateVolume = {
  name: string;
  mountPath: string;
  minimumSizeGiB: number;
  defaultSizeGiB: number;
};

export type ServiceTemplateHealth = {
  type: "http" | "tcp" | "command";
  portName?: string;
  path?: string;
  command?: string[];
  intervalSeconds: number;
  timeoutSeconds: number;
  failureThreshold: number;
};

export type ServiceTemplateResourceProfile = {
  id: string;
  label: string;
  cpuMillicores: number;
  memoryMiB: number;
};

export type ServiceTemplateBackupCapabilities = {
  supported: boolean;
  consistency: "filesystem" | "application";
  paths: string[];
};

export type ServiceTemplateWizardField = {
  id: string;
  label: string;
  description?: string;
  type: "text" | "number" | "boolean" | "select" | "secret";
  required: boolean;
  default?: JsonPrimitive;
  options?: Array<{ label: string; value: JsonPrimitive }>;
};

export type ServiceTemplateWizardStep = {
  id: string;
  title: string;
  description?: string;
  fields: ServiceTemplateWizardField[];
};

export type ServiceTemplateFieldMapping = {
  fieldId: string;
  path: string;
};

export type ServiceTemplateGeneratedConfig = {
  path: string;
  template: string;
  mode?: number;
};

export type ServiceTemplateManifest = {
  id: string;
  manifestVersion: number;
  displayName: string;
  description: string;
  category: string;
  image: {
    repository: string;
    tag: string;
    digest?: string;
  };
  ports: ServiceTemplatePort[];
  variables: ServiceTemplateVariable[];
  volumes: ServiceTemplateVolume[];
  health?: ServiceTemplateHealth;
  resourceProfiles: ServiceTemplateResourceProfile[];
  backups: ServiceTemplateBackupCapabilities;
  configurationSchema: Record<string, unknown>;
  wizard: {
    steps: ServiceTemplateWizardStep[];
    fieldMappings: ServiceTemplateFieldMapping[];
  };
  generatedConfigs: ServiceTemplateGeneratedConfig[];
};

export type WizardValues = Record<string, JsonPrimitive>;

export type NormalizedDesiredConfiguration = {
  template: { id: string; manifestVersion: number };
  image: { repository: string; tag: string; digest?: string };
  resources: {
    profileId: string;
    cpuMillicores: number;
    memoryMiB: number;
  };
  network: {
    ports: Record<
      string,
      { port: number; protocol: "tcp" | "udp"; public: boolean }
    >;
  };
  environment: Record<string, JsonPrimitive>;
  storage: {
    volumes: Record<string, { mountPath: string; sizeGiB: number }>;
  };
  health: { enabled: boolean; configuration?: ServiceTemplateHealth };
  backups: ServiceTemplateBackupCapabilities & { enabled: boolean };
  parameters: Record<string, JsonPrimitive>;
  generatedConfigs: ServiceTemplateGeneratedConfig[];
};
