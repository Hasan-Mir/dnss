# Code Review Round XX — YYYY-MM-DD

- **Commit(s):** `<git-sha>` (fill in after commit, or `uncommitted` if pending)
- **Source Directive:** `<e.g. AGENT_DIRECTIVES.md / REVIEW_REPORT.md>`
- **Subsystems Touched:** `<Core & DNS Engine | CLI & Client Tooling | Tauri Backend & Platform | GUI & Frontend | CI / Scripts>`

---

## 1. Applied Fixes

| Patch / Issue ID | Severity | File(s) & Symbol(s) | Root Cause & Summary of Fix |
| --- | --- | --- | --- |
| `PATCH-01` | High | `path/to/file.ext` (`symbol_name`) | Concise description of what was broken and how it was fixed. |

---

## 2. Pre-Apply Checks, Divergences & Rejected Findings

- **Pre-Apply Verification Results:**
  - Document the exact outcome of any pre-apply checks (e.g., live command testing, caller greps).
- **Corrections / Adaptations Made to External Directives:**
  - Document any syntax, type, schema, or logic adjustments made before applying.
- **Rejected Findings / False Positives (Add to `INDEX.md` if recurring):**
  - List any rejected recommendation and the concrete technical reason it was rejected.

---

## 3. Regression Tests & Verification Results

### Tests Added / Updated
- `<exact::test::path>` — what edge case or regression it proves.
- `<path/to/file.test.ts>` — what scenario it verifies.

### Verification Command Results
- `bun run typecheck:bun`: PASS / FAIL
- `cargo test --manifest-path packages/gui/src-tauri/Cargo.toml`: `<N> passed, 0 failed`
- `npm test`: `<N> passed, 0 failed`
- `npm run prettier:check`: PASS / FAIL

---

## 4. Pending Manual Verification

- [ ] List any runtime/OS-level checks that require manual testing on Windows (e.g., DNS switching, netsh elevation).
