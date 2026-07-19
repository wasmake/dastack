#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

required=(
  MONGO_INITDB_ROOT_USERNAME
  MONGO_INITDB_ROOT_PASSWORD
  MONGO_APP_USERNAME
  MONGO_APP_PASSWORD
  MONGODB_DB
)

for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    printf 'Required environment variable %s is empty.\n' "$name" >&2
    exit 1
  fi
done

mongosh \
  --quiet \
  --host "${MONGO_HOST:-127.0.0.1}" \
  --username "$MONGO_INITDB_ROOT_USERNAME" \
  --password "$MONGO_INITDB_ROOT_PASSWORD" \
  --authenticationDatabase admin \
  --eval '
    const hello = db.adminCommand({ hello: 1 });
    if (hello.setName !== "rs0" || hello.isWritablePrimary !== true) {
      throw new Error("MongoDB rs0 is not writable primary");
    }
    const appUser = db.getSiblingDB(process.env.MONGODB_DB)
      .getUser(process.env.MONGO_APP_USERNAME);
    if (!appUser) {
      throw new Error("MongoDB technical application user is missing");
    }
    print("MongoDB rs0 is writable and the technical application user exists.");
  '

mongosh \
  --quiet \
  --host "${MONGO_HOST:-127.0.0.1}" \
  --username "$MONGO_APP_USERNAME" \
  --password "$MONGO_APP_PASSWORD" \
  --authenticationDatabase "$MONGODB_DB" \
  "$MONGODB_DB" \
  --eval '
    const session = db.getMongo().startSession();
    try {
      session.startTransaction();
      session.getDatabase(process.env.MONGODB_DB)
        .getCollection("__infra_transaction_probe")
        .insertOne({ _id: new ObjectId() });
      session.abortTransaction();
    } finally {
      session.endSession();
    }
    print("MongoDB application user transaction probe passed and was aborted.");
  '
