import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const srcDir = path.dirname(fileURLToPath(import.meta.url));
const defaultControlScript = path.resolve(srcDir, '..', 'runner', 'control-server.mjs');

export function shouldAutoSpawn(env = process.env) {
  const localMode = !env.DATABASE_URL || env.CAREER_OPS_LOCAL === '1';
  const optedOut = ['0', 'false', 'no'].includes(String(env.DASHBOARD_AUTO_RUNNER || '').trim().toLowerCase());
  return localMode && !optedOut;
}

export function createRunnerSupervisor({
  spawnImpl = spawn,
  fetchImpl = fetch,
  env = process.env,
  controlScript = defaultControlScript,
  healthUrl = 'http://127.0.0.1:48731/health',
  maxRestarts = 5,
  backoffMs = 500,
  now = () => new Date(),
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
  maxLogs = 100,
} = {}) {
  const autoSpawn = shouldAutoSpawn(env);
  const state = {
    mode: autoSpawn ? 'idle' : 'disabled',
    pid: null,
    restarts: 0,
    maxRestarts,
    startedAt: null,
    nextRestartAt: null,
    lastError: '',
    logs: [],
  };
  let child = null;
  let stopping = false;
  let restartTimer = null;

  async function start() {
    if (!autoSpawn) {
      state.mode = 'disabled';
      return status();
    }
    if (child) return status();

    if (await healthCheck()) {
      state.mode = 'external';
      return status();
    }

    spawnControl();
    return status();
  }

  function stop() {
    stopping = true;
    if (restartTimer) {
      clearTimeoutImpl(restartTimer);
      restartTimer = null;
    }
    if (child) {
      child.kill?.();
      child = null;
    }
    if (state.mode === 'spawned' || state.mode === 'restarting') {
      state.mode = 'stopped';
      state.pid = null;
    }
    return status();
  }

  function status() {
    return {
      ...state,
      logs: [...state.logs],
    };
  }

  async function healthCheck() {
    try {
      const response = await fetchImpl(healthUrl);
      if (response.ok) return true;
      state.lastError = `Health check returned ${response.status || 'not ok'}`;
    } catch (error) {
      state.lastError = error.message;
    }
    return false;
  }

  function spawnControl() {
    stopping = false;
    state.mode = 'spawned';
    state.startedAt = now().toISOString();
    state.nextRestartAt = null;
    appendLog('system', 'Starting local runner control server.');

    try {
      child = spawnImpl(process.execPath, [controlScript], {
        cwd: path.dirname(controlScript),
        env: {
          ...process.env,
          ...env,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (error) {
      state.mode = 'failed';
      state.lastError = error.message;
      appendLog('stderr', error.message);
      return;
    }

    state.pid = child.pid || null;
    child.stdout?.on('data', chunk => appendChunk('stdout', chunk));
    child.stderr?.on('data', chunk => appendChunk('stderr', chunk));
    child.on?.('error', error => {
      state.lastError = error.message;
      appendLog('stderr', error.message);
    });
    child.on?.('close', code => handleClose(code));
  }

  function handleClose(code) {
    appendLog('system', `Local runner control server exited with code ${code}.`);
    child = null;
    state.pid = null;
    if (stopping) {
      state.mode = 'stopped';
      return;
    }
    if (state.restarts >= maxRestarts) {
      state.mode = 'failed';
      state.lastError = `Failed after ${state.restarts} restart(s).`;
      return;
    }
    state.restarts += 1;
    state.mode = 'restarting';
    const delay = backoffMs * (2 ** Math.max(0, state.restarts - 1));
    state.nextRestartAt = new Date(now().getTime() + delay).toISOString();
    restartTimer = setTimeoutImpl(() => {
      restartTimer = null;
      spawnControl();
    }, delay);
  }

  function appendChunk(stream, chunk) {
    for (const line of String(chunk).split(/\r?\n/).filter(Boolean)) {
      appendLog(stream, line);
    }
  }

  function appendLog(stream, message) {
    state.logs.push({
      at: now().toISOString(),
      stream,
      message,
    });
    if (state.logs.length > maxLogs) state.logs.splice(0, state.logs.length - maxLogs);
  }

  return { start, stop, status };
}
