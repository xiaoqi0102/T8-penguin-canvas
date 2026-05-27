# 贞贞工坊 API 接口梳理 & 中转站迁移评估

> 生成时间：2026-05-27
> 范围：T8-penguin-canvas v1.5.3 全量 image / video / audio / LLM 接口
> 目的：为「把贞贞工坊 BaseUrl `https://ai.t8star.org` 切换到其他中转站」提供决策依据与改造路径

---

## 一、贞贞工坊在程序里的角色

**所有上游 AI 调用统一封装在 `backend/src/routes/proxy.js`**（约 2200 行，30+ 路由）。前端通过 `/api/proxy/*` 调用后端，永远拿不到上游 URL 与 API Key 明文。

### BaseUrl 锁定点（4 处，构成「单一真值源 + 强制覆写」防篡改链路）

| 位置 | 代码 | 作用 |
|---|---|---|
| `backend/src/config.js:57` | `ZHENZHEN_BASE_URL: 'https://ai.t8star.org'` | 全局唯一真值源 |
| `backend/src/routes/settings.js:60-61` | 加载 settings 时强制覆写 `zhenzhenBaseUrl` / `llmBaseUrl` | 启动锁 |
| `backend/src/routes/settings.js:124-125` | POST 保存 settings 时再次强制覆写 | 写入锁（前端任何修改都会丢弃） |
| `src/stores/apiKeys.ts:6` | `export const FIXED_ZHENZHEN_BASE = 'https://ai.t8star.org'` | 前端显示用 |
| `src/types/canvas.ts:114,118` | TS 注释「锁定 https://ai.t8star.org」 | 类型说明 |

### 共用三套 API Key 体系

| Key 字段 | 用途 | 默认上游 |
|---|---|---|
| `zhenzhenApiKey` | 通用 Key（image / video / audio 兜底） | `ZHENZHEN_BASE_URL` |
| `llmApiKey` | LLM 独立 Key | `ZHENZHEN_BASE_URL`（同 BASE） |
| `rhApiKey` | RunningHub 独立 Key | `RH_BASE_URL = https://www.runninghub.cn`（**与贞贞工坊解耦**） |
| 分类 Key × 7 | `gptImage / nanoBanana / mj / veo / grok / seedance / suno` | 留空时 fallback 到 `zhenzhenApiKey` |

「专属优先 fallback 通用」逻辑统一在 `ensureKey(settings, res, hint, label)` 中（`proxy.js:116`）。

---

## 二、image / video / audio 接口全清单

> 全部以 `${ZHENZHEN_BASE_URL}` 为前缀；统一 `Authorization: Bearer ${apiKey}`。

### 📷 IMAGE — 5 组上游协议

#### 1. 标准图像生成（GPT2 / nano-banana）

| 前端→后端路由 | 上游路径 | 方法 | 协议要点 |
|---|---|---|---|
| `POST /api/proxy/image`（同步包装） | `POST {BASE}/v1/images/edits?async=true`<br>`POST {BASE}/v1/images/generations?async=true` | POST | GPT2 强制 multipart `/edits`，文生图加 1024×1024 白图占位；nano-banana 文生图走 JSON `/generations` |
| `POST /api/proxy/image/submit`（异步 submit） | 同上 | POST | 返回 `task_id` |
| `GET  /api/proxy/image/status/:tid` | `GET {BASE}/v1/images/tasks/:tid` | GET | 轮询，状态归一 success/completed/done vs failure/failed/error |

**`paramKind` 二分支**：
- `gpt-size`：用 `GPT_SIZE_MAP`（39 个 aspect_ratio × 1k/2k/4k 组合）转像素串，字段 `prompt/model/n/quality/moderation/size/aspectRatio(camelCase)/resolution(小写 1k/2k/4k)`
- `banana-ratio`：JSON 字段 `{prompt, model, aspect_ratio, image_size:'1K'|'2K'|'4K', image[base64...]?}`

**轮询配置**：1800 × 2s = 60 分钟上限（`pollImageTask`）。

#### 2. FAL 队列协议（GPT-image-2 / nano-banana-pro）

| 路由 | 上游路径 |
|---|---|
| `POST /api/proxy/image/fal/submit` | `POST {BASE}/fal/openai/gpt-image-2`<br>`POST {BASE}/fal/openai/gpt-image-2/edit`<br>`POST {BASE}/fal/fal-ai/nano-banana-pro/edit` |
| `POST /api/proxy/image/fal/query` | 透传 `response_url`（自动把 `queue.fal.run` 改写到 `{BASE}/fal`） |

**特征**：返回 `{request_id, response_url}` 异步；轮询 body `status` 字段为 `IN_QUEUE / IN_PROGRESS / COMPLETED / FAILED`；HTTP 非 200 但 body 是 IN_PROGRESS 视为继续等待。

`FAL_REGISTRY` 注册了 3 个模型：`gpt-image-2-fal`, `nano-banana-pro-fal`, `nano-banana-2-fal`。

#### 3. Midjourney（3 速度档）

| 路由 | 上游路径 |
|---|---|
| `POST /api/proxy/mj/imagine` | `POST {BASE}/{mj-turbo\|mj-fast\|mj-relax}/mj/submit/imagine` |
| `GET  /api/proxy/mj/task/:id` | `GET  {BASE}/{...}/mj/task/:id/fetch` |
| `POST /api/proxy/mj/upload` | `POST {BASE}/{...}/mj/submit/upload-discord-images` |

**speed_map**: `turbo/fast/relax → mj-turbo/mj-fast/mj-relax`。
payload 字段完全对齐 gpt-image-2-web `runMJ`：`prompt, base64Array, instanceId, modes, ar, no, c, s, iw, sw, cw, sv, seed, remix, tile, r, video`。

#### 4. 参考图上传（被 video/Seedance/FAL 复用）

| 路由 | 用途 |
|---|---|
| `POST {BASE}/v1/files` (multipart) | 上传参考图换 CDN URL（`uploadRefToZhenzhen()` 内部函数）|

### 🎬 VIDEO — 3 组上游协议

#### 1. 标准视频生成（Veo3.1 / Grok / 旧 seedance）

| 路由 | 上游路径 |
|---|---|
| `POST /api/proxy/video/submit` | `POST {BASE}/v2/videos/generations` |
| `GET  /api/proxy/video/query`  | `GET  {BASE}/v2/videos/generations/:tid` |

**model 自动分支**：
- `model.includes('veo')` → Veo 字段 `{prompt, model, enhance_prompt, aspect_ratio, seed?, enable_upsample?, images[base64≤3]?}`
- `model.includes('grok')` → Grok 字段 `{prompt, model, ratio, duration(int sec), resolution, seed?, images[URL≤7]?}`（图先 `POST /v1/files` 换 URL）
- 其它 → 沿用 Veo 字段（零破坏）

**返回**：`{task_id|id}` → query 取 `data.output` 视频 URL。

#### 2. FAL 视频队列

| 路由 | 上游路径 |
|---|---|
| `POST /api/proxy/video/fal/submit` | `POST {BASE}/fal/fal-ai/veo3.1/fast/reference-to-video`<br>`POST {BASE}/fal/xai/grok-imagine-video/text-to-video`<br>`POST {BASE}/fal/xai/grok-imagine-video/image-to-video` |
| `POST /api/proxy/video/fal/query`  | 透传 response_url，完成标志 `data.video.url` |

`VIDEO_FAL_REGISTRY` 注册了 `veo3.1-fal` (maxRefs 3) 和 `grok-video-fal` (maxRefs 1)。

#### 3. Seedance V3

| 路由 | 上游路径 |
|---|---|
| `POST /api/proxy/seedance/submit` | `POST {BASE}/seedance/v3/contents/generations/tasks` |
| `GET  /api/proxy/seedance/query`  | `GET  {BASE}/seedance/v3/contents/generations/tasks/:tid` |

**payload 特征**：`content[]` 数组，成员类型：
```jsonc
{ "type": "text", "text": "..." }
{ "type": "image_url",  "image_url":  { "url": "..." }, "role": "first_frame|last_frame|reference_image" }
{ "type": "video_url",  "video_url":  { "url": "..." }, "role": "reference_video" }
{ "type": "audio_url",  "audio_url":  { "url": "..." }, "role": "reference_audio" }
```
其它字段：`model, duration, ratio, resolution, generate_audio, return_last_frame, watermark, tools?[web_search], seed?`。

### 🎵 AUDIO — Suno 全链路

#### 1. 生成（3 模式）

| mode | 上游路径 | 备注 |
|---|---|---|
| `generate` | `POST {BASE}/suno/generate` | `{prompt, tags, mv, title, seed?}` |
| `extend`   | `POST {BASE}/suno/generate` | 加 `task:'upload_extend', continue_clip_id, continue_at` |
| `cover`    | `POST {BASE}/suno/submit/music` | `task:'cover', cover_clip_id, generation_type:'TEXT'`, 等 |

**`SUNO_MV_MAP`（7 个版本）**：
```js
'v3.0' → 'chirp-v3.0'   'v3.5' → 'chirp-v3.5'
'v4'   → 'chirp-v4'     'v4.5' → 'chirp-auk'
'v4.5+'→ 'chirp-bluejay' 'v5'  → 'chirp-crow'
'v5.5' → 'chirp-fenix'  (默认)
```

#### 2. 查询

| 路由 | 上游路径 |
|---|---|
| `GET /api/proxy/audio/query?clipIds=xxx` | `GET {BASE}/suno/feed/:clipIds` |

返回 `clips[]`，逐个取 `audio_url` + 元数据（`image_large_url, title, tags, metadata.duration`），完成态 `status === 'complete'`。

#### 3. 参考音频上传（cover / extend 必备的 5 步流水线）

```
① POST {BASE}/suno/uploads/audio                       body: {extension}  → {id, url, fields?}
② S3 上传（外部 URL）:
   - 有 fields  → POST multipart 到 url（含 fields[*] + file）
   - 无 fields  → PUT 到预签 url
③ POST {BASE}/suno/uploads/audio/:id/upload-finish    body: {upload_type:'file_upload', upload_filename}
④ 轮询 30 × 2s: GET {BASE}/suno/uploads/audio/:id     等 status === 'complete'
⑤ POST {BASE}/suno/uploads/audio/:id/initialize-clip  body: {}            → {clip_id}
```

### 🤖 LLM（共用同一 BASE，独立 `llmApiKey`）

| 路由 | 上游路径 | 协议 |
|---|---|---|
| `POST /api/proxy/llm` | `POST {BASE}/v1/chat/completions` | OpenAI 兼容 + SSE 流式 + 多模态 image_url 自动 base64 内联 |

`normalizeLlmMessageImages()` 会把 `messages[].content[].image_url.url` 中的 `/files/*` 本地路径转成 base64 dataURL。

---

## 三、与贞贞工坊解耦的部分（迁移时无需改动）

| 模块 | 路径 | 说明 |
|---|---|---|
| RunningHub 工作流 | `config.RH_BASE_URL = 'https://www.runninghub.cn'` | 独立 Key（`rhApiKey`）、独立协议（`/task/openapi/*`）|
| 算力充值 | `pay.t8star.org` | 走 VPS 公开下单接口 |
| 本地图像处理 | `backend/src/routes/imageOps.js` | sharp 全本地，无上游 |
| 文件管理 | `/api/files/*` | 本地 multer 上传 |
| 资源库 / 主题 / 画布 | `resources.js / themes.js / canvas.js` | 全本地 JSON 文件 |

---

## 四、迁移可行性评估

### ✅ 结论先说

**理论可行**。只要中转站完整兼容贞贞工坊使用的所有上游协议路径与字段，**一行配置切换 + 解除强制覆写锁**即可。实际可行性取决于中转站支持哪些协议。

### 难度分级（按目标中转站的兼容程度）

#### 🟢 L1 — 仅 LLM + 标准 OpenAI 图像

中转站需提供：
- `POST /v1/chat/completions`
- `POST /v1/images/generations`
- `POST /v1/images/edits`
- `GET  /v1/images/tasks/:id`（异步轮询；若中转站只支持同步，需要前端配套改造）

**会丢失**：MJ / Suno / Seedance / Veo3 / Grok Video / FAL 渠道（绝大多数中转站不提供这些）

#### 🟡 L2 — 加 FAL 通用渠道

在 L1 基础上 + `POST /fal/{endpoint}`（透传 FAL Queue API）。保留 FAL 类图像/视频。需要中转站提供 FAL 子路径。

#### 🔴 L3 — 完整对等

在 L2 基础上 + 贞贞工坊**私有**路径：
- `/{mj-turbo|fast|relax}/mj/submit/*` + `/mj/task/:id/fetch`
- `/suno/generate` + `/suno/feed/:ids` + `/suno/submit/music` + `/suno/uploads/audio*`
- `/v2/videos/generations(/:tid)`
- `/seedance/v3/contents/generations/tasks(/:tid)`
- `/v1/files`（参考图上传换 URL）

**几乎只有贞贞工坊系/同源中转支持**。

### 改造步骤（任何等级都涉及）

1. **改 BaseUrl 真值源**
   - `backend/src/config.js:57` 把 `ZHENZHEN_BASE_URL` 改为新 BASE
2. **解除强制覆写**
   - `backend/src/routes/settings.js:60-61, 124-125` 去掉对 `zhenzhenBaseUrl` / `llmBaseUrl` 的强制覆写，允许用户在 UI 自定义
3. **前端解锁**（可选，根据是否暴露给用户编辑）
   - `src/stores/apiKeys.ts:6` 把 `FIXED_ZHENZHEN_BASE` 改为变量或可编辑字段
   - `src/types/canvas.ts:114,118` 更新注释
4. **Electron 打包模式必需**
   - `npm run encrypt` 重新生成 `.t8c` 字节码（`backend/src/**` 任何改动都要重做）
5. **版本号四同步**（按项目规范）
   - `package.json` / `package-lock.json` / `vite.config.ts.__APP_VERSION__` / `electron/main.cjs` / `backend/src/config.js APP_VERSION` / `features.json.version`
6. **逐路由验证**
   - 按协议清单逐个测试 image / video / audio 关键节点
   - 同步更新 `features.json` 节点锁

### 推荐改造方向（不要 hardcode 新 URL）

**把 BaseUrl 从「硬锁定」改为「可在 API 设置里输入 + 兜底默认值」**。这样：
- 同一份代码可对接多家中转站
- 用户自带 API Key 时无需开发者重新发版
- 解除 `settings.js` 的强制覆写即可
- 默认值保留 `https://ai.t8star.org`（向后兼容）

---

## 五、对中转站文档的核对清单

把中转站接口说明拿来后，需要逐个核对：

### Checklist

- [ ] **OpenAI 兼容路径**是否真为 `/v1/images/generations` `/v1/images/edits` `/v1/chat/completions`（命名可能稍异，如 `/v1/images/generations/async`）
- [ ] **任务轮询路径**：是否是 `/v1/images/tasks/:id`（贞贞工坊特有），还是 `/v1/tasks/:id` / 仅同步无异步
- [ ] **Auth 形态**：是否仍是 `Authorization: Bearer ${apiKey}`，或换成 `x-api-key` 等
- [ ] **响应结构**：
  - 同步 `data:[{url|b64_json}]`？
  - 异步 `{task_id}` + 轮询返回 `{data:{status,progress,data:[{url}]}}`？
  - 是否有其他变体？
- [ ] **是否支持 FAL 透传** `/fal/{endpoint}`？
- [ ] **是否支持 MJ**？子路径形态是否为 `/{速度档}/mj/submit/*`？
- [ ] **是否支持 Suno**？是否兼容 5 步上传流水线？
- [ ] **是否支持 Seedance / Veo / Grok Video**？
- [ ] **参考图上传**：是否提供等价于 `/v1/files` 的 multipart 上传接口？
- [ ] **超时与并发限制**：是否与 60 分钟轮询窗口兼容？
- [ ] **错误码与错误消息字段**：`error.message` / `message` / `detail` / `description` 哪种？

---

## 六、相关文件索引

| 文件 | 行号 | 角色 |
|---|---|---|
| `backend/src/config.js` | 56-58 | `ZHENZHEN_BASE_URL` 真值源 |
| `backend/src/routes/proxy.js` | 全文 | 30+ 路由，所有上游调用 |
| `backend/src/routes/settings.js` | 60-61, 124-125 | 强制覆写锁 |
| `backend/src/utils/whitePng.js` | — | GPT2 文生图白图占位 |
| `backend/src/utils/duckPayload.js` | — | RH 隐写解码（非贞贞工坊相关） |
| `src/stores/apiKeys.ts` | 6, 21, 56, 72 | 前端 FIXED_ZHENZHEN_BASE |
| `src/types/canvas.ts` | 114, 118 | 类型定义 |
| `src/components/ApiSettings.tsx` | 230 | UI 注册入口 |
| `src/components/RechargeModal.tsx` | 427 | 充值显示 |
| `src/App.tsx` | 647, 662 | 顶部导航链接 |

---

## 七、改造工作量预估

| 阶段 | 范围 | 预估工时 |
|---|---|---|
| 后端改 BaseUrl + 解锁 settings | 2 个文件 4-5 行 | 0.5h |
| 前端解锁 + 注入用户输入 | `apiKeys.ts` + `ApiSettings.tsx` | 1-2h |
| 逐协议兼容测试 + 路径调整 | 视中转站文档差异 | **3-20h 不等**（L1 最少，L3 最多） |
| Electron 重打包 + 全功能回归 | encrypt + dist + 手动验证 | 1-2h |
| 文档与版本号同步 | features.json + 4 处版本 + README | 0.5h |

**最优情况**（中转站完全对等）：**半天**。
**最差情况**（仅 LLM/标准图像兼容）：**2-3 天**，且需删除/隐藏不支持的节点（要写入 `features.json` 防丢失锁）。
