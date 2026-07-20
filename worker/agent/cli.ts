import { enrollAgent, runHeartbeatLoop, sendHeartbeat } from "./client";
import { readAgentState, resolveStatePath } from "./state";

type Arguments = {
  command: "enroll" | "heartbeat" | "start";
  values: Map<string, string[]>;
  allowHttp: boolean;
};

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  const statePath = resolveStatePath(optionalValue(args, "state"));

  if (args.command === "enroll" || args.command === "start") {
    let enrolled = false;
    try {
      const state = await readAgentState(statePath);
      enrolled = Boolean(state.workerId && state.keyId);
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }
    if (!enrolled) {
      const token = process.env.WORKER_ENROLLMENT_TOKEN;
      if (!token) {
        throw new Error("WORKER_ENROLLMENT_TOKEN is required for enrollment.");
      }
      const state = await enrollAgent({
        controlPlaneUrl:
          optionalValue(args, "url") ??
          requiredEnvironment("WORKER_CONTROL_PLANE_URL"),
        token,
        name: requiredValue(args, "name"),
        region: requiredValue(args, "region"),
        provider: requiredValue(args, "provider"),
        capabilities: args.values.get("capability") ?? [],
        concurrentOperations: positiveIntegerValue(args, "concurrency"),
        statePath,
        allowHttp: args.allowHttp,
      });
      console.info(
        JSON.stringify({
          event: "worker.enrolled",
          phase: state.phase,
          workerId: state.workerId,
          keyId: state.keyId,
          credentialExpiresAt: state.credentialExpiresAt,
        }),
      );
    }
    if (args.command === "enroll") return;
  }

  if (args.command === "heartbeat") {
    const result = await sendHeartbeat(statePath, args.allowHttp);
    console.info(
      JSON.stringify({
        event: "worker.heartbeat_accepted",
        phase: "phase-2-node-heartbeat",
        acceptedAt: result.acceptedAt,
      }),
    );
    return;
  }

  const controller = new AbortController();
  process.once("SIGINT", () => controller.abort());
  process.once("SIGTERM", () => controller.abort());
  const interval = Number(
    optionalValue(args, "interval") ??
      process.env.WORKER_HEARTBEAT_INTERVAL_SECONDS ??
      "30",
  );
  await runHeartbeatLoop({
    statePath,
    allowHttp: args.allowHttp,
    intervalSeconds: interval,
    signal: controller.signal,
  });
}

function parseArguments(argv: string[]): Arguments {
  const command = argv[0];
  if (!command || !["enroll", "heartbeat", "start"].includes(command)) {
    throw new Error("Expected command: enroll, heartbeat, or start.");
  }
  const values = new Map<string, string[]>();
  const allowedOptions = new Set([
    "state",
    "url",
    "name",
    "region",
    "provider",
    "capability",
    "concurrency",
    "interval",
  ]);
  let allowHttp = false;
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--allow-http") {
      allowHttp = true;
      continue;
    }
    if (!argument?.startsWith("--")) {
      throw new Error("Unexpected positional argument.");
    }
    const key = argument.slice(2);
    if (!/^[a-z][a-z-]*$/.test(key) || !allowedOptions.has(key)) {
      throw new Error("Invalid option name.");
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Option --${key} requires a value.`);
    }
    values.set(key, [...(values.get(key) ?? []), value]);
    index += 1;
  }
  return {
    command: command as Arguments["command"],
    values,
    allowHttp,
  };
}

function requiredValue(args: Arguments, key: string): string {
  const value = optionalValue(args, key);
  if (!value) throw new Error(`Option --${key} is required.`);
  return value;
}

function optionalValue(args: Arguments, key: string): string | undefined {
  const values = args.values.get(key);
  if (values && values.length > 1 && key !== "capability") {
    throw new Error(`Option --${key} cannot be repeated.`);
  }
  return values?.[0];
}

function positiveIntegerValue(args: Arguments, key: string): number {
  const parsed = Number(requiredValue(args, key));
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1_000) {
    throw new Error(`Option --${key} must be an integer between 1 and 1000.`);
  }
  return parsed;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Option --url or ${name} is required.`);
  }
  return value;
}

function isMissingFile(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "ENOENT",
  );
}

void main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      event: "worker.agent_failed",
      phase: "phase-2-node-heartbeat",
      errorCode: error instanceof Error ? error.name : "UNKNOWN_ERROR",
      ...(error &&
      typeof error === "object" &&
      "validationPaths" in error &&
      Array.isArray(error.validationPaths)
        ? { validationPaths: error.validationPaths }
        : {}),
    }),
  );
  process.exitCode = 1;
});
