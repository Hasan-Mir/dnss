# DNSS Code Review History Index

> **For AI Reviewers & Coding Agents:** Read this file and the most recent `docs/reviews/round-*.md` report **before** auditing the codebase or applying new patches. Do not re-open items listed under **Intentional Decisions / Do-Not-Reopen** without demonstrating a new, concrete failure mode.

---

## Review Rounds

| Round | Date       | Report File                                      | Scope & Key Highlights                                                                                                                                                                                                                                                                                                  |
| ----- | ---------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01    | 2026-11-20 | Initial setup                                    | Infrastructure for AI code reviews, `bundle:context`, `typecheck:bun`, and review tracking index.                                                                                                                                                                                                                       |
| 02    | 2026-11-20 | [round-02-2026-11-20.md](round-02-2026-11-20.md) | Applied 9 directives: Windows console flash suppression (`CREATE_NO_WINDOW`), UTF-8 PowerShell I/O, static DNS parsing, CLI bulk apply error propagation, Linux/macOS reset parity, RFC 1035 label validation, GUI index drift & save guard, config store validation/quarantine parity, and mount effect stabilization. |

---

## Intentional Decisions / Do-Not-Reopen

Record deliberate architectural choices and rejected external review findings here so future review passes do not re-report them:

- **TypeScript typechecking uses `bun run typecheck:bun`**: Intentional fast-path (`bun check --skipLibCheck` across all workspaces in parallel); do not replace with raw `tsc` in agent workflows.
- **Config server name cap (`MAX_NAME_LEN = 64`)**: Aligned across Rust backend (`configs.rs`), React frontend (`Servers.tsx`), CLI prompts (`index.ts`), and core validation (`config-store.ts`).
- **Windows PowerShell execution format**: Spawns must specify `CREATE_NO_WINDOW` (`0x0800_0000`) and use `-EncodedCommand` (UTF-16LE Base64) with `[Console]::OutputEncoding = UTF8` to eliminate console popups and codepage corruption.
- **PowerShell adapter addressing by Index (`-InterfaceIndex`)**: In `set_dns_many`, adapter aliases must be mapped to their `ifIndex` to avoid wildcard pattern parsing by PowerShell for adapter names containing brackets or glob characters.
- **macOS `reset_all_dns` exit status tracking**: Joined `networksetup` commands must chain with `|| rc=1` and exit with `$rc` so failures on preceding adapters are not masked by later successes.

---

## Pending Manual Verification (Windows Live)

- [ ] Verify zero console window flashes during DNS switching, refresh, and cache flush.
- [ ] Verify non-ASCII adapter names are properly read and configured without corruption.
