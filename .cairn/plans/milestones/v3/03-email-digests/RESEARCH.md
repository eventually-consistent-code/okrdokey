# Phase 3 (v3): Email Digests — Research

Researched 2026-07-31 (one subagent). file:line evidence verified.

## Cadence engine

reminders: one row per scope (team, or personal) with cronExpr/timezone/
webhookUrl(nullable)/enabled/nextDueAt watermark; runTick picks
enabled+due rows, delivers webhooks with 3 attempts + [1s,5s,25s]
backoff into webhookDeliveries (attempts, deliveredAt,
deliveryFailedAt, lastError), advances the watermark (missed windows
collapse). Scheduler no-ops under NODE_ENV=test.

Email fits in two different homes: check-in reminder emails extend
reminders with an emailEnabled flag (engine already branches
per-channel); the weekly digest does NOT fit — one-reminder-per-scope
upsert can't hold a Tue nudge and a Mon digest — so it gets its own
digest_schedules table mirroring the watermark pattern, plus an
email_deliveries table mirroring webhookDeliveries (parallel table,
not polymorphic).

## Recipients + content

users.email NOT NULL unique; roster via teamMembers⋈users (pattern in
teams/routes.ts:30-36). Summary internals are inline in the route
handler and scoped to the requesting user — a digest needs a small
extraction: summarizeTeam(app, cycleId, teamId) composed from the
already-exported scoring primitives. Week-over-week deltas are
possible via buildObjectiveHistory but cost extra code for marginal
v1 value — v1 digest = current state (scores, statuses, roll-up) +
who checked in this week (checkIns.authorUserId + createdAt, machine
sources excluded). Deltas are a clean v2.

## SMTP library

nodemailer 9.0.3 (latest; MIT-0, ZERO runtime deps — fits the repo
ethos). createTransport({host,port,secure,auth}) + sendMail; test
transports confirmed in 9.0.3 source: jsonTransport + streamTransport
— unit tests need no server. @types/nodemailer 8.0.1 (lags major;
re-check at impl). No transitive nodemailer anywhere in the lock.
Alternatives weaker (emailjs small-community; rest service-bound).

## Config + smoke

Copy the OIDC all-or-nothing pattern: SMTP_HOST + SMTP_FROM required
together (absent = feature dark, partial = refuse to boot); SMTP_PORT
default 587, SMTP_SECURE default false, SMTP_USER/SMTP_PASS optional
as a pair. Container smoke: a dep-free node:net mock SMTP
(e2e/mock-smtp.cjs — 220/250/354 dance, capture messages) run beside
the image, mirroring the mock-anthropic pattern — exercises the real
transport + socket path in the shipped image. jsonTransport stays a
unit-test-only device.
