#!/bin/sh

########################
# Script by John Reed  #
# 2026-07-31           #
########################
#
# docker compose up must work with zero config — but production still
# refuses to run on a default session secret. Squaring that: generate a
# real secret on first boot and keep it in the data volume. Set
# SESSION_SECRET yourself to override.

set -eu

SECRET_FILE="${SESSION_SECRET_FILE:-/data/.session-secret}"

if [ -z "${SESSION_SECRET:-}" ]; then
  if [ ! -f "$SECRET_FILE" ]; then
    echo "generating session secret..."
    mkdir -p "$(dirname "$SECRET_FILE")"
    node -e "process.stdout.write(require('crypto').randomBytes(48).toString('base64url'))" > "$SECRET_FILE"
    chmod 600 "$SECRET_FILE"
    echo "secret saved."
  fi
  SESSION_SECRET="$(cat "$SECRET_FILE")"
  export SESSION_SECRET
fi

exec npx tsx packages/api/src/main.ts
