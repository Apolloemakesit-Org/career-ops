import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { getVoiceContext, invalidateVoiceCache } from '../src/voice-context.mjs';

test('loads narrative, proof points, and writing samples when present', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'career-ops-voice-'));
  try {
    mkdirSync(path.join(root, 'config'), { recursive: true });
    mkdirSync(path.join(root, 'writing-samples'), { recursive: true });
    writeFileSync(path.join(root, 'config', 'profile.yml'), [
      'narrative:',
      '  headline: "Support specialist who automates recurring work"',
    ].join('\n'));
    writeFileSync(path.join(root, 'article-digest.md'), 'Project Helios proof point.');
    writeFileSync(path.join(root, 'writing-samples', 'sample.md'), 'Clear, practical writing sample.');
    writeFileSync(path.join(root, 'writing-samples', 'README.md'), 'Ignore this.');

    invalidateVoiceCache();
    const context = getVoiceContext(root);

    assert.equal(context.voice.narrative.headline, 'Support specialist who automates recurring work');
    assert.match(context.voice.articleDigest, /Project Helios/);
    assert.match(context.voice.writingSamples, /practical writing sample/);
    assert.doesNotMatch(context.voice.writingSamples, /Ignore this/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    invalidateVoiceCache();
  }
});

test('missing voice files return empty context', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'career-ops-voice-empty-'));
  try {
    invalidateVoiceCache();
    const context = getVoiceContext(root);

    assert.deepEqual(context.voice.narrative, {});
    assert.equal(context.voice.articleDigest, '');
    assert.equal(context.voice.writingSamples, '');
  } finally {
    rmSync(root, { recursive: true, force: true });
    invalidateVoiceCache();
  }
});
