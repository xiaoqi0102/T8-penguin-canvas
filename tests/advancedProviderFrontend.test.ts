import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  advancedProviderSummary,
  advancedProvidersForNode,
  advancedProviderModelOptions,
  resolveAdvancedProviderSelection,
  externalImageSizeFor,
  modelscopeLorasForModel,
  normalizeModelscopeLoraStrength,
  parseAdvancedProviderModelText,
  stringifyAdvancedProviderModels,
} from '../src/utils/advancedProviders.ts';

test('parseAdvancedProviderModelText accepts commas and new lines while removing duplicates', () => {
  assert.deepEqual(
    parseAdvancedProviderModelText('gpt-image-1, seedream-4\nseedream-4\n  veo-3.1  '),
    ['gpt-image-1', 'seedream-4', 'veo-3.1'],
  );
});

test('stringifyAdvancedProviderModels keeps compact one-model-per-line output', () => {
  assert.equal(
    stringifyAdvancedProviderModels(['gpt-image-1', '', 'seedream-4']),
    'gpt-image-1\nseedream-4',
  );
});

test('advancedProviderSummary mirrors settings folded header counts', () => {
  const summary = advancedProviderSummary([
    { id: 'modelscope', protocol: 'modelscope', enabled: true, apiKey: '****1234' },
    { id: 'comfyui', protocol: 'comfyui', enabled: false, baseUrl: 'http://127.0.0.1:8188' },
    { id: 'jimeng', protocol: 'jimeng-cli', enabled: true, jimengConfig: { executablePath: 'dreamina' } },
  ] as any);

  assert.equal(summary.enabledCount, 2);
  assert.equal(summary.configuredKeyCount, 1);
  assert.equal(summary.comfyuiConfigured, true);
  assert.equal(summary.jimengConfigured, true);
});

test('advancedProvidersForNode only exposes enabled providers supported by each node kind', () => {
  const providers = [
    { id: 'openai-compatible', label: 'OpenAI', protocol: 'openai-compatible', enabled: true, imageModels: ['gpt-image-1'], chatModels: ['gpt-4o-mini'] },
    { id: 'modelscope', label: 'ModelScope', protocol: 'modelscope', enabled: true, imageModels: ['MusePublic/489_ckpt_FLUX_1'], chatModels: ['Qwen/Qwen3-Coder'] },
    { id: 'volcengine', label: 'Volc', protocol: 'volcengine', enabled: false, imageModels: ['seedream'], videoModels: ['seedance'], chatModels: ['doubao'] },
    { id: 'comfyui', label: 'ComfyUI', protocol: 'comfyui', enabled: true, comfyuiConfig: { workflows: [] } },
    { id: 'jimeng-cli', label: 'Jimeng', protocol: 'jimeng-cli', enabled: true, imageModels: ['jimeng-image'], videoModels: ['jimeng-video'] },
  ] as any;

  assert.deepEqual(advancedProvidersForNode(providers, 'image').map((p) => p.id), [
    'openai-compatible',
    'modelscope',
    'jimeng-cli',
  ]);
  assert.deepEqual(advancedProvidersForNode(providers, 'llm').map((p) => p.id), [
    'openai-compatible',
    'modelscope',
  ]);
  assert.deepEqual(advancedProvidersForNode(providers, 'video').map((p) => p.id), [
    'jimeng-cli',
  ]);
});

test('advanced provider selection preserves valid saved provider and falls back to zhenzhen safely', () => {
  const providers = [
    { id: 'modelscope', label: 'ModelScope', protocol: 'modelscope', enabled: true, imageModels: ['flux-dev'] },
  ] as any;

  assert.deepEqual(resolveAdvancedProviderSelection(providers, 'image', {
    providerSource: 'modelscope',
    providerId: 'modelscope',
    providerModel: 'flux-dev',
  }), {
    providerSource: 'modelscope',
    providerId: 'modelscope',
    providerModel: 'flux-dev',
    provider: providers[0],
    available: true,
  });

  assert.deepEqual(resolveAdvancedProviderSelection(providers, 'image', {
    providerSource: 'openai-compatible',
    providerId: 'missing',
    providerModel: 'old-model',
  }), {
    providerSource: 'zhenzhen',
    providerId: '',
    providerModel: '',
    provider: null,
    available: false,
  });
});

test('advancedProviderModelOptions uses explicit lists before safe provider defaults', () => {
  assert.deepEqual(
    advancedProviderModelOptions({ id: 'openai-compatible', protocol: 'openai-compatible', imageModels: ['custom-image'] } as any, 'image'),
    ['custom-image'],
  );
  assert.deepEqual(
    advancedProviderModelOptions({ id: 'modelscope', protocol: 'modelscope' } as any, 'llm'),
    [
      'Qwen/Qwen3-235B-A22B',
      'Qwen/Qwen3-VL-235B-A22B-Instruct',
      'MiniMax/MiniMax-M2.7:MiniMax',
    ],
  );
  assert.deepEqual(
    advancedProviderModelOptions({ id: 'volcengine', protocol: 'volcengine' } as any, 'video'),
    [
      'doubao-seedance-2-0-260128',
      'doubao-seedance-2-0-fast-260128',
      'doubao-seedance-1-5-pro-251215',
      'doubao-seedance-1-0-pro-250528',
      'doubao-seedance-1-0-lite-t2v-250428',
      'doubao-seedance-1-0-lite-i2v-250428',
    ],
  );
});

test('externalImageSizeFor maps T8 ratio and size labels to stable WxH values', () => {
  assert.equal(externalImageSizeFor('1:1', '1K'), '1024x1024');
  assert.equal(externalImageSizeFor('16:9', '1K'), '1344x768');
  assert.equal(externalImageSizeFor('9:16', '2K'), '1536x2688');
  assert.equal(externalImageSizeFor('bad', 'unknown'), '1024x1024');
});

test('modelscopeLorasForModel filters enabled LoRA entries for selected image model', () => {
  const provider = {
    id: 'modelscope',
    protocol: 'modelscope',
    modelscopeConfig: {
      loras: [
        { id: 'a/lora', name: 'A', targetModel: 'model-a', strength: 0.75, enabled: true },
        { id: 'b/lora', name: 'B', targetModel: 'model-b', strength: 0.8, enabled: true },
        { id: 'off/lora', name: 'Off', targetModel: 'model-a', strength: 0.8, enabled: false },
      ],
    },
  } as any;

  const loras = modelscopeLorasForModel(provider, 'model-a');

  assert.deepEqual(loras.map((lora) => lora.id), ['a/lora']);
  assert.equal(loras[0].strength, 0.75);
  assert.equal(normalizeModelscopeLoraStrength(8), 2);
  assert.equal(normalizeModelscopeLoraStrength(-1), 0);
});

test('VideoNode keeps Jimeng Seedance media limits separate from Grok FAL controls', () => {
  const source = fs.readFileSync(new URL('../src/components/nodes/VideoNode.tsx', import.meta.url), 'utf8');
  const ports = fs.readFileSync(new URL('../src/config/portTypes.ts', import.meta.url), 'utf8');

  assert.match(source, /JIMENG_SEEDANCE_LIMITS = \{ images: 9, videos: 3, audios: 3 \}/);
  assert.match(source, /showBuiltinFalControls = !isExternalSelected && isFal/);
  assert.match(source, /isJimengSeedanceSelected \? \['image', 'video', 'audio', 'text'\]/);
  assert.match(source, /videos: videoRefs/);
  assert.match(source, /audios: audioRefs/);
  assert.match(source, /图\$\{refs\.length\}\/视\$\{videoRefs\.length\}\/音\$\{audioRefs\.length\}/);
  assert.match(ports, /video:\s*\{\s*inputs:\s*\['text', 'image', 'video', 'audio'\],\s*outputs:\s*\['video'\]\s*\}/);
});

test('SeedanceNode exposes explicit Jimeng intelligent multiframe mode only for Jimeng CLI', () => {
  const source = fs.readFileSync(new URL('../src/components/nodes/SeedanceNode.tsx', import.meta.url), 'utf8');

  assert.match(source, /type SeedanceFrameMode = 'auto' \| 'first' \| 'firstlast' \| 'multiframe'/);
  assert.match(source, /const activeFrameMode: SeedanceFrameMode = !isJimengCliSelected && frameMode === 'multiframe' \? 'auto' : frameMode/);
  assert.match(source, /frameMode: activeFrameMode/);
  assert.match(source, /isJimengCliSelected && \(\s*<option value="multiframe"/);
  assert.match(source, /智能多帧\(multiframe\)/);
});
