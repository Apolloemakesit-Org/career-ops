#!/usr/bin/env node
import 'dotenv/config';

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

import { createRunnerClient } from './api-client.mjs';
import { describeBrowserProfile, launchBrowserContext } from './browser-profile.mjs';
import {
  buildDiscoveryBudgets,
  buildLocalMatchContext,
  markPartialDescription,
  needsDetailRescan,
  shouldImportJob,
} from './discovery-filter.mjs';
import { envFromLocalConfig, loadLocalConfig } from './local-config.mjs';
import { detectPortalSession, portalLoginUrl } from './portal-auth.mjs';
import { buildPortalSearchPlan, defaultPortalRows, keywordsFromProfile, normalizePortalRows, supportedPortals } from './portal-config.mjs';
import {
  dedupeJobs,
  mergeJobDetail,
} from './portal-extractor.mjs';
import {
  allPortalBudgetsReached,
  canImportForPortal,
  createPortalCounters,
  groupPlanByPortal,
  recordPortalImport,
} from './portal-discovery-core.mjs';
import { mapWithConcurrency } from './promise-pool.mjs';
import { runState } from './run-state.mjs';

const localEnv = envFromLocalConfig(loadLocalConfig());
const env = { ...localEnv, ...process.env };
const dashboardUrl = env.DASHBOARD_URL || 'http://localhost:3000';
const token = env.DASHBOARD_TOKEN || '';
const maxJobs = Number(env.PORTAL_DISCOVERY_MAX_JOBS || 1000);
const discoveryMode = String(env.PORTAL_DISCOVERY_MODE || 'new').trim().toLowerCase();
const perPortalLimit = Number(env.PORTAL_DISCOVERY_KEYWORDS_PER_PORTAL || 25);
const portalConcurrency = clampInt(env.PORTAL_DISCOVERY_PORTAL_CONCURRENCY, 4, 1, 20);
const detailConcurrency = clampInt(env.PORTAL_DISCOVERY_DETAIL_CONCURRENCY, 3, 1, 5);
const requestedPortals = (env.PORTAL_DISCOVERY_PORTALS || supportedPortals.join(','))
  .split(',')
  .map(item => item.trim().toLowerCase())
  .filter(Boolean);
const runnerDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(runnerDir, '..', '..', '..');

const client = createRunnerClient({ baseUrl: dashboardUrl, token });
const [profile, dashboardPortals] = await Promise.all([
  client.fetchProfile(),
  client.fetchPortals().catch(() => []),
]);
const portalRows = normalizePortalRows(
  dashboardPortals.length > 0 ? dashboardPortals : defaultPortalRows,
  { includeDisabled: discoveryMode === 'missing' },
)
  .filter(item => requestedPortals.includes(item.portal));
const plan = discoveryMode === 'missing'
  ? []
  : buildPortalSearchPlan({
      keywords: keywordsFromProfile(profile),
      portals: portalRows,
      perPortalLimit,
    });
const budgets = buildDiscoveryBudgets({
  totalMax: maxJobs,
  portals: portalRows.map(item => item.portal),
  perPortalMax: env.PORTAL_DISCOVERY_PER_PORTAL_MAX_JOBS,
});
const portalCounts = createPortalCounters(portalRows.map(item => item.portal));
const portalStats = createPortalStats(portalRows.map(item => item.portal));
const matchContext = buildLocalMatchContext({
  profile,
  textSources: [
    readOptionalFile(path.join(repoRoot, 'cv.md')),
    readOptionalFile(path.join(repoRoot, 'config', 'profile.yml')),
  ],
});

if (portalRows.length === 0) {
  console.log('No matching portals configured.');
  process.exit(0);
}

if (discoveryMode !== 'missing' && plan.length === 0) {
  console.log('No portal searches configured.');
  process.exit(0);
}

const rl = createInterface({ input, output });
const context = await launchBrowserContext(env, { stealth: portalRows.some(row => row.portal === 'hipo') });
const imported = [];
const failed = [];
let pendingImports = 0;
const pendingPortalImports = createPortalCounters(portalRows.map(item => item.portal));
let loginPromptChain = Promise.resolve();

try {
  console.log(`Using browser: ${describeBrowserProfile(env)}`);
  console.log(discoveryMode === 'missing'
    ? `Re-scanning incomplete job rows for ${portalRows.map(row => row.portal).join(', ')}.`
    : `Scanning ${plan.length} portal search page(s). Target: ${budgets.totalMax} jobs total, up to ${budgets.perPortalMax} per portal.`);
  console.log(`Discovery concurrency: ${portalConcurrency} portal worker(s), ${detailConcurrency} detail tab(s) per portal.`);
  console.log('Playwright will open each candidate detail page and capture the full description before import when the portal exposes it.');
  console.log('You can log in, solve 2FA, or accept cookies in the visible browser when prompted.');

  resetProgressForPortals(portalRows.map(row => row.portal));
  if (discoveryMode === 'missing') {
    await rescanMissingJobDetails({ context, client, portalRows, portalStats, imported });
  } else {
    await mapWithConcurrency(groupPlanByPortal(plan), portalConcurrency, group => runPortalWorker({
      portal: group.portal,
      items: group.items,
      context,
      client,
      portalStats,
      imported,
      failed,
    }), {
      shouldStop: shouldStopDiscovery,
    });
  }
} finally {
  await rl.close();
  console.log('\nDiscovery complete. Browser profile is preserved for the next run.');
  console.log(`Imported/updated jobs: ${imported.length}`);
  console.log('Per-portal discovery counts:');
  for (const [portal, stats] of Object.entries(portalStats)) {
    console.log(`  - ${portal}: imported=${stats.imported}, detail=${stats.detailCaptured}, partial=${stats.partialDetail}, skipped_location=${stats.skippedLocation}, skipped_relevance=${stats.skippedRelevance}, auth_required=${stats.authRequired}, failed_searches=${stats.failedSearches}`);
  }
  if (failed.length > 0) {
    console.log(`Failed searches: ${failed.length}`);
    for (const item of failed) console.log(`  - ${item.portal} ${item.keyword}: ${item.error}`);
  }
  await context.close();
}

async function runPortalWorker({ portal, items, context, client, portalStats, imported, failed }) {
  const page = await context.newPage();
  try {
    for (const item of items) {
      if (shouldStopDiscovery() || runState.isCancelled(portal)) {
        runState.setStatus(portal, 'done');
        break;
      }
      while (runState.isPaused(portal)) await delay(250);
      if (!canImportForPortal({ portal, importedTotal: importPressure(), counters: currentImportCounters(), budgets })) {
        console.log(`\nSkipping ${portal}: per-portal budget reached.`);
        runState.setStatus(portal, 'done');
        break;
      }

      console.log(`\nOpening ${portal}: ${item.keyword}`);
      runState.setStatus(portal, 'running');
      runState.setLastUrl(portal, item.url);
      try {
        const extractor = await loadExtractor(portal);
        await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
        const auth = await ensurePortalSession(page, portal, item.url, rl);
        if (auth.reloaded) await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
        await settleSearchResults(page);

        let jobs = dedupeJobs(await extractor.extractListPage(page, item));
        runState.incr(portal, 'discovered', jobs.length);

        // Only treat the page as needing a manual step when extraction found
        // nothing - a normal results page has a "log in" link too. Never block on
        // stdin when there is no interactive terminal (e.g. started from the
        // dashboard); the runner would hang forever waiting for Enter.
        if (jobs.length === 0 && await needsHumanIntervention(page)) {
          if (input.isTTY) {
            await askSerialized(`Manual step needed on ${portal}. Log in / solve CAPTCHA in the browser, then press Enter here to continue.`);
            jobs = dedupeJobs(await extractor.extractListPage(page, item));
          } else {
            console.log(`  ! ${portal} appears to need a manual login. Log into it in the open browser window, then run discovery again.`);
          }
        }
        console.log(`Found ${jobs.length} candidate job(s). Enriching details and filtering locally...`);
        await processJobsForPortal({ portal, jobs, context, client, portalStats, imported });
      } catch (error) {
        failed.push({ ...item, error: error.message });
        incrementStat(portalStats, portal, 'failedSearches');
        runState.incr(portal, 'errors');
        runState.setLastError(portal, error.message);
        runState.setStatus(portal, 'error');
        console.log(`  ! ${portal} failed: ${error.message}`);
      }
    }
  } finally {
    await page.close().catch(() => {});
    if (!runState.isCancelled(portal) && !['error', 'done'].includes(runState.snapshot().perPortal?.[portal]?.status)) {
      runState.setStatus(portal, 'done');
    }
  }
}

async function processJobsForPortal({ portal, jobs, context, client, portalStats, imported }) {
  const detailPages = [];
  const poolSize = Math.min(detailConcurrency, Math.max(1, jobs.length));
  try {
    for (let i = 0; i < poolSize; i += 1) detailPages.push(await context.newPage());
    const pagePool = [...detailPages];
    await mapWithConcurrency(jobs, detailConcurrency, async job => {
      const page = pagePool.pop();
      try {
        await processCandidateJob({ page, job, client, portalStats, imported });
      } catch (error) {
        incrementStat(portalStats, job.portal, 'failedSearches');
        runState.incr(job.portal, 'errors');
        runState.setLastError(job.portal, error.message);
        console.log(`  ! detail failed: ${job.company || 'Unknown'} | ${job.title}: ${error.message}`);
      } finally {
        pagePool.push(page);
      }
    }, {
      shouldStop: () => shouldStopDiscovery() || runState.isCancelled(portal),
    });
  } finally {
    await Promise.all(detailPages.map(page => page.close().catch(() => {})));
  }
}

async function processCandidateJob({ page, job, client, portalStats, imported }) {
  if (runState.isCancelled(job.portal)) return;
  while (runState.isPaused(job.portal)) await delay(250);

  const enriched = await enrichJobWithDetail(page, job);
  if (runState.isCancelled(job.portal)) return;
  if (enriched.authRequired) {
    incrementStat(portalStats, job.portal, 'authRequired');
    runState.incr(job.portal, 'errors');
    runState.setLastError(job.portal, enriched.authReason || 'Login required');
    console.log(`  ! login required: ${job.company || 'Unknown'} | ${job.title}`);
    return;
  }
  const decision = shouldImportJob(enriched, matchContext);
  runState.incr(job.portal, 'matched');
  if (!decision.import) {
    incrementStat(portalStats, job.portal, decision.reason === 'location' ? 'skippedLocation' : 'skippedRelevance');
    console.log(`  - skipped ${decision.reason}: ${job.company || 'Unknown'} | ${job.title}`);
    return;
  }

  if (!reserveImportSlot(job.portal)) return;
  try {
    const created = await client.createJob(enriched);
    imported.push(created);
    recordPortalImport(portalCounts, job.portal);
    runState.incr(job.portal, 'imported');
    incrementStat(portalStats, job.portal, 'imported');
    incrementStat(portalStats, job.portal, enriched.source?.includes(':detail') ? 'detailCaptured' : 'partialDetail');
    console.log(`  + ${portalCounts[job.portal]}/${budgets.remainingByPortal[job.portal]} ${created.fit?.score ?? created.fitScore ?? 0}% ${job.company || 'Unknown'} | ${job.title}`);
  } finally {
    releaseImportSlot(job.portal);
  }
}

async function rescanMissingJobDetails({ context, client, portalRows, portalStats, imported }) {
  const allowed = new Set(portalRows.map(row => row.portal));
  const existing = await client.fetchJobs({
    incomplete: true,
    portal: [...allowed],
    limit: Number(env.PORTAL_DISCOVERY_RESCAN_LIMIT || 5000),
  }).catch(() => []);
  const queue = existing
    .filter(job => allowed.has(String(job.portal || '').toLowerCase()))
    .filter(needsDetailRescan);
  const queuedByPortal = queue.reduce((counts, job) => {
    const portal = String(job.portal || '').toLowerCase();
    counts[portal] = (counts[portal] || 0) + 1;
    return counts;
  }, {});
  for (const portal of allowed) {
    runState.setQueued(portal, queuedByPortal[portal] || 0);
  }

  console.log(`Found ${queue.length} incomplete existing job row(s) to re-scan.`);
  const grouped = groupPlanByPortal(queue);
  await mapWithConcurrency(grouped, portalConcurrency, async ({ portal, items }) => {
    const pages = [];
    const poolSize = Math.min(detailConcurrency, Math.max(1, items.length));
    try {
      for (let i = 0; i < poolSize; i += 1) pages.push(await context.newPage());
      const pagePool = [...pages];
      await mapWithConcurrency(items, detailConcurrency, async job => {
        const page = pagePool.pop();
        try {
          await rescanMissingJob({ page, job, client, portalStats, imported });
        } finally {
          pagePool.push(page);
        }
      }, {
        shouldStop: () => runState.isCancelled(portal),
      });
    } finally {
      await Promise.all(pages.map(page => page.close().catch(() => {})));
      if (!runState.isCancelled(portal)) runState.setStatus(portal, 'done');
    }
  });
  for (const portal of allowed) {
    if (!runState.isCancelled(portal)) runState.setStatus(portal, 'done');
  }
}

async function rescanMissingJob({ page, job, client, portalStats, imported }) {
    const portal = String(job.portal || '').toLowerCase();
    if (runState.isCancelled(portal)) {
      runState.setStatus(portal, 'done');
      return;
    }
    while (runState.isPaused(portal)) await delay(250);
    runState.setStatus(portal, 'running');
    runState.setLastUrl(portal, job.url);
    runState.incr(portal, 'discovered');

    try {
      const enriched = await enrichJobWithDetail(page, job);
      if (enriched.authRequired) {
        incrementStat(portalStats, portal, 'authRequired');
        runState.incr(portal, 'errors');
        runState.setLastError(portal, enriched.authReason || 'Login required');
      console.log(`  ! login required: ${job.company || 'Unknown'} | ${job.title}`);
        return;
      }

      const created = await client.createJob(enriched);
      imported.push(created);
      runState.incr(portal, 'matched');
      runState.incr(portal, 'imported');
      incrementStat(portalStats, portal, 'imported');
      incrementStat(portalStats, portal, enriched.source?.includes(':detail') ? 'detailCaptured' : 'partialDetail');
      console.log(`  refreshed ${portal}: ${job.company || 'Unknown'} | ${job.title}`);
    } catch (error) {
      runState.incr(portal, 'errors');
      runState.setLastError(portal, error.message);
      console.log(`  ! refresh failed: ${job.company || 'Unknown'} | ${job.title}: ${error.message}`);
    } finally {
      runState.incr(portal, 'processed');
    }
}

function resetProgressForPortals(portals) {
  const uniquePortals = [...new Set(portals)];
  if (uniquePortals.length === supportedPortals.length && supportedPortals.every(portal => uniquePortals.includes(portal))) {
    runState.reset();
    return;
  }
  for (const portal of uniquePortals) runState.resetPortal(portal);
}

async function needsHumanIntervention(page) {
  const text = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  return /captcha|verify you are human|two-factor|2fa|sign in|log in|intra in cont|autentificare/i.test(text);
}

async function ensurePortalSession(page, portal, returnUrl, rl) {
  const session = await readPortalSession(page, portal);
  if (!session.needsLogin) {
    if (session.authenticated) console.log(`  auth ok: ${portal}`);
    return { ...session, reloaded: false };
  }

  const loginUrl = portalLoginUrl(portal);
  const message = `${portal} needs login (${session.reason}).`;
  runState.setLastError(portal, message);

  if (!input.isTTY || !loginUrl) {
    throw new Error(`${message} Open the Login Browser from the dashboard, finish signing into ${portal}, then run discovery again.`);
  }

  console.log(`  ! ${message} Opening the saved-profile login page now.`);
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
  await askSerialized(`Finish signing into ${portal} in the browser, then press Enter here to continue.`);

  const afterLogin = await readPortalSession(page, portal);
  if (afterLogin.needsLogin) {
    throw new Error(`${portal} still appears logged out (${afterLogin.reason}).`);
  }

  await page.goto(returnUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  return { ...afterLogin, reloaded: true };
}

async function readPortalSession(page, portal) {
  const [title, text] = await Promise.all([
    page.title().catch(() => ''),
    page.locator('body').innerText({ timeout: 5000 }).catch(() => ''),
  ]);
  return detectPortalSession({
    portal,
    url: page.url(),
    title,
    text,
  });
}

async function settleSearchResults(page) {
  for (let i = 0; i < 4; i += 1) {
    await page.mouse.wheel(0, 1800).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
  }
}

async function enrichJobWithDetail(page, job) {
  try {
    await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    const auth = await readPortalSession(page, job.portal);
    if (auth.needsLogin) {
      return {
        ...job,
        authRequired: true,
        authReason: `${job.portal} detail page needs login (${auth.reason})`,
      };
    }
    const extractor = await loadExtractor(job.portal);
    const detail = await extractor.extractDetail(page);
    const detailText = await page.locator('body').innerText({ timeout: 8000 }).catch(() => '');
    const merged = mergeJobDetail(job, detailText);
    const enriched = {
      ...(merged === job ? markPartialDescription(job) : merged),
      ...detail,
      description: detail.description || merged.description || job.description || '',
    };
    return enriched.description ? enriched : markPartialDescription(enriched);
  } catch {
    return markPartialDescription(job);
  }
}

async function loadExtractor(portal) {
  return import(`./extractors/${portal}.mjs`);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function readOptionalFile(filePath) {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function createPortalStats(portals) {
  return Object.fromEntries(portals.map(portal => [portal, {
    imported: 0,
    detailCaptured: 0,
    partialDetail: 0,
    skippedLocation: 0,
    skippedRelevance: 0,
    authRequired: 0,
    failedSearches: 0,
  }]));
}

function incrementStat(stats, portal, key) {
  if (!stats[portal]) return;
  stats[portal][key] = Number(stats[portal][key] || 0) + 1;
}

function reserveImportSlot(portal) {
  const name = String(portal || '').toLowerCase();
  if (!name) return false;
  if (!canImportForPortal({
    portal: name,
    importedTotal: importPressure(),
    counters: currentImportCounters(),
    budgets,
  })) return false;
  pendingImports += 1;
  pendingPortalImports[name] = Number(pendingPortalImports[name] || 0) + 1;
  return true;
}

function releaseImportSlot(portal = '') {
  pendingImports = Math.max(0, pendingImports - 1);
  const name = String(portal || '').toLowerCase();
  if (name) pendingPortalImports[name] = Math.max(0, Number(pendingPortalImports[name] || 0) - 1);
}

function importPressure() {
  return imported.length + pendingImports;
}

function currentImportCounters() {
  const counters = { ...portalCounts };
  for (const [portal, count] of Object.entries(pendingPortalImports)) {
    counters[portal] = Number(counters[portal] || 0) + Number(count || 0);
  }
  return counters;
}

function shouldStopDiscovery() {
  return importPressure() >= budgets.totalMax
    || allPortalBudgetsReached(currentImportCounters(), budgets);
}

function askSerialized(question) {
  const answer = loginPromptChain.then(() => rl.question(question));
  loginPromptChain = answer.catch(() => {});
  return answer;
}

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}
