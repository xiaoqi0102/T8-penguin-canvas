import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const modelscope = require('../backend/src/providers/modelscope.js');

function jsonResponse(body: any, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}

test('ModelScope image generation submits async task, polls, and normalizes output images', async () => {
  const calls: any[] = [];
  const provider = {
    id: 'modelscope',
    protocol: 'modelscope',
    baseUrl: 'https://api-inference.modelscope.cn/v1/',
    apiKey: 'ms-secret',
    imageModels: ['Tongyi-MAI/Z-Image-Turbo'],
  };

  const result = await modelscope.generateImage(provider, {
    prompt: 'a warm studio portrait',
    size: '832x1216',
    providerParams: {
      loras: {
        'Daniel8152/film': 0.75,
      },
    },
  }, {
    pollIntervalMs: 1,
    timeoutMs: 100,
    fetchImpl: async (url: string, init: any) => {
      const parsedBody = init.body ? JSON.parse(init.body) : null;
      calls.push({ url, init, body: parsedBody });
      if (init.method === 'POST') {
        return jsonResponse({ task_id: 'task-123' });
      }
      if (calls.filter((call) => call.init.method === 'GET').length === 1) {
        return jsonResponse({ task_status: 'RUNNING' });
      }
      return jsonResponse({
        task_status: 'SUCCEED',
        output_images: ['https://modelscope.example.com/out.png'],
      });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.kind, 'image');
  assert.equal(result.taskId, 'task-123');
  assert.deepEqual(result.imageUrls, ['https://modelscope.example.com/out.png']);
  assert.equal(calls[0].url, 'https://api-inference.modelscope.cn/v1/images/generations');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer ms-secret');
  assert.equal(calls[0].init.headers['X-ModelScope-Async-Mode'], 'true');
  assert.equal(calls[0].body.model, 'Tongyi-MAI/Z-Image-Turbo');
  assert.equal(calls[0].body.width, 832);
  assert.equal(calls[0].body.height, 1216);
  assert.deepEqual(calls[0].body.loras, { 'Daniel8152/film': 0.75 });
  assert.equal(calls[1].url, 'https://api-inference.modelscope.cn/v1/tasks/task-123');
  assert.equal(calls[1].init.headers['X-ModelScope-Task-Type'], 'image_generation');
});

test('ModelScope image generation accepts enabled LoRA shortcut fields from providerParams', async () => {
  const calls: any[] = [];
  const provider = {
    id: 'modelscope',
    protocol: 'modelscope',
    baseUrl: 'https://api-inference.modelscope.cn/v1',
    apiKey: 'ms-secret',
    imageModels: ['Tongyi-MAI/Z-Image-Turbo'],
  };

  const result = await modelscope.generateImage(provider, {
    prompt: 'draw',
    providerParams: {
      modelscopeLoraEnabled: true,
      modelscopeLoraId: 'custom/lora',
      modelscopeLoraStrength: 9,
    },
  }, {
    pollIntervalMs: 1,
    timeoutMs: 50,
    fetchImpl: async (url: string, init: any) => {
      calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
      if (init.method === 'POST') return jsonResponse({ task_id: 'task-lora' });
      return jsonResponse({ task_status: 'SUCCEED', output_images: ['https://modelscope.example.com/lora.png'] });
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls[0].body.loras, { 'custom/lora': 2 });
});

test('ModelScope chat uses /v1 chat endpoint, strips Bearer prefix, and keeps long-call timeout', async () => {
  const calls: any[] = [];
  const provider = {
    id: 'modelscope',
    protocol: 'modelscope',
    baseUrl: 'https://api-inference.modelscope.cn',
    apiKey: 'Bearer ms-secret',
    chatModels: [],
  };

  const result = await modelscope.generateChat(provider, {
    messages: [{ role: 'user', content: 'hello' }],
  }, {
    fetchImpl: async (url: string, init: any) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      return jsonResponse({ choices: [{ message: { content: 'modelscope hello' } }] });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.text, 'modelscope hello');
  assert.equal(result.model, 'Qwen/Qwen3-235B-A22B');
  assert.equal(calls[0].url, 'https://api-inference.modelscope.cn/v1/chat/completions');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer ms-secret');
  assert.equal(calls[0].body.model, 'Qwen/Qwen3-235B-A22B');
});
