---
type: gotcha
provenanceFiles: [Dockerfile]
provenanceCommits: [6c31eea]
created: 2026-07-31
confidence: high
---
better-sqlite3 v13 ships prebuilt binaries requiring glibc >= 2.38. `node:22-slim` (Debian bookworm, glibc 2.36) fails at container runtime with ERR_DLOPEN_FAILED / "GLIBC_2.38 not found"; `node:22-trixie-slim` (Debian 13) works. Applies to any native dep with fresh prebuilds — check glibc when a container crashes on module load but works locally.
