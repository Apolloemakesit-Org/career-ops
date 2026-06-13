# Dependency Graph Snapshot

## Current
**Generated:** 2026-06-13 05:55 Europe/Bucharest
**Commit:** 4a3b938e
**Tool:** `graphify update . --force` (code graph, no semantic LLM)

### Summary
- Corpus: 259 files, about 1.44M words; graph has 3253 nodes, 4400 edges, and 207 communities.
- Entry points: root Node scripts (`scan.mjs`, `generate-pdf.mjs`, `merge-tracker.mjs`, `verify-pipeline.mjs`, `test-all.mjs`), agent loaders/modes (`AGENTS.md`, `modes/*`), job dashboard (`apps/job-dashboard/src/server.mjs`, `apps/job-dashboard/src/routes.mjs`, runner scripts), and Go TUI (`dashboard/main.go`).
- Core hubs: dashboard API dispatch/filtering (`dispatchApi()`, `buildJobsWhere()`), dashboard browser UI (`showJobDetails()`, `renderJobs()`), runner orchestration (`createRunnerManager()`, local control server, portal discovery runner), scanner/liveness helpers (`checkUrlLiveness()`, `classifyLiveness()`), tracker merge/normalization, and Go TUI models (`PipelineModel`, `ViewerModel`, `NewPipelineModel()`).
- New dashboard feature nodes since the previous snapshot: `runner/promise-pool.mjs`, `src/runner-supervisor.mjs`, `src/voice-context.mjs`, migration `0007-screening-answers.mjs`, and tests for those surfaces.
- Leaf/util areas: ATS provider detectors, language-specific modes under `modes/*`, templates/docs, migration files, and one-off validation/updater scripts.
- Smells: `test-all.mjs`, `apps/job-dashboard/public/app.js`, and `apps/job-dashboard/src/routes.mjs` remain large cross-cutting hubs; Graphify extraction was code-only, so inferred cross-file relationships need source confirmation before architectural decisions.

### Navigation Notes
- Dashboard feature/API work usually starts in `apps/job-dashboard/src/routes.mjs`, with persistence in `apps/job-dashboard/src/schema.mjs` and migrations in `apps/job-dashboard/src/migrations/`.
- Runner/browser automation lives under `apps/job-dashboard/runner/`; dashboard-to-runner client behavior is in `runner/api-client.mjs` and local control state in `runner/control-server*.mjs`.
- Root career-ops pipeline integrity is maintained by `merge-tracker.mjs`, `verify-pipeline.mjs`, `dedup-tracker.mjs`, and `normalize-statuses.mjs`.
- Offer liveness checks should reuse `liveness-core.mjs` / `liveness-browser.mjs`; do not invent new expired/active heuristics unless the shared core is insufficient.

## Change Log
### 2026-06-13 - job-dashboard runner and screening-answer graph refresh
**Commit:** 4a3b938e
**Diff vs previous:** Dashboard graph expanded from 3120/4145/194 to 3253/4400/207 after adding screening answers, voice context, runner supervisor, promise-pool concurrency, discovery auto-fit chaining, and corresponding tests.

### 2026-06-13 - first real graph snapshot
**Commit:** 94609152
**Diff vs previous:** Replaced scaffold placeholder with Graphify summary. Raw generated graph artifacts are in `graphify-out/`.
