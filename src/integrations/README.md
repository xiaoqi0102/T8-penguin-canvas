# integrations/ · 第三方中转站 / API Provider 接入隔离层

> 目的：把每个第三方 provider 的改动**集中**到独立子目录，让上游主项目（fork 来源）更新时合并冲突最小化。
>
> 工作流：fork → 加 provider → 上游更新 → `git merge upstream/main` → 几乎零冲突（已在 v1.5.5、v1.5.8 两次合并实战验证；v1.5.8 时上游 v1.5.7 与 fork 的 Qiniu/Grsai 仅在 8 个版本号文件冲突，业务源码零冲突）。v1.5.9 起在 fork 自有的七牛 / grsai 双 provider 上同时落地了「比例 × 清晰度」双控件（七牛 openai/gpt-image-2 + grsai gpt-image-2-vip）。

---

## 目录现状

```
src/integrations/
├── qiniu/                          # 七牛云 AI 图像（v1.5.6 首个示例，OpenAI 兼容协议；v1.5.9 加图生图 size 修复 + 1K/2K/4K 清晰度档）
│   ├── QiniuSettingsSection.tsx    # API 设置弹窗中独立的 Key + baseUrl 块
│   ├── QiniuImageTab.tsx           # ImageNode 内的 质量 + 比例 (+ openai/gpt-image-2 的清晰度) 面板，动态 2/3 列
│   ├── runQiniuImage.ts            # 提交 + 轮询的纯函数；submit 前用 sizeMap 按 (ratio, resolution) 转像素串
│   └── sizeMap.ts                  # 按 apiModel 的比例集合 + ratio→像素串 映射；openai/gpt-image-2 支持 1K/2K/4K 三档（v1.5.6 ratio-only · v1.5.9 加清晰度档）
├── grsai/                          # Grsai 中转站（v1.5.6 第二个验证案例，自有协议；v1.5.9 加 gpt-image-2-vip 1K/2K/4K 清晰度档）
│   ├── GrsaiSettingsSection.tsx    # API 设置弹窗中独立的 Key + baseUrl 块
│   ├── GrsaiImageTab.tsx           # ImageNode 内的 比例 + 尺寸 面板；nano-banana 系列 + gpt-image-2-vip 都显示清晰度档（v1.5.9 起）
│   ├── runGrsaiImage.ts            # 提交 + 轮询；vip 在 submit 前用 sizeMap 按 (ratio, resolution) 转像素串
│   ├── sizeMap.ts                  # 按 apiModel 的比例集合 + gpt-image-2-vip 三档 DOC_PRESETS_BY_RES 文档预设表（v1.5.6 单档 1MP · v1.5.9 三档完整）
│   └── README.md                   # 上游协议镜像 + 模型清单
└── geeknow/                        # Geeknow LLM 中转站（v1.7.4 fork-only 首个 LLM provider；OpenAI Chat Completions 兼容）
    ├── GeeknowSettingsSection.tsx  # API 设置弹窗中独立的 Key + baseUrl 块（amber 主题）
    ├── runGeeknowLlm.ts            # 服务层：generateGeeknowLlm / generateGeeknowLlmStream / fetchGeeknowModels
    └── （无 ImageTab / sizeMap）   # LLM 模式：独立节点而非 ImageNode 内 Tab，无尺寸映射需求
```

> 📌 **图像 provider vs LLM provider 模式差异**：
> - **图像 provider**（qiniu / grsai）通过「`ImageNode` 内嵌专属 Tab + sizeMap 比例转换」模式接入，复用 `ImageNode` 的运行链路与 UI 骨架
> - **LLM provider**（geeknow）通过「独立节点 `t8f-geeknow-llm` + 独立 endpoint」模式接入，与上游 `LLMNode` 完全解耦，0 修改 `LLMNode.tsx`
> - 两种模式都保持 `integrations/<name>/` 目录边界与 sentinel 围栏隔离原则

---

## Provider 协议特征对照表

接入新中转站之前先把它的协议跟下表对照，能快速判断「直接复制 qiniu 模板就能用」还是「需要参考 grsai 的自有协议处理」。

> LLM provider（如 geeknow）协议特征见下方独立小节「LLM 中转站协议对照」。

| 维度 | qiniu | grsai |
|---|---|---|
| 上游路径 | `/v1/images/generations` + `/v1/images/edits` + `/v1/images/tasks/{tid}` | 统一 `/v1/api/generate` + `/v1/api/result?id=` |
| 文 / 图生图分流 | 路径不同（generations vs edits） | 路径一致，靠 `images` 数组是否空区分 |
| 字段命名风格 | OpenAI 下划线 `size` / `quality` | 驼峰 `aspectRatio` / `imageSize` / `replyType` |
| 异步标志 | 上游自决（路径加 `?async=true` 或上游识别） | 显式请求体 `replyType: "async"` |
| 状态枚举 | `succeed` / `processing` / `failed` | `succeeded` / `running` / `failed` / `violation` |
| 响应包装 | 按子模型分流：`openai/gpt-image-2` 文/图生图同步返回 `created + data[].b64_json`（不返回 `task_id`）；`gemini-3.1-flash-image-preview` 可返回异步 `task_id` 并查 `/v1/images/tasks/{tid}` | 直接顶层 `{id, status, results}` |
| 提交等待 | 七牛两个子模型都必须走 `fetchQiniuSubmit`：`openai/gpt-image-2` 同步返回可能长时间不返回响应头，`gemini-3.1-flash-image-preview` 提交拿 `task_id` 前也可能等待较久；统一允许 60 分钟响应等待，避免 Node fetch 默认 `UND_ERR_HEADERS_TIMEOUT` 约 5 分钟截断 | 普通 fetch 提交后轮询 |
| 端点切换 | 国内 `openai.qiniu.com` / 海外 `openai.sufy.com` | 国内 `grsai.dakka.com.cn` / 全球 `grsaiapi.com` |
| 默认提交模式 | 上游 `?async=true` 直接异步 | 后端代理默认 `replyType=async` |
| 认证 Header | `Authorization: Bearer sk-xxx` | `Authorization: Bearer sk-xxx` |
| UI size 表达 | 显示比例（auto+14 个），runner 内 sizeMap 转像素串送上游；openai/gpt-image-2 v1.5.9 额外暴露 1K/2K/4K 清晰度档（独立第三列下拉），按 (ratio, resolution) 转像素串 | 显示比例（按子模型分组：nano-banana / gpt-image-2 系列 11 个含 auto，nano-banana-2 系列 +4 个极端，gpt-image-2-vip 14 个去 auto +1:3/3:1/2:1/1:2 共 4 项 vip 独有比例）；nano-banana 系列上送 `imageSize` 给上游；gpt-image-2-vip 自 v1.5.9 起额外暴露 1K/2K/4K 清晰度档（与比例共显双控件），由 sizeMap 按 (ratio, resolution) 查 DOC_PRESETS_BY_RES 三档预设表转像素串；其它子模型透传比例 |
| 子模型默认 | gemini-3.1-flash-image-preview | gpt-image-2（v1.5.6 起，原 nano-banana-2） |

**接入新 provider 时务必填一行进表**，让后续接入者能快速对比。

### LLM 中转站协议对照（v1.7.4 起，与图像 provider 模式分离）

| 维度 | geeknow（v1.7.4） |
|---|---|
| 业务类型 | LLM 推理（chat completions），**非图像生成** |
| 上游路径 | `/v1/chat/completions`（流式 + 非流式同端点，靠 body.stream 区分）+ `/v1/models`（拉全集） |
| 字段命名风格 | OpenAI Chat Completions 兼容（驼峰 + 下划线混用：`messages` / `temperature` / `max_tokens` / `stream`） |
| 异步标志 | SSE：`stream:true` 走 `text/event-stream` 流；非 SSE：`stream:false` 一次性返回 JSON |
| 状态枚举 | 流式无显式 status，靠 `data:[DONE]` 标记结束 + 上游 HTTP 4xx/5xx |
| 响应包装 | 流式 `data: {choices:[{delta:{content:"..."}}]}` 逐行；非流式 `{choices:[{message:{content:"..."}}]}` |
| 提交等待 | SSE 流式直接透传字节，无超时收口；非流式走 Node fetch 默认 5 分钟超时（LLM 一般 < 30 秒 OK） |
| 端点切换 | 默认 `https://www.geeknow.top`，支持用户在设置面板自定义 baseUrl |
| 认证 Header | `Authorization: Bearer sk-xxx`（独立 `geeknowApiKey`，**不 fallback 到 `llmApiKey` 也不与贞贞共用**） |
| 节点 type | `t8f-geeknow-llm`（fork 类型前缀，与上游 `llm` 节点完全隔离） |
| 端口语义 | `inputs:['text','image']` / `outputs:['text']`（同上游 `llm` 节点） |
| 默认模型 | `gpt-4o-mini`（13 个静态默认：OpenAI + Claude + Gemini + DeepSeek + Qwen 五家族） |
| 模型扩展 | 节点内「刷新模型」按钮调 `/v1/models` 拉全集，写入 `localStorage.t8f-geeknow-dynamic-models` |

---

## 设计模式 · LLM 中转站独立节点接入（v1.7.4 起，与图像模式互补）

**问题**：图像 provider 走「`ImageNode` 内嵌专属 Tab」模式（qiniu / grsai 的成熟方案），是因为 `ImageNode` 本身就承担多模型聚合的职责。但 `LLMNode` 是单模型组件，硬要在它内部塞「Geeknow Tab」会破坏 `LLMNode` 与上游主项目 `gpt-image-2-web` 的同构关系，导致合并冲突翻倍。

**约定**（v1.7.4 fork-only）：
- LLM 中转站走「独立节点 + 独立 endpoint + 独立目录」三独立模式
- 节点 type 用 `t8f-` 前缀（fork-only 标识），完全不动 upstream 的 `llm` 节点
- 后端在 `backend/src/routes/proxy.js` 文件末尾 sentinel 围栏 `>>> FORK-GEEKNOW-LLM-START/END <<<` 内追加 `/api/proxy/llm-geeknow` 路由
- 共享文件改动 (`NodeType` / `ApiSettings` / `nodeRegistry` / `portTypes` / `Canvas`) 全部用「`v1.7.4 fork-only` 行注释」标注，每处只插 1-3 行
- `integrations/geeknow/` 内只放 3 个文件（无 sizeMap、无 ImageTab），与图像 provider 的 4 件套保持差异化

**实现位置**：
- 服务层：`src/integrations/geeknow/runGeeknowLlm.ts` 导出 `generateGeeknowLlm` / `generateGeeknowLlmStream` / `fetchGeeknowModels`，复用 `LLMNode` 的 `LlmMessage` / `LlmContentPart` 类型
- UI：`src/components/nodes/GeeknowLlmNode.tsx`（独立节点组件，从 `LLMNode.tsx` 复制后改 amber 主题 + 加「刷新模型」按钮）
- 设置面板：`src/integrations/geeknow/GeeknowSettingsSection.tsx`，与 `QiniuSettingsSection` / `GrsaiSettingsSection` 同构

**与图像 provider 模式的对比**：

| 维度 | 图像 provider 模式（qiniu / grsai） | LLM provider 模式（geeknow） |
|---|---|---|
| 节点 type | 共用 `image`（多模型聚合） | 独立 type `t8f-<name>-llm` |
| UI 接入点 | `ImageNode` 内嵌 `<XyzImageTab>` | 独立 `XyzLlmNode.tsx` 组件 |
| 共享文件改动量 | `ImageNode.tsx` 6 处 sentinel + `ApiSettings.tsx` 6 处 sentinel + `models.ts` 1 处 | `Canvas.tsx` 3 处 + `ApiSettings.tsx` 1 处围栏 + `models.ts` 1 处 |
| 上游合并风险 | 中（ImageNode 与上游有较多差异，需手动整理） | 低（fork-only 节点与上游完全解耦） |
| 必备文件 | `<Name>SettingsSection` + `<Name>ImageTab` + `run<Name>Image` + `sizeMap` | `<Name>SettingsSection` + `run<Name>Llm`（无 sizeMap） |
| 适用场景 | 图像生成多模型聚合 | LLM 推理 / Embedding / Audio 等单一职责的独立调用 |

---

## 设计模式 · 比例化 size 显示（v1.5.6 起，所有新 provider 默认遵循）

**问题**：不同 provider / 不同子模型对 size 的表达天差地别——七牛云 `openai/gpt-image-2` 接受像素串（1024x1024 等），Grsai 的 `gpt-image-2-vip` 强制像素串，但 nano-banana 系列只认比例字符串（'1:1' / '16:9'）。混在一个下拉里既丑又容易出错。

**约定**：UI 一律只显示比例（`auto` + 14 个 ratio），按 apiModel 分组限制可选集合；上游需要像素串时，由 runner 在 submit 前完成 ratio → 像素串转换。

**实现位置**：每个 integration 目录内独立的 `sizeMap.ts`，导出：
- `DEFAULT_<NAME>_RATIO` — 默认 ratio（一般是 `'auto'`）
- `get<Name>RatiosForApiModel(apiModel)` — 返回该子模型支持的比例数组
- `ratioTo<Name>Size(ratio)` 或 `resolve<Name>AspectRatio(ratio, apiModel)` — 提交前的 ratio → 像素串映射

**比例分组规范**：
- 5 个文档「常用 size」直接映射（`1:1` → `1024x1024`，`3:2` → `1536x1024`，`2:3` → `1024x1536`，`16:9` → `2048x1152`，`9:16` → `1152x2048`）
- 其它比例按 `1 MP 目标 + 16px 对齐 + 长边 ≤3840` 计算
- `'auto'` 透传；旧画布的像素串值兼容直通（不做强制改写）
- 文档约束「长边/短边 ≤ 3:1」的子模型仅保留 11 个 ≤3:1 比例（排除 `1:4` / `4:1` / `1:8` / `8:1`）

**清晰度分档**（v1.5.9 起；qiniu `openai/gpt-image-2` + grsai `gpt-image-2-vip` 同款模式）：
- 节点 data 字段（按 provider 命名）：qiniu 用 `qiniuResolution`，grsai 用 `grsaiImageSize`（与 nano-banana 共用），类型均为 `'1K' | '2K' | '4K'`，默认 `'1K'`；旧画布无该字段时 runner 自动补 `'1K'`，行为完全一致
- 三档目标像素：1K ≈ 1 MP、2K ≈ 4 MP（≈2048²）、4K = 8.29 MP（文档上限 3840×2160）
- 各档维护独立的 `DOC_PRESETS_BY_RES[res]` 文档预设表（命中直接用文档像素值），未命中则按 `computeSize(w, h, RES_TO_TARGET_PIXELS[res])` 计算 + 16 对齐 + 长边 ≤3840 + 总像素 ≤8.29MP 兜底
- 1K 档预设保留 v1.5.6 全部映射（qiniu 5 项 / grsai vip 单档 5 项），确保旧画布默认行为不变
- UI 触发条件：qiniu 用 `apiModel === 'openai/gpt-image-2'`（单条件）；grsai 用 `isNanoBananaSeries(apiModel) || isGptImage2VipModel(apiModel)`（vip 与 nano-banana 共用清晰度控件，写回同一个 `grsaiImageSize` 字段）
- API 第二/第三参数：qiniu `ratioToQiniuSize(ratio, resolution = '1K')`；grsai `resolveGrsaiAspectRatio(ratio, apiModel, resolution = '1K')`（apiModel 排在中间是因为非 vip 模型走透传分支，resolution 参数被忽略，所以放最末）
- vip 比例列表特殊：grsai gpt-image-2-vip 用 `GPT_IMAGE_2_VIP_RATIOS`（14 项去 auto + 加 1:3 / 3:1 / 2:1 / 1:2），旧画布残留 `'auto'` 由 runner 兜底到 `1024x1024`；qiniu openai/gpt-image-2 仍用 11 个含 auto 的通用列表

**ImageNode 配套**：
- 子模型 `<select>` onChange 与 `switchModel` 都按新 apiModel 的允许集合校验已存比例值，越界则迁移到默认，避免跨子模型残留非法选项
- `<Name>ImageTab` 渲染时若 `d.<name>Size` 不在当前 apiModel 的列表中，回退到默认（处理旧画布的像素串值）

---

## 接入新中转站的「四十分钟标准流程」

假设要接入新 provider `XYZ`（占位符；以 grsai 为本轮实战示例）。

### Step 1 · 共享文件「最小切口」改动（不可避免，每次新 provider 都要做）

这些文件无法收到 `integrations/` 目录，但每处只插 1-3 行，全部用 sentinel 注释包裹（完整成对范例见下方「设计规范」段）。

| 文件 | 改动 | 参考（qiniu / grsai 行号或样式） |
|---|---|---|
| `backend/src/config.js` | 加 `XYZ_BASE_URL` 常量 | qiniu: `QINIU_BASE_URL`；grsai: `GRSAI_BASE_URL` |
| `backend/src/routes/settings.js` | DEFAULT_SETTINGS 加 `xyzApiKey` / `xyzBaseUrl`；GET 路由加 `maskKey(xyzApiKey)` | 紧贴 `qiniuApiKey` 块后追加 |
| `backend/src/routes/proxy.js` | **文件末尾追加** XYZ 路由块（推荐放在 `module.exports = router;` 之前） | grsai 块在 qiniu 之后追加 |
| `src/types/canvas.ts` | `ApiSettings` 接口加 `xyzApiKey?` / `xyzBaseUrl?` | 紧贴 `qiniuApiKey` / `qiniuBaseUrl` |
| `src/stores/apiKeys.ts` | 导出 `DEFAULT_XYZ_BASE` 常量；`DEFAULT` 对象加字段 | 紧贴 `DEFAULT_QINIU_BASE` |
| `src/services/generation.ts` | **文件末尾追加** `submitXyzImage` / `queryXyzImageStatus` | 复用 `ImageSubmitResult` / `ImageQueryResult` |
| `src/providers/models.ts` | `ProviderType` 联合加 `'xyz'`；`ImageParamKind` 加 `'xyz'`；`IMAGE_MODELS` **数组末尾**追加模型定义 | grsai 块在 qiniu 之后追加 |
| `src/components/ApiSettings.tsx` | `KeyField` 联合加 `'xyzApiKey'`；`emptyMap` / `emptyShow` 加字段；`CUSTOM_PROVIDER_FIELDS` 加字段；导入 `<XyzSettingsSection>`；JSX 调用 1 行；state + useEffect + handleSave 各 3-5 行（全部 sentinel） | 6 个 sentinel 块 |
| `src/components/nodes/ImageNode.tsx` | 导入 `XyzImageTab` + `runXyzImage` + `getXyzRatiosForApiModel` + `DEFAULT_XYZ_RATIO`；`isXyz` 标志；`switchModel` 加 else-if 分支（按子模型校验比例）；子模型 `<select>` onChange 加 isXyz 迁移分支；UI 条件加 `!isXyz`；插入 `<XyzImageTab>`；`handleGenerate` 加 `if (isXyz) return runXyzImage(...)`（全部 sentinel） | 6 个 sentinel 块 |
| `features.json` | `modelRegistry.image` 数组末尾追加注册项 | 紧贴 qiniu 注册项 |

### Step 2 · 复制 `qiniu/` 目录为模板（核心改动 95% 在此目录内）

```bash
cp -r src/integrations/qiniu src/integrations/xyz
# 然后逐文件改：
#   QiniuSettingsSection.tsx → XyzSettingsSection.tsx
#   QiniuImageTab.tsx        → XyzImageTab.tsx
#   runQiniuImage.ts         → runXyzImage.ts
#   sizeMap.ts               → 改 RATIOS_BY_API_MODEL / COMMON_RATIO_TO_<NAME>_SIZE
```

需要改的位置（grep `Qiniu` / `qiniu` 全部替换）：
- 组件名 `QiniuSettingsSection` → `XyzSettingsSection` 等
- import 路径
- props 接口字段（`qiniuApiKeyInput` → `xyzApiKeyInput` 等）
- API 服务函数名（`submitQiniuImage` → `submitXyzImage`）
- sizeMap 导出名（`getQiniuRatiosForApiModel` → `getXyzRatiosForApiModel`、`ratioToQiniuSize` → `ratioToXyzSize`、`DEFAULT_QINIU_RATIO` → `DEFAULT_XYZ_RATIO`）
- 上游基址常量 `DEFAULT_QINIU_BASE` → `DEFAULT_XYZ_BASE`
- 外链「获取 APIKey」改为该 provider 的控制台 URL
- `<Name>ImageTab` 内**不要**添加外层颜色边框 / 外层 div；保持与 GPT2 一致的 `grid grid-cols-2 gap-2` 简洁布局，标签使用中文（质量 / 比例 / 尺寸）

### Step 3 · 接通 ImageNode handleGenerate

在 `runXyzImage.ts` 中实现：
- 调 `ratioTo<Name>Size(d.xyzSize)` 或 `resolve<Name>AspectRatio(d.xyzAspectRatio, apiModel)` 把 UI 存的比例转为上游接受的字段值
- `submit + 轮询`（取决于上游协议是同步、异步、还是 FAL queue 等其他形态）
- 日志埋点 `logBus.{info|success|debug|error}`，info 中同时打印「UI ratio」与「上游字段值」便于调试
- 写回节点 data：`status / progress / imageUrl / lastPrompt / usedI2I`

### 「以 grsai 接入为例」的完整路径示范

| 阶段 | 文件 | 一句话动作 |
|---|---|---|
| 抓 API 文档 | `中转站/grsai-llms.txt` 提取 nano-banana / gpt-image-2 / result 三个文档；firecrawl 拿到 yaml 规格 | — |
| 后端基础 | `backend/src/config.js` 加 `GRSAI_BASE_URL`；`settings.js` 加 `grsaiApiKey/grsaiBaseUrl` + 脱敏 | 6 行 |
| 后端代理 | `proxy.js` 末尾追加 `loadGrsai/refToGrsai/callGrsai/pollGrsai/normalizeGrsai` 5 个辅助 + 3 个 router 路由 | ≈220 行集中追加 |
| 类型 / 常量 / 服务 | `canvas.ts` / `apiKeys.ts` / `generation.ts` 各加几行 | < 50 行 |
| 模型注册 | `models.ts` ProviderType+ImageParamKind 加 `'grsai'`；IMAGE_MODELS 末尾加 grsai 条目（11 个 model，默认 `gpt-image-2`） | ≈40 行 |
| 集成层 | 新建 `src/integrations/grsai/` 四个文件（含 sizeMap.ts）+ README | ≈500 行 |
| 父组件插入 | `ApiSettings.tsx` 6 处 sentinel；`ImageNode.tsx` 6 处 sentinel（含子模型 onChange 迁移） | ≈35 行散插 |
| 文档 | `features.json` 加注册项；本 README 加对照表行 | < 10 行 |

---

## 设计规范

### 每个 `integrations/<name>/` 必须只产出四类导出

| 文件命名 | 角色 | 父组件中的调用形式 |
|---|---|---|
| `<Name>SettingsSection.tsx` | API 设置弹窗中独立的 Key + baseUrl 块（含外链、端点切换按钮） | `<XyzSettingsSection ... />` |
| `<Name>ImageTab.tsx`（或 `<Name>VideoTab.tsx` 等） | 节点内的专属参数面板，接收 `apiModel` prop 以决定可选比例集合；**不加外层颜色边框 / 外层 div**，沿用 GPT2 同款 `grid grid-cols-2 gap-2` 布局，标签中文化 | `{isXyz && <XyzImageTab d={d} update={update} apiModel={apiModel} />}` |
| `run<Name>Image.ts`（或 `run<Name>Video.ts` 等） | 提交 + 轮询 + 写回 node data；纯函数，不依赖任何 React；submit 前调 sizeMap 完成 ratio → 上游字段转换 | `if (isXyz) await runXyzImage({...})` |
| `sizeMap.ts` | UI 比例集合 + 比例 → 上游字段（像素串或保持 ratio）的映射；导出 `getXyzRatiosForApiModel` / `ratioToXyzSize`（或 `resolveXyzAspectRatio`）/ `DEFAULT_XYZ_RATIO`；**若 provider 含「比例 × 清晰度」双控件**（v1.5.9 模式），追加导出 `XyzResolution` 类型 / `DEFAULT_XYZ_RESOLUTION` / `XYZ_RESOLUTIONS` 数组 / `isXyzVipModel`（或同等判断函数），并让 `resolve<Name>AspectRatio` 接受 `resolution` 末位参数 | ImageNode + `<Name>ImageTab` + runner 各自 import |

可选 `README.md` — 推荐写，存放上游协议镜像、模型清单、已知约束，方便将来调试不用再翻 apifox。

### 父组件中的「插入点」必须用 sentinel 注释包裹

所有跨 `integrations/` 边界的代码片段，前后加：

```ts
// >>> CUSTOM-PROVIDER-INTEGRATIONS-START (与上游同步时，本块整体保留即可)
... 你的改动 ...
// <<< CUSTOM-PROVIDER-INTEGRATIONS-END
```

**好处**：
- 出现 merge 冲突时 `grep -rn "CUSTOM-PROVIDER-INTEGRATIONS"` 一次性定位所有改动点。
- 上游提交若改了 sentinel 之外的代码，三方合并工具能自动合并。
- 大方向：sentinel 块内代码尽量少（< 5 行），多则全部下沉到 `integrations/<name>/*`。

### `integrations/<name>/*` 内部禁止反向依赖

- ✅ 可以 `import` from `../../services/*` / `../../stores/*` / 通用 lucide 图标
- ❌ 不要 `import` from `../../components/ApiSettings` / `../../components/nodes/ImageNode`
- 目的：让 integration 包变成「被插入的乐高积木」，而不是「与父组件双向耦合」。

---

## 插入点速查表（qiniu + grsai 两列对照）

> Geeknow（LLM provider）的插入点见下方独立小节「LLM provider 插入点速查表（geeknow）」。

| 文件 / 位置 | qiniu | grsai |
|---|---|---|
| `backend/src/config.js` | `QINIU_BASE_URL: 'https://openai.qiniu.com'` | `GRSAI_BASE_URL: 'https://grsai.dakka.com.cn'` |
| `backend/src/routes/settings.js` DEFAULT_SETTINGS | `qiniuApiKey` + `qiniuBaseUrl` | `grsaiApiKey` + `grsaiBaseUrl` |
| `backend/src/routes/proxy.js` | 七牛云块（`loadQiniu/refToQiniu/fetchQiniuSubmit/callQiniu/pollQiniu/normalizeQiniu` + 3 路由 `/qiniu/image[/submit|/status/:tid]`）；`fetchQiniuSubmit` 专用于 60 分钟同步响应等待 | grsai 块（5 辅助 + 3 路由 `/grsai/image[/submit|/status/:tid]`） |
| `src/types/canvas.ts` ApiSettings | `qiniuApiKey?` / `qiniuBaseUrl?` | `grsaiApiKey?` / `grsaiBaseUrl?` |
| `src/stores/apiKeys.ts` | `DEFAULT_QINIU_BASE` | `DEFAULT_GRSAI_BASE` |
| `src/services/generation.ts` | `submitQiniuImage` / `queryQiniuImageStatus` | `submitGrsaiImage` / `queryGrsaiImageStatus` |
| `src/providers/models.ts` ProviderType | 加 `'qiniu'` | 加 `'grsai'` |
| `src/providers/models.ts` ImageParamKind | 加 `'qiniu'` | 加 `'grsai'` |
| `src/providers/models.ts` IMAGE_MODELS | 追加 id=`'qiniu'` 条目，默认 apiModel=`gemini-3.1-flash-image-preview` | 追加 id=`'grsai'` 条目，默认 apiModel=`gpt-image-2`（v1.5.6 起） |
| `ApiSettings.tsx` KeyField | 加 `'qiniuApiKey'` | 加 `'grsaiApiKey'` |
| `ApiSettings.tsx` CUSTOM_PROVIDER_FIELDS | 含 `'qiniuApiKey'` | 含 `'grsaiApiKey'` |
| `ApiSettings.tsx` state | `qiniuBaseUrlInput` | `grsaiBaseUrlInput` |
| `ApiSettings.tsx` useEffect 回填 | `setQiniuBaseUrlInput(...)` | `setGrsaiBaseUrlInput(...)` |
| `ApiSettings.tsx` handleSave 对比 | `qiniuBaseUrl` 比较 | `grsaiBaseUrl` 比较 |
| `ApiSettings.tsx` JSX 渲染 | `<QiniuSettingsSection ... />` | `<GrsaiSettingsSection ... />` |
| `ImageNode.tsx` import | `QiniuImageTab` + `runQiniuImage` + `getQiniuRatiosForApiModel` + `DEFAULT_QINIU_RATIO` | `GrsaiImageTab` + `runGrsaiImage` + `getGrsaiRatiosForApiModel` + `DEFAULT_GRSAI_RATIO` |
| `ImageNode.tsx` 标志位 | `isQiniu` | `isGrsai` |
| `ImageNode.tsx` switchModel | `paramKind === 'qiniu'` 分支，按 `getQiniuRatiosForApiModel(newDef.apiModel)` 校验 `qiniuSize` | `paramKind === 'grsai'` 分支，按 `getGrsaiRatiosForApiModel(newDef.apiModel)` 校验 `grsaiAspectRatio` |
| `ImageNode.tsx` 子模型 onChange | 若 isQiniu 且新 apiModel 不允许当前 `qiniuSize` → 回退 `DEFAULT_QINIU_RATIO` | 若 isGrsai 且新 apiModel 不允许当前 `grsaiAspectRatio` → 回退 `DEFAULT_GRSAI_RATIO` |
| `ImageNode.tsx` handleGenerate | `if (isQiniu) return runQiniuImage(...)` | `if (isGrsai) return runGrsaiImage(...)` |
| `ImageNode.tsx` UI 比例条件 | `!isFal && !isMj && !isQiniu` | 同条件再加 `&& !isGrsai` |
| `ImageNode.tsx` JSX 面板 | `{isQiniu && <QiniuImageTab d={d} update={update} apiModel={apiModel} />}` | `{isGrsai && <GrsaiImageTab d={d} update={update} apiModel={apiModel} />}` |
| `features.json` | `modelRegistry.image` 末尾加 qiniu 注册项 | 末尾再加 grsai 注册项 |

### LLM provider 插入点速查表（geeknow）

| 文件 / 位置 | geeknow（v1.7.4 fork-only） |
|---|---|
| `backend/src/routes/proxy.js` | 文件末尾追加 `>>> FORK-GEEKNOW-LLM-START/END <<<` 围栏，含 `getGeeknowConfig` + `POST /llm-geeknow`（SSE 透传）+ `GET /llm-geeknow/models`（拉全集） |
| `src/types/canvas.ts` `NodeType` | 加 `'t8f-geeknow-llm'`（带 `v1.7.4 fork-only` 行注释） |
| `src/types/canvas.ts` `ApiSettings` | 加 `geeknowApiKey?: string` + `geeknowBaseUrl?: string` |
| `src/stores/apiKeys.ts` | 导出 `DEFAULT_GEEKNOW_BASE`；DEFAULT 加 2 字段 |
| `src/providers/models.ts` `ProviderType` | 加 `'geeknow'` |
| `src/providers/models.ts` | 末尾导出 `GEEKNOW_LLM_MODELS`（13 个）+ `DEFAULT_GEEKNOW_LLM_MODEL` |
| `src/config/nodeRegistry.ts` | 核心节点末尾加 `{ type: 't8f-geeknow-llm', ... icon:'Sparkles', color:'amber' }` |
| `src/config/portTypes.ts` `NODE_PORTS` | 加 `'t8f-geeknow-llm': { inputs:['text','image'], outputs:['text'] }` |
| `src/components/Canvas.tsx` | 3 处改动：import `GeeknowLlmNode` / `nodeTypes` map 加条目 / `DEFAULT_DATA` 加条目 / `EXECUTABLE_NODE_TYPES` Set 加条目 |
| `src/components/ApiSettings.tsx` | `>>> FORK-GEEKNOW-LLM-START/END <<<` 围栏：import / `KeyField` 联合 / `CUSTOM_PROVIDER_FIELDS` / `emptyMap` / `emptyShow` / `geeknowBaseUrlInput` state / 加载 effect / handleSave / JSX 渲染 |
| `features.json` | core 节点数 6→7；新增 phase96 phase 记录条目 |

---

## 上游同步标准操作

```bash
# 1. 拉最新上游
git fetch upstream
git checkout main
git merge upstream/main

# 2. 若出冲突，先看 sentinel 块外有没有冲突（多数情况零冲突）
grep -rn "<<<<<<<" src backend features.json

# 3. 跑校验
npm install
npm run type-check
npm run lint
npm run build

# 4. 后端字节码必重做（修改了 backend/src/** 时）
npm run encrypt

# 5. 手工跑一遍画布，确认所有 provider Tab 仍能生图
npm run dev
```

---

## FAQ

**Q1：未来要加视频生成的中转站怎么办？**
照样在 `src/integrations/<name>/` 下加：
- `<Name>VideoTab.tsx`（视频参数面板）
- `run<Name>Video.ts`（提交轮询逻辑）
- 视频如有「ratio + resolution」双下拉，也可考虑配套 `sizeMap.ts` 抽离
- 改 `src/components/nodes/VideoNode.tsx` 一处插入点（用相同 sentinel 包裹）

**Q2：上游主项目重命名了 ImageNode handleGenerate 内部变量怎么办？**
你的 `if (isXyz) return runXyzImage(...)` 仅依赖 `id / apiModel / finalPrompt / allRefs / d / update` 这 6 个参数名。只要这 6 个还存在（即便重命名只需调一处），runner 内部纯逻辑不受影响。

**Q3：上游主项目改了 `ApiSettings` 的样式 token 计算？**
`<XyzSettingsSection>` 接收 `inputCls / labelCls / hintCls / eyeBtnCls / linkBtnCls` 等已计算好的 className 串。只要 props 名字不变就不会撞冲突。

**Q4：上游加了一个新的内置 KeyField（比如 `dalleApiKey`）怎么办？**
撞冲突的概率：`KeyField` 联合类型 + `emptyMap`/`emptyShow` 各一行。三方合并工具通常能自动合并。手动 resolve 也只需保留两边的字段。

**Q5：grsai 自有协议的「状态枚举不是 success 而是 succeeded」是不是坑？**
是。runner 与 proxy 内 SUCCESS / FAILURE 数组都同时识别 `succeeded` 与 `success`、`failed` 与 `violation`，已统一收口。新接入 provider 务必把上游所有非终态、终态状态枚举写全。

**Q6：grsai 字段是驼峰命名（aspectRatio / imageSize），与 OpenAI 下划线风格不同，前后端要小心吗？**
要。runner 和后端代理之间通过 `req.body.aspectRatio` / `req.body.imageSize` 驼峰透传，**不要在中间任何一层做下划线转换**。`/v1/api/generate` 上游只认驼峰，发下划线会被忽略导致比例不生效。

**Q7：gpt-image-2-vip 的「必须传像素串、不接受比例字符串」怎么处理？**（v1.5.6 单档重构 · v1.5.9 升级双控件）
UI 一律只显示比例 + 清晰度档，由 `grsai/sizeMap.ts` 的 `resolveGrsaiAspectRatio(ratio, apiModel, resolution)` 在 runner submit 前完成转换：当 apiModel 匹配 `/^gpt-image-2.*vip$/i` 时，按 `DOC_PRESETS_BY_RES[resolution]` 查文档预设（14 比例 × 3 档完整表，1:3 / 3:1 在 2K 档缺位由 `computeVipSize(4MP)` 兜底）；旧画布残留 `'auto'` 兜底到默认 `1024x1024`。其它子模型透传比例字符串，`resolution` 参数被忽略。**用户视角完全感知不到内部差异**。vip 比例列表自 v1.5.9 起从「通用 11 含 auto」改为「14 项去 auto + 加 1:3 / 3:1 / 2:1 / 1:2」，覆盖 vip 文档独有比例。

**Q8：grsai 的 `imageSize` 是只 nano-banana 系列识别吗？怎么避免误传？**（v1.5.9 起 vip 也读但不上送）
`runGrsaiImage.ts` 内用 `isNanoBananaSeries(model)` 判断是否把 `imageSize` 加进 HTTP request body —— **仅 nano-banana 系列上送给上游**。自 v1.5.9 起 `isGptImage2VipModel(model)` 也读 `d.grsaiImageSize`，但**只作为本地查表参数**传给 `resolveGrsaiAspectRatio`（影响最终的 `aspectRatio` 像素串），**不进入 body**。普通 gpt-image-2 完全忽略该字段。后端 `callGrsaiImageUpstream` 兜底跳过空字段做最后一道防线。

**Q9：为什么 size 下拉要做成「按 apiModel 分组」？**（v1.5.6 起的设计）
不同子模型的合法比例集合本就不同：
- 七牛 `openai/gpt-image-2` 文档明确「长边/短边 ≤ 3:1」，超出的比例（`1:4` 等）会被上游拒绝
- 七牛 `gemini-3.1-flash-image-preview` 支持全 14 个比例
- Grsai `nano-banana-2` 系列支持极端比例，其它子模型不支持
- Grsai `gpt-image-2-vip` 上游接受范围与 `openai/gpt-image-2` 相同

如果一律暴露全集，用户在 vip / openai 子模型下选了 `1:4` 必然报错。分组限制能在 UI 层就过滤掉非法选项，配合 ImageNode 的「子模型切换时校验并迁移已存值」一起，保证不会跨子模型残留越界比例。

**Q10：旧画布存的是像素串（如 `qiniuSize: '1024x1024'`），新版本只显示比例会不会显示空？**
不会。`<Name>ImageTab` 渲染时若 `d.xxxSize` 不在当前 apiModel 的允许列表中，会回退到默认（`DEFAULT_<NAME>_RATIO`）显示。runner 中 `ratioToXxxSize` 也会原样透传已是像素串的旧值给上游，不影响生成。但只要用户重新选一次下拉，数据就会迁移为新版比例字符串。

**Q11：v1.5.9 七牛 / grsai 的 1K / 2K / 4K 清晰度档是怎么工作的？**（v1.6.2 起扩到七牛 gemini）
三个子模型走**同款 UI 架构**，但**上游协议有显著差异**——qiniu `openai/gpt-image-2` 与 grsai `gpt-image-2-vip` 走「ratio → 像素串」本地查表，而 qiniu `gemini-3.1-flash-image-preview` 走「上游嵌套对象」直接送比例字符串 + 清晰度档名：

| 维度 | qiniu `openai/gpt-image-2` | qiniu `gemini-3.1-flash-image-preview`（v1.6.2 新增） | grsai `gpt-image-2-vip` |
|---|---|---|---|
| 节点 data 字段 | `qiniuResolution: '1K'\|'2K'\|'4K'` | `qiniuResolution`（与 openai/gpt-image-2 共用同字段） | `grsaiImageSize: '1K'\|'2K'\|'4K'`（与 nano-banana 共用同字段） |
| UI 触发条件 | `apiModel === 'openai/gpt-image-2'`（v1.5.9 起单条件） | `apiModel === 'gemini-3.1-flash-image-preview'`（v1.6.2 起加入 `supportsResolution`） | `isNanoBananaSeries(apiModel) \|\| isGptImage2VipModel(apiModel)` |
| UI 列数 | `grid-cols-3`（质量 + 比例 + 清晰度） | `grid-cols-3`（同 openai；quality 控件保留但上游忽略，仅 UI 一致性） | `grid-cols-2`（比例 + 清晰度） |
| 比例列表 | 11 通用比例（含 auto） | 14 项 gemini 文档枚举（保留 auto 作为"上游默认"语义） | 14 项 vip 专属（去 auto + 加 1:3 / 3:1 / 2:1 / 1:2） |
| **上游协议** | OpenAI 兼容：顶层 `size`（像素串）+ `quality` | **Gemini 嵌套**：`image_config.{aspect_ratio, image_size}`，**不发顶层 size / quality** | 自有协议：顶层 `aspectRatio`（像素串）|
| 转换 API | `ratioToQiniuSize(ratio, resolution)`（runner 内查表转像素串送 `body.size`） | **不走 sizeMap**：runner 直接送原始比例字符串 + 档名给后端 → 后端构造 `image_config` 嵌套对象 | `resolveGrsaiAspectRatio(ratio, apiModel, resolution)` |
| 路径分流 | 文/图生图分两个端点（generations / edits），双端共用 size | 文/图生图同端点分流，双端共用 image_config | 单端点 `/v1/api/generate`，靠 images[] 区分 |
| 关联修复 | v1.5.9 去掉 `if (!hasRefs)` 守卫，使图生图也送 size（详见 Q12） | v1.6.2 修复：根因是 `callQiniuImageUpstream` 把两子模型按同一份 OpenAI body 发，gemini 上游静默忽略顶层 size（详见 Q14） | v1.5.6 起就无此问题（vip 一直走 sizeMap 转换） |

**共同点**（接入新 provider 复用这套模式时的核心约定）：
- 三档目标像素：`1K = 1 MP / 2K = 4 MP / 4K = 8.29 MP`；每档独立 `DOC_PRESETS_BY_RES[res]` 文档预设表（命中文档值直接用），未命中按 `computeSize(w, h, RES_TO_TARGET_PIXELS[res])` 计算 + 16 对齐 + 长边 ≤3840 + 总像素 ≤8.29 MP 兜底
- runner 日志同时打印 `ratio` 与 `resolution` / `imageSize` 便于排错
- 兼容性：旧画布无清晰度字段 → 默认 `'1K'` + 1K 档预设保留 v1.5.6 / v1.5.8 全部映射，**完全不影响旧画布的输出**
- vip 列表去 `auto`：grsai vip 上游不接受 `auto`，UI 列表也去掉，runner 兜底处理旧画布残留 → `1024x1024`

**Q12：v1.5.9 之前的「七牛图生图 size 不生效」是什么坑？怎么修的？**
`backend/src/routes/proxy.js` 的 `callQiniuImageUpstream` 在历史实现里写了 `if (!hasRefs) body.size = size || 'auto';`，**显式过滤掉了图生图分支的 size 字段**——本意是按「OpenAI 兼容协议下 `/v1/images/edits` 不带 size」的猜测做的安全过滤，但七牛 `openai/gpt-image-2` 上游实际接受 size。v1.5.9 去掉该守卫，改成无条件 `body.size = size || 'auto'`；同时把日志里 `body.size || '(edit)'` 的占位符换成直接打印 `body.size`，运维能从日志直接核对透传值。`sizeMap.ts` 顶部「`/v1/images/edits` 不接受 size 参数」的旧注释同步删除。**这是 v1.5.9 的核心修复**，旧画布只要重新生图即可生效。grsai 同期 v1.5.9 工作（vip 双控件）不涉及此 bug，详见 `grsai/README.md` §五。

**Q13：什么时候应该给新接入的 provider 加 1K/2K/4K 清晰度档？复用模式的判断清单**
对照下列条件，**全部满足才有意义**——否则只显示比例下拉就够了：

1. **上游文档明确列出至少 3 档清晰度的官方推荐像素值**（如 1K=1024² / 2K=2048² / 4K=3840²）。若文档只给「1024x1024」一档，做双控件就是过度设计。
2. **上游 API 必须接受像素串**（runner 内本地查表后送上游）。若上游只接受比例字符串，清晰度档没下游可送，等于无意义参数。
3. **该子模型存在「同一比例不同档位 → 不同像素值」的实际场景**。如 vip 文档表里 `1:1` 三档分别是 `1024x1024 / 2048x2048 / 2880x2880`，三档差异显著用户值得选；若所有档位都收敛到一个值，就退化成单档。
4. **存在文档表与计算公式的混合场景**。如果 100% 比例都能命中文档预设，可以省掉 `computeSize` 兜底；但通常文档会缺 1-2 个边角组合（如 vip 文档表 `1:3 / 3:1` 缺 2K 档），需要 `computeSize(target_pixels)` 兜底。

**满足后的复用步骤**（≈40 行新增）：
1. `sizeMap.ts` 加 `<Name>Resolution` / `RES_TO_TARGET_PIXELS` / `DOC_PRESETS_BY_RES` 三件套；导出 `is<Name>VipModel`（或同等判断函数）
2. `<Name>ImageTab.tsx` 的 `showImageSize` 触发条件加 vip 分支；UI 复用现有的清晰度下拉（写回同一 `<name>Resolution` / `<name>ImageSize` 字段）
3. `run<Name>Image.ts` 调用 `resolve<Name>AspectRatio(ratio, apiModel, resolution)`；日志加 `resolution` 打印
4. 节点 data 类型在 `src/types/canvas.ts` 加 `<name>Resolution?: '1K' | '2K' | '4K'`
5. `features.json` provider 注册项的 `params` 描述加上新字段
6. 子目录 `README.md` 加「比例 × 清晰度双控件」章节，附完整预设表方便日后调试

**Q14：v1.6.2 修复的「七牛 gemini-3.1-flash-image-preview 比例参数不生效」是什么坑？**
v1.5.6 ~ v1.6.1 之间 `backend/src/routes/proxy.js` 的 `callQiniuImageUpstream` 把两个子模型按**同一份 OpenAI body** 发出：

```js
const body = { model, prompt, quality: quality || 'auto', size: size || 'auto' };
```

而 gemini-3.1-flash-image-preview 上游协议**完全不接受顶层 `size` / `quality`**，比例和清晰度必须通过嵌套对象 `image_config: { aspect_ratio, image_size }` 表达。gemini 上游收到 fork 发的 OpenAI body 后**静默忽略 `size` 字段**，导致结果默认 1:1。phase81 的 `if (!hasRefs)` 守卫修复（v1.5.9 / Q12）只让 openai/gpt-image-2 受益，对 gemini 无效。

**v1.6.2 修复方案**（4 处协同改动）：
1. **`backend/src/routes/proxy.js`** `callQiniuImageUpstream` 按 `model` 分流构造 body：
   - `model === 'gemini-3.1-flash-image-preview'` → 写入 `body.image_config.{aspect_ratio?, image_size?}`，两字段均可选（'auto' / 缺省时不发对应键，让上游默认）
   - 其它子模型（openai/gpt-image-2）→ 维持现状 `body.size` + `body.quality`
2. **`src/services/generation.ts`** `QiniuImageSubmitRequest` 接口新增可选字段：`aspectRatio?: string` + `imageSize?: '512' | '1K' | '2K' | '4K'`
3. **`src/integrations/qiniu/runQiniuImage.ts`** 按 `apiModel` 分流：
   - gemini 路径直接送原始比例字符串到 `req.aspectRatio`，**不调** `ratioToQiniuSize`；'auto' 与像素串残留（`/^\d+x\d+$/`）都不送，让上游默认
   - openai 路径维持现状（quality + ratioToQiniuSize 转像素串）
4. **`src/integrations/qiniu/QiniuImageTab.tsx`** `supportsResolution` 扩展到 gemini，UI 同步显示 1K/2K/4K 清晰度档（quality 控件保留以保持与 openai/gpt-image-2 一致，gemini 上游忽略不影响功能）

**关键边界**：
- **'auto' 语义**：gemini 上游文档不列 auto，UI 选 auto → runner 不送 `body.image_config.aspect_ratio`（仅送 `image_size` 或不送 `image_config`），让上游默认比例兜底
- **像素串 vs 比例字符串**：用正则 `/^\d+x\d+$/` 判别，避免把比例串误当像素串处理
- **旧画布兼容**：旧 gemini 节点 `qiniuSize: '1024x1024'`（v1.5.6 早期允许的像素串）→ runner 检测到不送 `aspect_ratio`，让上游默认；旧 gemini 节点无 `qiniuResolution` → runner 默认 `'1K'`
- **gemini 不需要 quality**：UI 保留控件以保持与 openai/gpt-image-2 一致；`d.qiniuQuality` 仅 runner 在 openai 分支读取，gemini 分支彻底丢弃

**Q15：v1.7.4 新增 LLM provider（geeknow）为什么不复用 image provider 模板？**
两个原因：
1. **业务实体不同**：image provider 是「ImageNode 的多模型一员」，沿用 ImageNode Tab 模式自然合理；LLM 在主项目里就是「`llm` 独立节点 + 独立 endpoint」，复制成 image 模式反而会破坏 `LLMNode` 与上游 `gpt-image-2-web` 的同构关系
2. **合并风险**：fork-only 的 `t8f-geeknow-llm` 节点完全不动 `LLMNode.tsx`，上游对 `LLMNode` 的任何改动（新增模型、加预设、改 UI）都自动跟随，不会出现「上游 `LLMNode` 改了、fork 因为塞了 Geeknow Tab 必须重新合并」的尴尬。所以 v1.7.4 走「独立节点 + `t8f-` 类型前缀」模式，并写入本 README 作为后续 LLM provider 接入的标准模板

未来若要接入第二个 LLM 中转站（如 `siliconflow` / `openrouter`），复制 `geeknow/` 三件套即可：
- `src/integrations/<name>/<Name>SettingsSection.tsx`（API 设置面板独立块）
- `src/integrations/<name>/run<Name>Llm.ts`（服务层 3 个导出）
- `src/components/nodes/<Name>LlmNode.tsx`（独立节点组件，节点 type 用 `t8f-<name>-llm`）

**Q16：geeknow 与上游 LLMNode 节点能不能共用 `useUpstreamMaterials` / `useRunTrigger`？**
能。`GeeknowLlmNode.tsx` 完全沿用 `LLMNode.tsx` 的 hooks 栈（`useRunTrigger` / `useUpstreamMaterials` / `useUpdateNodeData` / `MentionPromptInput` / `useMaterialDragSource` / `useMaterialDropTarget`），仅在如下两点差异化：
- 入参字段名前缀 `t8f-geeknow-` （localStorage 命名空间隔离）
- 调用 `runGeeknowLlm.ts` 而非 `generation.ts` 的 `generateLlm`
其它行为（system 预设保存、多轮 history、SSE 流式、多模态图像、`@` 提及、停止按钮、错误展示）都与 `LLMNode` 一致。

**Q17：七牛提交为什么要单独做 60 分钟响应等待？**
七牛 `openai/gpt-image-2` 的文生图 `/v1/images/generations` 与图生图 `/v1/images/edits` 文档返回结构都是同步 `ImageGenerationResponse`：`created + data[].b64_json`，**不会返回 `task_id`**。因此这一路不能假设“提交马上返回 taskId、然后前端轮询 60 分钟”；真实链路是上游可能长时间生成，最后一次性返回 `b64_json`。

`gemini-3.1-flash-image-preview` 虽然通常会返回异步 `task_id` 再查 `/v1/images/tasks/{tid}`，但它同样先经过 `/v1/images/generations` 或 `/v1/images/edits` 的提交阶段；如果提交阶段超过 Node fetch 默认约 5 分钟仍未返回响应头，也会在拿到 `task_id` 前触发 `HeadersTimeoutError / UND_ERR_HEADERS_TIMEOUT`。

当前后端在 `backend/src/routes/proxy.js` 中给七牛提交专门收口为 `fetchQiniuSubmit`，两个七牛子模型共用这条路径，用原生 `http/https` 请求把提交响应等待放宽到 `QINIU_SUBMIT_TIMEOUT_MS = 60 * 60 * 1000`。

关键边界：
- **只改提交等待，不改参数协议**：`openai/gpt-image-2` 的 `/edits` 仍必须发送 `size`，它是图生图尺寸控制的实际字段；不要因为某些文档 schema 漏列 `size` 就回退成“不发 size”。
- **60 分钟提交等待 ≠ 60 分钟轮询**：`fetchQiniuSubmit` 覆盖提交阶段（包含 `openai/gpt-image-2` 等同步图片、以及 `gemini-3.1-flash-image-preview` 拿 `task_id` 前的等待）；`runQiniuImage.ts` 的 `maxPoll=1800 / interval=2000` 只在后端已经拿到 `taskId` 后才生效。
- **上游同步响应体必须兼容 Response-like 接口**：`fetchQiniuSubmit` 返回 `{ ok, status, text() }`，用于复用现有 `callQiniuImageUpstream` 调用方解析逻辑。

