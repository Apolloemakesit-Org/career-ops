# Project Knowledge Map

> Auto-generated compass file. Answers the Five Questions per module so agents
> can navigate without reading thousands of lines of code.
> Regenerate with `/compass` when the project structure changes.

## Root pipeline scripts

**Purpose:** Node `.mjs` commands run the canonical job-search pipeline: scan, evaluate, generate PDFs, merge tracker updates, verify state, and analyze follow-ups/patterns.

**Modification patterns:**
- To change tracker behavior, edit `merge-tracker.mjs`, `verify-pipeline.mjs`, `dedup-tracker.mjs`, or `normalize-statuses.mjs`, then run `node verify-pipeline.mjs`.
- To change PDF output, edit `generate-pdf.mjs` and `templates/cv-template.html`; LaTeX output is separate in `generate-latex.mjs` and `templates/cv-template.tex`.

**Build failure gotchas:**
- New tracker rows go to `batch/tracker-additions/*.tsv`; do not append new rows directly to `data/applications.md`.
- `node test-all.mjs --quick` is the CI gate and includes wrapper/data-contract checks outside normal unit tests.

**Dependencies:** imports config/data/templates; used by agents, batch workers, dashboard imports, and CI.

**Tribal knowledge:**
- User data lives in the user layer from `DATA_CONTRACT.md`; system defaults must not absorb personal targeting details.

## Agent modes and loaders

**Purpose:** `AGENTS.md`, CLI wrappers, and `modes/*` define how AI coding CLIs evaluate jobs, draft CVs, scan portals, and apply ethically.

**Modification patterns:**
- To customize a user's archetypes or narrative, edit `modes/_profile.md` or `config/profile.yml`, not `modes/_shared.md`.
- To change shared behavior for all users, update the relevant `modes/*.md` file and keep wrappers referencing `AGENTS.md`.

**Build failure gotchas:**
- CI expects `CLAUDE.md`, `OPENCODE.md`, and `GEMINI.md` to reference `AGENTS.md`.
- Skill wrappers under `.claude/skills/` and `.opencode/skills/` should resolve to `.agents/skills/career-ops/SKILL.md`.

**Dependencies:** read by Claude, Codex, Gemini, OpenCode, Qwen, Copilot, and batch headless workers.

**Tribal knowledge:**
- Never submit applications automatically; the user reviews final portal forms and clicks submit.

## Scanner and liveness

**Purpose:** Portal scanners and liveness modules discover jobs and classify active/expired postings.

**Modification patterns:**
- To add or fix ATS/direct providers, edit provider modules used by `scan.mjs` and validate with `node validate-portals.mjs` or `node scan.mjs`.
- To change expired/active rules, edit `liveness-core.mjs` and verify with `node check-liveness.mjs <url>`.

**Build failure gotchas:**
- User-facing offer verification requires Playwright; generic fetch/search can misclassify closed postings.
- Expired signals must win over generic Apply text.

**Dependencies:** consumes `portals.yml`, writes scan history/pipeline data, and is reused by dashboard liveness sweep work.

## apps/job-dashboard/

**Purpose:** Local web dashboard for job storage, operations, AI scoring/drafting, package review, and runner coordination.

**Modification patterns:**
- To add an API endpoint, edit `apps/job-dashboard/src/routes.mjs`; database shape lives in `src/schema.mjs` and `src/migrations/`.
- To add UI behavior, edit `apps/job-dashboard/public/app.js` and matching CSS/static markup under `public/`.
- To validate package changes, run `npm --prefix apps/job-dashboard test`.

**Build failure gotchas:**
- SQL store status filtering is exact match unless `buildJobsWhere()` explicitly supports multiple statuses.
- `public/app.js` and `src/routes.mjs` are large hubs; source-probe UI integration, not just backend routes.

**Dependencies:** imports root CV/profile/project data and runner clients; used by local browser at `http://127.0.0.1:3000`.

**Tribal knowledge:**
- The local workflow expects the runner/control server on `127.0.0.1:48731`; offline runner APIs should degrade without breaking the dashboard.

## apps/job-dashboard/runner/

**Purpose:** Playwright and control-server runners discover jobs, score/draft packages, fill applications, sync cloud/local runner state, and test AI models.

**Modification patterns:**
- To change dashboard API calls from runners, edit `runner/api-client.mjs`.
- To change local control operations, edit `runner/control-server*.mjs`; cloud sync logic is in `runner/cloud-sync.mjs`.
- To change form filling or file upload, edit `runner/form-filler.mjs` and `runner/playwright-runner.mjs`.

**Build failure gotchas:**
- Preserve the stop-before-submit gate.
- AI provider calls must honor configured `aiBaseUrl`; do not silently fall back to `http://127.0.0.1:8317`.

**Dependencies:** calls dashboard APIs and Playwright; depends on portal hints/config and generated package/PDF paths.

## dashboard/

**Purpose:** Go Bubble Tea TUI for viewing and updating the application pipeline.

**Modification patterns:**
- To change TUI behavior, start at `dashboard/main.go` and models under `dashboard/internal/`.
- To validate Go changes, run `go test ./...` inside `dashboard/`; full build is part of `node test-all.mjs`.

**Build failure gotchas:**
- Graphify flags `PipelineModel`, `ViewerModel`, and theme functions as central; keep model/view updates consistent.

**Dependencies:** reads the root tracker/reports; independent from the Node web dashboard.

## Tests and CI

**Purpose:** `test-all.mjs`, package tests, and GitHub Actions enforce data contract, wrappers, scripts, dashboard tests, and build health.

**Modification patterns:**
- For dashboard-only changes, run `npm --prefix apps/job-dashboard test` first.
- For repo readiness, run `node test-all.mjs --quick`; CI uses Node 24 and Go 1.26 on Ubuntu.

**Build failure gotchas:**
- Local Windows runs may fail Unix-specific checks such as `chmod`; report exact failures.
- Some checks validate repository packaging files, not only code behavior.

**Dependencies:** imports or shells into root scripts, dashboard package, Go TUI, and wrapper files.
