import Ajv from "ajv";
import addFormats from "ajv-formats";
import { z } from "zod";

const identifier = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/);
const templateIdentifier = z
  .string()
  .min(2)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const jsonPrimitiveSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

const portSchema = z
  .object({
    name: identifier,
    port: z.number().int().min(1).max(65535),
    protocol: z.enum(["tcp", "udp"]),
    public: z.boolean(),
  })
  .strict();

const variableSchema = z
  .object({
    key: identifier,
    label: z.string().trim().min(1).max(100),
    description: z.string().trim().max(500).optional(),
    type: z.enum(["string", "number", "boolean", "secret"]),
    required: z.boolean(),
    default: jsonPrimitiveSchema.optional(),
  })
  .strict()
  .superRefine((variable, context) => {
    if (variable.type === "secret" && variable.default !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["default"],
        message: "Secret variables cannot contain manifest defaults.",
      });
    }
  });

const volumeSchema = z
  .object({
    name: identifier,
    mountPath: z
      .string()
      .min(1)
      .max(512)
      .startsWith("/")
      .refine((path) => !path.split("/").includes(".."), "Unsafe volume path"),
    minimumSizeGiB: z.number().finite().nonnegative(),
    defaultSizeGiB: z.number().finite().nonnegative(),
  })
  .strict()
  .refine((volume) => volume.defaultSizeGiB >= volume.minimumSizeGiB, {
    path: ["defaultSizeGiB"],
    message: "The default volume size cannot be below the minimum.",
  });

const healthSchema = z
  .object({
    type: z.enum(["http", "tcp", "command"]),
    portName: identifier.optional(),
    path: z.string().min(1).max(512).startsWith("/").optional(),
    command: z.array(z.string().min(1).max(512)).min(1).max(32).optional(),
    intervalSeconds: z.number().int().min(1).max(3600),
    timeoutSeconds: z.number().int().min(1).max(300),
    failureThreshold: z.number().int().min(1).max(100),
  })
  .strict();

const resourceProfileSchema = z
  .object({
    id: identifier,
    label: z.string().trim().min(1).max(100),
    cpuMillicores: z.number().int().positive(),
    memoryMiB: z.number().int().positive(),
  })
  .strict();

const wizardFieldSchema = z
  .object({
    id: identifier,
    label: z.string().trim().min(1).max(100),
    description: z.string().trim().max(500).optional(),
    type: z.enum(["text", "number", "boolean", "select", "secret"]),
    required: z.boolean(),
    default: jsonPrimitiveSchema.optional(),
    options: z
      .array(
        z
          .object({
            label: z.string().trim().min(1).max(100),
            value: jsonPrimitiveSchema,
          })
          .strict(),
      )
      .min(1)
      .max(100)
      .optional(),
  })
  .strict()
  .superRefine((field, context) => {
    if (field.type === "secret" && field.default !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["default"],
        message: "Secret fields cannot define published defaults.",
      });
    }
    if (field.type === "select" && !field.options) {
      context.addIssue({
        code: "custom",
        path: ["options"],
        message: "Select fields require options.",
      });
    }
    if (field.type !== "select" && field.options) {
      context.addIssue({
        code: "custom",
        path: ["options"],
        message: "Only select fields can define options.",
      });
    }
  });

export const serviceTemplateManifestSchema = z
  .object({
    id: templateIdentifier,
    manifestVersion: z.number().int().positive(),
    displayName: z.string().trim().min(1).max(100),
    description: z.string().trim().min(1).max(2_000),
    category: z.string().trim().min(1).max(80),
    image: z
      .object({
        repository: z
          .string()
          .trim()
          .min(1)
          .max(255)
          .refine(
            (repository) => !repository.split("/").at(-1)?.includes(":"),
            "Put the image tag in image.tag.",
          ),
        tag: z
          .string()
          .trim()
          .min(1)
          .max(128)
          .regex(/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/)
          .refine(
            (tag) => tag.toLowerCase() !== "latest",
            "latest is not pinned",
          ),
        digest: z
          .string()
          .regex(/^sha256:[a-f\d]{64}$/)
          .optional(),
      })
      .strict(),
    ports: z.array(portSchema).max(100),
    variables: z.array(variableSchema).max(500),
    volumes: z.array(volumeSchema).max(100),
    health: healthSchema.optional(),
    resourceProfiles: z.array(resourceProfileSchema).min(1).max(100),
    backups: z
      .object({
        supported: z.boolean(),
        consistency: z.enum(["filesystem", "application"]),
        paths: z.array(z.string().min(1).max(512).startsWith("/")).max(100),
      })
      .strict(),
    configurationSchema: z.record(z.string(), z.unknown()),
    wizard: z
      .object({
        steps: z
          .array(
            z
              .object({
                id: identifier,
                title: z.string().trim().min(1).max(100),
                description: z.string().trim().max(500).optional(),
                fields: z.array(wizardFieldSchema).min(1).max(100),
              })
              .strict(),
          )
          .min(1)
          .max(100),
        fieldMappings: z
          .array(
            z
              .object({
                fieldId: identifier,
                path: z.string().min(1).max(255),
              })
              .strict(),
          )
          .min(1)
          .max(500),
      })
      .strict(),
    generatedConfigs: z
      .array(
        z
          .object({
            path: z
              .string()
              .min(1)
              .max(512)
              .startsWith("/")
              .refine(
                (path) => !path.split("/").includes(".."),
                "Unsafe generated config path",
              ),
            template: z
              .string()
              .min(1)
              .max(64 * 1024),
            mode: z.number().int().min(0).max(0o777).optional(),
          })
          .strict(),
      )
      .max(100),
  })
  .strict()
  .superRefine((manifest, context) => {
    const checkUnique = (values: string[], path: string) => {
      const seen = new Set<string>();
      for (const value of values) {
        if (seen.has(value)) {
          context.addIssue({
            code: "custom",
            path: [path],
            message: `${value} is duplicated.`,
          });
        }
        seen.add(value);
      }
    };
    checkUnique(
      manifest.ports.map((port) => port.name),
      "ports",
    );
    checkUnique(
      manifest.ports.map((port) => `${port.protocol}:${port.port}`),
      "ports",
    );
    checkUnique(
      manifest.variables.map((variable) => variable.key),
      "variables",
    );
    checkUnique(
      manifest.volumes.map((volume) => volume.name),
      "volumes",
    );
    checkUnique(
      manifest.resourceProfiles.map((profile) => profile.id),
      "resourceProfiles",
    );
    checkUnique(
      manifest.wizard.steps.map((step) => step.id),
      "wizard.steps",
    );
    checkUnique(
      manifest.generatedConfigs.map((config) => config.path),
      "generatedConfigs",
    );

    const fields = manifest.wizard.steps.flatMap((step) => step.fields);
    checkUnique(
      fields.map((field) => field.id),
      "wizard.steps.fields",
    );
    checkUnique(
      manifest.wizard.fieldMappings.map((mapping) => mapping.fieldId),
      "wizard.fieldMappings",
    );
    const fieldIds = new Set(fields.map((field) => field.id));
    const mappings = new Map(
      manifest.wizard.fieldMappings.map((mapping) => [
        mapping.fieldId,
        mapping.path,
      ]),
    );
    for (const fieldId of fieldIds) {
      if (!mappings.has(fieldId)) {
        context.addIssue({
          code: "custom",
          path: ["wizard", "fieldMappings"],
          message: `Wizard field ${fieldId} has no mapping.`,
        });
      }
    }
    for (const [fieldId, path] of mappings) {
      if (!fieldIds.has(fieldId)) {
        context.addIssue({
          code: "custom",
          path: ["wizard", "fieldMappings"],
          message: `Mapping ${fieldId} has no wizard field.`,
        });
      }
      if (!isValidMappingPath(path, manifest)) {
        context.addIssue({
          code: "custom",
          path: ["wizard", "fieldMappings"],
          message: `Mapping ${fieldId} targets an unknown normalized path.`,
        });
      }
      const field = fields.find((candidate) => candidate.id === fieldId);
      const variableKey = path.startsWith("environment.")
        ? path.slice("environment.".length)
        : null;
      const variable = variableKey
        ? manifest.variables.find((candidate) => candidate.key === variableKey)
        : null;
      if (field?.type === "secret") {
        if (variable?.type !== "secret") {
          context.addIssue({
            code: "custom",
            path: ["wizard", "fieldMappings"],
            message: `Secret field ${fieldId} must map to a secret environment variable.`,
          });
        }
      }
      if (variable?.type === "secret" && field?.type !== "secret") {
        context.addIssue({
          code: "custom",
          path: ["wizard", "fieldMappings"],
          message: `Secret environment variable ${variable.key} must map from a secret field.`,
        });
      }
      if (path === "resources.profileId") {
        const profileIds = new Set(
          manifest.resourceProfiles.map((profile) => profile.id),
        );
        if (
          field?.type !== "select" ||
          field.options?.some(
            (option) =>
              typeof option.value !== "string" || !profileIds.has(option.value),
          )
        ) {
          context.addIssue({
            code: "custom",
            path: ["wizard", "fieldMappings"],
            message: `Resource profile field ${fieldId} must select declared profile IDs.`,
          });
        }
      }
      if (path.startsWith("storage.volumes.") && field?.type !== "number") {
        context.addIssue({
          code: "custom",
          path: ["wizard", "fieldMappings"],
          message: `Volume size field ${fieldId} must be numeric.`,
        });
      }
      if (
        (path === "backups.enabled" ||
          path === "health.enabled" ||
          path.startsWith("network.ports.")) &&
        field?.type !== "boolean"
      ) {
        context.addIssue({
          code: "custom",
          path: ["wizard", "fieldMappings"],
          message: `Toggle field ${fieldId} must be boolean.`,
        });
      }
      if (field && variable && variable.type !== "secret") {
        const expectedType =
          variable.type === "string" ? "text" : variable.type;
        const compatibleSelect =
          field.type === "select" &&
          field.options?.every(
            (option) =>
              option.value === null || typeof option.value === variable.type,
          );
        if (field.type !== expectedType && !compatibleSelect) {
          context.addIssue({
            code: "custom",
            path: ["wizard", "fieldMappings"],
            message: `Environment field ${fieldId} is incompatible with ${variable.type}.`,
          });
        }
      }
    }

    if (manifest.health?.type === "http") {
      if (!manifest.health.path || !manifest.health.portName) {
        context.addIssue({
          code: "custom",
          path: ["health"],
          message: "HTTP health checks require path and portName.",
        });
      }
    }
    if (manifest.health?.type === "tcp" && !manifest.health.portName) {
      context.addIssue({
        code: "custom",
        path: ["health", "portName"],
        message: "TCP health checks require portName.",
      });
    }
    if (manifest.health?.type === "command" && !manifest.health.command) {
      context.addIssue({
        code: "custom",
        path: ["health", "command"],
        message: "Command health checks require a command.",
      });
    }
    if (
      manifest.health?.portName &&
      !manifest.ports.some((port) => port.name === manifest.health?.portName)
    ) {
      context.addIssue({
        code: "custom",
        path: ["health", "portName"],
        message: "The health check references an unknown port.",
      });
    }
    if (!manifest.backups.supported && manifest.backups.paths.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["backups", "paths"],
        message: "Unsupported backups cannot define backup paths.",
      });
    }

    try {
      const ajv = addFormats(new Ajv({ allErrors: true, strict: true }));
      ajv.compile(manifest.configurationSchema);
    } catch {
      context.addIssue({
        code: "custom",
        path: ["configurationSchema"],
        message: "The configuration JSON Schema is invalid.",
      });
    }
    if (
      fields.some((field) => field.type === "secret") &&
      containsDefaultAnnotation(manifest.configurationSchema)
    ) {
      context.addIssue({
        code: "custom",
        path: ["configurationSchema"],
        message:
          "Configuration schemas cannot contain defaults when secret fields are present.",
      });
    }
    const schemaProperties = manifest.configurationSchema.properties;
    if (
      !schemaProperties ||
      typeof schemaProperties !== "object" ||
      Array.isArray(schemaProperties)
    ) {
      context.addIssue({
        code: "custom",
        path: ["configurationSchema", "properties"],
        message: "The configuration schema must declare wizard properties.",
      });
    } else {
      const properties = schemaProperties as Record<string, unknown>;
      for (const fieldId of fieldIds) {
        if (!(fieldId in properties)) {
          context.addIssue({
            code: "custom",
            path: ["configurationSchema", "properties"],
            message: `The schema does not define wizard field ${fieldId}.`,
          });
        }
      }
      const profileMapping = manifest.wizard.fieldMappings.find(
        (mapping) => mapping.path === "resources.profileId",
      );
      const profileField = fields.find(
        (field) => field.id === profileMapping?.fieldId,
      );
      if (
        profileMapping &&
        profileField?.options?.some(
          (option) =>
            !configurationPropertyAccepts(
              manifest.configurationSchema,
              profileMapping.fieldId,
              option.value,
            ),
        )
      ) {
        context.addIssue({
          code: "custom",
          path: ["configurationSchema", "properties", profileMapping.fieldId],
          message:
            "Resource profile options must satisfy their configuration schema.",
        });
      }
    }
  });

function containsDefaultAnnotation(value: unknown): boolean {
  const pending = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || typeof current !== "object") continue;
    if (!Array.isArray(current) && Object.hasOwn(current, "default")) {
      return true;
    }
    pending.push(...Object.values(current));
  }
  return false;
}

function configurationPropertyAccepts(
  configurationSchema: Record<string, unknown>,
  fieldId: string,
  value: unknown,
): boolean {
  try {
    const ajv = addFormats(new Ajv({ allErrors: true, strict: true }));
    ajv.addSchema(configurationSchema, "manifest-configuration");
    const validate = ajv.compile({
      $ref: `manifest-configuration#/properties/${fieldId}`,
    });
    return Boolean(validate(value));
  } catch {
    return false;
  }
}

type MappingManifest = {
  ports: Array<{ name: string }>;
  variables: Array<{ key: string }>;
  volumes: Array<{ name: string }>;
  backups: { supported: boolean };
  health?: unknown;
};

export function isValidMappingPath(
  path: string,
  manifest: MappingManifest,
): boolean {
  if (path === "resources.profileId") return true;
  if (path === "backups.enabled") return manifest.backups.supported;
  if (path === "health.enabled") return Boolean(manifest.health);

  const parts = path.split(".");
  if (parts.length === 2 && parts[0] === "parameters") {
    return identifier.safeParse(parts[1]).success;
  }
  if (parts.length === 2 && parts[0] === "environment") {
    return manifest.variables.some((variable) => variable.key === parts[1]);
  }
  if (
    parts.length === 4 &&
    parts[0] === "network" &&
    parts[1] === "ports" &&
    parts[3] === "public"
  ) {
    return manifest.ports.some((port) => port.name === parts[2]);
  }
  if (
    parts.length === 4 &&
    parts[0] === "storage" &&
    parts[1] === "volumes" &&
    parts[3] === "sizeGiB"
  ) {
    return manifest.volumes.some((volume) => volume.name === parts[2]);
  }
  return false;
}

export type ParsedServiceTemplateManifest = z.infer<
  typeof serviceTemplateManifestSchema
>;
