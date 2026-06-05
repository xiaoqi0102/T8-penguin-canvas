import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);

function read(rel: string) {
  return readFileSync(new URL(rel, import.meta.url), 'utf8');
}

test('achievement manifest gives every system theme time milestones and featured medals', () => {
  const manifest = JSON.parse(read('../shared/achievementManifest.json'));
  assert.equal(manifest.schema, 't8-achievement-manifest');
  assert.equal(manifest.themes.length, 10);
  assert.equal(manifest.timeMilestones.length, 5);
  for (const theme of manifest.themes) {
    assert.equal(theme.featured.length, 3, `${theme.style} should have first-batch featured achievements`);
  }
  assert.equal(manifest.films.length, 4);
  assert.equal(manifest.films.every((film: any) => film.lockedText === '待解锁'), true);
  assert.equal(manifest.films.every((film: any) => film.unavailableText === '影片素材待提供'), true);

  const source = read('../src/data/achievementManifest.ts');
  assert.match(source, /buildAchievementDefinitions/);
  assert.match(source, /\$\{theme\.style\}-time-\$\{milestone\.key\}/);
  assert.match(source, /normalizeAchievementTheme/);
});

test('achievement backend records active time, hidden mode, and film placeholders', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't8-achievements-'));
  const config = require('../backend/src/config.js');
  const oldFile = config.ACHIEVEMENTS_FILE;
  config.ACHIEVEMENTS_FILE = path.join(tmpDir, 'data', 'achievements.json');
  t.after(() => {
    config.ACHIEVEMENTS_FILE = oldFile;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const express = require('express');
  const achievementsRouter = require('../backend/src/routes/achievements.js');
  const app = express();
  app.use('/api/achievements', achievementsRouter);

  const server = await new Promise<any>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;

  for (let i = 0; i < 20; i += 1) {
    const tick = await fetch(`${base}/api/achievements/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'theme.active_tick', theme: 'tech', amountSeconds: 30 }),
    }).then((res) => res.json());
    assert.equal(tick.success, true);
  }

  const hiddenEnabled = await fetch(`${base}/api/achievements/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'hidden_mode.enabled', theme: 'rh', kind: 'rh-duck', nodeType: 'upload' }),
  }).then((res) => res.json());
  assert.equal(hiddenEnabled.success, true);

  const hiddenUsed = await fetch(`${base}/api/achievements/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'hidden_mode.used', theme: 'rh', kind: 'rh-duck', nodeType: 'upload' }),
  }).then((res) => res.json());
  assert.equal(hiddenUsed.success, true);

  const resourceSaved = await fetch(`${base}/api/achievements/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'resource.saved', theme: 'pixel', kind: 'image', category: 'image_uncategorized' }),
  }).then((res) => res.json());
  assert.equal(resourceSaved.success, true);

  const workflowSaved = await fetch(`${base}/api/achievements/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'workflow.saved', theme: 'op', kind: 'workflow', category: 'workflow' }),
  }).then((res) => res.json());
  assert.equal(workflowSaved.success, true);

  const dragonPano = await fetch(`${base}/api/achievements/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'panorama.generated', theme: 'dragon-ball', nodeType: 'panorama-3d' }),
  }).then((res) => res.json());
  assert.equal(dragonPano.success, true);

  const profile = await fetch(`${base}/api/achievements/profile`).then((res) => res.json());
  assert.equal(profile.success, true);
  assert.equal(profile.data.profile.themeStats.tech.activeSeconds, 600);
  assert.ok(profile.data.profile.unlockedAchievements['tech-time-10m']);
  assert.ok(profile.data.profile.unlockedAchievements['rh-duck-door']);
  assert.ok(profile.data.profile.unlockedAchievements['rh-duck-decoded']);
  assert.equal(profile.data.profile.themeStats.pixel.resourcesSaved, 1);
  assert.equal(profile.data.profile.themeStats.op.workflowsSaved, 1);
  assert.equal(profile.data.profile.themeStats['dragon-ball'].panoramasGenerated, 1);
  assert.ok(profile.data.profile.unlockedAchievements['dragon-ball-shenron-pano']);
  assert.equal(profile.data.profile.unlockedFilms['film-rh-01'].hasMedia, false);
  assert.equal(profile.data.profile.unlockedFilms['film-rh-01'].status, 'awaiting-media');
  assert.equal(profile.data.profile.unlockedFilms['film-rh-01'].unavailableText, '影片素材待提供');
  assert.equal(profile.data.profile.unlockedFilms['film-dragon-ball-01'].status, 'awaiting-media');
});

test('achievement frontend and server are wired without recording prompt content', () => {
  const app = read('../src/App.tsx');
  const canvas = read('../src/components/Canvas.tsx');
  const nodeActionBar = read('../src/components/NodeActionBar.tsx');
  const materialContext = read('../src/components/MaterialContextMenu.tsx');
  const drawer = read('../src/components/AchievementDrawer.tsx');
  const upload = read('../src/components/nodes/UploadNode.tsx');
  const portrait = read('../src/components/nodes/PortraitMasterNode.tsx');
  const server = read('../backend/src/server.js');
  const store = read('../backend/src/achievements/store.js');
  const api = read('../src/services/api.ts');

  assert.match(app, /AchievementTracker/);
  assert.match(app, /AchievementButton/);
  assert.match(app, /AchievementDrawer/);
  assert.match(app, /AchievementToast/);
  assert.match(canvas, /trackAchievementEvent\(\{\s*type:\s*'node\.created'/);
  assert.match(canvas, /trackAchievementEvent\(\{\s*type:\s*'node\.run_success'/);
  assert.match(canvas, /type:\s*'panorama\.generated'/);
  assert.match(canvas, /type:\s*'parsehub\.resolved'/);
  assert.match(canvas, /type:\s*'workflow\.saved'/);
  assert.match(canvas, /type:\s*'resource\.saved'/);
  assert.match(materialContext, /type:\s*'resource\.saved'/);
  assert.match(drawer, /今日主题建议/);
  assert.match(drawer, /handleImportFile/);
  assert.match(drawer, /importData\(raw\)/);
  assert.match(nodeActionBar, /hidden_mode\.enabled/);
  assert.match(upload, /hidden_mode\.used/);
  assert.match(portrait, /hidden_mode\.used/);
  assert.match(server, /achievementsRouter/);
  assert.match(server, /\/api\/achievements/);
  assert.match(api, /recordAchievementEvent/);
  assert.match(store, /const event = \{/);
  assert.doesNotMatch(store, /prompt|shareUrl|url:/);
});
