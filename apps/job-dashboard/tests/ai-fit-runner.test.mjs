import test from 'node:test';
import assert from 'node:assert/strict';

import { scoreJobsWithAi, selectJobsForAiScoring } from '../runner/ai-fit-runner-core.mjs';

test('selects recent jobs with enough content for AI scoring', () => {
  const selected = selectJobsForAiScoring({
    jobs: [
      {
        id: 'job-1',
        title: 'Application Support Engineer',
        description: 'ServiceNow MDM Python automation',
        createdAt: '2026-06-13T03:00:00.000Z',
      },
      { id: 'job-2', title: '', description: '' },
      {
        id: 'job-3',
        title: 'Python Developer',
        description: 'FastAPI PostgreSQL background jobs',
        createdAt: '2026-06-12T20:00:00.000Z',
      },
    ],
    limit: 1,
    since: '2026-06-13T02:00:00.000Z',
  });

  assert.deepEqual(selected.map(job => job.id), ['job-1']);
});

test('scores jobs locally and posts fit data back to the dashboard', async () => {
  const updates = [];
  const logs = [];
  const seenFilters = [];

  const result = await scoreJobsWithAi({
    client: {
      async fetchProfile() { return { fullName: 'Ioan Stefan Vlaicu', skills: ['ServiceNow', 'MDM'] }; },
      async fetchJobs(filters) {
        seenFilters.push(filters);
        return [{
          id: 'job-1',
          fitScore: 72,
          company: 'ExampleSoft',
          title: 'Application Support Engineer',
          description: 'ServiceNow MDM support automation',
          createdAt: '2026-06-13T03:00:00.000Z',
        }];
      },
      async updateJobFit(jobId, fit) { updates.push({ jobId, fit }); return { id: jobId, fitScore: fit.score }; },
    },
    limit: 10,
    since: '2026-06-13T02:00:00.000Z',
    onLog: message => logs.push(message),
    generateFitScore: async ({ profile, job, rulesFit }) => ({
      score: 91,
      category: 'excellent',
      matchedSkills: profile.skills,
      missingSkills: [],
      riskFlags: [],
      recommendation: 'strong_apply',
      reasons: [`Rules score was ${rulesFit.score} for ${job.company}.`],
    }),
  });

  assert.equal(result.updated, 1);
  assert.deepEqual(seenFilters[0], { limit: 10, createdSince: '2026-06-13T02:00:00.000Z' });
  assert.equal(updates[0].jobId, 'job-1');
  assert.equal(updates[0].fit.score, 91);
  assert.match(logs.join('\n'), /Selected 1 job/);
});

test('spaces AI scoring requests when a cooldown is configured', async () => {
  const waits = [];
  await scoreJobsWithAi({
    client: {
      async fetchProfile() { return { skills: [] }; },
      async fetchJobs() {
        return [
          { id: 'job-1', title: 'One', description: 'content' },
          { id: 'job-2', title: 'Two', description: 'content' },
        ];
      },
      async updateJobFit() { return {}; },
    },
    cooldownMs: 250,
    wait: ms => {
      waits.push(ms);
      return Promise.resolve();
    },
    generateFitScore: async () => ({
      score: 80,
      category: 'good',
      matchedSkills: [],
      missingSkills: [],
      riskFlags: [],
      recommendation: 'review',
      reasons: [],
    }),
  });

  assert.deepEqual(waits, [250]);
});
