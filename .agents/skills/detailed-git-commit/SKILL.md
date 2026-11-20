---
name: detailed-git-commit
description: Mandate and generate comprehensive, structured git commit messages that explain the root cause, defect details, resolution mechanism, component-level breakdown, and regression tests. Use whenever preparing, drafting, or executing git commits in this repository.
---

# Detailed Git Commit Skill

This skill enforces high-fidelity, production-grade Git commit messages across the repository. It guarantees that any future developer or agent can read `git log` and immediately understand:

1. **The Problem**: What was broken, missing, or insecure (root cause and trigger conditions).
2. **The Fix**: How it was resolved architecturally and algorithmically.
3. **The Scope**: Which files, functions, and subsystems were touched.
4. **The Proof**: What regression tests or verifications validate the change.

---

## Commit Message Topology

Every commit message produced must adhere to this exact structural hierarchy:

```text
<type>(<scope>): <summary up to 72 chars>

Problem & Root Cause:
<Thorough explanation of the defect, bug, or limitation. Explain why it occurred,
the affected edge cases, and the adverse impact on system behavior.>

Solution & Architecture:
<Detailed explanation of the technical resolution. Mention the design patterns,
invariants enforced, performance considerations, and safety measures applied.>

Key changes by component:
- Core & DNS Engine:
  - <Imperative action> in `<symbol_or_path>` to ensure <guarantee> (<ISSUE_OR_DIRECTIVE_REF>).
  - <Imperative action> in `<symbol_or_path>` to reject <invalid state>.

- CLI & Client Tooling:
  - <Imperative action> to handle <edge case> with `<EXIT_CODE>`.

- Tauri Backend & Platform:
  - <Imperative action> to offload <blocking operation> to background thread.

- GUI & Frontend:
  - <Imperative action> in `<component>` to eliminate <security risk or UI glitch>.

- CI, Packaging & Tooling:
  - <Imperative action> in `<script_or_workflow>` to guarantee <build invariant>.

Regression tests added / verified:
- `<exact::test::identifier_1>`
- `<exact::test::identifier_2>`
- `<test_suite.test.ts>`: <description of verified attack vector or boundary condition>
```

---

## Rules & Behavioral Standards

1. **Strictly Forbidden Messages**:
    - Single-line messages (e.g. `git commit -m "fix bug"`).
    - Terse descriptions without root cause (e.g. `git commit -m "update styles and fix tests"`).
    - Messages missing component breakdowns or regression tests.

2. **Grammar & Tone**:
    - The first line (subject) must be in the **imperative mood** (`fix: resolve ...`, not `fixed:` or `fixes:`).
    - All code identifiers, paths, types, flags, and exit codes must be in backticks (e.g. `` `isValidIp` ``, `` `netsh` ``).
    - Paragraphs in the body should be wrapped at ~72 to 80 characters for clean terminal viewing in `git log`.

3. **Subsystem Categorization**:
   Group bullet points logically under recognizable architectural sections:
    - `Core & DNS Engine`
    - `CLI & Client Tooling`
    - `Tauri Backend & Platform`
    - `GUI & Frontend`
    - `CI, Packaging & Tooling`
