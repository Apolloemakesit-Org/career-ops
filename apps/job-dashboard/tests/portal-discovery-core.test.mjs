import test from 'node:test';
import assert from 'node:assert/strict';

import {
  allPortalBudgetsReached,
  canImportForPortal,
  createPortalCounters,
  groupPlanByPortal,
  recordPortalImport,
} from '../runner/portal-discovery-core.mjs';

test('groups search plan items by portal while preserving item order', () => {
  const grouped = groupPlanByPortal([
    { portal: 'ejobs', keyword: 'support' },
    { portal: 'linkedin', keyword: 'python' },
    { portal: 'eJobs', keyword: 'mdm' },
    { portal: '', keyword: 'ignored' },
  ]);

  assert.deepEqual(grouped, [
    {
      portal: 'ejobs',
      items: [
        { portal: 'ejobs', keyword: 'support' },
        { portal: 'ejobs', keyword: 'mdm' },
      ],
    },
    {
      portal: 'linkedin',
      items: [{ portal: 'linkedin', keyword: 'python' }],
    },
  ]);
});

test('tracks per-portal imports independently from the global budget', () => {
  const counters = createPortalCounters(['ejobs', 'bestjobs']);
  const budgets = {
    totalMax: 4,
    perPortalMax: 2,
    remainingByPortal: { ejobs: 2, bestjobs: 2 },
  };

  assert.equal(canImportForPortal({ portal: 'ejobs', importedTotal: 0, counters, budgets }), true);
  recordPortalImport(counters, 'ejobs');
  recordPortalImport(counters, 'ejobs');

  assert.equal(canImportForPortal({ portal: 'ejobs', importedTotal: 2, counters, budgets }), false);
  assert.equal(canImportForPortal({ portal: 'bestjobs', importedTotal: 2, counters, budgets }), true);
});

test('detects when every active portal reached its budget', () => {
  const counters = { ejobs: 250, bestjobs: 250, hipo: 249, linkedin: 250 };
  const budgets = {
    perPortalMax: 250,
    remainingByPortal: { ejobs: 250, bestjobs: 250, hipo: 250, linkedin: 250 },
  };

  assert.equal(allPortalBudgetsReached(counters, budgets), false);
  counters.hipo = 250;
  assert.equal(allPortalBudgetsReached(counters, budgets), true);
});
