import { describe, expect, it } from "vitest";
import { Types } from "mongoose";

import { serviceTemplateManifestSchema } from "@/features/service-templates/schemas";
import { buildDesiredConfiguration } from "@/features/service-templates/wizard";
import { ServiceTemplateModel } from "@/server/db/control-plane-models";
import type { ServiceTemplateManifest } from "@/server/domain/service-template";

function manifest(): ServiceTemplateManifest {
  return {
    id: "postgresql",
    manifestVersion: 1,
    displayName: "PostgreSQL",
    description: "A test database template.",
    category: "database",
    image: { repository: "docker.io/library/postgres", tag: "16.3" },
    ports: [{ name: "database", port: 5432, protocol: "tcp", public: false }],
    variables: [
      {
        key: "DATABASE_NAME",
        label: "Database name",
        type: "string",
        required: true,
      },
    ],
    volumes: [
      {
        name: "data",
        mountPath: "/var/lib/postgresql/data",
        minimumSizeGiB: 1,
        defaultSizeGiB: 5,
      },
    ],
    resourceProfiles: [
      { id: "small", label: "Small", cpuMillicores: 500, memoryMiB: 512 },
      { id: "large", label: "Large", cpuMillicores: 1_000, memoryMiB: 2_048 },
    ],
    backups: { supported: false, consistency: "filesystem", paths: [] },
    configurationSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        profile: { type: "string", enum: ["small", "large"] },
        public: { type: "boolean" },
        size: { type: "number", minimum: 1 },
        databaseName: { type: "string", minLength: 1 },
      },
      required: ["profile", "public", "size", "databaseName"],
    },
    wizard: {
      steps: [
        {
          id: "configuration",
          title: "Configuration",
          fields: [
            {
              id: "profile",
              label: "Profile",
              type: "select",
              required: true,
              options: [
                { label: "Small", value: "small" },
                { label: "Large", value: "large" },
              ],
            },
            { id: "public", label: "Public", type: "boolean", required: true },
            { id: "size", label: "Size", type: "number", required: true },
            {
              id: "databaseName",
              label: "Database name",
              type: "text",
              required: true,
            },
          ],
        },
      ],
      fieldMappings: [
        { fieldId: "profile", path: "resources.profileId" },
        { fieldId: "public", path: "network.ports.database.public" },
        { fieldId: "size", path: "storage.volumes.data.sizeGiB" },
        { fieldId: "databaseName", path: "environment.DATABASE_NAME" },
      ],
    },
    generatedConfigs: [],
  };
}

describe("service template validation", () => {
  it("rejects latest and implicit image tags", () => {
    const latest = manifest();
    latest.image.tag = "latest";
    expect(serviceTemplateManifestSchema.safeParse(latest).success).toBe(false);

    const implicit = manifest();
    implicit.image.repository = "docker.io/library/postgres:16";
    expect(serviceTemplateManifestSchema.safeParse(implicit).success).toBe(
      false,
    );
  });

  it("rejects invalid JSON Schema and mappings without real targets", () => {
    const invalidSchema = manifest();
    invalidSchema.configurationSchema = { type: "not-a-json-schema-type" };
    expect(serviceTemplateManifestSchema.safeParse(invalidSchema).success).toBe(
      false,
    );

    const invalidMapping = manifest();
    invalidMapping.wizard.fieldMappings[0].path = "provider.docker.image";
    expect(
      serviceTemplateManifestSchema.safeParse(invalidMapping).success,
    ).toBe(false);

    const invalidProfileOption = manifest();
    invalidProfileOption.wizard.steps[0].fields[0].options = [
      { label: "Missing", value: "missing" },
    ];
    expect(
      serviceTemplateManifestSchema.safeParse(invalidProfileOption).success,
    ).toBe(false);

    const incompatibleProfileSchema = manifest();
    incompatibleProfileSchema.configurationSchema = {
      ...incompatibleProfileSchema.configurationSchema,
      properties: {
        ...(incompatibleProfileSchema.configurationSchema.properties as Record<
          string,
          unknown
        >),
        profile: { type: "string", enum: ["large"] },
      },
    };
    expect(
      serviceTemplateManifestSchema.safeParse(incompatibleProfileSchema)
        .success,
    ).toBe(false);
  });

  it("rejects non-secret fields mapped to secret environment variables", () => {
    const unsafe = manifest();
    unsafe.variables[0].type = "secret";
    expect(serviceTemplateManifestSchema.safeParse(unsafe).success).toBe(false);
  });

  it("rejects published defaults for secret fields", () => {
    const unsafe = manifest();
    unsafe.variables[0].type = "secret";
    unsafe.wizard.steps[0].fields[3] = {
      id: "databaseName",
      label: "Database name",
      type: "secret",
      required: true,
      default: "literal-secret",
    };

    expect(serviceTemplateManifestSchema.safeParse(unsafe).success).toBe(false);
  });

  it("rejects JSON Schema defaults for secret fields", () => {
    const unsafe = manifest();
    unsafe.variables[0].type = "secret";
    unsafe.wizard.steps[0].fields[3] = {
      id: "databaseName",
      label: "Database name",
      type: "secret",
      required: true,
    };
    unsafe.configurationSchema = {
      ...unsafe.configurationSchema,
      properties: {
        ...(unsafe.configurationSchema.properties as Record<string, unknown>),
        databaseName: {
          type: "string",
          allOf: [{ default: "literal-secret" }],
        },
      },
    };

    expect(serviceTemplateManifestSchema.safeParse(unsafe).success).toBe(false);
  });

  it("maps validated wizard values to provider-neutral desired configuration", () => {
    const result = buildDesiredConfiguration(manifest(), {
      profile: "large",
      public: true,
      size: 20,
      databaseName: "customer_data",
    });

    expect(result.desiredConfiguration.resources).toEqual({
      profileId: "large",
      cpuMillicores: 1_000,
      memoryMiB: 2_048,
    });
    expect(result.desiredConfiguration.network.ports.database.public).toBe(
      true,
    );
    expect(result.desiredConfiguration.storage.volumes.data.sizeGiB).toBe(20);
    expect(result.desiredConfiguration.environment.DATABASE_NAME).toBe(
      "customer_data",
    );
    expect(result.desiredConfiguration).not.toHaveProperty("docker");
  });

  it("preserves explicitly supplied null values instead of applying defaults", () => {
    const nullable = manifest();
    const field = nullable.wizard.steps[0].fields.find(
      (candidate) => candidate.id === "databaseName",
    )!;
    field.default = "fallback";
    nullable.configurationSchema = {
      ...nullable.configurationSchema,
      properties: {
        ...(nullable.configurationSchema.properties as Record<string, unknown>),
        databaseName: { type: ["string", "null"] },
      },
    };
    const result = buildDesiredConfiguration(nullable, {
      profile: "small",
      public: false,
      size: 5,
      databaseName: null,
    });
    expect(result.values.databaseName).toBeNull();
    expect(result.desiredConfiguration.environment.DATABASE_NAME).toBeNull();
  });

  it("retains a valid manifest shape through strict Mongoose casting", async () => {
    const actorId = new Types.ObjectId();
    const document = new ServiceTemplateModel({
      organizationId: null,
      templateId: "postgresql",
      manifestVersion: 1,
      manifest: manifest(),
      manifestHash: "a".repeat(64),
      publicationState: "published",
      publishedAt: new Date(),
      deprecatedAt: null,
      createdBy: actorId,
      updatedBy: actorId,
    });

    await expect(document.validate()).resolves.toBeUndefined();
    expect(
      serviceTemplateManifestSchema.safeParse(document.toObject().manifest)
        .success,
    ).toBe(true);
  });
});
