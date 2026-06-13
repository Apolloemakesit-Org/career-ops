import test from 'node:test';
import assert from 'node:assert/strict';

import { createRunnerSupervisor, shouldAutoSpawn } from '../src/runner-supervisor.mjs';

test('shouldAutoSpawn enables only local non-opted-out dashboards', () => {
  assert.equal(shouldAutoSpawn({}), true);
  assert.equal(shouldAutoSpawn({ DATABASE_URL: 'postgres://db' }), false);
  assert.equal(shouldAutoSpawn({ DATABASE_URL: 'postgres://db', CAREER_OPS_LOCAL: '1' }), true);
  assert.equal(shouldAutoSpawn({ DASHBOARD_AUTO_RUNNER: '0' }), false);
});

test('supervisor treats an already healthy runner as external', async () => {
  const supervisor = createRunnerSupervisor({
    fetchImpl: async () => ({ ok: true }),
    spawnImpl: () => {
      throw new Error('should not spawn');
    },
  });

  const status = await supervisor.start();

  assert.equal(status.mode, 'external');
});

test('supervisor spawns the control server when health check fails', async () => {
  const spawned = [];
  const child = fakeChild(321);
  const supervisor = createRunnerSupervisor({
    fetchImpl: async () => {
      throw new Error('offline');
    },
    spawnImpl: (command, args, options) => {
      spawned.push({ command, args, options });
      return child;
    },
    controlScript: 'C:/repo/apps/job-dashboard/runner/control-server.mjs',
  });

  const status = await supervisor.start();
  child.emitStdout('ready\n');

  assert.equal(status.mode, 'spawned');
  assert.equal(status.pid, 321);
  assert.equal(spawned[0].args.at(-1), 'C:/repo/apps/job-dashboard/runner/control-server.mjs');
  assert.equal(spawned[0].options.windowsHide, true);
  assert.match(supervisor.status().logs.at(-1).message, /ready/);
});

test('supervisor restarts crashed managed control server with backoff', async () => {
  const children = [];
  const timers = [];
  const supervisor = createRunnerSupervisor({
    fetchImpl: async () => ({ ok: false, status: 503 }),
    spawnImpl: () => {
      const child = fakeChild(400 + children.length);
      children.push(child);
      return child;
    },
    setTimeoutImpl: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    clearTimeoutImpl: () => {},
    backoffMs: 10,
  });

  await supervisor.start();
  children[0].emitClose(1);

  assert.equal(supervisor.status().mode, 'restarting');
  assert.equal(supervisor.status().restarts, 1);
  assert.equal(timers[0].ms, 10);

  timers[0].fn();
  assert.equal(supervisor.status().mode, 'spawned');
  assert.equal(supervisor.status().pid, 401);
});

test('supervisor marks failed after max restarts', async () => {
  const children = [];
  const timers = [];
  const supervisor = createRunnerSupervisor({
    fetchImpl: async () => ({ ok: false, status: 503 }),
    spawnImpl: () => {
      const child = fakeChild(500 + children.length);
      children.push(child);
      return child;
    },
    setTimeoutImpl: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    clearTimeoutImpl: () => {},
    maxRestarts: 1,
    backoffMs: 1,
  });

  await supervisor.start();
  children[0].emitClose(1);
  timers[0].fn();
  children[1].emitClose(1);

  assert.equal(supervisor.status().mode, 'failed');
  assert.match(supervisor.status().lastError, /Failed after 1 restart/);
});

function fakeChild(pid) {
  const listeners = {};
  return {
    pid,
    stdout: { on(event, fn) { listeners[`stdout:${event}`] = fn; } },
    stderr: { on(event, fn) { listeners[`stderr:${event}`] = fn; } },
    on(event, fn) { listeners[event] = fn; },
    kill() {
      listeners.close?.(0);
    },
    emitStdout(text) {
      listeners['stdout:data']?.(Buffer.from(text));
    },
    emitClose(code) {
      listeners.close?.(code);
    },
  };
}
