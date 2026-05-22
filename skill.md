# T8-penguin-canvas · skill.md

> 项目能力 / 接口 / 文件用途速查手册。
> 版本：v1.0.0 ｜ 仓库：<https://github.com/T8mars/T8-penguin-canvas>

---

## 1. 项目定位

T8-penguin-canvas 是 PenguinPravite 画布功能的 **轻量化重构版**，定位为 **纯 Web 端 AI 创作画布工具**：

- 仅运行于浏览器（前端 Vite 5180 端口 + 后端 Node Express 18766 端口）。
- 严格剔除桌面端封装、CLI、登录系统、创意库等非画布能力。
- 25 个业务节点（含 upload）全部落地，覆盖文本 / 图像 / 视频 / 音频 / LLM / 工作流 / 工具 / 辅助 / 工具箱。
- 支持 **批量执行（拓扑顺序串行）**、**节点对齐辅助线（snap-to-grid + 智能吸附）**、**双主题（科技风 / 像素糖果风）**、**终端日志面板**。

---

## 2. 仓库结构

```
T8-penguin-canvas/
├── backend/                     # Node + Express 后端
│   └── src/
│       ├── server.js            # 入口，挂载 5 类路由
│       ├── config.js            # 端口/目录/上游 baseUrl
│       ├── utils/
│       │   └── whitePng.js      # 零依赖 PNG 编码器（GPT2 文生图占位白图）
│       └── routes/
│           ├── canvas.js        # 画布 CRUD（防空覆盖）
│           ├── settings.js      # 三套 API Key 持久化（脱敏 GET / 明文 raw）
│           ├── files.js         # 上传 / list / base64 转存
│           ├── imageOps.js      # sharp：resize/upscale/grid-crop/combine/remove-bg
│           └── proxy.js         # 上游代理：image/llm/video/audio/runninghub（全异步对齐主项目）
├── src/                         # 前端 React + TS
│   ├── App.tsx                  # 三栏布局 + 状态栏
│   ├── components/
│   │   ├── Canvas.tsx           # 画布主体（xyflow）+ 批量运行 + 对齐辅助
│   │   ├── CanvasToolbar.tsx    # 顶部浮动工具栏（运行/吸附/历史/复制/导入导出/模板/帮助/终端）
│   │   ├── TerminalPanel.tsx    # 底部抽屉式日志面板（双主题）
│   │   ├── CanvasManager.tsx    # 多画布管理列
│   │   ├── Sidebar.tsx          # 节点拖拽侧边栏
│   │   ├── ApiSettings.tsx      # 三套 Key 设置弹窗
│   │   └── nodes/               # 27 个节点组件文件
│   ├── stores/
│   │   ├── canvas.ts            # 画布列表 store
│   │   ├── apiKeys.ts           # 三套 Key store
│   │   ├── theme.ts             # 浅/深色 + 科技/像素双主题
│   │   ├── runBus.ts            # 运行总线（批量执行）
│   │   └── logs.ts              # 日志总线 logBus（对齐 gpt-image-2-web log()）
│   ├── hooks/
│   │   ├── useCanvasHistory.ts  # Undo/Redo 栈
│   │   └── useRunTrigger.ts     # 节点订阅运行总线
│   ├── services/
│   │   ├── api.ts               # 后端 REST 封装
│   │   ├── generation.ts        # 图像/视频/音频/LLM 生成调用封装
│   │   └── imageOps.ts          # /api/image/* 工具调用
│   ├── providers/               # 模型注册表（image/video/audio/llm）
│   ├── config/
│   │   ├── nodeRegistry.ts      # 24 节点元数据（label/icon/color）
│   │   └── canvasTemplates.ts   # 工作流模板预设
│   ├── utils/
│   │   └── topologicalSort.ts   # Kahn 拓扑排序（批量运行依赖序）
│   ├── types/canvas.ts          # 节点 / 画布 / Key 类型
│   └── styles/index.css         # Tailwind 入口
├── data/                        # 画布 JSON / 设置 JSON（gitignore）
├── input/  output/  thumbnails/ # 用户上传 / 生成产物 / 缩略（gitignore）
├── features.json                # 节点防丢失锁 + 接口快照
├── vite.config.ts               # 5180 端口 + /api → 18766 代理
├── package.json
└── tsconfig.json
```

---

## 3. 后端接口（http://127.0.0.1:18766）

### 3.1 健康检查

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/status` | 返回 `{ ok, service, version, port, time }` |

### 3.2 画布 CRUD（routes/canvas.js）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/canvas` | 画布列表 |
| POST | `/api/canvas` | 新建画布 `{ name? }` |
| GET | `/api/canvas/:id` | 画布数据 `{ nodes, edges, viewport }` |
| PUT | `/api/canvas/:id` | 保存画布数据，**拒绝空数据覆盖非空画布** |
| DELETE | `/api/canvas/:id` | 删除画布及数据文件 |
| PATCH | `/api/canvas/:id/name` | 重命名 `{ name }` |

> 数据文件位置：`data/canvas_list.json` + `data/canvas_<id>.json`。

### 3.3 设置（routes/settings.js）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/settings` | 三套 Key 设置（Key 字段被 `****xxxx` 脱敏） |
| GET | `/api/settings/raw` | 内部接口，明文（仅供 proxy.js 调用） |
| POST | `/api/settings` | 更新设置；`zhenzhenBaseUrl` / `llmBaseUrl` 强制为配置值 |

字段：`zhenzhenApiKey / rhApiKey / llmApiKey + 各自 baseUrl + preferences{ theme, language }`。

### 3.4 文件（routes/files.js）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/files/upload` | multipart 上传到 `input/`，限 10MB |
| GET | `/api/files/list` | 列出 `output/` 中的 png/jpg/webp/gif/mp4/webm/mp3/wav |
| POST | `/api/files/upload-base64` | dataURL 转存到 `output/`（手绘画板 / 抽帧使用） |

静态托管：`/files/output`、`/files/input`、`/files/thumbnails`、`/output`、`/input`。

### 3.5 图像处理（routes/imageOps.js · sharp）

| 方法 | 路径 | body |
|---|---|---|
| POST | `/api/image/resize` | `{ imageUrl, width?, height?, fit? }` |
| POST | `/api/image/upscale` | `{ imageUrl, scale }`（1~8，lanczos3） |
| POST | `/api/image/grid-crop` | `{ imageUrl, rows, cols }`，返回 `urls[]` |
| POST | `/api/image/combine` | `{ imageUrls[], direction: 'horizontal' \| 'vertical' }`，等比缩放后拼接 |
| POST | `/api/image/remove-bg` | `{ imageUrl }`（**占位实现**，仅 PNG 化） |

输入支持本地 URL（`/files/output|input` / `/output|input`）、HTTP(S)、`data:image/...;base64,` 三种形态。

### 3.6 上游代理（routes/proxy.js）

> 隐藏 Key、自动注入 Key、产物自动转存到 `output/` 并返回本地 URL。

#### 图像（全异步 · 1:1 对齐 gpt-image-2-web）
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/proxy/image` | 同步入口：内部提交异步任务并轮询至完成，返回本地图片 URL（兼容同步响应的上游） |
| POST | `/api/proxy/image/submit` | 提交异步任务，返回 `{ sync, taskId?, urls?, status, progress }` |
| GET  | `/api/proxy/image/status/:tid` | 轮询 `/v1/images/tasks/{tid}`，返回 `{ status, progress, urls? }` |

调用上游必加 `?async=true` 查询参数，GPT2 始终走 multipart `/v1/images/edits?async=true`（无参考图时插入 1024×1024 白图占位）；nano-banana 文生图 JSON `/v1/images/generations?async=true`、图生图 multipart `/v1/images/edits?async=true`。详见 §11 异步任务规范。

#### 同步：LLM
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/proxy/llm` | 贞贞工坊 `/v1/chat/completions`，使用 **LLM 独立 Key** |

#### 异步：视频（全异步 · 1:1 对齐 gpt-image-2-web）
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/proxy/video/submit` | 上游 `/v2/videos/generations`；**后端根据 `model` 名自动选择 Veo3.1 / Grok / Seedance 三种 payload 协议**，返回 `taskId` |
| GET | `/api/proxy/video/query?taskId` | 轮询；SUCCESS 时下载视频到本地，返回 `videoUrl` |

Grok 路径另依赖上游 `POST /v1/files`（multipart `file`）上传参考图拿 URL，后端在 [`uploadRefToZhenzhen`](file:///e:/PenguinPravite/T8-penguin-canvas/backend/src/routes/proxy.js) 内部完成，前端可传 base64 或 `/files/*` 本地 URL。详见 §11.6。

#### 异步：Suno 音频（v5.5 三模式）
| 方法 | 路径 | mode |
|---|---|---|
| POST | `/api/proxy/audio/submit` | `generate / cover / extend`，自动选 `mv` |
| GET | `/api/proxy/audio/query?clipIds` | 解析 `audio_url`，返回 `tracks[]` |

模型映射：`suno-v5.5 → chirp-fenix`、`v5 → chirp-v3-5`、`v4.5 → chirp-v4-5`、`v4 → chirp-v4`。

#### 异步：RunningHub
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/proxy/runninghub/submit` | `/task/openapi/ai-app/run`，返回 `taskId` |
| GET | `/api/proxy/runninghub/query?taskId` | 轮询；code `0/804/813/805` → `SUCCESS/RUNNING/QUEUED/FAILED`，转存所有产物 |
| GET | `/api/proxy/runninghub/app-info?webappId` | 调 `/api/webapp/apiCallDemo`，返回 `nodeInfoList` 等 |

---

## 4. 前端服务封装

### `src/services/api.ts`
- `checkBackendStatus()` / `listCanvases()` / `createCanvas(name?)`
- `getCanvasData(id)` / `saveCanvasData(id, data)` / `deleteCanvas(id)` / `renameCanvas(id, name)`
- `getSettings()` / `updateSettings(patch)`

### `src/services/generation.ts`
统一封装 image / video / audio / llm 的提交 + 轮询，向上层节点暴露 Promise。

### `src/services/imageOps.ts`
对 `/api/image/*` 的薄封装，供工具节点 `ResizeNode / UpscaleNode / GridCropNode / CombineNode / RemoveBgNode` 使用。

---

## 5. 节点清单（25 个）

| 分组 | 节点 type | 入口 | 可批量运行 |
|---|---|---|---|
| 核心 | text | TextNode | ✗ |
| 核心 | upload | UploadNode（图像/音频/视频自适应） | ✗ |
| 核心 | image | ImageNode（异步轮询，对齐 gpt-image-2-web） | ✓ |
| 核心 | video | VideoNode | ✓ |
| 核心 | seedance | VideoNode（model=seedance-2.0） | ✓ |
| 核心 | audio | AudioNode | ✓ |
| 核心 | llm | LLMNode | ✓ |
| 核心 | runninghub | RunningHubNode | ✓ |
| 核心 | rh-config | RhConfigNode | ✗ |
| 特殊 | multi-angle-3d / panorama-720 / penguin-portrait | PresetImageNode | ✓ |
| 特殊 | portrait-metadata | PortraitMetadataNode | ✗ |
| 特殊 | storyboard-grid | StoryboardGridNode | ✗ |
| 工具 | drawing-board | DrawingBoardNode | ✗ |
| 工具 | browser | BrowserNode | ✗ |
| 工具 | image-compare | ImageCompareNode | ✗ |
| 工具 | frame-extractor | FrameExtractorNode | ✓ |
| 工具 | resize / upscale / grid-crop / combine / remove-bg | ImageOpFrame | ✓ |
| 辅助 | edit | ImageNode（mode=edit） | ✓ |
| 辅助 | idea / bp / relay / video-output | IdeaNode / BpNode / RelayNode / VideoOutputNode | ✗ |
| 工具箱 | cinematic / video-motion | ToolboxParamNode | ✗ |

> 「可批量运行」= 已通过 `useRunTrigger(nodeId, runFn)` 接入运行总线。

---

## 6. 运行总线（批量执行）

### `src/stores/runBus.ts` · zustand
```
state: { currentRunId, lastDone, mode, batchTotal, batchDoneCount }
actions: triggerRun(id, mode='single'|'batch'), markDone(id, ok, error?),
         cancelAll(), setBatchProgress(total, done)
```

### `src/hooks/useRunTrigger.ts`
节点端订阅 `currentRunId`，命中自身则 `await runFn()` → `markDone(id, true)`。
- 用 `runFnRef = useRef(runFn)` 保持闭包最新。
- `startedRef` 防 React StrictMode 二次挂载重入。
- 异常被节点内部 `try/catch` 消化（节点自管 `status='error'`），运行总线只关心「已完成」。

### `src/utils/topologicalSort.ts`
Kahn 算法：仅取可执行节点子图的入度，排序失败时按原始顺序补全（环兼容）。

### `Canvas.tsx · handleRunAll`
1. 拓扑排序得 `order: string[]`
2. `setBatchProgress(order.length, 0)` → 串行 `await new Promise(...)`，每个节点 5 分钟安全超时
3. 监听 `lastDone.id === order[i]` 推进
4. `cancelRunRef` 控制中断
5. 工具栏 Play/Square 按钮 + `done/total` 进度徽标

---

## 7. 节点对齐辅助

### snap-to-grid
ReactFlow 内置：`snapToGrid={snapEnabled} snapGrid={[20, 20]}`。

### 智能对齐辅助线（onNodeDrag）
对每对「拖拽节点 6 边 × 其他节点 6 边」做差，差 < `ALIGN_THRESHOLD=6px`：
- 记入 `guides.vertical / horizontal`
- 取最优差值做弱吸附（`setNodes` 直接调整位置）
- 通过 `<ViewportPortal>` + SVG 在世界坐标系绘制橙色虚线（`vectorEffect="non-scaling-stroke"`）
- `onNodeDragStop` 清空辅助线

工具栏 **磁铁 Magnet 按钮** 开关吸附与辅助线。

---

## 8. 画布交互

| 能力 | 实现 | 文件 |
|---|---|---|
| Undo/Redo | 节流 250ms 入栈 + 拖拽中暂停 | `useCanvasHistory.ts` |
| 复制/粘贴/快复制/删除 | 仅复制选中节点 + 子图边，paste 偏移 (40,40) | `Canvas.tsx · handleCopy/Paste/Duplicate/DeleteSelected` |
| 导入/导出 JSON | `{ version, exportedAt, nodes, edges }` | `Canvas.tsx · handleExport/handleImportFile` |
| 工作流模板 | 预设节点+连线，一键插入 | `config/canvasTemplates.ts` |
| 自动保存 | 800ms 防抖；防空数据覆盖（前端 + 后端双层） | `Canvas.tsx` 自动保存 effect |
| 后端连通检测 | 每 15s `GET /api/status` | `App.tsx` |

### 全局快捷键
`Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y` / `Ctrl+C` / `Ctrl+V` / `Ctrl+D` / `Ctrl+A` / `Delete` / `Backspace`。

---

## 9. 三套 API Key

| Key | 默认 BaseUrl | 是否固定 | 影响节点 |
|---|---|---|---|
| `zhenzhenApiKey` | `https://ai.t8star.org` | ✓ | image / video / audio |
| `runninghubApiKey` | `https://www.runninghub.cn` | ✗（仅 Key） | runninghub / rh-config |
| `llmApiKey` | `https://ai.t8star.org` | ✓ | llm / vision（**额度独立**） |

后端 `routes/settings.js` 在保存时强制将 `zhenzhenBaseUrl / llmBaseUrl` 还原为配置常量，防止前端篡改。

---

## 10. 启动 / 构建

```powershell
# 安装
npm install
cd backend; npm install; cd ..

# 开发（前端 5180 + 后端 18766，concurrently 并发）
npm run dev

# 类型检查 / 构建
npm run type-check
npm run build
```

或 Windows 双击 `start-dev.bat`。

---

## 11. 异步任务对齐外部参考项目规范（重要·以图像节点改造为参考样板）

> 本节记录的是 **通用规范**，适用于后续 **任何节点** 对齐外部参考项目（gpt-image-2-web / suno-web / runninghub-web 等）的改造。
> **字段名、路径、查询参数、枚举值并非固定**，每次都以当次参考项目的源码为准。

### 11.1 三原则

1. **参照源于参考项目的运行时代码**：优先读 `index.html` / `main.js` 中的 `fetch(...)` 调用点，而不是口头描述或官方文档。
2. **字段严格原样复制**：包括大小写（`aspectRatio` vs `aspect_ratio`）、枚举值大小写（`1k` vs `1K`）、是否传空串、是否增加 `?async=true` 查询参数、multipart vs JSON。
3. **反向验证**：提交后上游后台必须能看到 **异步任务**，而不是只看到同步请求；否则表示代理未走对应路径。

### 11.2 后端处理范式

上游调用集中抽取为 **单一 helper**（主项目例：[`callImageUpstreamAsync`](file:///e:/PenguinPravite/T8-penguin-canvas/backend/src/routes/proxy.js)），同步入口（`/image`）与异步入口（`/image/submit`）**必须复用同一 helper**，避免双实现漂移。

```
request → callXUpstreamAsync(...) → fetch(`?async=true`) → normalize →
  - kind=='sync'  → 转存产物 → 返回 urls
  - kind=='async' → 返回 taskId（/image/submit）或 pollXTask(taskId) → urls（/image）
```

轮询路径（图像示例）：`GET {baseUrl}/v1/images/tasks/{taskId}`。响应结构可能是多层嵌套（`data.data.data[0].url`），要同时兼容 `data.data[0]` 与 `data.data.data[0]` 两种布局，详见 [proxy.js#image/status](file:///e:/PenguinPravite/T8-penguin-canvas/backend/src/routes/proxy.js)。

状态字段同样不固定，要同时识别 `SUCCESS / completed / done / success`、与失败类 `failure / failed / error`，**全部转小写后判断**。

### 11.3 前端节点执行范式

```ts
// 1) 提交
const submit = await submitXAsync({ ... });
// 2) 同步完成分支
if (submit.sync && submit.urls?.length) { update(success); return; }
// 3) 异步轮询分支
for (let i = 0; i < MAX; i++) {
  await sleep(INTERVAL);
  const q = await queryXStatus(submit.taskId!);
  update({ progress: q.progress });
  const st = String(q.status).toLowerCase();
  if (['completed','success','done'].includes(st)) { update(success(q.urls)); return; }
  if (['failed','failure','error'].includes(st))   throw new Error(q.error);
}
throw new Error('超时');
```

默认参数：`MAX=60`、`INTERVAL=2000ms`（与主项目一致）。各节点可根据任务平均耗时调整，但无特殊原因不要脱离这个量级。

### 11.4 特殊补丁（为什么需要白图）

某些上游端点（如 GPT2 的 `/v1/images/edits`）**必须传 `image` 字段**。主项目代码中文生图场景会以 canvas 制造 1024×1024 白图占位（`index.html` line 2861）。Node 端无 canvas，改以 [whitePng.js](file:///e:/PenguinPravite/T8-penguin-canvas/backend/src/utils/whitePng.js) 零依赖手写 PNG（zlib + CRC32 + IHDR/IDAT/IEND）生成，并缓存。其他节点遇到类似“上游要求字段但场景上没有”的问题时，**优先选择补默认体以保持一致**，不要反向修改分发逻辑。

### 11.5 代码定位索引（主项目 gpt-image-2-web）

| 关键点 | 文件·行号 |
|---|---|
| GPT2 全量参数 + 白图 + `?async=true` | `index.html` ~ line 2840-2883 |
| GPT_SIZE_MAP 完整表（13×3） | `index.html` line 2173 |
| nano-banana 文生图 JSON | `index.html` ~ line 2998-3008 |
| pollTask 轮询逻辑及状态字段调和 | `index.html` ~ line 4866-4908 |
| Veo3.1 `runVeo3` / `pollVeo3` | `index.html` line 3372 / 3422 |
| Grok Video `runGrok3` / `pollGrok3` | `index.html` line 3863 / 3917 |
| `uploadFileToAPI`（Grok 参考图上传） | `index.html` line 3104 |
| veo_model 13 子模型下拉 | `index.html` line 1350 |
| gk_ratio / gk_duration / gk_resolution | `index.html` line 1410-1414 |

后续改造 audio / sora 等节点时同样到参考项目 `index.html` 用 `grep_code` 搜“`/suno/generate`”、“`runSora`” 以定位。

### 11.6 视频节点协议对齐实例（Veo3.1 / Grok Video）

> 此例为 **可复用样本**：“一个上游路径、两种完全不同的 payload 字段”怎么在同一路由中优雅剩余。后续 sora2 / fal 渠道接入可参照同样“分支-不破坏”结构。

#### 两个模型的 payload 字段对照表（字段名严格以主项目为准）

| 范畴 | Veo3.1 （`runVeo3`） | Grok Video （`runGrok3`） |
|---|---|---|
| 上游路径 | `POST /v2/videos/generations` | `POST /v2/videos/generations`（同） |
| 轮询路径 | `GET /v2/videos/generations/{tid}` | （同） |
| 模型子选 | 13 个（veo3 / veo3-fast / veo3.1 / veo3.1-pro / veo3.1-4k …） | `grok-video-3` |
| 比例字段 | `aspect_ratio`（8 选项仅中 16:9/9:16） | `ratio`（2:3 / 3:2 / 16:9 / 9:16 / 1:1） |
| 时长 | —不传— | `duration`（**数字秒**：6/10/15/30） |
| 分辨率 | —不传— | `resolution`（`480P` / `720P`，**大写 P**） |
| 提示词增强 | `enhance_prompt:bool` | — |
| 上采样 | `enable_upsample:bool` | — |
| 随机种子 | `seed`（0 不传） | `seed`（0 不传） |
| 参考图上限 | 3 | 7 |
| 参考图格式 | `images: string[]`，**base64 dataURL** | `images: string[]`，**先 `POST /v1/files` 上传拿 URL** |

#### 后端处理分支（零破坏原则）

[`/api/proxy/video/submit`](file:///e:/PenguinPravite/T8-penguin-canvas/backend/src/routes/proxy.js) 内以 `model` 名包含 `'grok'` / `'veo'` 作为分支键。**未知模型（如 seedance）必须堆在 Veo 分支**，以保留历史画布中 “model=seedance-2.0 使用 aspect_ratio + images=base64” 的旧行为。这是“仅加不减”原则的典型设计。

Grok 参考图上传：
```js
// uploadRefToZhenzhen(): 接受 base64 dataURL 或 /files/* 本地 URL
// 内部 fetch 转 Buffer → multipart fd.append('file', blob, ...) → POST /v1/files → 取 j.url
```
前端不需要为 Grok 转 base64，直接传上游可访问的 URL 或本地 `/files/*` 即可。

#### 前端节点设计要点

- [`VIDEO_MODELS`](file:///e:/PenguinPravite/T8-penguin-canvas/src/providers/models.ts) 中 **每个项携带 `kind: 'veo' | 'grok' | 'seedance'`**，以该枚举控制 UI 列表（是否展示 duration / resolution / enhance/upsample）。
- [`VideoNode`](file:///e:/PenguinPravite/T8-penguin-canvas/src/components/nodes/VideoNode.tsx) 提交时按 `modelDef.kind` **选不同字段名**（`aspect_ratio` vs `ratio`），而不是走同一份字段让后端重映射。
- 参考图预处理：`kind === 'grok'` 直接传 URL 列表；其他 kind 调 `urlToBase64()`。
- 切主模型时调 `switchMainModel()` **重置** ratio/duration/resolution 为该 kind 默认值，避免跨模型参数遗留（如从 grok 切到 veo 还带着 `2:3`）。
- 旧画布兼容：接受 `model='veo-3.1'`/`'grok-video'` 这些旧值时 `find` 不到会退回 `VIDEO_MODELS[0]`，不报错。

### 11.7 FAL 渠道接入实例（gpt-image-2-fal / nano-banana-pro-fal）

> 严格对齐 [`gpt-image-2-web/SKILL.md` §FAL模型渠道接入规范](file:///E:/PenguinPravite/gpt-image-2-web/SKILL.md)。FAL 是**独立 Queue API**，与原 `/v1/images/*` 协议完全不同，故走**新增独立路由**（不污染原 `/image/submit`）。

#### 协议核心

| 项 | 取值 |
|---|---|
| URL 前缀 | `${ZHENZHEN_BASE_URL}/fal/${endpoint}` （替换官方 `https://queue.fal.run`） |
| 认证 | `Authorization: Bearer ${apiKey}` |
| GPT FAL endpoint | `openai/gpt-image-2`（gen）/ `openai/gpt-image-2/edit`（edit） |
| NBPro FAL endpoint | `fal-ai/nano-banana-pro/edit`（只有 edit） |
| 同步返回 | `result.images[]` 直接拿 URL |
| 异步返回 | `result.request_id` + `result.response_url` → 轮询 |
| **response_url 域名修复** | `queue.fal.run` → `${baseUrl}/fal`，否则会走到公网 |
| 轮询 HTTP 非 200 | body 中 `status==='IN_QUEUE'` / `'IN_PROGRESS'` 视为进行中（必须重试，不能抛错） |
| 轮询完成 | `pd.images[]` |
| 轮询失败 | `pd.status === 'FAILED'` / `'CANCELLED'` |
| 自定义尺寸 | 宽高必须 **16 整数倍**，后端 `snap16()` 自动对齐 |
| 参考图 | 上传 `${baseUrl}/v1/files` 拿 URL（复用现有 `uploadRefToZhenzhen()`） |

#### 两个模型 payload 字段对照

| 范畴 | gpt-image-2-fal（`runGPTFal`） | nano-banana-pro-fal（`runNanoFal`） |
|---|---|---|
| paramKind | `gpt-fal` | `nbpro-fal` |
| 模式 | `mode: 'edit' \| 'gen'`（有参考图默认 edit） | 仅 edit |
| 尺寸 | `image_size: 'auto'\|'square_hd'\|'square'\|'portrait_4_3'\|'portrait_16_9'\|'landscape_4_3'\|'landscape_16_9'` 或 `{width,height}`（custom，16倍数） | `aspect_ratio: 'auto'/'21:9'/...` + `resolution: '1K'/'2K'/'4K'` |
| 张数 | `num_images: 1-4` | `num_images: 1-4` |
| 质量 | `quality: 'low'/'medium'/'high'/'auto'`（默认 medium） | — |
| 输出 | `output_format: 'png'/'jpeg'/'webp'` | `output_format` |
| 同步开关 | `sync_mode: true`（贞贞接受时同步返） | — |
| 安全 | — | `safety_tolerance: '1'(严)..'6'(松)`，默认 `'4'` |
| 系统词 | — | `system_prompt`（可选） |
| 联网 | — | `enable_web_search: bool` |
| 种子 | — | `seed`（0 不传） |
| 参考图字段 | `image_urls: string[]` 仅 edit | `image_urls: string[]`（必填） |
| 参考图上限 | 5 | 8 |
| 参考图编码 | URL（贞贞上传） | URL 或 base64 dataURI（`image_mode` 切换） |

#### 后端分支（零破坏原则）

[`/api/proxy/image/fal/submit`](file:///e:/PenguinPravite/T8-penguin-canvas/backend/src/routes/proxy.js) 与 [`/api/proxy/image/fal/query`](file:///e:/PenguinPravite/T8-penguin-canvas/backend/src/routes/proxy.js) 是**新增独立路由**，与原 `/image` / `/image/submit` / `/image/status/:tid` 平行存在。

- 后端 `FAL_REGISTRY` 表按 apiModel 索引 → 找到 endpoint + paramKind → 分支组装 payload。
- 不在 `/image/submit` 内做 fal 分流，避免参数集污染（FAL 字段集和原 GPT2/nano-banana 完全不一样）。
- `fixFalResponseUrl()` 在 submit 时立刻修域名 + 写库，query 时不再依赖前端是否替换。
- 提交成功时若上游同步返 images[]，后端会立即 `saveRemoteImage()` 转存到 `/files/output` 并返本地相对路径，与原协议产物一致。

#### 前端节点改造要点

- [`isFalModel(apiModel)`](file:///e:/PenguinPravite/T8-penguin-canvas/src/providers/models.ts) 在 [ImageNode](file:///e:/PenguinPravite/T8-penguin-canvas/src/components/nodes/ImageNode.tsx) 首部统一判断 → `isFal && falDef`。
- isFal 为 true 时：**隐藏**原“比例 + 尺寸”行，**渲染** FAL 专属面板（gpt-fal / nbpro-fal 两套），参数 store 字段独立命名（`falMode/falSize/falQuality/falN/falFormat/falSync/falCustomW/falCustomH/nbAspect/nbResolution/nbSafety/nbImgMode/nbWebSearch/nbSysPrompt/nbSeed`），与原 `aspectRatio/sizeLevel` 不冲突。
- `handleGenerate` 内 `if (isFal && falDef) {...}` 分支独立调 `submitImageFal` + 内置轮询（600 × 3s = 30min 上限）。
- 参考图上限同步用 `falDef?.maxRefs ?? modelDef.maxReferenceImages`。
- **不要**在节点 UI 内 fal/非 fal 共用 setState，避免“切回标准模型时拿到上次 FAL 设置”。
- 切 apiModel 不切 TAB（gpt-image-2-fal 仍在 GPT2 TAB；nano-banana-pro-fal 在 香蕉Pro TAB）—— 与主项目 "不新增 Tab" 原则一致。

#### 关键参考位置（gpt-image-2-web/index.html）

| 内容 | 行号 |
|---|---|
| `runGPTFal` 全文 | line 2890-2973 |
| `_finishFal` | line 2975-2982 |
| `_toggleFalPanel` / `_toggleFalCustomSize` | line 2887-2888 |
| `gf_panel` HTML（gpt FAL 控件） | line 1069-1080 |
| `runNanoFal` 全文 | line 3587-3679 |
| `nano_fal_panel` HTML | line 1154-1173 |
| `uploadFileToAPI` | line 3104 |
| FAL 渠道接入规范文档 | SKILL.md line 264-307 |

---

## 12. 日志总线 / 终端面板规范

### 12.1 logBus

[`src/stores/logs.ts`](file:///e:/PenguinPravite/T8-penguin-canvas/src/stores/logs.ts) 提供双接口：
- 响应式：`useLogStore()` 订阅 entries / open / unread
- 命令式：`logBus.info|success|warn|error|debug(message, source?)`

调用点 = **gpt-image-2-web 中原型调 `log(...)` 的位置**（提交 / 进入轮询 / progress 变化 / 完成 / 失败）。实现参考 [ImageNode.handleGenerate](file:///e:/PenguinPravite/T8-penguin-canvas/src/components/nodes/ImageNode.tsx)。

**允许：** 改造其他节点（VideoNode / AudioNode / RunningHubNode / LLMNode 等）时在同样五个时机增加 `logBus.*` 调用，`source` 统一使用 `分类:节点 id 前6位`（如 `video:abc123`）。

**禁止：** 不要在节点 render 函数主体、useEffect deps 变化、父组件 rerender 路径上打日志，会造成狂刷。

### 12.2 TerminalPanel

[`src/components/TerminalPanel.tsx`](file:///e:/PenguinPravite/T8-penguin-canvas/src/components/TerminalPanel.tsx)：底部抽屉式（`absolute left-3 right-3 bottom-3`），高度 `min(48vh, 420px)`，不遮挡画布交互。备选能力：
- 5 级筛选 · 跟随尾部 · 清空 · ESC 关闭 · X 关闭
- 主题分支：`style==='pixel'` 走糖果风（mint 头 + yellow/pink 徽章 + 黑边硬阴影），否则走科技风（毛玻璃 + 霓虹色级别色）

[`CanvasToolbar.tsx`](file:///e:/PenguinPravite/T8-penguin-canvas/src/components/CanvasToolbar.tsx) 末尾附加 **终端按钮**：`useLogStore.toggleOpen()`，未读数额以双主题色徽章显示。

---

## 13. 节点改造原则（强约束）

> 以下原则适用于后续 **任何** 节点迭代、对齐外部项目、增加参数、修复 Bug 的工作。违反任何一条都可能造成 **原本已实现的功能被静默破坏**。

### 13.1 参数以参考项目为准，不要写死
- **错误示例：** 把 `aspectRatio` / `image_size` 等字段名写死在代码另一侧。
- **正确示例：** 每次改造先读参考项目 `index.html`，字段名、枚举值大小写、查询参数、是 multipart 还是 JSON、是否传空串，完全复制。
- **主项目参考位置：** [`gpt-image-2-web/index.html`](file:///e:/PenguinPravite/gpt-image-2-web/index.html)。

### 13.2 增量改动，不要重写整个路由/节点
- 优先抽取 helper 复用（如 [callImageUpstreamAsync](file:///e:/PenguinPravite/T8-penguin-canvas/backend/src/routes/proxy.js)），**不要** 复制一份同步代码 + 一份异步代码走两条路。
- 修改节点 UI 时保留原有的父组件 contract（props / ref / `onMouseDown` 防拖拽冒泡等）。
- 修改 stores 时保留原有订阅字段名，只加不减。

### 13.3 双主题必须同步考虑
- 任何新 UI 均需加 `style === 'pixel'` 分支，否则像素风下会漏样式。
- 像素风主色使用 mint（薄荷绿） + yellow + pink，全局类名以 `var(--px-*)` 为准，详见 [theme-pixel.css](file:///e:/PenguinPravite/T8-penguin-canvas/src/styles)。

### 13.4 连接校验不要调松
- [`portTypes.ts`](file:///e:/PenguinPravite/T8-penguin-canvas/src/config/portTypes.ts) 中定义的端口语义不得随意删除或放宽，需增加节点时补全该节点的输入输出类型后再注册。
- Canvas.tsx 的 `isValidConnection` 不要提前绕过。

### 13.5 批量运行总线的接入
- 可执行节点必须 `useRunTrigger(id, runFn)` 接入，且 `runFn` 需与“点击生成”为同一个函数。
- 节点内部以 `try/catch` 消化异常，使 `markDone(id, true)` 始终可调，不会阻塞 `handleRunAll` 的拓扑串行。

### 13.6 验收清单（必跑）
1. `npx tsc --noEmit`
2. 后端启动无语法错（`node -e "require('./src/routes/proxy')"`）
3. **端到端**：提交后验证 `taskId` 是真的，轮询能拿到 `urls`，上游后台能看到异步任务。
4. 双主题选择“像素” 与 “科技” 各看一眼控件是否文本/底色选中态都正常。

---
