# Project Context - career-ops

> Canonical shared memory for ALL AI agents (Claude CLI, Codex CLI, Gemini
> CLI, Windsurf/Devin, and Devin CLI). Read this FIRST every session. Update it LAST every
> session. Protocol: `~/.agents/AGENT_PROTOCOL.md`.

Last updated: 2026-06-13 13:35 Europe/Bucharest by Codex

## 1. Project Summary

career-ops is a local-first AI job-search automation system for evaluating postings, generating tailored CVs/PDFs, scanning job portals, tracking applications, and managing follow-ups.
The root system is Node.js `.mjs` scripts plus Markdown/YAML data (`cv.md`, `portals.yml`, `data/*`, `reports/*`) and Playwright for scraping/PDF/liveness work.
There is a local job dashboard app in `apps/job-dashboard` (Node ESM server, SQLite/Postgres stores, static frontend, Playwright runner/control server) and a separate Go Bubble Tea TUI under `dashboard/`.
Agent behavior is configured through `AGENTS.md`, CLI wrappers, and `modes/*`; user-specific personalization belongs only in the user layer described by `DATA_CONTRACT.md`.

## 2. Current Sprint Goal

Job-dashboard upgrade plan in `memories/session/plan.md` is implemented, reviewed PASS for the dashboard surface, committed on branch `apollomakesit/job-dashboard-runner-screening`, and opened as PR #2. Remaining sprint work is repo-wide quick-gate cleanup outside the dashboard plan: root updater/tracker/liveness helper tests plus skill wrapper/symlink drift and Windows `chmod` tooling failure.

## 3. Architectural Decisions Log

| Date | Decision | Why | By |
|------|----------|-----|----|
| 2026-06-13 | Project onboarded with shared agent context layer | Cross-tool context continuity | new-project-init |
| 2026-06-13 | Reviewer failed the job-dashboard implementation | Several plan items are partially wired but broken or missing end-to-end UI/runner integration | Codex Reviewer |
| 2026-06-13 | Graphify code graph generated at commit `94609152` | Future agents need topology before touching the large root script/dashboard/TUI surface | Codex |
| 2026-06-13 | Keep current dashboard review as the active sprint after onboarding | User invoked onboarding while a Coder/Reviewer pipeline was already in progress | Codex |
| 2026-06-13 | Job-dashboard plan implemented through M7.1 and reviewed PASS | Dashboard package tests pass 248/248 and runtime health is OK; repo quick gate failures are separate root/tooling issues | Codex |
| 2026-06-13 | Portal discovery parallelism uses one shared persistent browser context with per-portal workers and bounded detail-page pools | Playwright persistent profile cannot be opened by multiple browsers; tabs share login cookies and respect pause/stop state | Codex |
| 2026-06-13 | Discovery auto-chains AI fit scoring using `AI_FIT_SINCE`/`createdSince` from the discover run start | Keeps auto-scoring scoped to newly imported jobs instead of the dashboard's arbitrary first page | Codex |
| 2026-06-13 | Keep generated `graphify-out/` artifacts uncommitted and commit only `memories/graph-snapshot.md` | The compact snapshot carries durable topology context without adding bulky generated graph artifacts to the reviewed dashboard PR | Codex |

## 4. Known Pitfalls

- Run `node update-system.mjs check` and `node doctor.mjs --json` at session start per `AGENTS.md`; missing `modes/_profile.md` can be copied from `modes/_profile.template.md`, but do not proceed with evaluations if core onboarding files are missing.
- User layer is protected: `cv.md`, `config/profile.yml`, `modes/_profile.md`, `article-digest.md`, `portals.yml`, `data/*`, `reports/*`, `output/*`, and `interview-prep/*` are personalization/data. Do not put user-specific content in system files like `modes/_shared.md`.
- Never auto-submit applications. The dashboard/runner may fill forms, but the user must review and click the final submit/send/apply action.
- New tracker entries should be written as TSV files under `batch/tracker-additions/` and merged with `node merge-tracker.mjs`; edit `data/applications.md` directly only for updates to existing rows.
- Offer liveness verification must use Playwright for real user-facing evaluations. Web fetch/search is not trusted for active/closed status except documented batch fallback.
- `createRunnerClient().fetchJobs()` previously serialized only `incomplete`, `limit`, `offset`, and `portal`; runner filters such as `status` are silently dropped unless added to `queryString()`.
- `store.listJobs({ status: 'a,b' })` is exact-match SQL, not CSV membership. Multi-status endpoints need multiple queries or `IN` support.
- `createJob()` upserts by URL but does not persist `notes`, so do not use it for status/note-only updates.
- `node test-all.mjs --quick` is the CI gate but can fail locally on Windows/tooling issues (`chmod`, wrapper/symlink checks, tracker fixtures). Report exact failures; do not call the gate green unless it is green.
- Graphify output is code-only/no semantic LLM; use `memories/graph-snapshot.md` for orientation, then confirm important edges in source.
- Discovery parallelization must not open multiple persistent browser contexts for the same profile. Use one shared context plus tabs/pages per portal/detail worker.
- Screening-answer generation must stay grounded in CV/profile/projects/proof/writing samples and should mark uncertainty with confirmation markers rather than inventing details.

## 5. Dependency Graph Snapshot

- Snapshot: `memories/graph-snapshot.md`
- Last generated: 2026-06-13 05:55 Europe/Bucharest
- Generated at commit: `4a3b938e`
- Raw artifacts: `graphify-out/` (`GRAPH_REPORT.md`, `graph.json`, `graph.html`, `manifest.json`)
- Note: `code-index .` was attempted during onboarding but did not produce `memories/code-index.md`.

## 6. Open Tasks

- [x] Run first Graphify scan and fill section 5.
- [x] Fill Project Summary and context-layer onboarding notes.
- [x] Add a module compass in `MAP.md`.
- [x] Fix Reviewer FAIL findings in `memories/session/review.md`.
- [x] Re-run `npm --prefix apps/job-dashboard test` after dashboard fixes.
- [x] Re-run `node test-all.mjs --quick`; separate implementation failures from pre-existing Windows/tooling failures.
- [x] Keep generated `graphify-out/` uncommitted and retain only the compact memory snapshot.
- [ ] Fix residual repo quick-gate failures: updater/tracker/liveness helper crashes, missing `.opencode` skill link, `.claude` skill wrapper drift, tracker derived-index failures, and Windows `chmod` batch-rate-limit test.

## 7. Last Session Handoff Note

**From:** codex-cli (coder/push-pr) -> **To:** any
**When:** 2026-06-13 13:35 Europe/Bucharest
**Task:** Commit and push the reviewed job-dashboard upgrade batch.
**Current files:**
- Branch `apollomakesit/job-dashboard-runner-screening` contains commit `212f38e` with the reviewed dashboard upgrade batch.
- PR: https://github.com/Apolloemakesit-Org/career-ops/pull/2
- `apps/job-dashboard/**` changes include screening answers, runner supervisor/settings, liveness/status note updates, parallel discovery, auto-fit chaining, NEW badge UI, and tests.
- `memories/PROJECT_CONTEXT.md` / `memories/graph-snapshot.md` carry the refreshed context layer; generated `graphify-out/` artifacts were intentionally left uncommitted.
**Last changes (newest first):**
1. Created PR #2 on `Apolloemakesit-Org/career-ops` for branch `apollomakesit/job-dashboard-runner-screening`.
2. Pushed commit `212f38e feat(job-dashboard): add runner screening automation` to `origin`.
3. Staged only the reviewed dashboard/context files; secret scan found redaction logic, env names, and dummy test keys, not real credentials.
4. Confirmed `origin/main` is the default branch, so work was pushed on a feature branch instead of directly to `main`.
5. Preserved the previous Reviewer PASS and residual root quick-gate failure notes in `memories/session/review.md`.
**Graph snapshot:** `memories/graph-snapshot.md` @ 2026-06-13 05:55 Europe/Bucharest (fresh for commit `4a3b938e`)
**Verified:**
- `node update-system.mjs check` -> up-to-date 1.10.0.
- `node doctor.mjs --json` -> onboardingNeeded false; warning: Playwright MCP tools not detected.
- `git diff --check` -> pass, with existing CRLF warning for `apps/job-dashboard/runner/liveness-sweep-runner.mjs`.
- `git push -u origin apollomakesit/job-dashboard-runner-screening` -> branch pushed; GitHub reported repo moved to `Apolloemakesit-Org/career-ops`.
- `gh pr create --repo Apolloemakesit-Org/career-ops ...` -> https://github.com/Apolloemakesit-Org/career-ops/pull/2
- Prior dashboard verification still stands: `npm --prefix apps/job-dashboard test` -> 248/248 pass; runtime `/api/health` smoke -> HTTP 200 SQLite OK; `graphify update . --force` -> 3253 nodes, 4400 edges, 207 communities.
- Prior repo quick gate still stands: `node test-all.mjs --quick` -> 242 passed, 12 failed, 0 warnings.
**Unresolved questions:**
- Should residual root quick-gate failures be fixed on this PR branch or as a separate follow-up?
**Next immediate action:** Fix the root quick-gate failures listed in `memories/session/review.md` under "Residual Gate Failures", or review/merge PR #2 first if the dashboard batch should stay isolated.
