#!/usr/bin/env node
import 'dotenv/config';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createRunnerClient } from './api-client.mjs';
import { launchBrowserContext } from './browser-profile.mjs';
import { buildRequiredFields, detectScreeningQuestions, fillKnownFields, normalizeQuestion } from './form-filler.mjs';
import { envFromLocalConfig, loadLocalConfig } from './local-config.mjs';

const runnerDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(runnerDir, '..', '..', '..');

const localEnv = envFromLocalConfig(loadLocalConfig());
const env = { ...localEnv, ...process.env };
const dashboardUrl = env.DASHBOARD_URL || 'http://localhost:3000';
const token = env.DASHBOARD_TOKEN || '';

const client = createRunnerClient({ baseUrl: dashboardUrl, token });
const packages = await client.fetchApprovedPackages();
const profile = await client.fetchProfile().catch(() => ({}));
const portals = await client.fetchPortals().catch(() => []);

if (packages.length === 0) {
  console.log('No approved packages waiting for the local runner.');
  process.exit(0);
}

const context = await launchBrowserContext(env);
const page = context.pages()[0] || await context.newPage();

try {
  for (const pkg of packages) {
    const missingFields = {};
    const url = pkg.jobUrl;

    if (!url || !/^https?:\/\//i.test(url)) {
      await client.markRunnerStatus(pkg.id, {
        runnerStatus: 'needs_manual_url',
        missingFields: { url: 'A public job URL is required for browser filling.' },
      });
      continue;
    }

    console.log(`Opening ${pkg.company || 'company'} - ${pkg.title || 'role'}`);
    await client.markRunnerStatus(pkg.id, { runnerStatus: 'opening_portal', missingFields: {} });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    const fields = buildRequiredFields({
      packageFields: pkg.requiredFields || {},
      profile,
      coverLetter: pkg.coverLetter || '',
    });

    if (pkg.cvPdfPath) {
      fields.cv = path.resolve(repoRoot, pkg.cvPdfPath);
    }
    if (pkg.coverLetterPdfPath) {
      fields.cover_letter_pdf = path.resolve(repoRoot, pkg.coverLetterPdfPath);
    }

    const portalConfig = portals.find(item => item.portal === pkg.portal) || {};
    await fillKnownFields(page, fields, missingFields, {
      fieldHints: portalConfig.fieldHints || {},
    });
    await fillScreeningQuestions({ page, client, pkg, missingFields });

    await client.markRunnerStatus(pkg.id, {
      runnerStatus: Object.keys(missingFields).length > 0 ? 'needs_missing_fields' : 'ready_for_user_submit',
      missingFields,
    });

    console.log('Stopped before final submit. Review the browser window before applying.');
  }
} finally {
  console.log('Leaving browser open for user review. Close it manually when done.');
}

async function fillScreeningQuestions({ page, client, pkg, missingFields }) {
  const questions = await detectScreeningQuestions(page).catch(() => []);
  if (questions.length === 0) return;
  if (!pkg.jobId) {
    missingFields.screening_questions = questions.map(item => item.question).join('\n');
    return;
  }

  let answers = await client.fetchAnswers(pkg.jobId).catch(() => []);
  const answerMap = new Map(answers.map(item => [normalizeQuestion(item.question), item]));
  const missingQuestions = questions
    .filter(item => !answerMap.has(normalizeQuestion(item.question)))
    .map(item => item.question);

  if (missingQuestions.length > 0) {
    try {
      const generated = await client.generateAnswers(pkg.jobId, missingQuestions, 'runner');
      answers = [...answers, ...generated];
      for (const item of generated) answerMap.set(normalizeQuestion(item.question), item);
    } catch (error) {
      missingFields.screening_questions = `Could not generate answers: ${error.message}`;
      return;
    }
  }

  const unfilled = [];
  for (const item of questions) {
    const answer = answerMap.get(normalizeQuestion(item.question));
    if (!answer?.answer) {
      unfilled.push(item.question);
      continue;
    }
    const filled = await page.locator(item.selector).fill(answer.answer, { timeout: 2000 }).then(() => true).catch(() => false);
    if (!filled) unfilled.push(item.question);
  }
  if (unfilled.length > 0) {
    missingFields.screening_questions = unfilled.join('\n');
  }
}
