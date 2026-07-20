import Ajv, { type ErrorObject } from "ajv";
import addFormats from "ajv-formats";

import { serviceTemplateManifestSchema } from "@/features/service-templates/schemas";
import type {
  JsonPrimitive,
  NormalizedDesiredConfiguration,
  ServiceTemplateManifest,
  WizardValues,
} from "@/server/domain/service-template";
import { AppError } from "@/server/security/errors";

function configurationError(
  errors: ErrorObject[] | null | undefined,
): AppError {
  return new AppError(
    400,
    "INVALID_WIZARD_VALUES",
    "The wizard values do not satisfy the template configuration schema.",
    errors?.map((error) => ({
      path: error.instancePath,
      keyword: error.keyword,
    })),
  );
}

export function validateWizardValues(
  manifestInput: ServiceTemplateManifest,
  rawValues: unknown,
): WizardValues {
  const manifest = serviceTemplateManifestSchema.parse(manifestInput);
  if (!rawValues || typeof rawValues !== "object" || Array.isArray(rawValues)) {
    throw configurationError(undefined);
  }
  const supplied = rawValues as Record<string, unknown>;
  const fields = manifest.wizard.steps.flatMap((step) => step.fields);
  const fieldIds = new Set(fields.map((field) => field.id));
  if (Object.keys(supplied).some((key) => !fieldIds.has(key))) {
    throw configurationError(undefined);
  }

  const values: WizardValues = {};
  for (const field of fields) {
    const value = Object.hasOwn(supplied, field.id)
      ? supplied[field.id]
      : field.default;
    if (value === undefined) {
      if (field.required) throw configurationError(undefined);
      continue;
    }
    if (
      value !== null &&
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean"
    ) {
      throw configurationError(undefined);
    }
    values[field.id] = value as JsonPrimitive;
    if (
      field.type === "secret" &&
      (typeof value !== "string" ||
        !/^vault:\/\/[A-Za-z0-9._-]{8,160}$/.test(value))
    ) {
      throw new AppError(
        400,
        "SECRET_REFERENCE_REQUIRED",
        "Secret wizard fields must use a Vault reference.",
      );
    }
  }

  const ajv = addFormats(new Ajv({ allErrors: true, strict: true }));
  const validate = ajv.compile(manifest.configurationSchema);
  if (!validate(values)) throw configurationError(validate.errors);
  return values;
}

function applyMapping(
  desired: NormalizedDesiredConfiguration,
  path: string,
  value: JsonPrimitive,
  manifest: ServiceTemplateManifest,
): void {
  if (path === "resources.profileId") {
    if (typeof value !== "string") throw configurationError(undefined);
    const profile = manifest.resourceProfiles.find((item) => item.id === value);
    if (!profile) throw configurationError(undefined);
    desired.resources = {
      profileId: profile.id,
      cpuMillicores: profile.cpuMillicores,
      memoryMiB: profile.memoryMiB,
    };
    return;
  }
  if (path === "backups.enabled") {
    if (typeof value !== "boolean" || !manifest.backups.supported) {
      throw configurationError(undefined);
    }
    desired.backups.enabled = value;
    return;
  }
  if (path === "health.enabled") {
    if (typeof value !== "boolean" || !manifest.health) {
      throw configurationError(undefined);
    }
    desired.health.enabled = value;
    return;
  }

  const parts = path.split(".");
  if (parts[0] === "parameters" && parts.length === 2) {
    desired.parameters[parts[1]] = value;
    return;
  }
  if (parts[0] === "environment" && parts.length === 2) {
    const variable = manifest.variables.find(
      (candidate) => candidate.key === parts[1],
    );
    if (!variable) {
      throw configurationError(undefined);
    }
    if (
      variable.type === "secret" &&
      (typeof value !== "string" ||
        !/^vault:\/\/[A-Za-z0-9._-]{8,160}$/.test(value))
    ) {
      throw new AppError(
        400,
        "SECRET_REFERENCE_REQUIRED",
        "Secret environment variables must use a Vault reference.",
      );
    }
    desired.environment[parts[1]] = value;
    return;
  }
  if (
    parts[0] === "network" &&
    parts[1] === "ports" &&
    parts[3] === "public" &&
    parts.length === 4 &&
    typeof value === "boolean" &&
    desired.network.ports[parts[2]]
  ) {
    desired.network.ports[parts[2]].public = value;
    return;
  }
  if (
    parts[0] === "storage" &&
    parts[1] === "volumes" &&
    parts[3] === "sizeGiB" &&
    parts.length === 4 &&
    typeof value === "number" &&
    Number.isFinite(value) &&
    desired.storage.volumes[parts[2]]
  ) {
    const volume = manifest.volumes.find((item) => item.name === parts[2]);
    if (!volume || value < volume.minimumSizeGiB) {
      throw configurationError(undefined);
    }
    desired.storage.volumes[parts[2]].sizeGiB = value;
    return;
  }
  throw configurationError(undefined);
}

export function buildDesiredConfiguration(
  manifestInput: ServiceTemplateManifest,
  rawValues: unknown,
): {
  values: WizardValues;
  desiredConfiguration: NormalizedDesiredConfiguration;
} {
  const manifest = serviceTemplateManifestSchema.parse(manifestInput);
  const values = validateWizardValues(manifest, rawValues);
  const defaultProfile = manifest.resourceProfiles[0];
  const desired: NormalizedDesiredConfiguration = {
    template: { id: manifest.id, manifestVersion: manifest.manifestVersion },
    image: { ...manifest.image },
    resources: {
      profileId: defaultProfile.id,
      cpuMillicores: defaultProfile.cpuMillicores,
      memoryMiB: defaultProfile.memoryMiB,
    },
    network: {
      ports: Object.fromEntries(
        manifest.ports.map((port) => [
          port.name,
          { port: port.port, protocol: port.protocol, public: port.public },
        ]),
      ),
    },
    environment: Object.fromEntries(
      manifest.variables
        .filter((variable) => variable.default !== undefined)
        .map((variable) => [variable.key, variable.default as JsonPrimitive]),
    ),
    storage: {
      volumes: Object.fromEntries(
        manifest.volumes.map((volume) => [
          volume.name,
          { mountPath: volume.mountPath, sizeGiB: volume.defaultSizeGiB },
        ]),
      ),
    },
    health: {
      enabled: Boolean(manifest.health),
      ...(manifest.health ? { configuration: manifest.health } : {}),
    },
    backups: { ...manifest.backups, enabled: false },
    parameters: {},
    generatedConfigs: manifest.generatedConfigs.map((config) => ({
      ...config,
    })),
  };

  for (const mapping of manifest.wizard.fieldMappings) {
    const value = values[mapping.fieldId];
    if (value !== undefined) {
      applyMapping(desired, mapping.path, value, manifest);
    }
  }
  return { values, desiredConfiguration: desired };
}
