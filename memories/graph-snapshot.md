# Dependency Graph Snapshot

## Current
**Generated:** 2026-06-13 02:10 Europe/Bucharest
**Commit:** 94609152
**Tool:** `graphify update . --force` (code graph, no semantic LLM)

### Summary
- Corpus: 247 files, about 1.43M words; graph has 3120 nodes, 4145 edges, and 194 communities.
- Entry points: root Node scripts (`scan.mjs`, `generate-pdf.mjs`, `merge-tracker.mjs`, `verify-pipeline.mjs`, `test-all.mjs`), agent loaders/modes (`AGENTS.md`, `modes/*`), job dashboard (`apps/job-dashboard/src/server.mjs`, `apps/job-dashboard/src/routes.mjs`, runner scripts), and Go TUI (`dashboard/main.go`).
- Core hubs: dashboard API dispatch/filtering (`dispatchApi()`, `buildJobsWhere()`), dashboard browser UI (`showJobDetails()`, `withButtonLoading()`), scanner/liveness helpers (`checkUrlLiveness()`, `classifyLiveness()`), tracker merge/normalization, and Go TUI models (`PipelineModel`, `ViewerModel`, `NewPipelineModel()`).
- Leaf/util areas: ATS provider detectors, language-specific modes under `modes/*`, templates/docs, migration files, and one-off validation/updater scripts.
- Smells: `test-all.mjs`, `apps/job-dashboard/public/app.js`, and `apps/job-dashboard/src/routes.mjs` are large cross-cutting hubs; 1599 weakly connected nodes indicate docs/generated text dominate parts of the graph. Graphify extraction was code-only, so inferred cross-file relationships need source confirmation before architectural decisions.

### Navigation Notes
- Dashboard feature/API work usually starts in `apps/job-dashboard/src/routes.mjs`, with persistence in `apps/job-dashboard/src/schema.mjs` and migrations in `apps/job-dashboard/src/migrations/`.
- Runner/browser automation lives under `apps/job-dashboard/runner/`; dashboard-to-runner client behavior is in `runner/api-client.mjs` and local control state in `runner/control-server*.mjs`.
- Root career-ops pipeline integrity is maintained by `merge-tracker.mjs`, `verify-pipeline.mjs`, `dedup-tracker.mjs`, and `normalize-statuses.mjs`.
- Offer liveness checks should reuse `liveness-core.mjs` / `liveness-browser.mjs`; do not invent new expired/active heuristics unless the shared core is insufficient.

## Change Log
### 2026-06-13 - first real graph snapshot
**Commit:** 94609152
**Diff vs previous:** Replaced scaffold placeholder with Graphify summary. Raw generated graph artifacts are in `graphify-out/`.
