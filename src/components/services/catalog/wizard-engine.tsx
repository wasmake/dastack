"use client";

import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import { ChevronLeft, ChevronRight, FileCheck2, Save } from "lucide-react";
import { useEffect, useState } from "react";
import {
  useForm,
  useWatch,
  type FieldErrors,
  type Resolver,
} from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  ServiceTemplate,
  WizardField,
  WizardSchema,
  WizardStep,
} from "@/hooks/use-phase-two";

type Configuration = Record<string, unknown>;
type Field = WizardField & { name: string; required: boolean };
type Step = Omit<WizardStep, "fields"> & { fields: Field[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function configurationPropertyAllowsNull(
  schema: WizardSchema,
  fieldName: string,
): boolean {
  try {
    const configurationSchema = { ...schema } as Record<string, unknown>;
    delete configurationSchema.steps;
    delete configurationSchema.fields;
    const ajv = addFormats(new Ajv({ allErrors: true, strict: false }));
    ajv.addSchema(configurationSchema, "wizard-configuration");
    const pointer = fieldName.replaceAll("~", "~0").replaceAll("/", "~1");
    const validate = ajv.compile({
      $ref: `wizard-configuration#/properties/${pointer}`,
    });
    return Boolean(validate(null));
  } catch {
    return false;
  }
}

function steps(schema: WizardSchema): Step[] {
  const required = new Set(schema.required ?? []);
  const properties = schema.properties ?? {};
  if (schema.steps?.length)
    return schema.steps.map((step, stepIndex) => ({
      ...step,
      id: step.id ?? `step-${stepIndex + 1}`,
      fields: step.fields.flatMap((field) => {
        const name = field.name ?? field.key ?? field.id;
        if (!name) return [];
        const property = properties[name] ?? {};
        const options = field.options;
        return [
          {
            ...property,
            ...field,
            name,
            type:
              field.type === "text" ||
              field.type === "secret" ||
              field.type === "select"
                ? (property.type ?? "string")
                : field.type,
            secret: field.type === "secret",
            enum: options?.map((option) => option.value) ?? property.enum,
            enumNames:
              options?.map((option) => option.label) ?? property.enumNames,
            required: field.required ?? required.has(name),
          },
        ];
      }),
    }));
  if (schema.fields?.length)
    return [
      {
        id: "configuration",
        title: schema.title ?? "Configuration",
        description: schema.description,
        fields: schema.fields.flatMap((field) => {
          const name = field.name ?? field.key ?? field.id;
          return name
            ? [
                {
                  ...field,
                  name,
                  required: field.required ?? required.has(name),
                },
              ]
            : [];
        }),
      },
    ];
  const fields = Object.entries(schema.properties ?? {}).map(
    ([name, field]) => ({
      ...field,
      name,
      required: required.has(name),
    }),
  );
  return [
    {
      id: "configuration",
      title: schema.title ?? "Configuration",
      description: schema.description,
      fields,
    },
  ];
}

function validationSchema(
  schema: WizardSchema,
  allSteps: Step[],
  template: ServiceTemplate,
): Record<string, unknown> {
  const jsonSchema = { ...schema } as Record<string, unknown>;
  delete jsonSchema.steps;
  delete jsonSchema.fields;
  const properties: Record<string, unknown> = { ...(schema.properties ?? {}) };
  const required = new Set(schema.required ?? []);
  for (const field of allSteps.flatMap((step) => step.fields)) {
    const jsonField = { ...field } as Record<string, unknown>;
    for (const key of [
      "id",
      "name",
      "key",
      "required",
      "label",
      "advanced",
      "secret",
      "options",
      "enumNames",
      "placeholder",
    ]) {
      delete jsonField[key];
    }
    if (field.secret) {
      jsonField.type = "string";
      jsonField.pattern = "^vault://[A-Za-z0-9._-]{8,160}$";
    }
    properties[field.name] = jsonField;
    if (field.required) required.add(field.name);
  }
  for (const mapping of template.manifest.wizard.fieldMappings) {
    const existingProperty = properties[mapping.fieldId];
    const property: Record<string, unknown> = isRecord(existingProperty)
      ? { ...existingProperty }
      : {};
    if (mapping.path === "resources.profileId") {
      property.type = "string";
      property.enum = template.manifest.resourceProfiles.map(
        (profile) => profile.id,
      );
    } else if (
      mapping.path === "backups.enabled" ||
      mapping.path === "health.enabled" ||
      /^network\.ports\.[A-Za-z0-9_-]+\.public$/.test(mapping.path)
    ) {
      property.type = "boolean";
    } else if (mapping.path.startsWith("storage.volumes.")) {
      const volumeName = mapping.path.split(".")[2];
      const volume = template.manifest.volumes.find(
        (candidate) => candidate.name === volumeName,
      );
      if (volume) {
        property.type = "number";
        property.minimum = Math.max(
          typeof property.minimum === "number"
            ? property.minimum
            : Number.NEGATIVE_INFINITY,
          volume.minimumSizeGiB,
        );
      }
    } else if (mapping.path.startsWith("environment.")) {
      const variable = template.manifest.variables.find(
        (candidate) =>
          candidate.key === mapping.path.slice("environment.".length),
      );
      if (variable) {
        const type = variable.type === "secret" ? "string" : variable.type;
        const nullable =
          variable.type !== "secret" &&
          configurationPropertyAllowsNull(schema, mapping.fieldId);
        property.type = nullable ? [type, "null"] : type;
        if (variable.type === "secret") {
          property.pattern = "^vault://[A-Za-z0-9._-]{8,160}$";
        }
      }
    }
    properties[mapping.fieldId] = property;
  }
  return {
    ...jsonSchema,
    type: "object",
    properties,
    required: [...required],
    additionalProperties: schema.additionalProperties ?? false,
  };
}

function errorField(error: ErrorObject): string | undefined {
  if (
    error.keyword === "required" &&
    isRecord(error.params) &&
    typeof error.params.missingProperty === "string"
  )
    return error.params.missingProperty;
  return error.instancePath.split("/").filter(Boolean)[0];
}

function resolver(validator: ValidateFunction): Resolver<Configuration> {
  return async (values) => {
    if (validator(values)) return { values, errors: {} };
    const errors: FieldErrors<Configuration> = {};
    for (const error of validator.errors ?? []) {
      const name = errorField(error);
      if (name && !errors[name])
        errors[name] = {
          type: error.keyword,
          message: error.message ?? "Invalid value",
        };
    }
    return { values: {}, errors };
  };
}

function initialValues(allSteps: Step[], saved?: Configuration): Configuration {
  const values: Configuration = {};
  for (const field of allSteps.flatMap((step) => step.fields)) {
    if (field.default !== undefined) values[field.name] = field.default;
  }
  return { ...values, ...saved };
}

function normalize(values: Configuration, fields: Field[]): Configuration {
  const normalized: Configuration = {};
  for (const field of fields) {
    const value = values[field.name];
    if (
      value === undefined ||
      (typeof value === "number" && Number.isNaN(value))
    )
      continue;
    normalized[field.name] = value;
  }
  return normalized;
}

function optionValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function FieldControl({
  field,
  form,
}: {
  field: Field;
  form: ReturnType<typeof useForm<Configuration>>;
}) {
  const error = form.formState.errors[field.name];
  const label = field.label ?? field.title ?? field.name;
  if (field.type === "boolean") {
    return (
      <div className="rounded-md border bg-background p-3">
        <label className="flex min-h-10 items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-primary"
            {...form.register(field.name)}
          />
          <span>
            <span className="font-medium">{label}</span>
            {field.description && (
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                {field.description}
              </span>
            )}
          </span>
        </label>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`wizard-${field.name}`}>
        {label}
        {field.required && <span className="text-danger"> *</span>}
      </Label>
      {field.enum ? (
        <select
          id={`wizard-${field.name}`}
          className="h-10 w-full rounded-md border border-border-strong bg-background px-3 text-sm"
          {...form.register(field.name, {
            setValueAs: (value) =>
              field.enum?.find((option) => optionValue(option) === value),
          })}
          defaultValue={
            field.default === undefined ? "" : optionValue(field.default)
          }
          aria-invalid={Boolean(error)}
        >
          <option value="">Select an option</option>
          {field.enum.map((option, index) => (
            <option key={optionValue(option)} value={optionValue(option)}>
              {field.enumNames?.[index] ?? String(option)}
            </option>
          ))}
        </select>
      ) : field.format === "textarea" ? (
        <textarea
          id={`wizard-${field.name}`}
          rows={4}
          placeholder={
            field.secret ? "vault://reference-name" : field.placeholder
          }
          readOnly={field.readOnly}
          className="w-full resize-y rounded-md border border-border-strong bg-background px-3 py-2 font-mono text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
          {...form.register(field.name)}
          aria-invalid={Boolean(error)}
        />
      ) : (
        <Input
          id={`wizard-${field.name}`}
          type={
            field.secret || field.format === "password"
              ? "password"
              : ["number", "integer"].includes(field.type ?? "")
                ? "number"
                : "text"
          }
          min={field.minimum}
          max={field.maximum}
          minLength={field.minLength}
          maxLength={field.maxLength}
          placeholder={field.placeholder}
          readOnly={field.readOnly}
          {...form.register(field.name, {
            setValueAs: ["number", "integer"].includes(field.type ?? "")
              ? (value) => (value === "" ? undefined : Number(value))
              : undefined,
          })}
          aria-invalid={Boolean(error)}
        />
      )}
      {field.description && (
        <p className="text-xs leading-5 text-muted-foreground">
          {field.description}
        </p>
      )}
      {error?.message && (
        <p className="text-xs text-danger">{String(error.message)}</p>
      )}
    </div>
  );
}

function desiredConfiguration(
  template: ServiceTemplate,
  values: Configuration,
  maskSecrets = false,
) {
  const manifest = template.manifest;
  const defaultProfile = manifest.resourceProfiles[0];
  const desired: Record<string, unknown> = {
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
        .map((variable) => [variable.key, variable.default]),
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
    generatedConfigs: manifest.generatedConfigs,
  };
  const fieldById = new Map(
    manifest.wizard.steps
      .flatMap((step) => step.fields)
      .map((field) => [field.id, field]),
  );
  for (const mapping of manifest.wizard.fieldMappings) {
    let value = values[mapping.fieldId];
    if (value === undefined) continue;
    if (maskSecrets && fieldById.get(mapping.fieldId)?.type === "secret")
      value = "[secret]";
    const parts = mapping.path.split(".");
    let target = desired;
    for (const part of parts.slice(0, -1)) {
      const next = target[part];
      if (!isRecord(next)) break;
      target = next;
    }
    target[parts.at(-1)!] = value;
    if (mapping.path === "resources.profileId" && typeof value === "string") {
      const profile = manifest.resourceProfiles.find(
        (item) => item.id === value,
      );
      if (profile)
        desired.resources = {
          profileId: profile.id,
          cpuMillicores: profile.cpuMillicores,
          memoryMiB: profile.memoryMiB,
        };
    }
  }
  return desired;
}

export function WizardEngine({
  template,
  savedConfiguration,
  saving,
  saveError,
  saveRevision,
  onSave,
}: {
  template: ServiceTemplate;
  savedConfiguration?: Configuration;
  saving: boolean;
  saveError?: string;
  saveRevision: number;
  onSave: (configuration: Configuration) => void;
}) {
  const schema = {
    ...template.manifest.configurationSchema,
    steps: template.manifest.wizard.steps,
  } as WizardSchema;
  const allSteps = steps(schema);
  const fields = allSteps.flatMap((step) => step.fields);
  const [validator] = useState(() =>
    addFormats(
      new Ajv({ allErrors: true, strict: false, coerceTypes: false }),
    ).compile(validationSchema(schema, allSteps, template)),
  );
  const form = useForm<Configuration>({
    resolver: resolver(validator),
    mode: "onChange",
    reValidateMode: "onChange",
    defaultValues: initialValues(allSteps, savedConfiguration),
  });
  const [stepIndex, setStepIndex] = useState(0);
  const [review, setReview] = useState(false);
  const [submittedConfiguration, setSubmittedConfiguration] =
    useState<Configuration | null>(null);
  useEffect(() => {
    if (saveRevision > 0 && submittedConfiguration) {
      form.reset(submittedConfiguration);
    }
  }, [form, saveRevision, submittedConfiguration]);
  const current = allSteps[stepIndex];
  const watchedValues = useWatch({ control: form.control });
  const configuration = normalize(watchedValues as Configuration, fields);
  const profileField = template.manifest.wizard.fieldMappings.find(
    (mapping) => mapping.path === "resources.profileId",
  )?.fieldId;
  const selectedProfileId = profileField
    ? configuration[profileField]
    : undefined;
  const resourceProfile =
    template.manifest.resourceProfiles.find(
      (profile) => profile.id === selectedProfileId,
    ) ?? template.manifest.resourceProfiles[0];
  const desiredPreview = desiredConfiguration(template, configuration, true);

  async function next() {
    const valid = await form.trigger(current.fields.map((field) => field.name));
    if (!valid) return;
    if (stepIndex < allSteps.length - 1) setStepIndex((value) => value + 1);
    else setReview(true);
  }

  if (!current || fields.length === 0)
    return (
      <Alert tone="danger">
        This published template does not contain a renderable wizard schema.
      </Alert>
    );

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="min-w-0">
        <CardHeader>
          <div className="flex flex-wrap gap-2" aria-label="Wizard progress">
            {allSteps.map((step, index) => (
              <span
                key={step.id}
                className={`rounded-full border px-2.5 py-1 text-[10px] ${review ? "text-muted-foreground" : index === stepIndex ? "border-primary/40 bg-primary/10 text-primary" : "text-muted-foreground"}`}
              >
                {index + 1}. {step.title}
              </span>
            ))}
            <span
              className={`rounded-full border px-2.5 py-1 text-[10px] ${review ? "border-primary/40 bg-primary/10 text-primary" : "text-muted-foreground"}`}
            >
              {allSteps.length + 1}. Review
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {!review ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                next();
              }}
            >
              <h2 className="text-base font-semibold">{current.title}</h2>
              {current.description && (
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {current.description}
                </p>
              )}
              <div className="mt-6 space-y-5">
                {current.fields
                  .filter((field) => !field.advanced)
                  .map((field) => (
                    <FieldControl key={field.name} field={field} form={form} />
                  ))}
                {current.fields.some((field) => field.advanced) && (
                  <details className="rounded-md border bg-muted/25 p-4">
                    <summary className="min-h-10 cursor-pointer text-sm font-medium">
                      Advanced configuration
                    </summary>
                    <div className="mt-4 space-y-5">
                      {current.fields
                        .filter((field) => field.advanced)
                        .map((field) => (
                          <FieldControl
                            key={field.name}
                            field={field}
                            form={form}
                          />
                        ))}
                    </div>
                  </details>
                )}
              </div>
              <div className="mt-7 flex justify-between gap-3 border-t pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={stepIndex === 0}
                  onClick={() =>
                    setStepIndex((value) => Math.max(0, value - 1))
                  }
                >
                  <ChevronLeft className="size-4" /> Back
                </Button>
                <Button type="submit">
                  {stepIndex === allSteps.length - 1 ? "Review" : "Continue"}
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </form>
          ) : (
            <div>
              <div className="flex items-start gap-3">
                <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                  <FileCheck2 className="size-4" />
                </span>
                <div>
                  <h2 className="text-base font-semibold">
                    Review desired configuration
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    This saves a draft only. It does not provision or deploy a
                    service.
                  </p>
                </div>
              </div>
              <pre className="mt-6 max-h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded-md border bg-background p-4 font-mono text-[11px] leading-5">
                {JSON.stringify(desiredPreview, null, 2)}
              </pre>
              {saveError && (
                <Alert tone="danger" className="mt-4">
                  {saveError}
                </Alert>
              )}
              {saveRevision > 0 && !form.formState.isDirty && (
                <Alert tone="success" className="mt-4">
                  Deployment draft saved. You can safely leave and resume it
                  later.
                </Alert>
              )}
              <div className="mt-7 flex flex-col-reverse justify-between gap-3 border-t pt-4 sm:flex-row">
                <Button
                  variant="ghost"
                  onClick={() => setReview(false)}
                  disabled={saving}
                >
                  <ChevronLeft className="size-4" /> Edit configuration
                </Button>
                <Button
                  onClick={form.handleSubmit((values) => {
                    const configuration = normalize(values, fields);
                    setSubmittedConfiguration(configuration);
                    onSave(configuration);
                  })}
                  disabled={saving}
                >
                  <Save className="size-4" />{" "}
                  {saving ? "Saving draft..." : "Save deployment draft"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold">Resource profile impact</h2>
          </CardHeader>
          <CardContent>
            {resourceProfile ? (
              <dl className="space-y-3">
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <dt className="text-muted-foreground">Profile</dt>
                  <dd>{resourceProfile.label}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <dt className="text-muted-foreground">CPU</dt>
                  <dd className="font-mono">
                    {resourceProfile.cpuMillicores} m
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <dt className="text-muted-foreground">Memory</dt>
                  <dd className="font-mono">{resourceProfile.memoryMiB} MiB</dd>
                </div>
              </dl>
            ) : (
              <p className="text-xs leading-5 text-muted-foreground">
                This template does not declare a resource profile. No impact
                estimate is shown.
              </p>
            )}
          </CardContent>
        </Card>
        <Alert>
          Only fields declared by the published template are included in the
          normalized desired configuration.
        </Alert>
      </div>
    </div>
  );
}
