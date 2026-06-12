# Project Context - career-ops

> Canonical shared memory for ALL AI agents (Claude CLI, Codex CLI, Gemini
> CLI, Windsurf/Devin, and Devin CLI). Read this FIRST every session. Update it LAST every
> session. Protocol: `~/.agents/AGENT_PROTOCOL.md`.

Last updated: 2026-06-13 by Codex

## 1. Project Summary

career-ops is a local-first AI job-search automation system for evaluating postings, generating tailored CVs/PDFs, scanning job portals, tracking applications, and managing follow-ups.
The root system is Node.js `.mjs` scripts plus Markdown/YAML data (`cv.md`, `portals.yml`, `data/*`, `reports/*`) and Playwright for scraping/PDF/liveness work.
There is a local job dashboard app in `apps/job-dashboard` (Node ESM server, SQLite/Postgres stores, static frontend, Playwright runner/control server) and a separate Go Bubble Tea TUI under `dashboard/`.
Agent behavior is configured through `AGENTS.md`, CLI wrappers, and `modes/*`; user-specific personalization belongs only in the user layer described by `DATA_CONTRACT.md`.

## 2. Current Sprint Goal

Fix the Reviewer FAIL findings for the job-dashboard implementation against `memories/session/plan.md`: runner status serialization, liveness note persistence, cadence multi-status filtering, Review queue PDF UI, and cloud runner `aiBaseUrl` propagation.

## 3. Architectural Decisions Log

| Date | Decision | Why | By |
|------|----------|-----|----|
| 2026-06-13 | Project onboarded with shared agent context layer | Cross-tool context continuity | new-project-init |
| 2026-06-13 | Reviewer failed the job-dashboard implementation | Several plan items are partially wired but broken or missing end-to-end UI/runner integration | Codex Reviewer |
| 2026-06-13 | Graphify code graph generated at commit `94609152` | Future agents need topology before touching the large root script/dashboard/TUI surface | Codex |
| 2026-06-13 | Keep current dashboard review as the active sprint after onboarding | User invoked onboarding while a Coder/Reviewer pipeline was already in progress | Codex |

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

## 5. Dependency Graph Snapshot

- Snapshot: `memories/graph-snapshot.md`
- Last generated: 2026-06-13 02:10 Europe/Bucharest
- Generated at commit: `94609152`
- Raw artifacts: `graphify-out/` (`GRAPH_REPORT.md`, `graph.json`, `graph.html`, `manifest.json`)
- Note: `code-index .` was attempted during onboarding but did not produce `memories/code-index.md`.

## 6. Open Tasks

- [x] Run first Graphify scan and fill section 5.
- [x] Fill Project Summary and context-layer onboarding notes.
- [x] Add a module compass in `MAP.md`.
- [ ] Fix Reviewer FAIL findings in `memories/session/review.md`.
- [ ] Re-run `npm --prefix apps/job-dashboard test` after dashboard fixes.
- [ ] Re-run `node test-all.mjs --quick`; separate implementation failures from pre-existing Windows/tooling failures.
- [ ] Decide whether to commit generated `graphify-out/` or keep only the compact memory snapshot.

## 7. Last Session Handoff Note

**From:** codex-cli (project-onboard) -> **To:** any
**When:** 2026-06-13 02:28 Europe/Bucharest
**Task:** Finish `/project-onboard` after the initial context scaffold and Graphify run.
**Current files:**
- `memories/PROJECT_CONTEXT.md` - canonical project summary, active sprint, pitfalls, graph freshness, and this handoff.
- `memories/graph-snapshot.md` - real Graphify summary for commit `94609152`.
- `MAP.md` - module compass for root scripts, dashboard, runner, TUI, and CI.
- `AGENTS.md` / `.windsurfrules` / `OPENCODE.md` - loader/context wrapper cleanup.
- `memories/session/review.md` - existing Reviewer FAIL verdict remains the source of truth for the next coding task.
**Last changes (newest first):**
1. Completed project onboarding context files and preserved the active dashboard review pipeline.
2. Replaced graph snapshot scaffold with a compact Graphify summary; raw graph artifacts are in `graphify-out/`.
3. Added/filled loader context so AGENTS-importing tools, OpenCode, and Windsurf know the same commands and gotchas.
4. Confirmed career-ops setup checks: update checker is up to date and doctor reports onboarding not needed.
5. Did not commit because the worktree already contains unrelated dashboard implementation changes from the Coder/Reviewer pipeline.
**Graph snapshot:** `memories/graph-snapshot.md` @ 2026-06-13 02:10 Europe/Bucharest (fresh for commit `94609152`; regenerate after substantial dashboard fixes)
**Verified:**
- `node update-system.mjs check` -> up-to-date 1.10.0.
- `node doctor.mjs --json` -> onboardingNeeded false; warning: Playwright MCP tools not detected.
- `graphify update . --force` was already run in this onboarding flow -> 3120 nodes, 4145 edges, 194 communities.
- Prior reviewer run: `npm --prefix apps/job-dashboard test` -> 215/215 pass.
- Prior reviewer run: `node test-all.mjs --quick` -> 240 passed, 14 failed.
**Unresolved questions:**
- Should `graphify-out/` be committed, or should the repo keep only `memories/graph-snapshot.md`?
- Should the Coder address CI wrapper/symlink failures now or only after the dashboard Reviewer blockers are fixed?
**Next immediate action:** Enter Coder role and fix the five blockers in `memories/session/review.md`, starting with `apps/job-dashboard/runner/api-client.mjs` status query serialization.
