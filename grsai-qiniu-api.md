# Grsai / 七牛云 图像 API 接口说明与生图规范

> 版本：截止 T8-penguin-canvas v1.6.2（含 phase80 ~ phase84 全部变更）
> 整理日期：2026-05-28
> 维护对象：`src/integrations/{grsai,qiniu}/` 隔离层 + `backend/src/routes/proxy.js` 两段代理路由
> 同级参考：`rh.md`（RunningHub 落地参考）/ `src/integrations/grsai/README.md`（grsai 隔离层 README）

---

## 0 · 全局约定

| 项 | 值 |
|---|---|
| 前端开发端口 | `http://127.0.0.1:11422` |
| 后端 API 端口 | `http://127.0.0.1:18766` |
| Vite proxy | `/api`、`/files`、`/output`、`/input` 全部转发到后端 |
| 鉴权方式 | 两家都用 `Authorization: Bearer <ApiKey>`（与贞贞工坊的「`apiKey` 放 body」不同） |
| Content-Type | `application/json`（**两家都不走 multipart**，参考图统一以 base64 dataURL 或 http(s) URL 形式放进 JSON 数组） |
| 任务模式 | 两家均为「**提交 → 异步任务 ID → 轮询查询**」三段式 |
| 轮询上限 | 后端固定 `maxRetries = 1800` × `interval = 2000ms`，**单任务最长 60 分钟** |
| 前端字段命名 | 一律 **camelCase**（`aspectRatio` / `imageSize` / `qiniuQuality` …），与上游字段命名对齐看 §5 速查表 |
| 后端统一返回壳 | 成功 `{ success: true, data: { urls?, raw, taskId?, status?, progress?, model?, prompt? } }`；失败 `{ success: false, error: '<message>', raw? }` |
| Key 隔离 | `qiniuApiKey` / `grsaiApiKey` 独立保存在 `data/settings.json`，与贞贞工坊 / RH 完全解耦；前端永远拿不到明文 |
| 转存策略 | 上游返回的 `url` / `b64_json` 由后端 `saveRemoteImage` / `saveBase64Image` 落盘到 `OUTPUT_DIR`，前端拿到的永远是本地 `/files/output/img_<ts>_<rand>.png` |

**两家与贞贞工坊路径的关键差异（速记）**：

- 贞贞工坊：`POST /api/proxy/image*`，强制 `multipart`，强制 `/v1/images/edits?async=true`，强制 BaseUrl 锁 `ai.t8star.org`
- 七牛 / Grsai：`POST /api/proxy/{qiniu,grsai}/image*`，**纯 JSON**，按 `refs.length` 自动分流 generations / edits，BaseUrl 用户可切换端点

---

## 1 · Grsai 接口规范

### 1.1 上游端点与认证

| 维度 | 值 |
|---|---|
| 国内端点（默认） | `https://grsai.dakka.com.cn` |
| 全球端点 | `https://grsaiapi.com` |
| 自定义反代 | 用户可在【API 设置 → Grsai Base URL】填写任意 https 反代 |
| 鉴权 Header | `Authorization: Bearer sk-xxxxxxxxxxx` |
| 控制台获取 Key | https://grsai.ai/zh/dashboard/api-keys |

默认值由 `backend/src/config.js:78` 提供：

```js
GRSAI_BASE_URL: 'https://grsai.dakka.com.cn',
```

`loadGrsaiSettings()` 优先级：`settings.grsaiBaseUrl` → `config.GRSAI_BASE_URL`。BaseUrl **不强制锁定**，用户切换不会影响后端。

### 1.2 路由清单（前端入口）

挂载前缀来自 `backend/src/server.js` 中 `app.use('/api/proxy', proxyRouter)`：

| HTTP 方法 | 路由 URL | 行号 | 用途 |
|---|---|---|---|
| POST | `/api/proxy/grsai/image` | `proxy.js:2539-2569` | **同步包装**：内部 submit + 60 分钟轮询，一次返回最终 url |
| POST | `/api/proxy/grsai/image/submit` | `proxy.js:2571-2598` | **异步提交**：立即返回 `{ taskId, status:'pending' }` |
| GET | `/api/proxy/grsai/image/status/:tid` | `proxy.js:2600-2644` | 前端轮询；通过 `recallTaskKey('grsai:'+tid)` 恢复 apiKey + baseUrl |

> 前端实际使用「submit + status 轮询」异步模式（`runGrsaiImage.ts`）。同步路由 `/grsai/image` 备用，不在 UI 主链路。

### 1.3 提交接口 — `POST {base}/v1/api/generate`

**后端调用入口**：`callGrsaiImageUpstream()` `proxy.js:2472-2492`。

#### 请求体（后端 → grsai 上游）

```jsonc
{
  "model":      "<11 个模型之一>",        // 必填
  "prompt":     "<提示词>",              // 必填
  "replyType":  "async",                 // 后端固定写 'async'
  "aspectRatio": "auto | 1:1 | ... | 1024x1024",  // 可选，驼峰
  "imageSize":  "1K | 2K | 4K",          // 可选，仅 nano-banana 系列上送
  "images":     ["data:image/...;base64,...", "https://..."]  // 可选，非空走图生图
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `model` | string | ✓ | 见 §1.5 模型清单 |
| `prompt` | string | ✓ | 中英混合均可；自有协议偏好中文叙事 |
| `replyType` | enum | ✓ | `'json' / 'stream' / 'async'`；后端**固定写 `'async'`** |
| `aspectRatio` | string | ✗ | 驼峰命名。普通模型透传 `auto / 1:1 / 16:9 / ...`；vip 模型由前端 `resolveGrsaiAspectRatio()` 转成像素串后透传 |
| `imageSize` | enum | ✗ | `'1K' / '2K' / '4K'`；nano-banana 系列上送上游；gpt-image-2-vip **不上送**（已在前端转成像素串塞进 `aspectRatio`） |
| `images` | string[] | ✗ | 参考图数组；后端 `refToGrsaiImage()` `proxy.js:2456-2470` 把 `/files/*` 转 dataURL；http(s) 与 data: 透传 |

#### 前端 → 后端代理路由的请求体

前端通过 `submitGrsaiImage()`（`src/services/generation.ts:807-836`）请求 `/api/proxy/grsai/image/submit`，body 形态：

```ts
interface GrsaiImageSubmitRequest {
  model: string;
  prompt: string;
  images?: string[];                          // 参考图列表
  aspectRatio?: string;                       // 比例字符串或像素串
  imageSize?: '1K' | '2K' | '4K';
}
```

后端路由 `proxy.js:2574` 还会接收一个**遗留兼容字段** `image`（单串），自动 `unshift` 到 `refs` 数组。

#### 响应（grsai 上游顶层，无 `data` 包装）

```jsonc
// 异步任务首次返回
{ "id": "6-f671fc51-...", "status": "running" }

// 成功
{
  "id": "14-5f3cf761-...",
  "status": "succeeded",                       // 注意是 succeeded 不是 success
  "results": [{ "url": "https://file1.aitohumanize.com/file/xxx.png" }],
  "progress": 100
}

// 失败
{ "id": "12-1f771fbf-...", "status": "failed", "error": "generate failed" }

// 内容审核未通过
{ "id": "...", "status": "violation", "error": "..." }
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 任务 ID；后端取 `data.id` 作为 `taskId` |
| `status` | string | `running` / `succeeded` / `failed` / `violation` |
| `progress` | number | 0~100；后端 `proxy.js:2624` 自动加 `%` |
| `results` | `{url?, b64_json?}[]` | 成功时数组首项的 `url` 经 `saveRemoteImage` 转存到 `/files/output/`；或 `b64_json` 经 `saveBase64Image` 落盘 |
| `error` | string | 失败 / violation 时透传给用户的原文 |

#### 状态归一化（后端代理层）

| 上游 status | 后端归一识别集合 | 行号 |
|---|---|---|
| 成功 | `['succeeded', 'success', 'completed', 'done']` | `proxy.js:2504, 2625` |
| 失败（含违规） | `['failed', 'failure', 'error', 'violation']` | `proxy.js:2510, 2626` |

> **violation 必须当 failed 处理但 `error` 文案必须透传给用户**——这是内容审核未通过的具体原因，UI 层要把它显示给用户而不是吞掉。

### 1.4 查询接口 — `GET {base}/v1/api/result?id=<task_id>`

返回结构与提交接口的响应顶层完全一致。

后端 `pollGrsaiTask()` `proxy.js:2494-2519` 实现：

- 轮询间隔 2 秒，最大 1800 次（**60 分钟上限**）
- fetch 异常 / HTTP 非 2xx / JSON 解析失败 → `continue`（不中断）
- 命中失败状态 → `console.error('[grsai/poll] 任务失败:')` 返回 `null`

前端 `queryGrsaiImageStatus()` 走 `/api/proxy/grsai/image/status/:tid`（**不是直接调用上游**），后端从 `recallTaskKey('grsai:'+tid)` 恢复 apiKey + baseUrl，避免前端切换端点后查不到任务。

### 1.5 11 个支持模型清单

来自 `src/providers/models.ts:184-196` + `src/integrations/grsai/sizeMap.ts:56-68`：

| 模型 ID | 系列 | aspectRatio | imageSize | 说明 |
|---|---|---|---|---|
| `nano-banana` | nano-banana | 通用 11 | 1K/2K/4K（上送） | 基础版 |
| `nano-banana-fast` | nano-banana | 通用 11 | 1K/2K/4K（上送） | 快速版 |
| `nano-banana-2` | nano-banana-2 | 通用 11 + 4 极端 | 1K/2K/4K（上送） | **官方默认推荐** |
| `nano-banana-2-cl` | nano-banana-2 | 通用 11 + 4 | 1K/2K/4K（上送） | 商用版 |
| `nano-banana-2-4k-cl` | nano-banana-2 | 通用 11 + 4 | 1K/2K/4K（上送） | 4K 商用 |
| `nano-banana-pro` | nano-banana | 通用 11 | 1K/2K/4K（上送） | Pro 版 |
| `nano-banana-pro-cl` | nano-banana | 通用 11 | 1K/2K/4K（上送） | Pro 商用 |
| `nano-banana-pro-vip` | nano-banana | 通用 11 | 1K/2K/4K（上送） | Pro VIP |
| `nano-banana-pro-4k-vip` | nano-banana | 通用 11 | 1K/2K/4K（上送） | Pro 4K VIP |
| `gpt-image-2` | gpt-image-2 | 通用 11 | **❌ 忽略** | 基础版，`imageSize` 完全忽略 |
| `gpt-image-2-vip` | gpt-image-2 | 14 比例（去 auto + 加 4） | 1K/2K/4K（**本地查表，不上送**） | 1~4K，由 `sizeMap` 按 ratio×resolution 转像素串后塞进 `aspectRatio` |

**比例集合三类**：

- **通用 11**：`auto, 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 5:4, 4:5, 21:9`
- **nano-banana-2 额外 4 个极端**：`1:4, 4:1, 1:8, 8:1`（共 15 个含 auto）
- **gpt-image-2-vip 14 个**：去 `auto`，加 `1:3, 3:1, 2:1, 1:2`

### 1.6 vip 比例 × 清晰度双控件（v1.5.9 引入）

`gpt-image-2-vip` 是 grsai 唯一需要在前端做比例 → 像素串转换的模型——上游强制接受像素串（不接受 `auto`），且文档给定了 14 比例 × 3 档共 42 项预设。

#### 文档原文预设表（`src/integrations/grsai/sizeMap.ts:86-134`）

| 比例 | 1K（≈1MP） | 2K（≈4MP） | 4K（≤8.29MP） |
|---|---|---|---|
| 1:1 | 1024x1024 | 2048x2048 | 2880x2880 |
| 16:9 | 1280x720 | 2048x1152 | 3840x2160 |
| 9:16 | 720x1280 | 1152x2048 | 2160x3840 |
| 4:3 | 1152x864 | 2304x1728 | 3264x2448 |
| 3:4 | 864x1152 | 1728x2304 | 2448x3264 |
| 3:2 | 1536x1024 | 2048x1360 | 3504x2336 |
| 2:3 | 1024x1536 | 1360x2048 | 2336x3504 |
| 5:4 | 1120x896 | 2240x1792 | 3200x2560 |
| 4:5 | 896x1120 | 1792x2240 | 2560x3200 |
| 21:9 | 1456x624 | 2912x1248 | 3840x1648 |
| 1:3 | 688x2048 | **（兜底算）** | 1280x3840 |
| 3:1 | 2048x688 | **（兜底算）** | 3840x1280 |
| 2:1 | 1536x768 | 3072x1536 | 3840x1920 |
| 1:2 | 768x1536 | 1536x3072 | 1920x3840 |

> **注**：2K 档的 `1:3` / `3:1` 文档原文未给出，由 `computeVipSize()` 兜底（典型结果：1:3 + 2K → `1184x3552`）。

#### 兜底规则（`computeVipSize()` `sizeMap.ts:142-160`）

未命中预设时，按下面四条约束计算像素串：

1. **目标像素**：1K = 1,048,576 / 2K = 4,194,304 / 4K = 8,294,400
2. **16 对齐**：两条边都必须是 16 的倍数（`alignTo16`）
3. **长边上限**：≤ 3840px（超出按比例缩放）
4. **总像素上限**：≤ 8,294,400（极端比例的兜底，按比例缩放）

#### 上游对自定义像素值的约束（必须遵守）

- 最大边长 ≤ 3840px
- 两条边都必须是 16 的倍数
- 长边 / 短边比 ≤ 3:1
- 总像素数：655,360 ~ 8,294,400

#### 兼容性边界（`resolveGrsaiAspectRatio()` `sizeMap.ts:170-185`）

| 旧画布残留值 | 行为 |
|---|---|
| 像素串（v1.5.6 早期 UI 允许） | 原样小写返回 |
| `'auto'`（v1.5.8 之前 UI 允许） | 退到 `1024x1024` |
| 非 vip 模型 + 任何值 | 比例字符串直接透传，`resolution` 参数忽略 |
| 无效比例字符串 | 退到 `1024x1024` |

### 1.7 字段命名约定（**驼峰**，严禁下划线）

grsai 上游用**驼峰命名**：`aspectRatio` / `imageSize` / `replyType`。

> ⚠️ 这与贞贞工坊 / 七牛 / OpenAI 的下划线风格不同。后端 `/api/proxy/grsai/*` 路由的请求体也采用驼峰（`{ model, prompt, aspectRatio, imageSize, images, image }`），**前后端字段一对一不做转换**。

如果在后端或 runner 任何一层做了 `aspect_ratio` ↔ `aspectRatio` 转换，会立即导致上游静默忽略该参数。

### 1.8 代码位置映射

| 文件 | 行号区间 | 角色 |
|---|---|---|
| `backend/src/routes/proxy.js` | 2422-2439 | 注释段（协议总览） |
| `backend/src/routes/proxy.js` | 2441-2454 | `loadGrsaiSettings()` |
| `backend/src/routes/proxy.js` | 2456-2470 | `refToGrsaiImage()` 参考图规范化 |
| `backend/src/routes/proxy.js` | 2472-2492 | `callGrsaiImageUpstream()` 上游调用 |
| `backend/src/routes/proxy.js` | 2494-2519 | `pollGrsaiTask()` 同步轮询 |
| `backend/src/routes/proxy.js` | 2521-2537 | `normalizeGrsaiResponse()` 响应归一化 |
| `backend/src/routes/proxy.js` | 2539-2569 | `POST /grsai/image`（同步包装） |
| `backend/src/routes/proxy.js` | 2571-2598 | `POST /grsai/image/submit`（异步提交） |
| `backend/src/routes/proxy.js` | 2600-2644 | `GET /grsai/image/status/:tid`（任务查询） |
| `backend/src/config.js` | 78 | `GRSAI_BASE_URL` 默认值 |
| `src/integrations/grsai/sizeMap.ts` | 1-186 | vip 三档预设 + `computeVipSize` 兜底 + `resolveGrsaiAspectRatio` 决策 |
| `src/integrations/grsai/runGrsaiImage.ts` | — | runner：submit + 轮询 + logBus 埋点 |
| `src/integrations/grsai/GrsaiImageTab.tsx` | — | ImageNode 内的 aspectRatio + imageSize 双下拉 |
| `src/integrations/grsai/GrsaiSettingsSection.tsx` | — | API Key + 国内/全球切换按钮 |
| `src/integrations/grsai/README.md` | — | 隔离层 README（vip 表 + 兼容性边界） |
| `src/services/generation.ts` | 807-836 | `submitGrsaiImage` / `queryGrsaiImageStatus` 客户端 |
| `src/providers/models.ts` | 176-207 | `IMAGE_MODELS` 注册（`id: 'grsai'`） |
| `features.json` | phase80/81/83/84 | 防丢失锁 |

---

## 2 · 七牛云接口规范

### 2.1 上游端点与认证

| 维度 | 值 |
|---|---|
| 国内端点（默认） | `https://openai.qiniu.com` |
| 海外端点 | `https://openai.sufy.com` |
| 自定义反代 | 用户可在【API 设置 → 七牛云 Base URL】填写任意 https 反代 |
| 鉴权 Header | `Authorization: Bearer sk-xxxxxxxxxxx` |
| 控制台获取 Key | https://portal.qiniu.com/ai-inference/api-key |

默认值由 `backend/src/config.js:72` 提供：

```js
QINIU_BASE_URL: 'https://openai.qiniu.com',
```

`loadQiniuSettings()` 优先级：`settings.qiniuBaseUrl` → `config.QINIU_BASE_URL`。同样**不强制锁定**。

### 2.2 路由清单（前端入口）

| HTTP 方法 | 路由 URL | 行号 | 用途 |
|---|---|---|---|
| POST | `/api/proxy/qiniu/image` | `proxy.js:2305-2339` | **同步包装**：内部 submit + 60 分钟轮询，一次返回最终 url |
| POST | `/api/proxy/qiniu/image/submit` | `proxy.js:2342-2371` | **异步提交**：立即返回 `{ taskId, status:'pending' }` 或同步图片 |
| GET | `/api/proxy/qiniu/image/status/:tid` | `proxy.js:2374-2418` | 前端轮询；通过 `recallTaskKey('qiniu:'+tid)` 恢复 apiKey + baseUrl |

> 七牛同样使用「submit + status 轮询」异步模式作为前端主链路。

### 2.3 文生图 — `POST {base}/v1/images/generations`

**触发条件**：`refs.length === 0`（前端未传 `images[]` 或全部转换失败）

后端调用入口：`callQiniuImageUpstream()` `proxy.js:2219-2256`，URL 选择代码 `proxy.js:2222`：

```js
const url = `${baseUrl}/v1/images/${hasRefs ? 'edits' : 'generations'}`;
```

### 2.4 图生图 — `POST {base}/v1/images/edits`

**触发条件**：`refs.length > 0`

与 generations 的唯一差异：

| 维度 | `/generations`（文生图） | `/edits`（图生图） |
|---|---|---|
| URL 路径 | `/v1/images/generations` | `/v1/images/edits` |
| 请求体差异 | 无 `image` 字段 | 多 `image: string[]`，元素为 base64 dataURL 或 http(s) URL |
| 其它字段 | 完全相同（按 model 分流） | 同左 |

> **关键**：与贞贞工坊 edits 不同，**七牛 edits 不使用 multipart**，参考图直接作为 JSON 数组（字符串）传入。

参考图来源转换 `refToQiniuImage()` `proxy.js:2202-2217`：

- `data:` 前缀 → 原样保留
- `http(s)://` → 原样保留
- `/files/*` → 拉本地后转 base64 dataURL（`data:${ct};base64,${buf.toString('base64')}`）
- 其它 → 返回 `null`（被过滤）

### 2.5 异步任务查询 — `GET {base}/v1/images/tasks/{tid}`

后端 `pollQiniuTask()` `proxy.js:2259-2284` 实现：

```jsonc
// 上游响应
{
  "task_id":         "<id>",
  "status":          "processing | succeed | failed",
  "status_message":  "<失败原因，可选>",
  "data": [
    { "url": "https://..." },
    // 或
    { "b64_json": "..." }
  ]
}
```

后端归一化（`proxy.js:2399-2400`）：

| 上游 status | 后端归一识别集合 |
|---|---|
| 成功 | `['succeed', 'success', 'completed', 'done']` |
| 失败 | `['failed', 'failure', 'error']`（**注意：不包含 violation**，七牛上游不返回 violation 状态） |

失败原因取自 `data.status_message`（与 grsai 的 `data.error` 字段不同）。

### 2.6 两个子模型的分流协议

**核心分流键**：`const isGemini = model === 'gemini-3.1-flash-image-preview';` （`proxy.js:2223`）

#### 2.6.1 `openai/gpt-image-2`（OpenAI 兼容协议）

```jsonc
{
  "model":   "openai/gpt-image-2",
  "prompt":  "<提示词>",
  "quality": "auto",                       // 顶层 quality
  "size":    "1024x1024",                  // 顶层 size，必须是像素串或 'auto'
  "image":   ["data:image/...;base64,..."] // 仅 edits 模式
}
```

| 字段 | 类型 | 取值 | 说明 |
|---|---|---|---|
| `quality` | enum | `'auto' / 'low' / 'medium' / 'high'` | 缺省 `'auto'`（`proxy.js:2235`） |
| `size` | string | 像素串 `1024x1024` 等 / `'auto'` | 缺省 `'auto'`（`proxy.js:2236`） |

**前端比例 → 像素串映射**：`ratioToQiniuSize()` `src/integrations/qiniu/sizeMap.ts:128-142`

#### 2.6.2 `gemini-3.1-flash-image-preview`（image_config 嵌套协议，v1.6.2 起）

```jsonc
{
  "model":  "gemini-3.1-flash-image-preview",
  "prompt": "<提示词>",
  "image_config": {                        // 嵌套对象，不是顶层字段
    "aspect_ratio": "16:9",                // 下划线命名，14 项 enum，不含 auto
    "image_size":   "1K"                   // 下划线命名
  },
  "image":  ["data:image/...;base64,..."]  // 仅 edits 模式
}
```

| 字段 | 类型 | 取值 | 说明 |
|---|---|---|---|
| `image_config.aspect_ratio` | string | 14 项 enum | `aspectRatio === 'auto'` 或缺省时**不下发**，让上游默认 |
| `image_config.image_size` | string | `'512' / '1K' / '2K' / '4K'` | UI 暂未开放 `'512'`（仅注释提及） |

**关键代码**（`proxy.js:2225-2237`）：

```js
if (isGemini) {
  const cfg = {};
  if (aspectRatio && aspectRatio !== 'auto') cfg.aspect_ratio = aspectRatio;
  if (imageSize) cfg.image_size = imageSize;
  if (Object.keys(cfg).length) body.image_config = cfg;
} else {
  body.quality = quality || 'auto';
  body.size    = size    || 'auto';
}
```

> **v1.6.2 修复点**：在此修复之前，所有七牛子模型都按 OpenAI body 发，gemini 上游收到顶层 `size` 会**静默忽略**比例参数。修复后按 `model` 分流，gemini 走 `image_config` 嵌套、`openai/gpt-image-2` 维持 `size/quality`。

### 2.7 比例 × 清晰度策略

`openai/gpt-image-2` 支持的比例集合**（11 个）**：

```
auto, 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 5:4, 4:5, 21:9
```

> 文档约束：长边 / 短边 ≤ 3:1，因此**排除** `1:4 / 4:1 / 1:8 / 8:1` 这 4 个极端比例。

`gemini-3.1-flash-image-preview` 支持的比例集合**（15 个含 auto）**：

```
auto, 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 5:4, 4:5, 21:9, 1:4, 4:1, 1:8, 8:1
```

> 上游限制：14 项 enum **不含 auto**；前端 UI 仍提供 `auto` 选项，由后端 `proxy.js:2230` 自动转为「不下发 `aspect_ratio`」，让上游用默认。

#### 七牛 OpenAI 兼容子模型的 `size` 映射（`src/integrations/qiniu/sizeMap.ts:76-93`）

`ratioToQiniuSize(ratio, resolution)` 按当前清晰度档命中预设表，**未命中由 `computeSize()` 按目标像素 + 16 对齐计算**：

| 比例 | 1K | 2K | 4K |
|---|---|---|---|
| 1:1 | 1024x1024 | 2048x2048 | （未命中按 4MP 算） |
| 3:2 | 1536x1024 | （未命中按 1MP 算） | （未命中按 4MP 算） |
| 2:3 | 1024x1536 | （未命中按 1MP 算） | （未命中按 4MP 算） |
| 16:9 | 2048x1152* | 2048x1152 | 3840x2160 |
| 9:16 | 1152x2048* | 1152x2048 | 2160x3840 |

> `*` 1K 档的 16:9/9:16 保留了 v1.5.6 兼容映射（实际 ≈ 2.3MP，不严格符合 1MP 目标）——确保旧画布默认行为不变。

未命中预设的项由 `computeSize()` 兜底（约束与 grsai 的 `computeVipSize()` 完全一致：16 对齐 + 长边 ≤3840 + 总像素 ≤8.29MP）。

#### gemini 子模型的清晰度

直接将前端 `imageSize` 透传到 `image_config.image_size`，上游接受 `'512' / '1K' / '2K' / '4K'` 共 4 档（UI 暂未开放 `'512'`）。

### 2.8 字段命名约定（前端 camelCase ↔ 上游分流）

七牛后端代理路由请求体（前端 → 后端，`proxy.js:2308 / 2345`）：

```ts
{ model, prompt, quality?, size?, aspectRatio?, imageSize?, images?, image? }
```

- `quality` / `size` 字段名**自动留给 `openai/gpt-image-2` 子模型用**
- `aspectRatio` / `imageSize` 字段名**自动留给 `gemini-3.1-flash-image-preview` 子模型用**

`callQiniuImageUpstream()` 按 `model` 分流写到上游 body：

| 前端 / 后端代理字段 | 上游 OpenAI 兼容 body | 上游 gemini body |
|---|---|---|
| `quality` | `quality`（顶层） | （忽略） |
| `size` | `size`（顶层） | （忽略） |
| `aspectRatio` | （忽略） | `image_config.aspect_ratio`（下划线） |
| `imageSize` | （忽略） | `image_config.image_size`（下划线） |

> ⚠️ **前后端字段名是 camelCase；只有写到 gemini 上游 body 才是 snake_case**。这种「外驼内蛇」是 v1.6.2 修复的关键，不要再做任何额外转换。

### 2.9 代码位置映射

| 文件 | 行号区间 | 角色 |
|---|---|---|
| `backend/src/routes/proxy.js` | 2166-2185 | 注释段（协议总览） |
| `backend/src/routes/proxy.js` | 2187-2200 | `loadQiniuSettings()` |
| `backend/src/routes/proxy.js` | 2202-2217 | `refToQiniuImage()` 参考图规范化 |
| `backend/src/routes/proxy.js` | 2219-2256 | **`callQiniuImageUpstream()` 模型分流核心** |
| `backend/src/routes/proxy.js` | 2259-2284 | `pollQiniuTask()` 同步轮询 |
| `backend/src/routes/proxy.js` | 2287-2302 | `normalizeQiniuResponse()` 响应归一化 |
| `backend/src/routes/proxy.js` | 2305-2339 | `POST /qiniu/image`（同步包装） |
| `backend/src/routes/proxy.js` | 2342-2371 | `POST /qiniu/image/submit`（异步提交） |
| `backend/src/routes/proxy.js` | 2374-2418 | `GET /qiniu/image/status/:tid`（任务查询） |
| `backend/src/config.js` | 72 | `QINIU_BASE_URL` 默认值 |
| `src/integrations/qiniu/sizeMap.ts` | 1-142 | 比例集合 + `ratioToQiniuSize` + `computeSize` |
| `src/integrations/qiniu/runQiniuImage.ts` | — | runner：submit + 轮询 |
| `src/integrations/qiniu/QiniuImageTab.tsx` | — | ImageNode 内的参数面板 |
| `src/integrations/qiniu/QiniuSettingsSection.tsx` | — | API Key + 国内/海外切换按钮 |
| `src/services/generation.ts` | 97-129 | `submitQiniuImage` / `queryQiniuImageStatus` 客户端 |
| `src/providers/models.ts` | 145-166 | `IMAGE_MODELS` 注册（`id: 'qiniu'`） |
| `features.json` | phase80/81/83/84 | 防丢失锁 |

---

## 3 · Grsai vs 七牛 对照表

### 3.1 协议对比矩阵（10 维）

| 维度 | Grsai | 七牛云 |
|---|---|---|
| BaseUrl 默认 | `https://grsai.dakka.com.cn`（国内） | `https://openai.qiniu.com`（国内） |
| BaseUrl 备选 | `https://grsaiapi.com`（全球） | `https://openai.sufy.com`（海外） |
| BaseUrl 锁定 | ❌ 用户可任意切换 | ❌ 用户可任意切换 |
| 协议族 | **自有协议**（POST `/v1/api/generate` + GET `/v1/api/result`） | **OpenAI 兼容**（POST `/v1/images/generations` 或 `/edits` + GET `/v1/images/tasks/{tid}`） |
| 鉴权方式 | `Authorization: Bearer <grsaiApiKey>` | `Authorization: Bearer <qiniuApiKey>` |
| 传输方式 | JSON | JSON（**非 multipart**） |
| 字段命名 | 驼峰（`aspectRatio` / `imageSize` / `replyType`） | 前端 camelCase；上游按 model 分流，gemini 走 snake_case `image_config.{aspect_ratio,image_size}`，openai 走顶层 `size` / `quality` |
| 参考图字段 | `images: string[]`（**复数**） | `image: string[]`（**单数**，仅 edits 模式上送） |
| 文生图 / 图生图分流 | 同一端点，由 `refs.length > 0` 决定是否带 `images` 字段 | 不同端点，由 `refs.length > 0` 决定 URL：`/generations` 或 `/edits` |
| 状态枚举 | `running / succeeded / failed / violation` | `processing / succeed / failed`（**无 violation** 状态） |
| 失败错误字段 | `data.error` | `data.status_message` |
| 任务 ID 字段 | `data.id` | `data.task_id` / `data.id` / `data.data`（字符串） |
| 进度字段 | `data.progress`（number 0~100） | `data.progress`（string，可选） |
| 成功结果字段 | `data.results[].url` | `data.data[].url` 或 `data.data[].b64_json` |
| 任务模式 | 强制异步（后端 `replyType: 'async'` 固定写） | 自动判断（同步立即返回图，异步返回 `task_id`） |
| TaskKey 记忆键 | `grsai:${taskId}` | `qiniu:${taskId}` |
| 轮询配置 | 1800 × 2s = 60 分钟 | 1800 × 2s = 60 分钟 |
| 控制台获取 Key | https://grsai.ai/zh/dashboard/api-keys | https://portal.qiniu.com/ai-inference/api-key |
| 支持模型数量 | 11 个（9 nano-banana + 2 gpt-image-2） | 2 个（`openai/gpt-image-2` + `gemini-3.1-flash-image-preview`） |
| 比例集合多样性 | 3 类（通用 11 / nano-banana-2 加 4 / vip 14） | 2 类（gpt-image-2 限 11 ≤3:1 / gemini 全 15） |
| vip 像素串需求 | ✅ `gpt-image-2-vip` 强制像素串 | ❌ 两个子模型都不强制 |

### 3.2 与贞贞工坊路径的差异

| 维度 | 贞贞工坊 `/proxy/image*` | Grsai `/proxy/grsai/image*` | 七牛 `/proxy/qiniu/image*` |
|---|---|---|---|
| Key 字段 | `settings.zhenzhenApiKey`（+ 7 个分类 key fallback） | `settings.grsaiApiKey`（独立） | `settings.qiniuApiKey`（独立） |
| BaseUrl | **锁定** `https://ai.t8star.org` | 可切换 | 可切换 |
| GPT 分支传输 | **multipart**，强制 `/v1/images/edits?async=true`，文生图加白图占位 | JSON | JSON，按 hasRefs 走 `/generations` 或 `/edits` |
| 参数命名 | snake_case (`aspect_ratio` / `image_size`) | 驼峰 (`aspectRatio` / `imageSize` / `replyType`) | 前端 camelCase；上游 gemini snake_case / openai 顶层 |
| Gemini 协议 | 不支持 | 不支持 | **支持**（`image_config` 嵌套，v1.6.2 起） |
| TaskKey 记忆键 | 原始 `taskId` | `grsai:${taskId}` | `qiniu:${taskId}` |
| 任务查询路径 | `/v1/images/tasks/{tid}` 解响应 `data.data` 嵌套 | `/v1/api/result?id={tid}` 解顶层 | `/v1/images/tasks/{tid}` 解顶层 `data` 数组 + 顶层 `status` |

---

## 4 · 生图规范（最佳实践）

### 4.1 模型选型决策树

#### Step 1：场景定位

```
├─ 写实人像 / 商业摄影 / 产品图 ────→ grsai · nano-banana-2-cl 或 nano-banana-pro-cl
├─ 创意插画 / 二次元 / 概念设计 ────→ grsai · nano-banana / nano-banana-2
├─ 极端比例（≥3:1，如长卷 / 横幅 / 竖屏）─→ grsai · nano-banana-2 系列 或 七牛 · gemini
├─ OpenAI 兼容工具链集成（已用 gpt-image API）→ 七牛 · openai/gpt-image-2
├─ Google Gemini 风格 / 多语言场景 ──→ 七牛 · gemini-3.1-flash-image-preview
└─ 4K 高清画质需求 ─────────────────→ grsai · nano-banana-2-4k-cl / nano-banana-pro-4k-vip
```

#### Step 2：清晰度选择

| 用途 | 推荐档位 | 理由 |
|---|---|---|
| Web 设计 / 社交媒体封面 / 头像 | 1K（≈1MP） | 速度快、消耗少、足够清晰 |
| 印刷品 / 海报 / A4 文档 | 2K（≈4MP） | 中等成本，平衡精度与速度 |
| 大屏展示 / 高清壁纸 / 商用素材 | 4K（≤8.29MP） | 最高清，耗时与成本最高 |

#### Step 3：vip vs 普通

| 选择维度 | 走 vip | 走普通 |
|---|---|---|
| 比例需求 | 1:3 / 3:1 / 2:1 / 1:2 必须 vip | 通用 11 比例够用 |
| 清晰度需求 | 需要文档预设以外的自定义像素值 | `auto` / 文档预设够用 |
| 成本敏感 | — | ✓ 普通版便宜 |
| 上游协议复杂度 | 必须像素串 | 比例字符串透传 |

### 4.2 比例选择策略

| 任务类型 | 推荐比例 | 推荐清晰度 | 备注 |
|---|---|---|---|
| 头像 / 方形展示 | 1:1 | 1K | 通用、跨模型支持最好 |
| 横向叙事 / 电影剧照 / 横屏壁纸 | 16:9 / 21:9 | 2K~4K | 21:9 偏电影，16:9 偏通用 |
| 小红书封面 / 竖屏短视频封面 | 9:16 / 4:5 | 1K~2K | 4:5 兼顾 Instagram |
| 印刷物 / A4 / 海报 | 3:4 / 4:3 | 2K | 接近 A4 比例 |
| 卡片 / 名片 / 横向印刷 | 3:2 | 1K~2K | 经典摄影比例 |
| 漫画长条 / 信息长图 | **3:1 / 1:3**（仅 vip） / **1:4 / 4:1 / 1:8 / 8:1**（仅 nano-banana-2 / gemini） | 2K~4K | 极端比例需选支持的模型 |
| 横幅 Banner / 网站 Hero 区 | 2:1（仅 vip） / 21:9 | 2K | 21:9 是通用，2:1 仅 vip |

### 4.3 提示词写法指引

#### grsai（自有协议）

- **支持中英混合**，自有协议对中文叙事友好
- 推荐结构：`[主体] + [风格] + [构图 / 视角] + [氛围 / 光线]`
- nano-banana 系列：擅长**写实风格**和**人像**，提示词偏向真实摄影
- gpt-image-2 系列：擅长**多元化风格**和**复杂构图**

**示例**：

```text
一位身穿汉服的少女站在樱花树下，
柔和的春日阳光，电影感构图，
浅景深，shot on Sony A7M4，35mm
```

#### 七牛 OpenAI 兼容（gpt-image-2）

- 推荐**结构化英文 + 关键词堆叠**（与 OpenAI 原生提示词风格一致）
- 比 grsai 更适合**渲染 / 概念图 / 抽象艺术**

**示例**：

```text
A young woman in traditional Hanfu standing under cherry blossoms,
soft spring sunlight, cinematic composition,
shallow depth of field, shot on Sony A7M4, 35mm lens
```

#### 七牛 Gemini

- 中英混合均可，对**多语言场景**和**文化背景**理解更好
- 适合需要**精确遵循指令**的场景（如「画一只戴着红色帽子的猫，坐在木桌上」）

### 4.4 参考图最佳实践

#### 通用规则

- **数量上限**：两家前端 `maxReferenceImages: 4`（`src/providers/models.ts:164, 204`）
- **格式支持**：http(s):// URL / `/files/*` 本地路径 / `data:image/...;base64,...` dataURL
- **`/files/*` 自动转换**：后端 `refToGrsaiImage()` / `refToQiniuImage()` 自动拉本地后转 base64 dataURL，前端不必预处理
- **转换失败处理**：grsai 会过滤失败项；七牛若全部转换失败会抛 `'参考图全部转换失败'` 错误

#### grsai 上送规则

- 上游字段名：`images: string[]`（复数）
- **同一端点**（`/v1/api/generate`）：非空时携带 `images`，空时不携带
- 参考图组合：建议 1~3 张相关图（人物 + 场景 / 多视角同主体）

#### 七牛上送规则

- 上游字段名：`image: string[]`（**单数**）
- **不同端点**：非空走 `/v1/images/edits`，空走 `/v1/images/generations`
- 参考图组合：建议单张或同主题多张

#### 推荐参考图

| 场景 | 推荐 |
|---|---|
| 人物风格迁移 | 1 张目标人物 + 1 张风格参考 |
| 多视角生成 | 同主体 2~3 张不同角度 |
| 场景延展 | 1 张原图 + 1~2 张氛围参考 |
| 商品换背景 | 1 张商品 + 1 张目标背景 |

### 4.5 失败与重试策略

#### 状态机识别

| 状态码 | grsai | 七牛 | 后端归一为 |
|---|---|---|---|
| 任务运行中 | `running` | `processing` | `pending`（透传到前端） |
| 任务完成 | `succeeded` | `succeed` | `completed`（前端拿 `urls`） |
| 任务失败 | `failed / failure / error` | `failed / failure / error` | `failed`（前端显示 `error`） |
| 内容审核未通过 | `violation` | — | `failed`，`error` 文案透传 |

**白名单识别原则**：runner 与后端代理 SUCCESS 数组同时识别 `succeeded` 与 `success`、`completed`、`done`，避免上游字段微调时漏判。

#### 重试与超时

- **轮询上限**：60 分钟（1800 × 2s）；超时返回 `'<provider> 任务轮询超时/失败'`
- **fetch 异常不中断**：网络抖动 / HTTP 非 2xx / JSON 解析失败都 `continue` 继续轮询
- **失败任务不重试**：上游明确返回 `failed / violation` 时立即终止，不再轮询

#### 用户层重试建议

| 场景 | 建议 |
|---|---|
| 网络超时 / 502 | 检查上游端点连通性，切换备用 BaseUrl |
| 内容审核失败 | 调整提示词，避免敏感词；vip 模型可能有更宽松的审核策略 |
| 上游限流 / 余额不足 | 看 `error` 文案，到控制台充值或换 Key |
| 参考图转换失败 | 检查 `/files/*` 路径有效；改用 dataURL 直传 |

### 4.6 内容审核与合规

- **grsai `violation` 状态**：必须当 `failed` 处理，但 `error` 字段内容**必须透传给用户**（这是内容审核的具体原因）
- **七牛无 violation 状态**：审核未通过会在 `status_message` 中给出原因，按 `failed` 处理
- **合规提示**：UI 层应明确告知用户提示词被审核拒绝，避免反复重试同一提示词导致 Key 被风控

### 4.7 性能与成本建议

#### 同步 vs 异步

| 模式 | 适用场景 | 实现方式 |
|---|---|---|
| **同步包装**（推荐少用） | 仅用于命令行 / 一次性脚本测试 | `POST /api/proxy/{provider}/image`，等待 60 分钟内完成 |
| **异步轮询**（主链路） | UI 节点 / 批量任务 / 长任务 | `POST /submit` + `GET /status/:tid` 每 2 秒轮询 |

**前端节点统一走异步**：避免阻塞 UI、可显示进度条、支持取消（前端断开轮询即可）。

#### 清晰度档位影响

| 档位 | 像素数 | 相对耗时 | 相对成本 |
|---|---|---|---|
| 1K | ≈1MP | 1× | 1× |
| 2K | ≈4MP | 2~3× | 2~4× |
| 4K | ≤8.29MP | 4~6× | 4~8× |

**建议**：
- 草稿 / 预览 / 批量探索阶段：1K
- 选稿后再单图 2K / 4K 重生
- 极端比例（≥3:1）尽量用 2K 起步，1K 在长边方向像素太少（如 1:3 + 1K = 688x2048，宽度仅 688px）

#### 并发与限流

- 后端不主动限流，依赖上游
- grsai：未见明确 QPS 限制，但单 Key 同时太多任务可能被排队
- 七牛：见上游限流文档；单 Key 一般 5~10 QPS 内安全

---

## 5 · 字段对照速查表

### 5.1 grsai：前端 camelCase ↔ 上游驼峰

| 前端 / runner 字段 | 后端代理 body 字段 | 上游 body 字段 | 上游 response 字段 | 备注 |
|---|---|---|---|---|
| `apiModel` | `model` | `model` | — | 11 个模型名 |
| `prompt` | `prompt` | `prompt` | — | 必填 |
| `grsaiAspectRatio` | `aspectRatio` | `aspectRatio`（驼峰） | — | vip 模型经 `resolveGrsaiAspectRatio` 转像素串 |
| `grsaiImageSize` | `imageSize` | `imageSize`（仅 nano-banana 系列上送） | — | vip 不进 body |
| 上游素材 → `images[]` | `images` / `image` | `images`（复数） | — | `/files/*` 自动转 dataURL |
| — | — | `replyType: 'async'` | — | 后端固定写 |
| — | — | — | `id` | 任务 ID |
| — | — | — | `status` | `running / succeeded / failed / violation` |
| — | — | — | `progress` | number 0~100 |
| — | — | — | `results[].url` | 成功时取首项 |
| — | — | — | `error` | 失败 / violation 时透传 |

### 5.2 七牛：前端 camelCase ↔ 上游分流后字段

| 前端 / runner 字段 | 后端代理 body 字段 | 上游 body 字段（gpt-image-2） | 上游 body 字段（gemini） | 上游 response 字段 |
|---|---|---|---|---|
| `apiModel` | `model` | `model` | `model` | — |
| `prompt` | `prompt` | `prompt` | `prompt` | — |
| `qiniuQuality` | `quality` | `quality`（顶层） | （忽略） | — |
| 比例 → 像素串 | `size` | `size`（顶层） | （忽略） | — |
| `qiniuSize`（UI 显示比例） | `aspectRatio` | （忽略） | `image_config.aspect_ratio`（下划线） | — |
| `qiniuResolution` | `imageSize` | （忽略） | `image_config.image_size`（下划线） | — |
| 上游素材 → `images[]` | `images` / `image` | `image`（单数）仅 edits | `image`（单数）仅 edits | — |
| — | — | — | — | `task_id` / `id` |
| — | — | — | — | `status` `processing / succeed / failed` |
| — | — | — | — | `status_message` 失败原因 |
| — | — | — | — | `data[].url` 或 `data[].b64_json` |
| — | — | — | — | `progress`（可选） |

---

## 6 · 调试快捷链路

### 6.1 grsai 上游文档（apifox）

| 内容 | 链接 |
|---|---|
| nano-banana 模型文档 | https://qmy27nhsd9.apifox.cn/452392911e0.md |
| gpt-image-2 模型文档 | https://qmy27nhsd9.apifox.cn/452409160e0.md |
| 查询接口文档 | https://qmy27nhsd9.apifox.cn/452409577e0.md |
| 本地 LLMs.txt 镜像 | `中转站/grsai-llms.txt` |

### 6.2 七牛上游文档

| 内容 | 链接 / 路径 |
|---|---|
| 控制台 / API Key 申请 | https://portal.qiniu.com/ai-inference/api-key |
| 本地 LLMs.txt 镜像 | `中转站/七牛-llms.txt`（42KB） |

### 6.3 排错流程图（4 步定位）

```
现象：上游返回错误 / 比例不生效 / 参考图失败
   │
   ├─ Step 1 · 后端日志
   │   $ npm run dev:backend
   │   关注 [upstream] Grsai / Qiniu 日志，确认上游 URL + body 字段
   │
   ├─ Step 2 · 字段对照
   │   核对本文 §5 速查表，确认前端字段名 → 上游 body 字段名转换正确
   │   特别检查：
   │     · grsai 是否误用了 snake_case
   │     · 七牛 gemini 是否漏了 image_config 嵌套
   │     · vip 模型是否还在送 'auto' 比例
   │
   ├─ Step 3 · 上游协议对照
   │   用 firecrawl / curl 重抓 §6.1 / §6.2 文档，对比 §1.3 / §2.6 字段表
   │
   └─ Step 4 · 同步路由 cURL 验证
       $ curl -X POST http://127.0.0.1:18766/api/proxy/grsai/image \
           -H 'Content-Type: application/json' \
           -d '{"model":"nano-banana-2","prompt":"test","aspectRatio":"1:1"}'
       绕过前端节点 / runner，直接验证后端代理层
```

---

## 7 · 变更记录（按 phase 追溯）

| Phase | 版本 | 关键变更 |
|---|---|---|
| phase80 | v1.5.8（fork 自有） | 七牛云 OpenAI 兼容 provider 接入；Grsai 自有协议 provider 接入；后端三条代理路由（60 分钟轮询）；11 比例化 size + `sizeMap.ts` 映射器 |
| phase81 | v1.5.9（fork 自有） | 修复后端 `if(!hasRefs) body.size` 守卫导致图生图 size 丢失；七牛 `openai/gpt-image-2` 新增 1K/2K/4K；Grsai `gpt-image-2-vip` 新增比例×清晰度双控件 + 14 比例×3 档 `DOC_PRESETS_BY_RES` 文档预设表 |
| phase82 | v1.6.1 | 合并 upstream v1.6.0；fork 自有 phase77/78 因 JSON key 冲突重命名为 phase80/81 避免撞号 |
| phase83 | v1.6.2 | **修复七牛 `gemini-3.1-flash-image-preview` 比例不生效**——根因：`callQiniuImageUpstream` 把所有子模型按 OpenAI body 发，gemini 上游需要 `image_config.{aspect_ratio,image_size}` 嵌套对象，收到顶层 `size` 会静默忽略。按 `model` 分流构造 body，gemini 走 `image_config`、openai/gpt-image-2 维持 size/quality；UI 让 gemini 也显示 1K/2K/4K 清晰度档 |
| phase84 | v1.7.0 | 合并 upstream main；fork 七牛 / grsai 完整保留；新增 fork 品牌素材 |

---

## 附录 · 常见问题（FAQ）

**Q1：grsai vip 模型的比例参数为什么必须是像素串？**
A：上游文档明确 `gpt-image-2-vip` 不接受 `auto` 比例和比例字符串，必须传像素串（如 `1024x1024`）。前端 `resolveGrsaiAspectRatio()` 自动按当前选中的比例 + 清晰度档查 `DOC_PRESETS_BY_RES` 表，未命中由 `computeVipSize()` 按目标像素 + 16 对齐 + 长边 ≤3840 + 总像素 ≤8.29MP 兜底计算。

**Q2：七牛 gemini 模型为什么 v1.6.1 之前比例不生效？**
A：v1.6.2 之前 `callQiniuImageUpstream` 把所有子模型按 OpenAI body 发（顶层 `size` / `quality`）。gemini 上游的协议是 `image_config: { aspect_ratio, image_size }` 嵌套对象，收到顶层 `size` 会静默忽略并使用默认 1024x1024。修复后按 `model` 分流，gemini 走嵌套协议。

**Q3：为什么 grsai 字段是驼峰、七牛 gemini 字段是下划线？**
A：两家上游文档的命名风格本来就不同。grsai 自有协议用驼峰；七牛 OpenAI 兼容子模型用顶层 `size` / `quality`（OpenAI 风格），七牛 gemini 子模型用 `image_config.{aspect_ratio,image_size}`（Google Gemini 风格）。前端统一用 camelCase 屏蔽差异，后端 `callQiniuImageUpstream` 按 model 分流时只对 gemini 做命名转换（这是唯一一处「外驼内蛇」转换）。

**Q4：参考图最多能传几张？**
A：两家前端都设 `maxReferenceImages: 4`（`src/providers/models.ts:164, 204`）。上游本身可能支持更多，但 UI 层限制为 4。

**Q5：60 分钟轮询上限为什么定这么长？**
A：grsai vip 4K / 七牛 gemini 4K 的极端比例任务实测耗时可达 5~10 分钟，预留 6× 安全冗余。前端节点可以随时通过删除节点 / 重新运行打断轮询。

**Q6：如何让 grsai 走全球端点 `grsaiapi.com`？**
A：在【API 设置 → Grsai Base URL】输入框右侧点【全球】按钮，或直接填入 `https://grsaiapi.com`。无需重启后端，下一次任务自动生效。七牛同理（国内 `openai.qiniu.com` / 海外 `openai.sufy.com`）。

**Q7：旧画布数据残留的 vip 'auto' 比例怎么处理？**
A：`resolveGrsaiAspectRatio()` 自动兜底到 `1024x1024`（`sizeMap.ts:178`）；UI 下拉列表已在 v1.5.9 移除 `auto` 选项，旧画布加载后用户重新选一次即可。

**Q8：grsai violation 状态怎么显示给用户？**
A：后端 `proxy.js:2637` 把 violation 归到 `status: 'failed'`，并把上游 `data.error` 透传到 `error` 字段。前端节点要显示这个 `error` 文案（如「内容审核未通过：xxx」），不要吞掉。

---

> 维护提示：上游协议有变更时，按 §6.3 排错流程图重新验证一遍后，同步更新本文档 + `src/integrations/{grsai,qiniu}/sizeMap.ts` + `features.json` 新增 phase 编号 + 各模块 README。
