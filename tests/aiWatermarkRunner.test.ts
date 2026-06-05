import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);

const {
  assertModeSupportsKind,
  buildAiWatermarkPlan,
  commandCandidates,
  invisibleArgs,
  normalizeInvisiblePipeline,
  normalizeMode,
  normalizeRegions,
  redactCommandArgs,
  versionAtLeast,
  visibleArgs,
} = require('../backend/src/tools/aiWatermark/runner.js');

test('normalizeMode keeps supported modes and falls back to smart', () => {
  assert.equal(normalizeMode('erase'), 'erase');
  assert.equal(normalizeMode('metadata'), 'metadata-remove');
  assert.equal(normalizeMode('unknown-mode'), 'smart');
});

test('visibleArgs uses registry-driven mark and safe defaults', () => {
  const args = visibleArgs('input.png', 'output.png', {
    mark: 'doubao',
    inpaintMethod: 'telea',
    detect: true,
    inpaint: false,
    stripMetadata: false,
  });

  assert.deepEqual(args.slice(0, 5), ['visible', 'input.png', '-o', 'output.png', '--mark']);
  assert.ok(args.includes('doubao'));
  assert.ok(args.includes('--no-inpaint'));
  assert.ok(args.includes('--detect'));
  assert.ok(args.includes('--keep-metadata'));
});

test('normalizeRegions accepts object and semicolon string forms', () => {
  assert.deepEqual(
    normalizeRegions([{ x: 10, y: 20, w: 30, h: 40 }, { x: 0, y: 0, w: 0, h: 10 }]),
    ['10,20,30,40'],
  );
  assert.deepEqual(normalizeRegions('1,2,3,4; 5,6,7,8'), ['1,2,3,4', '5,6,7,8']);
});

test('buildAiWatermarkPlan composes smart mode as visible auto plus metadata cleanup', () => {
  const plan = buildAiWatermarkPlan({
    mode: 'smart',
    sourcePath: 'source.png',
    outputPath: 'final.png',
    mediaKind: 'image',
    options: { runInvisible: false },
  });

  assert.equal(plan.mode, 'smart');
  assert.equal(plan.outputPath, 'final.png');
  assert.deepEqual(plan.steps.map((step: any) => step.label), ['visible-auto', 'metadata-remove']);
  assert.ok(plan.steps[0].args.includes('--mark'));
  assert.ok(plan.steps[0].args.includes('auto'));
  assert.equal(plan.steps[0].allowNoOutput, true);
});

test('buildAiWatermarkPlan includes invisible step only when requested', () => {
  const plan = buildAiWatermarkPlan({
    mode: 'smart',
    sourcePath: 'source.png',
    outputPath: 'final.png',
    mediaKind: 'image',
    options: { runInvisible: true, device: 'cpu' },
  });

  assert.deepEqual(plan.steps.map((step: any) => step.label), ['visible-auto', 'invisible', 'metadata-remove']);
  assert.ok(plan.steps[1].args.includes('--device'));
  assert.ok(plan.steps[1].args.includes('cpu'));
});

test('invisible maxResolution clamps tiny nonzero values to a safe diffusion size', () => {
  const plan = buildAiWatermarkPlan({
    mode: 'invisible',
    sourcePath: 'source.png',
    outputPath: 'final.png',
    mediaKind: 'image',
    options: { maxResolution: 128, steps: 1 },
  });

  const args = plan.steps[0].args;
  const index = args.indexOf('--max-resolution');
  assert.ok(index >= 0);
  assert.equal(args[index + 1], 256);
});

test('invisible keeps enough steps and strength for at least one diffusion timestep', () => {
  const plan = buildAiWatermarkPlan({
    mode: 'invisible',
    sourcePath: 'source.png',
    outputPath: 'final.png',
    mediaKind: 'image',
    options: { steps: 1, strength: 0.1 },
  });

  const args = plan.steps[0].args;
  const stepsIndex = args.indexOf('--steps');
  const strengthIndex = args.indexOf('--strength');
  assert.equal(args[stepsIndex + 1], 4);
  assert.equal(args[strengthIndex + 1], 0.25);
});

test('invisible pipeline names are version-aware for 0.8.9 controlnet migration', () => {
  assert.equal(versionAtLeast('0.8.9', '0.8.9'), true);
  assert.equal(versionAtLeast('0.8.7', '0.8.9'), false);
  assert.equal(normalizeInvisiblePipeline('ctrlregen', '0.8.9'), 'controlnet');
  assert.equal(normalizeInvisiblePipeline('controlnet', '0.8.7'), 'ctrlregen');
});

test('invisible 0.8.9 uses controlnet, auto, restore, polish and resolution options', () => {
  const args = invisibleArgs('source.png', 'final.png', {
    upstreamVersion: '0.8.9',
    pipeline: 'ctrlregen',
    minResolution: 1024,
    controlnetScale: 1.2,
    auto: true,
    adaptivePolish: true,
    restoreFaces: true,
    restoreFacesWeight: 0.35,
    unsharp: 0.4,
    protectText: true,
    protectFaces: true,
  });

  assert.ok(args.includes('--pipeline'));
  assert.equal(args[args.indexOf('--pipeline') + 1], 'controlnet');
  assert.equal(args[args.indexOf('--min-resolution') + 1], 1024);
  assert.equal(args[args.indexOf('--controlnet-scale') + 1], 1.2);
  assert.ok(args.includes('--auto'));
  assert.ok(args.includes('--adaptive-polish'));
  assert.ok(args.includes('--restore-faces'));
  assert.equal(args[args.indexOf('--restore-faces-weight') + 1], 0.35);
  assert.equal(args[args.indexOf('--unsharp') + 1], 0.4);
  assert.equal(args.includes('--protect-text'), false);
  assert.equal(args.includes('--protect-faces'), false);
});

test('invisible auto does not force the default pipeline so upstream can choose it', () => {
  const args = invisibleArgs('source.png', 'final.png', {
    upstreamVersion: '0.8.9',
    pipeline: 'default',
    auto: true,
  });
  assert.ok(args.includes('--auto'));
  assert.equal(args.includes('--pipeline'), false);
});

test('legacy invisible protection flags are only sent to 0.8.7 runtimes', () => {
  const defaultArgs = invisibleArgs('source.png', 'final.png', {});
  assert.equal(defaultArgs.includes('--no-protect-text'), false);
  assert.equal(defaultArgs.includes('--no-protect-faces'), false);
  assert.equal(defaultArgs.includes('--protect-text'), false);
  assert.equal(defaultArgs.includes('--protect-faces'), false);

  const protectedArgs = invisibleArgs('source.png', 'final.png', {
    upstreamVersion: '0.8.7',
    protectText: true,
    protectFaces: true,
  });
  assert.ok(protectedArgs.includes('--protect-text'));
  assert.ok(protectedArgs.includes('--protect-faces'));
  assert.equal(protectedArgs[protectedArgs.indexOf('--pipeline') + 1], 'default');
});

test('non-image media is limited to metadata operations', () => {
  assert.doesNotThrow(() => assertModeSupportsKind('metadata-check', 'audio'));
  assert.doesNotThrow(() => assertModeSupportsKind('metadata-remove', 'video'));
  assert.throws(() => assertModeSupportsKind('visible', 'video'), /视频 \/ 音频当前仅支持元数据/);
});

test('redactCommandArgs hides sensitive invisible watermark tokens in logs', () => {
  assert.deepEqual(
    redactCommandArgs(['invisible', 'source.png', '--hf-token', 'hf_secret_123', '--steps', '50']),
    ['invisible', 'source.png', '--hf-token', '***', '--steps', '50'],
  );
});

test('commandCandidates prefers explicit packaged sidecar runtime before generic PATH', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 't8-aiw-runtime-'));
  const scripts = path.join(root, 'Scripts');
  fs.mkdirSync(scripts, { recursive: true });
  fs.writeFileSync(path.join(root, 'python.exe'), '');
  fs.writeFileSync(path.join(scripts, 'remove-ai-watermarks.exe'), '');

  const previous = process.env.T8_REMOVE_AI_WATERMARKS_RUNTIME;
  process.env.T8_REMOVE_AI_WATERMARKS_RUNTIME = root;
  try {
    const labels = commandCandidates().map((item: any) => item.label);
    const runtimeIndex = labels.findIndex((label: string) => label.includes('T8_REMOVE_AI_WATERMARKS_RUNTIME'));
    const runtimePythonIndex = labels.findIndex((label: string) => label.includes('T8_REMOVE_AI_WATERMARKS_RUNTIME python'));
    const runtimeCliIndex = labels.findIndex((label: string) => label.includes('T8_REMOVE_AI_WATERMARKS_RUNTIME CLI'));
    const pathIndex = labels.findIndex((label: string) => label.includes('PATH remove-ai-watermarks'));
    assert.ok(runtimeIndex >= 0);
    assert.ok(runtimePythonIndex >= 0);
    assert.ok(runtimeCliIndex >= 0);
    assert.ok(runtimePythonIndex < runtimeCliIndex);
    assert.ok(pathIndex < 0 || runtimeIndex < pathIndex);
  } finally {
    if (previous === undefined) delete process.env.T8_REMOVE_AI_WATERMARKS_RUNTIME;
    else process.env.T8_REMOVE_AI_WATERMARKS_RUNTIME = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('electron packaging uses runtime archive for bundled ai watermark runtime', () => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
  const postBuild = fs.readFileSync(path.resolve('electron/_post_build.cjs'), 'utf8');
  const resource = pkg.build.extraResources.find((item: any) => item.to === 'tools/runtime-archives');
  assert.ok(resource);
  assert.ok(resource.filter.includes('remove-ai-watermarks-runtime.zip'));
  assert.match(postBuild, /remove-ai-watermarks-runtime\.zip/);
});
