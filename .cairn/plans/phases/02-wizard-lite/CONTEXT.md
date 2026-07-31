# Phase 2 (v2): Wizard Lite — Context

## Locked decisions

- **Client-side only.** Static template module in `packages/shared`
  (`templates.ts`): 18 KR templates across engineering / product /
  sales / marketing / support / ops + 3 objective title suggestions per
  function. No template API; future self-host customization = JSON
  override merged over defaults, deferred.
- **Template shape**: id, fn, title with `{baseline}`/`{target}` slots,
  KR type mapped to OUR types (numeric/percent/boolean), default unit,
  one-line coach note. `direction` is coaching metadata only — the
  scoring engine already handles decreasing-is-good via
  baseline > target.
- **3-step dialog wizard** (Radix Dialog, ledger styling):
  1. category → template grid + "write my own" escape;
     header: "A key result is a number that changes — not a task you
     finish."
  2. measure — prefilled type/unit, baseline→target inputs, boolean
     soft-hint, "don't know your baseline?" coaching line.
  3. review — interpolated title preview, checklist, amber warning when
     the objective would exceed 4 KRs. Create posts through the SAME
     existing mutation (`useCreateKeyResult`) — no new API surface.
- **Placement**: "guide me" secondary button beside the existing + key
  result button; zero-KR empty state flips it to primary CTA. Objective
  title suggestions render as datalist/combobox suggestions in the
  new-objective dialog, keyed off an optional category picker.
- **No schema/API changes anywhere in this phase.** Frontend + shared
  static data only; the API test count must not move.

Rationale, flow detail, and the full template content: RESEARCH.md +
the phase-1 research transcript (template data lands verbatim in T1).
