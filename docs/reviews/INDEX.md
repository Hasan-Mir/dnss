# DNSS Code Review History Index

> **For AI Reviewers & Coding Agents:** Read this file and the most recent `docs/reviews/round-*.md` report **before** auditing the codebase or applying new patches. Do not re-open items listed under **Intentional Decisions / Do-Not-Reopen** without demonstrating a new, concrete failure mode.

---

## Review Rounds

| Round | Date | Report File | Scope & Key Highlights |
| --- | --- | --- | --- |
| 01 | 2026-11-20 | Initial setup | Infrastructure for AI code reviews, `bundle:context`, `typecheck:bun`, and review tracking index. |

---

## Intentional Decisions / Do-Not-Reopen

Record deliberate architectural choices and rejected external review findings here so future review passes do not re-report them:

- **TypeScript typechecking uses `bun run typecheck:bun`**: Intentional fast-path (`bun check --skipLibCheck` across all workspaces in parallel); do not replace with raw `tsc` in agent workflows.
- *(Append new rejected findings or intentional design decisions here after each round.)*
