import mongoose from "mongoose";
import { MongoClient } from "mongodb";

import { getServerEnv } from "@/server/env";

declare global {
  var __dastackMongoose: Promise<typeof mongoose> | undefined;
  var __dastackMongoClient: Promise<MongoClient> | undefined;
}

export function connectMongoose(): Promise<typeof mongoose> {
  if (!global.__dastackMongoose) {
    const env = getServerEnv();
    mongoose.set("strictQuery", true);
    global.__dastackMongoose = mongoose
      .connect(env.MONGODB_URI, {
        dbName: env.MONGODB_DB,
        autoIndex: env.NODE_ENV !== "production",
        maxPoolSize: 20,
        minPoolSize: env.NODE_ENV === "production" ? 2 : 0,
        serverSelectionTimeoutMS: 5_000,
      })
      .catch((error) => {
        global.__dastackMongoose = undefined;
        throw error;
      });
  }

  return global.__dastackMongoose;
}

export function getMongoClientPromise(): Promise<MongoClient> {
  if (!global.__dastackMongoClient) {
    const env = getServerEnv();
    const client = new MongoClient(env.MONGODB_URI, {
      maxPoolSize: 20,
      minPoolSize: env.NODE_ENV === "production" ? 2 : 0,
      serverSelectionTimeoutMS: 5_000,
    });
    global.__dastackMongoClient = client.connect().catch((error) => {
      global.__dastackMongoClient = undefined;
      throw error;
    });
  }

  return global.__dastackMongoClient;
}

// Auth.js accepts a client factory; this alias also exposes the shared client promise to other consumers.
export const mongoClientPromise = getMongoClientPromise;

export async function pingMongo(): Promise<void> {
  const env = getServerEnv();
  const client = await getMongoClientPromise();
  await client.db(env.MONGODB_DB).command({ ping: 1 });
}
