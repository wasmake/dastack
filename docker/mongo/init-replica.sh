#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

required=(
  MONGO_HOST
  MONGO_REPLICA_HOST
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

mongo_args=(
  --quiet
  --host "$MONGO_HOST"
  --username "$MONGO_INITDB_ROOT_USERNAME"
  --password "$MONGO_INITDB_ROOT_PASSWORD"
  --authenticationDatabase admin
)

for attempt in {1..60}; do
  if mongosh "${mongo_args[@]}" --eval 'quit(db.adminCommand({ ping: 1 }).ok ? 0 : 1)' >/dev/null 2>&1; then
    break
  fi

  if (( attempt == 60 )); then
    printf '%s\n' 'MongoDB did not become reachable within 120 seconds.' >&2
    exit 1
  fi
  sleep 2
done

mongosh "${mongo_args[@]}" --eval '
  try {
    const status = rs.status();
    if (status.set !== "rs0") {
      throw new Error(`Unexpected replica set: ${status.set}`);
    }
    print("Replica set rs0 is already initialized.");
  } catch (error) {
    if (error.code !== 94 && error.codeName !== "NotYetInitialized") {
      throw error;
    }
    rs.initiate({
      _id: "rs0",
      members: [{ _id: 0, host: process.env.MONGO_REPLICA_HOST }]
    });
    print("Replica set rs0 initialization requested.");
  }
'

for attempt in {1..60}; do
  if mongosh "${mongo_args[@]}" --eval '
    const hello = db.adminCommand({ hello: 1 });
    quit(hello.setName === "rs0" && hello.isWritablePrimary === true ? 0 : 1);
  ' >/dev/null 2>&1; then
    break
  fi

  if (( attempt == 60 )); then
    printf '%s\n' 'MongoDB replica set did not elect a primary within 120 seconds.' >&2
    exit 1
  fi
  sleep 2
done

mongosh "${mongo_args[@]}" --eval '
  const appDb = db.getSiblingDB(process.env.MONGODB_DB);
  const username = process.env.MONGO_APP_USERNAME;
  const user = appDb.getUser(username);
  const options = {
    pwd: process.env.MONGO_APP_PASSWORD,
    roles: [{ role: "readWrite", db: process.env.MONGODB_DB }]
  };

  if (user) {
    appDb.updateUser(username, options);
    print(`Updated technical MongoDB user ${username}.`);
  } else {
    appDb.createUser({ user: username, ...options });
    print(`Created technical MongoDB user ${username}.`);
  }
'
