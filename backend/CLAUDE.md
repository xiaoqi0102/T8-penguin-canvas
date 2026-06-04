[根目录](../CLAUDE.md) > **backend**

# backend · Node.js Express 后端代理服务

> 范围：`d:\T8-penguin-canvas\backend\**`  ·  入口：`backend/src/server.js`  ·  默认端口：`18766`
>
> 角色：所有上游 AI 服务（贞贞工坊 / RunningHub / FAL / MJ / Suno / Seedance / LLM / 扩展 Provider / AI 去水印 sidecar）的代理层；隐藏 API Key、自动转存远端资源到本地、提供画布/设置/资源库/主题 CRUD。

> **路由完整清单以 [`../features.json`](../features.json) `backendRoutes` 字段为准**（27 个 `.t8c` 与之对应）。本文档优先覆盖核心 + AI 水印 sidecar；externalProviders / cloudUploads / eagle / aiWatermark 等 v1.9.x+v2.1.0 新路由暂以小节形式补充，详细 schema 见路由源码。

---

## 一、模块职责

1. **代理层**：注入 API Key（前端永远拿不到明文），调上游 AI API，转存返回的图/视/音到 `output/`，给前端返回稳定的本地 `/files/output/*` URL
2. **数据存储**：画布 JSON 文件、API 设置（带脱敏 GET）、RH 工具应用、资源库元数据 + 文件、自定义主题模板
3. **图像处理**：基于 `sharp` 的 resize/upscale/crop/grid-crop/combine/compare/remove-bg
4. **文件服务**：上传素材、Base64 解码上传、按本地路径保存生成产物到用户磁盘
5. **算力充值**：迁移自 gpt-image-2-web，走 VPS pay.t8star.org 公开下单/查单
6. **打包模式适配**：根据 `T8PC_PACKAGED` / `T8PC_USER_DATA` / `T8PC_FRONTEND_DIST` 切换数据目录 + 静态托管前端 SPA

---

## 二、入口与启动

| 文件 | 作用 |
|---|---|
| `backend/src/server.js` | 入口：CORS（仅 127.0.0.1/localhost）+ 50MB JSON + 简易访问日志 + 8 个路由挂载 + 打包模式 SPA 兜底 + listen 18766 |
| `backend/src/config.js` | 全局配置：HOST/PORT/APP_VERSION/IS_PACKAGED + 数据/输入/输出/缩略图目录 + 默认 BaseUrl + 默认本地保存路径 |
| `backend/package.json` | `npm start` = `node src/server.js`；零打包工具，纯 Node CommonJS |
| `backend/_test_poll.js` | 临时调试脚本（_前缀 .gitignore） |

### 启动顺序（`server.js`）
1. CORS 中间件（origin 白名单：`127.0.0.1` / `localhost` / 无 origin）
2. `express.json({limit:'50mb'})` + `urlencoded`
3. 简易访问日志：`[hh:mm:ss] METHOD /path`
4. 自动创建 `DATA_DIR`/`INPUT_DIR`/`OUTPUT_DIR`/`THUMBNAILS_DIR`
5. 静态托管：`/files/{output,input,thumbnails}` + 兼容老路径 `/output` `/input`
6. 健康检查 `/api/status`
7. 挂载 8 个业务路由器
8. **打包模式**：挂载前端 `dist` 静态托管 + SPA 兜底（排除 `/api`、`/files`、`/input`、`/output`）
9. `app.listen(PORT, HOST)`

---

## 三、对外接口（HTTP API）

### 3.1 健康与画布

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/status` | 健康检查（返回 service/version/port/time） |
| GET | `/api/canvas` | 画布列表 |
| POST | `/api/canvas` | 新建画布（body: `{name}`） |
| GET | `/api/canvas/:id` | 读取画布数据（nodes/edges/viewport） |
| PUT | `/api/canvas/:id` | 保存画布数据（防空数据覆盖双层防护） |
| POST | `/api/canvas/:id/auto-save` | 自动导出到 `<canvasAutoSavePath>/T8-penguin-canvas/canvases/*.json` |
| DELETE | `/api/canvas/:id` | 删除画布 |
| PATCH | `/api/canvas/:id/name` | 重命名 |

### 3.2 设置 + RH 工具

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/settings` | 读取（10 个 Key 脱敏为 `****xxxx`） |
| GET | `/api/settings/raw` | 内部用，明文返回 |
| POST | `/api/settings` | 保存（强制锁定 zhenzhenBaseUrl/llmBaseUrl 到 `https://ai.t8star.org`） |
| GET\|POST\|PUT\|DELETE | `/api/settings/rh-tool-categories[/:id\|/reorder]` | RH 工具分类 CRUD（5 路由） |
| GET\|POST\|PUT\|DELETE | `/api/settings/rh-tool-apps[/:id\|/reorder]` | RH 工具应用 CRUD（5 路由） |
| GET | `/api/settings/rh-tools/export` | 导出 RH 工具集 JSON |
| POST | `/api/settings/rh-tools/import` | 导入 RH 工具集 JSON |

### 3.3 文件

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/files/upload` | multipart 上传（10MB 上限，写到 INPUT_DIR） |
| GET | `/api/files/list` | 列出输入目录文件 |
| POST | `/api/files/upload-base64` | base64 dataURL 上传（最大 20MB） |
| POST | `/api/files/save-to-disk` | 把 `/files/output/*` `/files/input/*` `http(s)://*` 三种来源静默复制到本地 `fileSavePath`（默认 `D:\zhenzhen`） |

### 3.4 图像处理（sharp）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/image/resize` | 等比/裁剪/包含/填充 4 模式（`fit: cover\|contain\|inside\|fill`） |
| POST | `/api/image/upscale` | 放大 |
| POST | `/api/image/crop` | 矩形裁剪 |
| POST | `/api/image/grid-crop` | 宫格切割（支持 gap 去缝、自定义索引） |
| POST | `/api/image/combine` | 图像拼合 |
| POST | `/api/image/compare` | 多模式对比图生成 |
| POST | `/api/image/remove-bg` | 去背景（基于 sharp + 简易阈值） |

### 3.5 上游代理 `/api/proxy/*`

| 方法 | 路径 | 上游 |
|---|---|---|
| POST | `/image` | 贞贞工坊同步 image（dataURL） |
| POST | `/image/submit` | 异步 submit |
| GET | `/image/status/:tid` | 异步 status（默认 maxRetries=1800，上限 3600s） |
| POST | `/image/fal/submit` / `/image/fal/query` | FAL Queue API |
| POST | `/mj/imagine` | Midjourney imagine（speed_map: turbo/fast/relax） |
| GET | `/mj/task/:id` | MJ 查询（URL ai.comfly.chat → ai.t8star.cn 改写） |
| POST | `/mj/upload` | MJ 参考图上传换 URL |
| POST | `/llm` | LLM 多模态（`/files/*` 自动转 dataURL inline，避免上游解码失败） |
| POST | `/video/submit` / GET `/video/query` | 视频任务 |
| POST | `/video/fal/submit` / `/video/fal/query` | 视频 FAL |
| POST | `/seedance/submit` / GET `/seedance/query` | Seedance V3 |
| POST | `/audio/submit` / GET `/audio/query` | Suno（生成/翻唱/续写） |
| POST | `/audio/upload` | Suno 上传参考音频（multer 50MB） |
| POST | `/runninghub/submit` / GET `/runninghub/query` | RH 工作流任务 |
| POST | `/runninghub/upload-asset` | RH 上传资产（支持 `/files/{output,input}/*` 路径白名单） |
| GET | `/runninghub/app-info` | RH 应用 nodeInfoList |

**关键工具函数（`proxy.js`）**：
- `pickApiKey(settings, hint)` — 按模型名 / endpoint / 路由名选 7 种分类 Key（gpt-image / nano-banana / mj / veo / grok / seedance / suno），未填则 fallback 到 `zhenzhenApiKey`
- `applyClassifiedKey(settings, hint)` — 临时覆盖 `zhenzhenApiKey`，后续原路由零侵入
- `pickRhApiKey(settings)` — v1.2.9.16 起统一 `rhApiKey || runninghubApiKey`
- `normalizeLlmMessageImages(messages)` — LLM 多模态参考图 `/files/*` → dataURL inline
- `refToBananaImage()` — banana 协议参考图预处理
- `saveRemoteImage()` / `saveRemoteVideo()` / `saveRemoteAudio()` — 上游返回远端 URL 自动 fetch + 保存到 `OUTPUT_DIR`

### 3.6 资源库 `/api/resources/*`

| 方法 | 路径 | 说明 |
|---|---|---|
| GET/POST/PUT/DELETE | `/categories[/:id]` | 资源分类 |
| GET | `/items?categoryId=` | 列出资源 |
| POST | `/items/add` / `/sets/add` | 添加单素材 / 添加素材集 |
| PUT/DELETE | `/items/:id` | 编辑 / 删除 |
| GET | `/set/:id` / `/set-file/:id/:index` | 读取素材集元数据 / 单文件 |
| GET | `/file/:id` / `/thumb/:id` | 资源文件 / 缩略图 |

### 3.7 主题 `/api/themes/*`

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/templates` | 列出自定义模板（路径 `themeTemplatePath`，默认 `D:\zhenzhen\theme-templates`） |
| POST | `/templates/import` | 导入 JSON（`validateTheme` + `normalizeTemplate` 过滤未知枚举/超长字段/非法音乐 URL） |
| PUT | `/templates/:id` | 编辑保存 |
| GET | `/templates/:id/export` | 导出 JSON |
| DELETE | `/templates/:id` | 删除（仅自定义） |

### 3.8 算力充值 `/api/recharge/*` + `/pay/*`

> **v2.1.0 起公开仓库不含 recharge.js**（接受 upstream「Harden public release」决策）。私有 fork 可保留该路由，走 VPS `pay.t8star.org` 公开下单 / 查单 / 重试接口；本地仅保存绑定用户 / 订单摘要 / order_token。

### 3.9 AI 去水印 `/api/ai-watermark/*`（v1.8.6+，v2.1.0 起加密为 `.t8c`）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/status` | 探测 sidecar runtime 安装情况，返回 `{installed, version, resolver, markKeys, optionalFeatures: {invisible, lama, detect, trustmark}, setupHints, errors}` |
| POST | `/process` | 提交去水印任务（body: `{source\|url\|imageUrl, kind?, mode?, options?}`），返回 `{mode, outputKind, outputUrl, logs}`（reportOnly 模式返回 `outputText` + `report`） |

**支持的 `mode`**（`backend/src/tools/aiWatermark/runner.js` `normalizeMode`）：
- `smart`（默认，先 visible-auto，可选 invisible，再 metadata-remove）
- `visible` — 可见水印识别 + 修复（`--mark <gemini|doubao|jimeng|auto>` + `--inpaint-method <ns|telea|gaussian>`）
- `erase` — 框选擦除（`--backend <cv2|lama>` + `--region x,y,w,h`，需要至少 1 个区域）
- `invisible` — 隐形水印（pipeline `default|ctrlregen` + device `auto|cpu|mps|cuda|xpu`，可选 `--protect-text` / `--protect-faces`，v2.1.0 起仅 opt-in）
- `metadata-check` / `metadata-remove` — AI 元数据检查 / 清理
- `identify` — 来源鉴别（输出 JSON 报告）

**Runner 探测链路**（`commandCandidates()`）：

1. `T8_REMOVE_AI_WATERMARKS_BIN` env CLI
2. `T8_REMOVE_AI_WATERMARKS_RUNTIME` env runtime 根
3. **`T8PC_RES/tools/remove-ai-watermarks/`**（Electron 打包默认命中：`python/python.exe` + `python -m remove_ai_watermarks.cli`）
4. `T8_REMOVE_AI_WATERMARKS_SRC` env clone
5. 开发环境 `_external/remove-ai-watermarks/`（仅 `IS_PACKAGED=false`）
6. PATH `python` / `py -3` / `remove-ai-watermarks.exe` / `.cmd`

每个 candidate 通过 `python-module` import probe 或 `cli-bin` `--version` 探测；命中即缓存 5 分钟（失败缓存 10 秒）。详细打包链路见 [`docs/packaging-and-distribution.md`](../docs/packaging-and-distribution.md) §三。

### 3.10 其他新增路由（详细见源码 / `features.json`）

| 路由前缀 | 文件 | 说明 |
|---|---|---|
| `/api/external-providers/*` | `routes/externalProviders.js` | 扩展 API 平台（OpenAI 兼容 / ModelScope / 火山 / ComfyUI / 即梦 CLI）的列表 / 提交 / 查询 / LoRA 管理 |
| `/api/cloud-uploads/*` | `routes/cloudUploads.js` | 云端上传目标管理（七牛 / S3 等）；后台 worker 见 `backend/src/cloudUploads/` |
| `/api/eagle/*` | `routes/eagle.js` | Eagle 本地素材入库（仅 localhost） |

---

## 四、关键依赖与配置

### 4.1 `backend/package.json`
- `express ^4.21.0` — 路由
- `cors ^2.8.5` — CORS（已收紧到 127.0.0.1/localhost 来源）
- `multer ^2.0.2` — 文件上传中间件
- `sharp ^0.34.5` — 图像处理（打包模式 asarUnpack，与 `@img/**` 同步）

### 4.2 `backend/src/config.js` 关键变量

| 字段 | 说明 |
|---|---|
| `HOST` / `PORT` | `127.0.0.1` / `18766` |
| `APP_VERSION` | `1.5.3`（**必须与 package.json / vite.config / main.cjs 同步**） |
| `IS_PACKAGED` | 取 `process.env.T8PC_PACKAGED === '1'` |
| `DATA_ROOT` | 打包模式取 `T8PC_USER_DATA`，否则项目根 |
| `DATA_DIR` / `INPUT_DIR` / `OUTPUT_DIR` / `THUMBNAILS_DIR` | 4 个核心数据目录（打包模式启动自动 mkdir -p） |
| `CANVAS_FILE` / `SETTINGS_FILE` / `RECHARGE_FILE` / `RECHARGE_PRIVATE_FILE` / `RH_TOOL_*_FILE` | 6 个数据 JSON 文件路径 |
| `FRONTEND_DIST` | 打包模式取 `T8PC_FRONTEND_DIST`（默认 `resources/frontend`），否则空 |
| `THUMBNAIL_SIZE` / `THUMBNAIL_QUALITY` | 160 / 80 |
| `MAX_FILE_SIZE` | 10MB |
| `ZHENZHEN_BASE_URL` / `RH_BASE_URL` | 默认上游 URL（settings 中强制锁定） |
| `DEFAULT_LOCAL_SAVE_DIR` / `DEFAULT_CANVAS_AUTO_SAVE_DIR` / `DEFAULT_RESOURCE_LIBRARY_DIR` / `DEFAULT_THEME_TEMPLATE_DIR` | 4 套默认本地路径（启动自动创建） |

### 4.3 环境变量（运行时注入）

| 环境变量 | 用途 |
|---|---|
| `T8PC_PACKAGED` | `1` = 打包模式 / `0` = 开发模式（由 `electron/main.cjs` 注入） |
| `T8PC_USER_DATA` | `app.getPath('userData')` |
| `T8PC_FRONTEND_DIST` | 前端静态产物目录 |
| `T8PC_RES` | `process.resourcesPath` |
| `RECHARGE_AGENT_BASE_URL` / `RECHARGE_AGENT_HMAC_KEY` / `RECHARGE_WEBSITE_URL` / `RECHARGE_DULUPAY_KEY` | 本地私有充值代理配置（仅开发） |
| `PORT` / `HOST` / `NODE_ENV` | 标准 Node 变量 |

---

## 五、数据模型

### 5.1 `data/canvas_list.json`

```json
[
  { "id": "...", "name": "...", "nodeCount": 0, "createdAt": 1700000000000, "updatedAt": 1700000000000 }
]
```

### 5.2 `data/canvas_<id>.json`

```json
{ "nodes": [...], "edges": [...], "viewport": { "x": 0, "y": 0, "zoom": 1 } }
```

### 5.3 `data/settings.json`（脱敏后由 GET 返回 `****xxxx`）

```json
{
  "zhenzhenApiKey": "...", "zhenzhenBaseUrl": "https://ai.t8star.org",
  "rhApiKey": "...", "rhBaseUrl": "https://www.runninghub.cn",
  "llmApiKey": "...", "llmBaseUrl": "https://ai.t8star.org",
  "gptImageApiKey": "", "nanoBananaApiKey": "", "mjApiKey": "",
  "veoApiKey": "", "grokApiKey": "", "seedanceApiKey": "", "sunoApiKey": "",
  "fileSavePath": "D:\\zhenzhen",
  "canvasAutoSavePath": "D:\\zhenzhen",
  "resourceLibraryPath": "D:\\zhenzhen\\resources",
  "themeTemplatePath": "D:\\zhenzhen\\theme-templates",
  "preferences": { "theme": "dark", "language": "zh-CN" }
}
```

### 5.4 `data/rh_tool_categories.json` / `rh_tool_apps.json`

RH 超市的分类与应用配置（与 `rh_apps.json` 分开，避免污染）。

### 5.5 `data/recharge.json` / `.recharge_device_id` / `recharge.private.json`

充值订单状态 / 设备 ID（持久化） / 本地私有配置（被 .gitignore 忽略）。

---

## 六、测试与质量

- ❌ 无单元测试（`backend/_test_poll.js` 是临时手动调试脚本，已被 `.gitignore _*.js` 模式覆盖）
- ✅ 启动后由前端 `App.tsx` 每 15s GET `/api/status` 做存活检测
- ✅ 简易访问日志：`[hh:mm:ss] METHOD /path`（控制台）
- ✅ 打包模式由 `electron/_post_build.cjs` 校验 **27 个 `.t8c`**（v2.1.0：核心 + providers + cloudUploads + tools/aiWatermark + utils） + 充值密钥泄漏扫描 + RH toolbox maker 字样扫描 + sidecar runtime 校验

---

## 七、常见问题 (FAQ)

**Q1：修改后端代码后 Electron 启动报 `Cannot find module 'express'`？**
A：后端 `.t8c` 是字节码加密产物，每次改 `backend/src/**` 后必须重新 `npm run encrypt`（必须用 Electron 内置 Node：`cross-env ELECTRON_RUN_AS_NODE=1`，否则 V8 字节码版本不匹配）。参考 `phase27` 完整 SOP。

**Q2：上游图片 URL `/files/output/x.png` 给 LLM 报 base64 失败？**
A：`/api/proxy/llm` 内 `normalizeLlmMessageImages` 已自动转 dataURL。如果是新代理路由，参考实现复用同一 helper（`phase19`）。

**Q3：RH 钱包应用 APIKEY 还需要吗？**
A：v1.2.9.16 起取消 `rhWalletApiKey`，RH 钱包节点与普通 RH 节点统一读 `settings.rhApiKey`。前端 `useWallet` 仅用于 UI 区分（紫色/青色）。

**Q4：上传节点产生的 `/files/input/up_xxx.mp4` RH 上传资产失败？**
A：`/api/proxy/runninghub/upload-asset` 路径白名单支持 4 种前缀 `/files/{output,input}/` 和 `/output/` `/input/`，无需特殊处理（`phase24`）。

**Q5：打包后 GET / 返回 `Cannot GET /`？**
A：开发模式后端不挂载前端静态资源（避免与 Vite dev server 打架）。打包模式下 `T8PC_PACKAGED=1` + `T8PC_FRONTEND_DIST` 存在时自动挂载 SPA 兜底（`server.js:74-82`）。

---

## 八、相关文件清单

```
backend/
├── package.json                  # express + cors + multer + sharp
├── _test_poll.js                 # 临时调试（.gitignore _* 模式）
└── src/
    ├── server.js                 # 入口 + 中间件 + 路由挂载 + SPA 兜底 + listen
    ├── config.js                 # 全局配置 + 数据目录派生 + 默认路径
    ├── routes/                   # 11 个路由模块（与 features.json.backendRoutes 对应）
    │   ├── canvas.js             # 画布 CRUD + 自动导出
    │   ├── settings.js           # 设置 + RH 工具分类/应用（22 路由）
    │   ├── proxy.js              # 上游 AI 代理（~2200 行，30+ 路由）
    │   ├── files.js              # 文件上传 + base64 + save-to-disk
    │   ├── imageOps.js           # sharp 图像处理（7 路由）
    │   ├── resources.js          # 资源库（分类 + 单素材 + 素材集）
    │   ├── themes.js             # 自定义主题模板
    │   ├── eagle.js              # Eagle 本地入库（v1.x+）
    │   ├── externalProviders.js  # 扩展 API 平台（ModelScope/火山/ComfyUI/即梦 CLI 等）
    │   ├── aiWatermark.js        # AI 去水印 sidecar 桥接（v1.8.6+）
    │   └── cloudUploads.js       # 云端上传目标管理（v1.9.x+）
    ├── providers/                # 9 个 provider 适配器（registry/mediaResolver/adapters/openaiCompatible/llmMedia/modelscope/volcengine/comfyui/jimengCli）
    ├── cloudUploads/             # 云端上传 worker（settings.js + uploader.js）
    ├── tools/
    │   └── aiWatermark/          # AI 去水印 runner + media resolver
    │       ├── runner.js         # sidecar 探测链路 + 命令构造 + 流式日志 + 能力探测缓存
    │       └── media.js          # 输入路径解析 + 输出路径派生 + 媒体类型推断
    └── utils/
        ├── duckPayload.js        # tryDecodeDuckPayload（上游异形响应 payload 解码）
        └── whitePng.js           # getWhitePng（占位白图，提交时 reference 兜底）
```

---

## 九、变更记录 (Changelog)

| 日期 | 变更 |
|---|---|
| 2026-05-27 | 初次生成 backend 模块 CLAUDE.md，扫描 8 路由模块 + 2 工具函数 + 配置文件 |
| 2026-06-04 | v2.1.0 同步：补 §3.9 AI 去水印路由（runner 探测链路 + 6 个 mode）；补 §3.10 externalProviders/cloudUploads/eagle；§六测试质量项 `.t8c` 计数 11→27；§八文件清单加 providers/ + cloudUploads/ + tools/aiWatermark/；顶部加路由清单指向 `features.json.backendRoutes` 为 SSOT |
