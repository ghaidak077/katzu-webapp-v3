# Katzu plans

## Product-wide roadmap

[008 — Katzu Excellence Master Plan](./008-katzu-excellence-master-plan.md) is the owner-approved 2026 roadmap for autonomous local execution for trust fixes, production verification, clean architecture, scalable sync, measured performance, learning quality, premium UX, and launch readiness. It includes acceptance criteria and milestone gates. Current partial implementation is tracked in [EXCELLENCE-STATUS](../docs/agent/EXCELLENCE-STATUS.md). Deployment and production changes still require separate authorization.

## Current coordinated audit (approval pending)

[009 — Experience, interface and motion audit](./009-coordinated-experience-interface-motion-audit.md)
contains the current evidence-backed findings, coverage gaps, local implementation proposal and
separate deployment gate. It does not claim a complete visual/runtime pass. Motion findings M1/M2
await owner selection; the older proposals below must not be replayed blindly. Source inspection
confirms that token wiring, the confetti guard and overlay entrances already exist.

## Historical motion plans

The seven motion proposals below predate the product-wide roadmap. Reconcile each against the current code before execution; their listed TODO status and measurements are historical, not a fresh audit.

Seven self-contained plans from the 2026-10-03 animation audit of Katzu (`ef1fb92`).

Katzu has **no motion library** — motion is CSS transitions, one WebGL orb
(`ogl`) and `canvas-confetti`. Every plan below works within that constraint.
None of them adds a dependency.

## Plans

| # | Title | Severity | Category | Status | Depends on |
| --- | --- | --- | --- | --- | --- |
| [001](./001-promote-motion-tokens-to-tailwind-utilities.md) | Promote the motion tokens to real Tailwind utilities | **HIGH** | Cohesion & tokens | TODO | — |
| [002](./002-gate-confetti-behind-reduced-motion.md) | Gate the confetti celebration behind reduced motion | **HIGH** | Accessibility | TODO | — |
| [003](./003-animate-sheet-and-modal-entrances.md) | Give the sheet and modal a real entrance | MEDIUM | Physicality & origin | TODO | 001 (for `ease-spring`) |
| [004](./004-stop-forced-layout-on-scroll.md) | Stop forcing layout on every scroll frame | MEDIUM | Performance | TODO | — |
| [005](./005-composite-progress-bars.md) | Composite the progress bars instead of animating width | MEDIUM | Performance | TODO | — |
| [006](./006-collapse-transition-all-to-property-scoped.md) | Collapse `transition-all` to property-scoped transitions | LOW | Performance | TODO | — |
| [007](./007-verify-and-fix-hover-lift-magnitude.md) | Reduce the Practice card hover scale | LOW | Physicality & origin | TODO | — |

## Recommended execution order

**Batch 1 — no dependencies, ship first.**

Run 001, 002, 004, 005 in any order. 001 is the most consequential because it
changes the default transition from Tailwind's undeclared 150ms to the token
ladder's 280ms across the whole app. It is best executed and *felt* on its own,
before other motion changes are mixed into the same review.

002 is the only plan that fixes a correctness bug rather than a taste issue, and
the smallest diff in the set. If the whole batch is ever cut down, keep this one.

**Batch 2 — after 001 is proven.**

003 depends on 001 only because it wants the `ease-spring` utility. It works
either way (`duration-[var(--kz-dur)]` is equivalent), so the dependency is
convenience, not correctness.

005 and 004 are independent of everything and could be in batch 1.

**Batch 3 — mechanical sweeps, last.**

006 and 007 touch the most files for the least user-visible gain. 006 in
particular should run *after* 001 so that new durations are already settled, and
after 005 so it does not edit `AudioWaveform.tsx:21` that plan already rewrote.

## Verified during the audit

- `npx tsc --noEmit` — exit 0
- `npm test` — 106 files / 1298 tests pass
- `npm run build` — exit 0
- `npm run design` (drift + contrast) — exit 0
- `E2E_TARGET=preview npx playwright test` — 62 passed
- Tailwind is **3.4.19**, which already gates `hover:` behind `(hover: hover)`.
  Plan 007 was corrected for this after the original finding assumed it did not.

## Rejected as by-design

Do not "fix" these; they are deliberate and documented in the code.

- **The live-conversation turn-progress bar** (`LiveConversationScreen.tsx:236`)
  changes width instantly with no transition. The comment records this as the V19
  motion rule: a transition there is decoration.
- **The WebGL orb's reduced-motion damping** (`KatzuOrb.tsx:78-96`) reduces
  `motion` amplitude rather than freezing time, which preserves the orb's meaning
  as a listening indicator.
- **`kz-glow-pulse`** (`StatusIndicator.tsx:37`) is a semantic state signal, and
  its `.kz-animated` opt-out under reduced motion is correct.
- **The specular highlight drift on scroll** (`GlassSurface.tsx:135-150`) is a
  deliberate design effect. Plan 004 changes only *how* the value is computed.

## Executing

Any agent can execute a plan — each is self-contained with exact values, file
paths and a verification section. To run one with this agent, paste the plan file
or say `execute plans/001`. To re-check this list against the current code after
fixes land, use the `reconcile` variant of the skill.
