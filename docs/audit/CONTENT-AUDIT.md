# Content audit log

Read-only audit of learning content. No content has been changed.
Severity: **P0** wrong or misleading content · **P1** level or format mismatch · **P2** polish.
Status for uncertain items: *needs native or expert review*.

Scope: `docs/content/curriculum-*.json` (8 modules: 44 scenarios, 453 vocabulary rows, review and
grammar blocks), `docs/content/supplements/*.json` (3 grammar files), and the in-app sources in
`src/lib/` (placement, listening, writing, quiz, mock exam, Ask Katzu, Coach).

## Parts

- [Part 1 — Curriculum content and lessons](CONTENT-AUDIT-1-CONTENT-AND-LESSONS.md) — Pass 0, Types 1–3
- [Part 2 — Grammar, listening, writing](CONTENT-AUDIT-2-GRAMMAR-AND-SKILLS.md) — Types 4–6
- [Part 3 — Quizzes and exams](CONTENT-AUDIT-3-QUIZZES-AND-EXAMS.md) — Types 7, 8, 10
- [Part 4 — Ask Katzu, Coach, and priorities](CONTENT-AUDIT-4-ASK-AND-PRIORITIES.md) — Type 9 and the final ranked list

## Findings and priorities

The ranked P0/P1/P2 list and the per-type coverage table live in
[part 4](CONTENT-AUDIT-4-ASK-AND-PRIORITIES.md). In one line: one root cause (the article is
composed onto a `german` field that already holds it) drives the "die die …" defect across the
quiz, placement, listening and review screens; the legacy grammar row `akkusativ_articles` teaches
the wrong Akkusativ article and is live; the listening dictation and the mock-exam topic carry
correctness bugs; and the mock names no real exam.
