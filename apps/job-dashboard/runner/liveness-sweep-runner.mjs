#!/usr/bin/env node
import 'dotenv/config';

import { createRunnerClient } from './api-client.mjs';
import { launchBrowserContext, openRunnerPage, describeBrowserProfile } from './browser-profile.mjs';
import { envFromLocalConfig, loadLocalConfig } from './local-config.mjs';
import { classifyLiveness } from '../../../liveness-core.mjs';

const localEnv = envFromLocalConfig(loadLocalConfig());
const env = { ...localEnv, ...process.env };
const dashboardUrl = env.DASHBOARD_URL || 'http://localhost:3000';
const token = env.DASHBOARD_TOKEN || '';

const client = createRunnerClient({ baseUrl: dashboardUrl, token });

async function main() {
  const jobs = await client.fetchJobs({
    status: 'discovered,evaluated,applied',
    limit: 1000
  });

  if (jobs.length === 0) {
    console.log('No active jobs to check for liveness.');
    return;
  }

  console.log(`Checking liveness for ${jobs.length} job(s)...`);
  console.log(`Using browser: ${describeBrowserProfile(env)}`);

  const context = await launchBrowserContext(env);
  const page = await openRunnerPage(context);

  let active = 0, expired = 0, uncertain = 0;

  for (const job of jobs) {
    if (!job.url || job.url.startsWith('manual:')) continue;

    console.log(`Checking ${job.company} | ${job.title}...`);
    try {
      const result = await checkLiveness(page, job.url);
      
      if (result.result === 'expired') {
        console.log(`  ❌ Expired: ${result.reason}`);
        await client.updateJob(job.id, {
          status: 'discarded',
          notes: `${job.notes || ''}\n[Liveness] Marked discarded: ${result.reason} (${new Date().toISOString()})`.trim()
        });
        expired++;
      } else if (result.result === 'active') {
        console.log('  ✅ Active');
        active++;
      } else {
        console.log(`  ⚠️ Uncertain: ${result.reason}`);
        uncertain++;
      }
    } catch (error) {
      console.log(`  ! Error: ${error.message}`);
      uncertain++;
    }
  }

  await context.close();
  console.log(`\nLiveness sweep complete: ${active} active, ${expired} expired, ${uncertain} uncertain.`);
}

async function checkLiveness(page, url) {
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

    const bodyText = await page.locator('body').innerText().catch(() => '');
    const applyControls = await page.locator('button, a').evaluateAll(elements => 
      elements.map(el => el.innerText).filter(text => text.length > 0 && text.length < 50)
    );

    return classifyLiveness({
      status: response?.status() || 0,
      finalUrl: page.url(),
      bodyText,
      applyControls
    });
  } catch (error) {
    return { result: 'uncertain', reason: error.message };
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
