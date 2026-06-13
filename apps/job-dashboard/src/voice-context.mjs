import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

const srcDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(srcDir, '..', '..', '..');
const cache = new Map();

export function getVoiceContext(rootDir = repoRoot) {
  const resolved = path.resolve(rootDir);
  const files = voiceFiles(resolved);
  const signature = files.map(file => `${file}:${mtime(file)}`).join('|');
  const cached = cache.get(resolved);
  if (cached?.signature === signature) return cached.value;

  const profile = readProfile(path.join(resolved, 'config', 'profile.yml'));
  const articleDigest = readOptional(path.join(resolved, 'article-digest.md')).slice(0, 3000);
  const writingSamples = files
    .filter(file => file.includes(`${path.sep}writing-samples${path.sep}`))
    .map(file => readOptional(file))
    .filter(Boolean)
    .join('\n\n---\n\n')
    .slice(0, 4000);
  const value = {
    profile,
    voice: {
      narrative: profile.narrative || {},
      articleDigest,
      writingSamples,
    },
  };
  cache.set(resolved, { signature, value });
  return value;
}

export function invalidateVoiceCache() {
  cache.clear();
}

function voiceFiles(rootDir) {
  const files = [
    path.join(rootDir, 'config', 'profile.yml'),
    path.join(rootDir, 'article-digest.md'),
  ].filter(existsSync);
  const samplesDir = path.join(rootDir, 'writing-samples');
  if (existsSync(samplesDir)) {
    for (const entry of readdirSync(samplesDir, { withFileTypes: true })) {
      if (entry.isFile() && /\.md$/i.test(entry.name) && entry.name.toLowerCase() !== 'readme.md') {
        files.push(path.join(samplesDir, entry.name));
      }
    }
  }
  return files;
}

function readProfile(filePath) {
  const raw = readOptional(filePath);
  if (!raw) return {};
  try {
    return yaml.load(raw) || {};
  } catch {
    return {};
  }
}

function readOptional(filePath) {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function mtime(filePath) {
  try {
    return statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}
