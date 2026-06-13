import test from 'node:test';
import assert from 'node:assert/strict';

import { mapWithConcurrency } from '../runner/promise-pool.mjs';

test('maps items with bounded concurrency and preserves order', async () => {
  let active = 0;
  let maxActive = 0;

  const results = await mapWithConcurrency([1, 2, 3, 4], 2, async value => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await Promise.resolve();
    active -= 1;
    return value * 10;
  });

  assert.deepEqual(results, [10, 20, 30, 40]);
  assert.equal(maxActive, 2);
});

test('keeps sibling workers running when one item fails', async () => {
  const seen = [];

  const results = await mapWithConcurrency([1, 2, 3], 2, async value => {
    seen.push(value);
    if (value === 2) throw new Error('boom');
    return value;
  });

  assert.deepEqual(seen.sort(), [1, 2, 3]);
  assert.deepEqual(results, [1, undefined, 3]);
});

test('stops claiming new work when shouldStop is true', async () => {
  let claimed = 0;

  await mapWithConcurrency([1, 2, 3, 4], 1, async value => {
    claimed += 1;
    return value;
  }, {
    shouldStop: () => claimed >= 2,
  });

  assert.equal(claimed, 2);
});
