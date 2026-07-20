import { Queue, type Job } from "bullmq";
import Redis, { type RedisOptions } from "ioredis";

import {
  QUEUE_NAMES,
  REGISTERED_JOB_DEFINITIONS,
  phaseTwoJobDataSchema,
  registeredQueueFor,
  type PhaseTwoJobData,
  type QueueName,
  type RegisteredJobName,
} from "@/server/jobs/definitions";
import { deterministicJobId } from "@/server/jobs/job-id";

const queues = new Map<QueueName, Queue<PhaseTwoJobData>>();
let producerConnection: Redis | undefined;

export type EnqueueOptions = {
  idempotencyKey: string;
  requestId: string;
  correlationId: string;
  requestedAt?: Date;
};

export function createBullRedisConnection(): Redis {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) throw new Error("REDIS_URL is required for BullMQ.");
  const connection = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    connectTimeout: 5_000,
  });
  connection.on("error", (error) => logInfrastructureError("redis", error));
  return connection;
}

export function createBullRedisOptions(): RedisOptions {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) throw new Error("REDIS_URL is required for BullMQ.");
  const connection = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    connectTimeout: 5_000,
  });
  const options = { ...connection.options };
  connection.disconnect(false);
  return options;
}

export function jobQueuePrefix(): string {
  const prefix =
    process.env.JOB_QUEUE_PREFIX ?? process.env.COMPOSE_PROJECT_NAME;
  if (!prefix || !/^[A-Za-z0-9][A-Za-z0-9_-]{2,79}$/.test(prefix)) {
    throw new Error(
      "JOB_QUEUE_PREFIX must identify this deployment with 3-80 safe characters.",
    );
  }
  return prefix;
}

function getProducerConnection(): Redis {
  producerConnection ??= createBullRedisConnection();
  return producerConnection;
}

function getQueue(name: QueueName): Queue<PhaseTwoJobData> {
  let queue = queues.get(name);
  if (!queue) {
    queue = new Queue<PhaseTwoJobData>(name, {
      connection: getProducerConnection(),
      prefix: jobQueuePrefix(),
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 2_000 },
        removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
        removeOnFail: { age: 7 * 24 * 60 * 60, count: 5_000 },
        sizeLimit: 16 * 1_024,
      },
    });
    queue.on("error", (error) => logInfrastructureError(name, error));
    queues.set(name, queue);
  }
  return queue;
}

function logInfrastructureError(component: string, error: Error): void {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      event: "jobs.infrastructure_error",
      component,
      errorCode: error.name,
    }),
  );
}

export async function enqueueJob<N extends RegisteredJobName>(
  name: N,
  options: EnqueueOptions,
): Promise<Job<PhaseTwoJobData, unknown, N>> {
  const queueName = registeredQueueFor(name);
  const queue = getQueue(queueName);
  const data = phaseTwoJobDataSchema.parse({
    requestId: options.requestId,
    correlationId: options.correlationId,
    requestedAt: (options.requestedAt ?? new Date()).toISOString(),
  });
  return queue.add(name, data, {
    jobId: deterministicJobId(queueName, name, options.idempotencyKey),
  }) as Promise<Job<PhaseTwoJobData, unknown, N>>;
}

export async function upsertRegisteredJobScheduler<N extends RegisteredJobName>(
  name: N,
  schedulerId: string,
  every: number,
  data: PhaseTwoJobData,
): Promise<void> {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(schedulerId)) {
    throw new Error("The job scheduler ID is invalid.");
  }
  if (!Number.isInteger(every) || every < 1_000) {
    throw new Error("The job scheduler interval is invalid.");
  }
  const queue = getQueue(registeredQueueFor(name));
  const parsedData = phaseTwoJobDataSchema.parse(data);
  await queue.upsertJobScheduler(
    schedulerId,
    { every },
    { name, data: parsedData },
  );
}

export async function closeQueueRegistry(): Promise<void> {
  const failures: unknown[] = [];
  const closed = await Promise.allSettled(
    Array.from(queues.values(), (queue) => queue.close()),
  );
  failures.push(
    ...closed.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    ),
  );
  queues.clear();
  const connections = producerConnection ? [producerConnection] : [];
  producerConnection = undefined;
  const disconnected = await Promise.allSettled(
    connections.map((connection) => closeBullRedisConnection(connection)),
  );
  failures.push(
    ...disconnected.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    ),
  );
  if (failures.length > 0) {
    throw new AggregateError(failures, "BullMQ registry shutdown failed.");
  }
}

export async function closeBullRedisConnection(
  connection: Redis,
): Promise<void> {
  if (connection.status === "end") return;
  const ended = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Redis connection did not close cleanly.")),
      2_000,
    );
    connection.once("end", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
  let closeError: unknown;
  let closeOperation: Promise<unknown>;
  try {
    if (connection.status === "ready") {
      closeOperation = connection.quit();
    } else {
      connection.disconnect(false);
      closeOperation = Promise.resolve();
    }
    await Promise.race([closeOperation, ended]);
  } catch (error) {
    closeError = error;
  }
  if (String(connection.status) !== "end") connection.disconnect(false);
  try {
    await ended;
  } catch (error) {
    closeError ??= error;
  }
  if (closeError) throw closeError;
}

export function registeredQueueNames(): ReadonlySet<QueueName> {
  return new Set(
    Object.values(REGISTERED_JOB_DEFINITIONS).map(({ queue }) => queue),
  );
}

export function initializeQueueRegistry(): void {
  for (const queue of QUEUE_NAMES) {
    getQueue(queue);
  }
}
