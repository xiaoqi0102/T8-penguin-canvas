[根目录](../CLAUDE.md) > **src**

# src · 前端 SPA（React 19 + xyflow 12 + zustand）

> 范围：`d:\T8-penguin-canvas\src\**`  ·  入口：`src/main.tsx → src/App.tsx → src/components/Canvas.tsx`
>
> 角色：渲染节点画布、协调状态总线、调用后端 API；通过 Vite proxy 转发到 `127.0.0.1:18766`。

---

## 一、模块职责

1. 渲染并管理 **40+ 业务节点**（`src/components/nodes/`），实现拖拽编排、连线校验、批量执行、跨节点素材拖拽
2. 维护 **7 套 zustand 全局状态**（画布列表 / 运行总线 / 日志 / 主题 / API Keys / 拖拽素材 / 组容器）
3. 提供 **API 服务封装**（`src/services/{api,generation,imageOps}.ts`）：贞贞工坊 / RunningHub / MJ / FAL / Seedance / Suno / LLM 全链路客户端
4. 实现 **三套主题模板系统**（`src/theme/`）：tech / pixel / op × dark/light，可导入自定义模板
5. 端口语义注册表 + 节点元数据注册表（`src/config/`），驱动 Sidebar、连接校验、拖出候选

---

## 二、入口与启动

| 文件 | 职责 |
|---|---|
| `src/main.tsx` | ReactDOM.createRoot + StrictMode + 全局 CSS |
| `src/App.tsx` (~1089 行) | 顶部状态栏 + Sidebar + Canvas + 全局弹窗（API 设置 / 充值 / 资源库 / 主题管理）；MutationObserver 全局注入 `nodrag nowheel` `spellcheck=false` |
| `src/components/Canvas.tsx` (~2000+ 行) | xyflow `<ReactFlow>` 主体；批量运行、智能对齐、GroupBox 拖动联动、Shift 剪刀/多线平移、Ctrl 框选、跨节点素材拖拽接入、autoOutput 自动建输出节点 |

启动顺序：
1. `main.tsx` render `<App />` 进 `<StrictMode>`
2. `App` 启动后台健康探测（每 15s 调 `GET /api/status`）
3. 预加载 settings（`useApiKeysStore.load()`）、自定义主题模板（`useThemeStore.loadCustomTemplates()`）
4. 用户从 Sidebar 拖入节点或 Canvas 右键添加 → `addNodeRef.current(type)` 写 Canvas 状态

---

## 三、对外接口（前端导出）

> 这是前端调后端的 API 客户端表，全部走 Vite proxy → `http://127.0.0.1:18766`。

### 3.1 `src/services/api.ts`

| 函数 | 后端路径 | 用途 |
|---|---|---|
| `checkBackendStatus()` | `GET /api/status` | 健康检测 |
| `listCanvases()` / `createCanvas()` / `getCanvasData()` / `saveCanvasData()` / `autoSaveCanvasData()` / `deleteCanvas()` / `renameCanvas()` | `/api/canvas/*` | 画布 CRUD + 自动保存 |
| `loadSettings()` / `saveSettings()` / `getRawSettings()` | `/api/settings*` | API Key 设置（脱敏读 + 明文眼睛回填） |
| `uploadFile()` / `uploadBase64()` / `saveAssetToDisk()` | `/api/files/*` | 上传素材 + 全局生成自动保存到本地 |
| `listResources*` / `addResource*` / `setResource*` | `/api/resources/*` | 资源库（v1.3.4+） |
| `listThemes()` / `importTheme()` / `exportTheme()` | `/api/themes/templates*` | 主题模板（v1.3.6+） |
| `createRechargeOrder()` / `queryRechargeOrder()` / `bindRechargeUser()` | `/api/recharge/*` | 算力充值（v1.2.10.9+ 走 VPS pay.t8star.org） |
| `listRhToolCategories*` / `listRhToolApps*` | `/api/settings/rh-tool-*` | RH 工具节点（启动器）的分类与应用 CRUD |

### 3.2 `src/services/generation.ts`

封装上游生成任务（贞贞工坊、MJ、FAL、Seedance、Suno、LLM、RunningHub）的 submit + poll 协议：

- `submitImage()` / `submitImageFal()` / `submitMjImagine()` / `pollImageTask()`
- `submitVideo()` / `submitVideoFal()` / `pollVideo()`
- `submitSeedance()` / `pollSeedance()`
- `submitSuno()` / `pollSuno()`
- `submitLlm()`（一次性返回）
- `submitRh()` / `queryRh()` / `fetchRhAppInfo()` / `uploadRhAsset()`
- `buildMjPrompt()`（MJ `--ar/--no/--c/--s/--sw/--cw/--sv/--sref/--oref` 串拼装）

### 3.3 `src/services/imageOps.ts`

调 `/api/image/*`（sharp 处理）：resize / upscale / crop / grid-crop / combine / compare / remove-bg + `uploadDataUrl` / `uploadFileBlob`。

---

## 四、关键依赖与配置

### 4.1 `package.json` 关键依赖
- `@xyflow/react ^12.10.0` — 画布引擎（v12 节点拖拽走 pointerdown，必须用 nodrag className 拦截）
- `zustand ^5.0.0` — 全局状态
- `@dnd-kit/core / sortable / utilities` — Sidebar 拖拽 + 素材集排序
- `lucide-react ^0.468.0` — 图标
- `react / react-dom ^19.0.0` + `typescript ^5.7.0` + `vite ^6.0.0` + `tailwindcss ^3.4.0`

### 4.2 `vite.config.ts` 关键配置
- `server.port = 11422`、`strictPort: true`
- `server.proxy`: `/api`, `/files`, `/output`, `/input` → `127.0.0.1:18766`
- `define.__APP_VERSION__`: 编译期注入（**修改时必须同步 `package.json` / `electron/main.cjs` / `backend/src/config.js`**）
- `build.rollupOptions.output.manualChunks`: 分离 `react-vendor` 与 `xyflow` chunk

### 4.3 `src/config/`
- `nodeRegistry.ts`：`NODE_REGISTRY[]` 节点元数据（type/label/category/icon/color/hidden）+ `NODE_GROUPS` 分类索引
- `portTypes.ts`：`NODE_PORTS` 每节点 inputs/outputs 端口语义（text/image/video/audio/metadata/config/any），驱动 `isValidConnection`
- `canvasTemplates.ts`：内置工作流模板

---

## 五、数据模型

### 5.1 节点数据 `CanvasNodeData`（`src/types/canvas.ts`）

```ts
{
  label?, prompt?, imageUrl?, videoUrl?, audioUrl?,
  model?, status?: 'idle'|'generating'|'success'|'error', error?,
  [key: string]: any   // 各节点扩展字段
}
```

### 5.2 端口类型 `PortType`

`'text' | 'image' | 'video' | 'audio' | 'metadata' | 'config' | 'any'`

### 5.3 节点分类 `NodeCategory`

`'core' | 'rh' | 'special' | 'utility' | 'auxiliary' | 'toolbox' | 'input'`

### 5.4 主题 Tokens `ThemeTokens`（`src/theme/types.ts`）

50+ CSS 变量：`appBg`/`canvasBg`/`panelBg*`/`nodeBg`/`textMain`/`accent*`/`shadow*`/`radius*`/`port{Text,Image,Video,Audio,Metadata,Config}`/`gridDot`/`edge*`/`selection*`

---

## 六、节点目录（40+）

> 节点防丢失锁：`features.json`（**任何节点删减必须更新该文件**）

### 6.1 素材资源（3）
- `UploadNode.tsx` — 图/视/音三合一上传 + 动态端口色
- `MaterialSetNode.tsx` — 素材集（同类多素材打包，可排序/反转/随机/导入导出）
- `OutputNode.tsx` — 终端预览（文本双击编辑、原始宽高比、kind 分流）

### 6.2 核心节点（6）
- `TextNode.tsx` · `ImageNode.tsx`（GPT2/Banana2/BananaPro/FAL/MJ 多 TAB） · `VideoNode.tsx`（Veo/Grok） · `SeedanceNode.tsx`（SD2.0） · `AudioNode.tsx`（Suno V5.5 三模式） · `LLMNode.tsx`（GPT/Claude/Gemini，多模态）

### 6.3 RH（3，1 隐藏）
- `RunningHubNode.tsx` — 工作流 + 钱包应用共用（`useWallet = type === 'runninghub-wallet'`）
- `RhConfigNode.tsx`（hidden） · `RHToolsNode.tsx` + `RHToolEditorModal.tsx`（RH 超市启动器）

### 6.4 工具节点（13，5 隐藏）
- `ResizeNode.tsx` · `UpscaleNode.tsx`(hidden) · `RemoveBgNode.tsx`(hidden) · `CombineNode.tsx` · `GridCropNode.tsx` · `FrameExtractorNode.tsx`(hidden) · `FramePairNode.tsx`(首尾帧) · `LoopNode.tsx`(循环器) · `PickFromSetNode.tsx` · `TextSplitNode.tsx`(文本分割) · `DrawingBoardNode.tsx`(hidden) · `BrowserNode.tsx`(hidden) · `ImageCompareNode.tsx` + `ImageCompareModal.tsx` + `ImageCompareStage.tsx`

### 6.5 辅助节点（5，2 隐藏）
- `IdeaNode.tsx` · `BpNode.tsx` · `RelayNode.tsx`(any 透传) · `VideoOutputNode.tsx`(hidden) · `edit`(hidden, 走 `ImageEditModal.tsx` 5 模式)

### 6.6 特殊节点（5，全部 hidden）
- `PortraitMetadataNode.tsx` · `StoryboardGridNode.tsx` · 其余复用 PresetImageNode / Placeholder

### 6.7 工具箱（3）
- `cinematic`（电影感 5 维 × 50 项） · `video-motion`（运镜 6 维 × 50 项） · `multi-angle-visual`（方位/俯仰/远近可视化）

### 6.8 节点辅助组件 / hooks
- `ImageEditModal.tsx` — 5 模式编辑器（crop/mask/brush/grid/compose），矢量化存储 + 50 深独立撤销栈
- `MaterialPreviewSection.tsx` · `MaterialThumbnail.tsx` · `MentionPromptInput.tsx`（`@` 素材提及） · `ResizableCorners.tsx`（4 角同比缩放）
- `useUpstreamMaterials.ts` — 订阅上游全字段素材（含 audioUrl_1 副轨）
- `useOrderedMaterials.ts` — 按 Handle id 排序的稳定上游列表
- `useHasAutoOutput.ts` — 检测下游是否已挂 OutputNode（防双显）
- `useUpdateNodeData.ts` — 深度比较 + 无变更不写回，防 setState 风暴

---

## 七、状态总线（`src/stores/`）

| Store | 文件 | 用途 |
|---|---|---|
| 画布列表 | `canvas.ts` | CRUD + 当前激活画布 ID |
| 运行总线 | `runBus.ts` | `triggerRun(id)` / `triggerRunMany(ids)` / `markDone(id, ok)` / `lastDone` 订阅；支持单点 + 并发（循环器） |
| 日志 | `logs.ts` | `logBus.{info\|debug\|warn\|error}(src, ...args)` + `useLogStore` 订阅；驱动 `TerminalPanel.tsx` |
| 主题 | `theme.ts` | `style`(tech/pixel) + `theme`(dark/light) + `templateId` + `customTemplates` 持久化 |
| API Keys | `apiKeys.ts` | settings 加载/保存（脱敏 + raw 接口） |
| 拖拽素材 | `dragMaterial.ts` | Ctrl+拖跨节点素材拖拽三状态机 + `MATERIAL_DROP_EVENT` 自定义事件 |
| 组容器 | `groupBus.ts` | GroupBoxNode requestExecute / requestDelete 请求总线 |

---

## 八、Hooks（`src/hooks/`）

| Hook | 用途 |
|---|---|
| `useCanvasHistory.ts` | 撤销 / 重做 50 深栈 |
| `useRunTrigger.ts` | 节点接入 runBus 标准入口；订阅 `currentRunId === id \|\| runningIds.includes(id)` 触发 `runFn` |
| `useMaterialDragSource.ts` / `useMaterialDropTarget.ts` | 跨节点素材拖拽 source/target 注册 |

---

## 九、Providers / Utils / Theme / Styles

- `src/providers/RHToolsProvider.tsx` — RH 工具节点的全局 Context（分类 + 应用 + 拼音搜索）
- `src/providers/models.ts` — `IMAGE_MODELS` / `VIDEO_MODELS` / `AUDIO_MODELS` / FAL / MJ 模型注册表
- `src/utils/topologicalSort.ts` — Kahn 拓扑排序（批量运行依赖）
- `src/utils/nodePlacement.ts` — 阿基米德螺线避让 + 向右扫描 + 兜底（autoOutput / 拖出落点）
- `src/utils/textSplit.ts` — 文本分割 8 模式（段落/行/分隔/Markdown/序号/智能分镜/正则/字数）
- `src/utils/materialSet.ts` — 素材集排序/反转/随机/导入导出
- `src/utils/pinyinMatch.ts` — 拼音首字母模糊匹配（RH 工具搜索）
- `src/utils/imageCompare.ts` — 图像对比模式辅助
- `src/utils/wheelBlock.ts` — 滚轮事件拦截
- `src/utils/mediaCollection.ts` — 媒体合集打散辅助
- `src/theme/{types,defaultTemplates,applyTheme,validateTheme}.ts` — 主题模板 schema + 应用 + 校验
- `src/styles/{index,theme-core,theme-pixel,theme-op}.css` — Tailwind 入口 + 三套主题 CSS

---

## 十、测试与质量

- ❌ 无单元/集成测试
- ✅ TS 类型检查：`npm run type-check`
- ✅ ESLint：`npm run lint`（`--max-warnings 0` 严格模式）
- ✅ 构建校验：`npm run build`（PR 必需）
- ⚠️ 重要：节点重构后必须人工验证 `TerminalPanel` 日志面板有日志（`phase29` 防再丢失规范）

---

## 十一、常见问题 (FAQ)

**Q1：节点拖拽时 textarea 框选文字会带走整个节点？**
A：xyflow v12 用 pointerdown 启动节点拖动。`App.tsx` 已经全局 MutationObserver 给所有 `textarea/input/select` 自动加 `nodrag nowheel` className。若新组件不工作，确认元素是 DOM 标签而非 SVG 等其他元素。

**Q2：新增节点后连线无法连接？**
A：检查 `src/config/portTypes.ts` 中是否声明了 inputs/outputs；`src/config/nodeRegistry.ts` 是否注册了元数据；以及节点根 div 是否使用了百分比 width 形成 CSS 循环测量（参考 `phase32`，应当使用本地 px size state）。

**Q3：节点未触发运行总线？**
A：用 `useRunTrigger(id, runFn)` hook 而非手动监听 `currentRunId`。同时确认 `EXECUTABLE_NODE_TYPES`（在 `Canvas.tsx`）包含该节点 type。

**Q4：日志面板「暂无日志」？**
A：业务节点必须调 `logBus.{info\|debug\|warn\|error}(src, ...)`。`src` 命名空间约定 `<ns>:${id}`，如 `rh:abc123`。参考 `RunningHubNode.tsx` 中的 9 个调用点（提交/进度/完成/错误等，见 `phase29`）。

**Q5：上游图片到 LLM 节点报 base64 解码失败？**
A：后端 `/api/proxy/llm` 已实现 `normalizeLlmMessageImages`，将 `/files/*` 自动转 dataURL（`phase19`）。前端不要做特殊处理。

---

## 十二、相关文件清单（关键文件）

```
src/
├── main.tsx                       # 入口
├── App.tsx                        # 应用根组件 (~1089 行)
├── components/
│   ├── Canvas.tsx                 # 画布主体 (~2000+ 行)
│   ├── Sidebar.tsx                # 节点列表 + 画布管理
│   ├── CanvasToolbar.tsx          # 工具栏（运行/对齐/撤销/复制等）
│   ├── CanvasManager.tsx          # 画布 CRUD UI
│   ├── ApiSettings.tsx            # API Key 设置弹窗（10+ Key 分类）
│   ├── RechargeModal.tsx          # 算力充值
│   ├── ResourceLibraryDrawer.tsx  # 资源库
│   ├── ThemeTemplateManager.tsx   # 主题模板管理
│   ├── ThemeMusicToggle.tsx       # 主题音乐播放
│   ├── TerminalPanel.tsx          # 日志面板（底部抽屉）
│   ├── MaterialDragOverlay.tsx    # 跨节点素材拖拽幽灵层
│   ├── MaterialContextMenu.tsx    # 素材右键菜单
│   ├── ErrorBoundary.tsx          # 错误边界
│   ├── edges/DeletableEdge.tsx    # 自定义可删除连线
│   └── nodes/                     # 40+ 节点组件 + ImageEditModal + hooks
├── config/{nodeRegistry,portTypes,canvasTemplates}.ts
├── stores/{canvas,runBus,logs,theme,apiKeys,dragMaterial,groupBus}.ts
├── services/{api,generation,imageOps}.ts
├── hooks/{useCanvasHistory,useRunTrigger,useMaterialDragSource,useMaterialDropTarget}.ts
├── providers/{RHToolsProvider.tsx,models.ts}
├── theme/{types,defaultTemplates,applyTheme,validateTheme}.ts
├── styles/{index,theme-core,theme-pixel,theme-op}.css
├── utils/{topologicalSort,nodePlacement,textSplit,materialSet,pinyinMatch,imageCompare,wheelBlock,mediaCollection}.ts
├── types/canvas.ts                # NodeType / PortType / ApiSettings 等
└── assets/                        # 主题音乐 mp3 + op-straw-hat.png
```

---

## 十三、变更记录 (Changelog)

| 日期 | 变更 |
|---|---|
| 2026-05-27 | 初次生成 src 模块 CLAUDE.md，覆盖 100+ 个 ts/tsx 源文件结构 |
