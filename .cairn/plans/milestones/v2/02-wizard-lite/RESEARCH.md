# Phase 2 (v2): Wizard Lite — Research

One research subagent, standard depth. Verified 2026-07-31.

## Findings

**Why Profit.co's wizard works.** It front-loads the DECISION, not the
fields: "can you measure it, or only track it?" → metric picker →
values. The 300+ templates ARE the wizard — it's a picker with defaults.

**What novices get wrong** (whatmatters/mooncamp coaching consensus):
outputs-not-outcomes ("Launch newsletter" vs "Grow subscribers 20%"),
unmeasurable KRs (no baseline — measuring it is a fine first KR), too
many KRs (2–4 per objective), unverifiable phrasing.

**Minimal 3-step dialog flow** (collects exactly the existing form's
fields):
1. What kind of result? — function category → template grid (title +
   coach note) + "Write my own". Header teaches THE lesson: "A key
   result is a number that changes — not a task you finish."
2. How will you measure it? — template pre-fills type/unit; user fills
   baseline→target. Inline coaching incl. the boolean soft-hint
   ("done/not-done results are usually tasks in disguise").
3. Review — rendered title preview, measurable/outcome checklist, amber
   warning when the objective would exceed 4 KRs.

**Templates: 18 KRs across 6 functions + 3 objective title suggestions
per function** (full content captured in the research transcript and
shipped as code in T1). Objective FULL templates: skipped — title
suggestions only.

**Delivery: client-side static TS, no API.** ~4KB, zero latency/auth
surface. Self-host customization deferred (future JSON override merged
over defaults — YAGNI until asked). Co-locate with shared schemas so
type/unit drift is impossible.

**Placement: progressive disclosure with an escape hatch.** Keep the
inline form; add a "guide me" secondary button. In the zero-KR empty
state the wizard becomes the primary CTA and the inline form the
escape hatch; precedence flips after the first KR exists.

## Sources

- https://www.profit.co/answers/okrs/how-to-create-a-key-result-via-step-by-step-guide/ · https://www.profit.co/answers/okrs/which-key-result-type-to-choose/
- https://www.whatmatters.com/faqs/common-okr-mistakes · https://www.whatmatters.com/okrs-explained/examples-of-key-results · https://www.whatmatters.com/get-examples
- https://mooncamp.com/blog/okr-mistakes · https://www.perdoo.com/resources/online-guides/okr-examples-guide
- https://sugarokr.com/blog/okr-examples-templates-you-can-steal-by-function/ · https://www.tability.io/okrs
- https://www.eleken.co/blog-posts/wizard-ui-pattern-explained · https://www.uxpin.com/studio/blog/what-is-progressive-disclosure/ · https://www.appcues.com/blog/user-onboarding-ui-ux-patterns
