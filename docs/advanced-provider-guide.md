# 高级 Provider 接入指南

> 版本：v2.0.0 · 更新日期：2026-06-03
> 适用范围：T8-penguin-canvas 扩展 API 平台系统

---

## 一、架构概览

```
前端 ImageNode / LLMNode
  ↓ providerParams + providerId
POST /api/proxy/external/image[/stream] 或 /llm[/stream]
  ↓ resolveRunnableProvider() → 按 providerId 匹配已启用 provider
后端 adapters.js → getAdapterForProtocol(protocol)
  ↓ 调用对应适配器的 generateImage / generateChat / generateChatStream
适配器 (qiniu.js / grsai.js / geeknow.js / ...)
  ↓ 构造上游请求、轮询、返回 imageUrls / text
```

### 关键文件

| 层级 | 文件 | 职责 |
|------|------|------|
| 后端注册表 | `backend/src/providers/registry.js` | DEFAULT_ADVANCED_PROVIDERS + normalizeProvider |
| 后端适配器索引 | `backend/src/providers/adapters.js` | getAdapterForProtocol 路由 |
| 后端路由 | `backend/src/routes/externalProviders.js` | HTTP 端点 /image /image/stream /llm /llm/stream /video |
| 前端类型 | `src/types/canvas.ts` | AdvancedProviderProtocol 联合类型 |
| 前端白名单 | `src/utils/advancedProviders.ts` | IMAGE_PROTOCOLS / VIDEO_PROTOCOLS / LLM_PROTOCOLS |
| 前端 API 设置 | `src/components/ApiSettings.tsx` | ADVANCED_PROVIDER_LABELS + GUIDES |
| 前端调用 | `src/services/generation.ts` | generateExternalImage / generateExternalImageStream |

---

## 二、当前已接入的中转站

| 协议 ID | 平台 | 能力 | 备注 |
|---------|------|------|------|
| `qiniu` | 七牛云 | 图像 | 同步返回，OpenAI 兼容 + Gemini 双协议 |
| `grsai` | Grsai | 图像 | 异步轮询（replyType: async） |
| `geeknow` | Geeknow | 图像 + LLM | Gemini 原生 + OpenAI 兼容双协议，LLM 支持流式 |

---

## 三、接入新中转站的步骤

假设要接入一个新中转站 `xyzcloud`，提供图像生成服务。

### 步骤 1：编写适配器文件

在 `backend/src/providers/xyzcloud.js` 中实现以下方法：

```js
// 必选：测试连接
async function testProvider(provider, options) { ... }
// 返回 { ok, code, providerId, protocol, error? }

// 可选：图像生成
async function generateImage(provider, input, options) { ... }
// 返回 { ok, kind:'image', code, providerId, protocol, imageUrls?, taskId?, error? }

// 可选：LLM 非流式
async function generateChat(provider, input, options) { ... }
// 返回 { ok, kind:'llm', text, imageUrls? }

// 可选：LLM 流式
async function generateChatStream(provider, input, callbacks) { ... }
// 通过 callbacks.onDelta(chunk) / onDone() / onError(err) 推送

module.exports = { testProvider, generateImage };
```

输入字段说明：
- `input.providerModel` / `input.model`：前端选择的模型名
- `input.prompt`：提示词
- `input.images`：参考图列表（dataURL / `/files/xxx` / 远程 URL）
- `input.providerParams`：自定义参数如 `{ aspectRatio, resolution, quality }`
- `options.baseUrl`：本地后端地址，用于解析 `/files/...`
- `options.onTaskSubmit(taskId)`：异步任务通过 SSE 推送 taskId

### 步骤 2：注册到 registry.js

```js
// backend/src/providers/registry.js
const DEFAULT_XYZCLOUD_BASE_URL = 'https://api.xyzcloud.com';
// SUPPORTED_PROTOCOLS 加入 'xyzcloud'
// DEFAULT_ADVANCED_PROVIDERS 加入默认配置条目（含 imageModels 列表）
```

### 步骤 3：注册到 adapters.js

```js
// backend/src/providers/adapters.js
const xyzcloud = require('./xyzcloud');
// ADAPTERS 对象加入 xyzcloud
```

### 步骤 4：扩展前端类型与白名单

- `src/types/canvas.ts`：AdvancedProviderProtocol 加入 `'xyzcloud'`
- `src/utils/advancedProviders.ts`：IMAGE_PROTOCOLS（或 LLM_PROTOCOLS）加入
- `src/components/ApiSettings.tsx`：LABELS + GUIDES 加入说明

### 步骤 5：（可选）走 SSE 流式

如果是异步轮询或长耗时，在 `ImageNode.tsx` 加入 useStream：
```ts
const useStream = protocol === 'qiniu' || ... || protocol === 'xyzcloud';
```

### 步骤 6：（可选）自定义 UI Tab

在 `src/integrations/xyzcloud/` 下新建 Tab 组件，在 ImageNode 条件渲染。

---

## 四、长耗时请求处理

用 `http`/`https` 原生模块替代 `fetch`（避免 5 分钟默认超时），参考 `geeknow.js` 的 `fetchWithLongTimeout`。

---

## 五、验证清单

- [ ] `tsc --noEmit` 零错误
- [ ] `npm run build` 成功
- [ ] 后端启动无错误
- [ ] `/api/proxy/external/test-provider` 测试连接正常
- [ ] 图像节点下拉可见新 provider
- [ ] 生成 → 后端日志输出 → 图片正确显示
