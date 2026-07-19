#!/bin/sh
set -eu

key=${MONGO_REPLICA_KEY:?MONGO_REPLICA_KEY is required}
target=/run/mongo-keyfile/keyfile

if [ "${#key}" -lt 32 ] || [ "${#key}" -gt 1024 ]; then
  printf '%s\n' 'MONGO_REPLICA_KEY must contain between 32 and 1024 characters.' >&2
  exit 1
fi

case "$key" in
  *[!A-Za-z0-9+/=]*)
    printf '%s\n' 'MONGO_REPLICA_KEY may contain base64 characters only.' >&2
    exit 1
    ;;
esac

if [ -f "$target" ]; then
  if [ "$(cat "$target")" != "$key" ]; then
    printf '%s\n' 'The persisted Mongo key differs from MONGO_REPLICA_KEY.' >&2
    printf '%s\n' 'Restore the old key or intentionally recreate local volumes.' >&2
    exit 1
  fi
else
  umask 077
  printf '%s' "$key" > "$target"
fi

chown 999:999 "$target"
chmod 0400 "$target"
