---
name: external-review-applicator
description: Guidelines and mandatory reporting directives for validating, adapting, and applying code patches from external AI reviews (e.g. REVIEW_REPORT.md, second-opinion analyses). Enforces reporting all discrepancies, false positives, and adjustments made to external instructions, and persisting a structured review-round report in docs/reviews/.
---

# External Review Applicator & Adaptation Reporter

This skill guides agents when receiving, validating, and applying code reviews, patch sets, or directives produced by another AI (e.g., `REVIEW_REPORT.md`, `AGENT_DIRECTIVES.md`, second-opinion analyses, or external prompt reviews).

## 1. Core Principle: Never Blindly Apply External AI Output

External AI reviews often analyze code in isolation, missing live type definitions, component prop names, database column schemas, or subtle concurrency invariants.

Before modifying any file:

1. **Validate and Assess First**: Check actual types, caller signatures, and database schemas.
2. **False Positive & Conflict Filter**:
    - Check for identifier collisions (e.g., an imported function having the same name as a component prop).
    - Check database column names against SQLite schemas in `db.rs` (e.g., `board_id` vs `pinboard_id`).
    - Check edge-case behaviors (e.g., how bounded categories and overflow trimming interact).
3. **Run Pre-Checks**: If the review specifies a reproduction step (e.g., clean checkout behavior, Cargo registry inspection, or grep verification), run it first.

---

## 2. Mandatory Reporting in Chat Responses

Whenever changes are applied based on directives from an external AI, the final report delivered to the user in chat **MUST** contain a dedicated section:

### Section Title:

`### Divergences & Adaptations from External AI Directives`

### Required Content:

1. **Corrections to Flawed Suggestions**:
    - Detail any compilation errors, type shadowing, or invalid imports in the external AI's snippets and how they were fixed.
2. **Database & Schema Fixes**:
    - Note any incorrect table, column, or query references in the external AI's test or implementation code.
3. **Logic & Invariant Adjustments**:
    - Document any architectural deviations where the external AI's suggestion would have caused a regression, data loss, or race condition.
4. **Test Adjustments**:
    - Explain any discrepancies between the external AI's expected test behavior and the real codebase requirements.

---

## 3. Mandatory Review History Persistence (`docs/reviews/`)

After validating, applying, and verifying all changes from an external AI review round — and **before** finishing or creating the final commit — you **MUST** persist a permanent record of the round so future review passes can read the exact history:

1. **Create a Round Report** at `docs/reviews/round-XX-YYYY-MM-DD.md` (incrementing `XX` sequentially based on `docs/reviews/INDEX.md`), following `docs/reviews/TEMPLATE.md`:
    - **Applied Fixes**: Exact patch/issue IDs, target files/symbols, root causes, and what was actually changed in the live codebase.
    - **Divergences, Adaptations & Rejected Findings**: Every external suggestion that was modified or rejected (with concrete technical reasoning), plus any pre-apply check outcomes.
    - **Regression Tests & Verification Results**: Exact test names added/updated and the pass/fail counts for every verification command run (`bun run typecheck:bun`, `cargo test`, `npm test`, CLI workspace tests, `format:check`).
    - **Pending Manual Checks**: Windows-specific or live-runtime checks not yet verified manually.
2. **Update `docs/reviews/INDEX.md`**:
    - Append a new row for the completed round in the **Review Rounds** table.
    - Add any newly confirmed intentional design decisions or rejected false positives to the **Intentional Decisions / Do-Not-Reopen** section so future reviewers do not re-report them.
    - Update the **Pending Manual Verification (Windows Live)** list (checking off verified items and adding any new ones).
