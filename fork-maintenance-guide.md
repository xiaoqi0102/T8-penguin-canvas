# Fork 维护指南：合并 upstream + Provider 接入规范 + API 接口说明

> 版本：T8-penguin-canvas v1.8.0（fork 自有）
> 整理日期：2026-05-31
> 维护对象：`src/integrations/{grsai,qiniu,geeknow}/` 隔离层 + `backend/src/routes/proxy.js` 三段代理路由 + LLMNode TAB 切换
> 同级参考：`rh.md`（RunningHub 落地参考）/ `src/integrations/README.md`（隔离层架构总览）

## 文档目录

- [第一部分 · Fork 项目维护指南](#第一部分--fork-项目维护指南)
  - [1. Fork 版本策略](#1-fork-版本策略)
  - [2. Fork 项目核心改动清单](#2-fork-项目核心改动清单)
  - [3. 合并 upstream 标准操作](#3-合并-upstream-标准操作)
  - [4. 合并冲突处理](#4-合并冲突处理)
  - [5. 验收清单](#5-验收清单)
- [第二部分 · Provider 接入规范](#第二部分--provider-接入规范)
- [第三部分 · API 接口规范](#第三部分--api-接口规范)
- [附录](#附录)

---

# 第一部分 · Fork 项目维护指南

## 1. Fork 版本策略

**核心规则**：fork 版本号必须**永远领先 upstream/main 至少一个次版本号**。

### 版本号管理

| 检查时机 | 操作 |
|---|---|
| 合并 upstream 后 | 立即检查 upstream 版本，若 ≥ fork 当前版本，递增 fork 版本（次版本号 +1） |
| Fork 自有功能发版 | 递增修订号（patch） |
| 合并 upstream 但本地无新功能 | 递增次版本号（minor） |

### 当前状态（截至 2026-05-31）

| 项目 | 版本 |
|---|---|
| Fork 当前 | v1.8.0 |
| Upstream 当前 | v1.7.4 |
| 领先状态 | ✅ 领先一个次版本号 |

### 版本号在哪些地方？

需要同步更新的版本号位置（合并 upstream 时高发冲突）：

| 文件 | 字段 |
|---|---|
| `package.json` | `version` |
| `package-lock.json` | `version`（顶层 + `packages."".version`） |
| `backend/package.json` | `version` |
| `backend/package-lock.json` | `version`（同上 2 处） |
| `electron/main.cjs` | 应用标题 / About 对话框（如有硬编码） |
| `features.json` | 顶层 `version` 字段 |
| `CLAUDE.md` | 「Fork 版本策略」章节的当前版本表 |

---

## 2. Fork 项目核心改动清单

合并 upstream 时**必须保留**的所有 fork 自有内容。按文件类型分类。

### 2.1 完整新增的文件（最容易保留 — 上游不会动）

#### 后端

| 文件 | 用途 |
|---|---|
| `backend/src/routes/settings.js` 中的 `geeknowApiKey` / `geeknowBaseUrl` | Geeknow LLM 配置（DEFAULT_SETTINGS + GET 路由 maskKey） |

#### 前端 - integrations 目录（fork 完全自治）

| 目录 | 文件 | 用途 |
|---|---|---|
| `src/integrations/qiniu/` | `QiniuSettingsSection.tsx` | API 设置面板独立块 |
| | `QiniuImageTab.tsx` | ImageNode 内嵌 Tab |
| | `runQiniuImage.ts` | 提交 + 轮询服务 |
| | `sizeMap.ts` | 比例 → 像素串映射 |
| `src/integrations/grsai/` | `GrsaiSettingsSection.tsx` | API 设置面板独立块 |
| | `GrsaiImageTab.tsx` | ImageNode 内嵌 Tab |
| | `runGrsaiImage.ts` | 提交 + 轮询服务 |
| | `sizeMap.ts` | 比例 × 清晰度 双控件映射 |
| | `README.md` | grsai 协议镜像 + 模型清单 |
| `src/integrations/geeknow/` | `GeeknowSettingsSection.tsx` | API 设置面板独立块 |
| | `runGeeknowLlm.ts` | LLM 推理服务（流式 + 非流式） |
| `src/integrations/` | `README.md` | 隔离层架构总览 |

#### 文档（fork 自有）

| 文件 | 用途 |
|---|---|
| `fork-maintenance-guide.md` | 本文档 |
| `rh.md` | RunningHub 落地参考 |
| `docs/llm-inference.md` | LLM 推理专项文档 |

---

### 2.2 共享文件「最小切口」改动（每次合并都要核对的位置）

这些文件 fork 与 upstream 都会动，是**冲突高发区**。每处改动用 sentinel 注释包裹，便于快速识别。

#### 2.2.1 后端共享文件

##### `backend/src/config.js`

```js
// fork 自有配置常量
QINIU_BASE_URL: 'https://openai.qiniu.com',
GRSAI_BASE_URL: 'https://grsai.dakka.com.cn',
// Geeknow 默认 baseUrl 在 settings.js DEFAULT_SETTINGS 内
```

##### `backend/src/routes/settings.js`

需保留的字段（DEFAULT_SETTINGS 中）：

```js
qiniuApiKey: '',
qiniuBaseUrl: 'https://openai.qiniu.com',
grsaiApiKey: '',
grsaiBaseUrl: 'https://grsai.dakka.com.cn',
// v1.7.4: Geeknow LLM 中转站
geeknowApiKey: '',
geeknowBaseUrl: 'https://www.geeknow.top',
```

GET 路由的 maskKey 调用：

```js
qiniuApiKey: maskKey(settings.qiniuApiKey),
grsaiApiKey: maskKey(settings.grsaiApiKey),
geeknowApiKey: maskKey(settings.geeknowApiKey),
```

##### `backend/src/routes/proxy.js`

整体结构（按 sentinel 围栏块识别）：

| 块标记 | 行号区间（v1.8.0） | 内容 |
|---|---|---|
| 七牛代理路由 | 2166-2400 区间 | `loadQiniuSettings` / `refToQiniuImage` / `callQiniuImageUpstream`（**model 分流**） / `pollQiniuTask` / 3 条 API 路由 |
| Grsai 代理路由 | 2456-2644 区间 | `loadGrsaiSettings` / `refToGrsaiImage` / `callGrsaiImageUpstream` / `pollGrsaiTask` / 3 条 API 路由 |
| **Geeknow LLM 代理路由** | `>>> FORK-GEEKNOW-LLM-START` ~ `<<< FORK-GEEKNOW-LLM-END`（文件末尾） | `getGeeknowConfig` + `POST /llm-geeknow`（SSE 透传 + 非流式） |

> ⚠️ **Geeknow 路由必须在 `module.exports = router;` 之前**。文件末尾追加，避免与上游路由插入位置冲突。

#### 2.2.2 前端共享文件

##### `src/types/canvas.ts`

`ApiSettings` 接口需保留 fork 字段：

```ts
export interface ApiSettings {
  // ... upstream 字段
  // fork 自有：
  qiniuApiKey?: string;
  qiniuBaseUrl?: string;
  grsaiApiKey?: string;
  grsaiBaseUrl?: string;
  geeknowApiKey?: string;     // v1.7.4
  geeknowBaseUrl?: string;    // v1.7.4
}
```

##### `src/stores/apiKeys.ts`

需保留的导出常量：

```ts
export const DEFAULT_QINIU_BASE = 'https://openai.qiniu.com';
export const DEFAULT_GRSAI_BASE = 'https://grsai.dakka.com.cn';
export const DEFAULT_GEEKNOW_BASE = 'https://www.geeknow.top';  // v1.7.4
```

`DEFAULT` 对象需保留对应字段。

##### `src/providers/models.ts`

| 改动点 | 内容 |
|---|---|
| `ProviderType` 联合 | 加 `'qiniu'` / `'grsai'` / `'geeknow'` |
| `ImageParamKind` 联合 | 加 `'qiniu'` / `'grsai'` |
| `IMAGE_MODELS` 数组 | 末尾追加七牛 2 个子模型 + Grsai 11 个子模型 |
| `GEEKNOW_LLM_MODELS` | v1.8.0 起 5 个推理模型（gpt-5.5、gemini-3-pro-preview、gemini-3.1-pro-preview、gemini-3.5-flash、deepseek-v4-pro） |
| `DEFAULT_GEEKNOW_LLM_MODEL` | `'gemini-3.1-pro-preview'` |
| `getModelsByProvider(provider)` | 按 provider 过滤模型 |
| `getDefaultModelForProvider(provider)` | 返回该 provider 的默认模型 |

##### `src/services/generation.ts`

文件末尾追加（七牛 + Grsai）：
- `submitQiniuImage` / `queryQiniuImageStatus`
- `submitGrsaiImage` / `queryGrsaiImageStatus`

> Geeknow 不在 `generation.ts`，直接在 `src/integrations/geeknow/runGeeknowLlm.ts` 中实现。

##### `src/components/ApiSettings.tsx`

围栏块（合并时关键检查点）：

| Sentinel 块 | 内容 |
|---|---|
| 顶部 import | `QiniuSettingsSection` / `GrsaiSettingsSection` / `GeeknowSettingsSection`（`>>> FORK-GEEKNOW-LLM-START`） |
| `KeyField` 联合类型 | 加 `'qiniuApiKey'` / `'grsaiApiKey'` / `'geeknowApiKey'` |
| `CUSTOM_PROVIDER_FIELDS` | 数组追加三个 key |
| `emptyMap` / `emptyShow` | 加三个空字段 |
| `geeknowBaseUrlInput` state | 围栏 `>>> FORK-GEEKNOW-LLM-START` |
| 加载 effect | 从 `settings` 读取 `geeknowBaseUrl` |
| `handleSave` 中 baseUrl 持久化 | 围栏 `>>> FORK-GEEKNOW-LLM-START` |
| JSX 渲染三个 SettingsSection | 围栏 `>>> FORK-GEEKNOW-LLM-START` |

##### `src/components/nodes/ImageNode.tsx`

围栏改动（七牛 / Grsai 各 6 处插入点）：

| 改动 | 内容 |
|---|---|
| import | `QiniuImageTab` + `runQiniuImage` + `getQiniuRatiosForApiModel` + `DEFAULT_QINIU_RATIO`（grsai 同型） |
| `isQiniu` / `isGrsai` 标志 | 按 `apiModel` 子模型判断 |
| `switchModel` else-if 分支 | 按子模型校验比例值 |
| 子模型 `<select>` onChange 迁移 | 防止跨 apiModel 残留越界比例 |
| UI 条件 | `!isQiniu && !isGrsai` 才显示通用比例下拉 |
| `<XyzImageTab>` 插入点 | `{isQiniu && <QiniuImageTab .../>}` |
| `handleGenerate` 分流 | `if (isQiniu) return runQiniuImage(...)` |

##### `src/components/nodes/LLMNode.tsx`（v1.8.0 重构）

整个节点改造为「provider TAB 切换」模式：

| 改动 | 内容 |
|---|---|
| import | `generateGeeknowLlm` / `generateGeeknowLlmStream`（来自 `integrations/geeknow/runGeeknowLlm`） |
| import | `getModelsByProvider` / `getDefaultModelForProvider` / `ProviderType`（来自 `providers/models`） |
| Provider TAB 按钮组 | 顶部「直连 / Geeknow」切换 |
| 动态模型列表 | `getModelsByProvider(provider)` 返回不同列表 |
| 流式生成函数选择 | `provider === 'geeknow' ? generateGeeknowLlmStream : generateLlmStream` |
| 非流式生成函数选择 | `provider === 'geeknow' ? generateGeeknowLlm : generateLlm` |
| 预设系统命名空间 | `t8f-geeknow-sys-presets` vs `t8-llm-sys-presets` |

#### 2.2.3 配置文件

##### `src/config/nodeRegistry.ts`

LLM 节点描述需保留 v1.8.0 措辞：

```ts
{ type: 'llm', label: 'LLM', category: 'core',
  description: '多提供商 LLM 推理（直连/Geeknow TAB 切换，支持 GPT/Claude/Gemini/DeepSeek/Qwen）',
  icon: 'Brain', color: 'emerald' },
```

##### `features.json`

顶层 `version` 字段 + `modelRegistry.image` 数组追加 qiniu / grsai 注册项 + phase 编号扩展（fork 自有 phase80~phase96+）。

---

## 3. 合并 upstream 标准操作

### 3.1 标准流程

```bash
# 1. 拉最新上游
git fetch upstream
git checkout main
git merge upstream/main

# 2. 检查冲突文件
grep -rn "<<<<<<<" src backend features.json package*.json

# 3. 跑校验
npm install
npm run type-check
npm run build

# 4. 后端字节码必重做（修改了 backend/src/** 时）
npm run encrypt

# 5. 手工跑一遍画布，确认所有 provider 仍能生图/推理
npm run dev
```

### 3.2 合并前的准备

```bash
# 确保工作树干净
git status

# 备份当前分支
git branch backup/before-merge-$(date +%Y%m%d)

# 查看 upstream 与 fork 的差异（预览）
git fetch upstream
git log HEAD..upstream/main --oneline
git diff HEAD..upstream/main --stat
```

### 3.3 合并后的 fork 版本号递增

```bash
# 假设上游推到 v1.8.0，fork 当前 v1.8.0
# 必须递增 fork 到至少 v1.9.0
npm version minor --no-git-tag-version
cd backend && npm version minor --no-git-tag-version && cd ..

# 同步 features.json 顶层 version
# 同步 CLAUDE.md「Fork 版本策略」章节当前版本表
```

---

## 4. 合并冲突处理

### 4.1 高频冲突点

| 文件 | 冲突原因 | 处理 |
|---|---|---|
| `package.json` / `package-lock.json` | 版本号 + 依赖列表 | 保留 fork 版本号；依赖列表合并双方新增 |
| `features.json` | 顶层 `version` + `modelRegistry` + `phase` 编号 | fork 自有 phase 编号若与 upstream 撞号，重命名为 +3 起的新编号（已有 phase80~84 的处理先例） |
| `CLAUDE.md` | 文档全文 | 手工合并，保留 fork 自有章节（Fork 版本策略 / 变更记录） |
| `src/types/canvas.ts` | `NodeType` / `ApiSettings` 联合 | 保留双方字段 |
| `src/components/ApiSettings.tsx` | KeyField / emptyMap / JSX | 看 sentinel 块；上游加新 KeyField 时按字母序合并 |
| `src/components/nodes/ImageNode.tsx` | switchModel 与 onChange 分支 | 看 isXyz 围栏，保留 fork 自有 isQiniu / isGrsai 分支 |
| `src/components/nodes/LLMNode.tsx` | 整个组件 | v1.8.0 起 fork 大量魔改，建议先看 upstream LLMNode 改动是否需要镜像到 fork |

### 4.2 LLMNode 合并策略（v1.8.0 起特别注意）

upstream 的 `LLMNode` 是单 provider 设计；fork 改造为多 provider TAB 切换。合并时：

1. **优先保留 fork 的 TAB 切换骨架**
2. upstream 对模型 / 预设 / UI 控件的改动 → 手工镜像到「直连」provider 分支
3. upstream 新增的 `LLM_MODELS` 项 → 自动包含（直接走 `getModelsByProvider('llm-direct')`）
4. upstream 改了流式 / 非流式调用方式 → 同步到 `generateLlm` / `generateLlmStream` 路径，**不要影响** Geeknow 路径

### 4.3 features.json phase 撞号处理

历史先例（v1.6.1 合并 upstream v1.5.7）：

- fork 自有 phase77 / 78 → upstream 也用了 phase77 / 78（不同 JSON key）
- 处理：fork 重命名为 phase80 / 81 → 让位给 upstream
- 教训：fork 新增 phase 编号建议**预留 5~10 个间隔**，给 upstream 增长空间

### 4.4 sentinel 围栏的好处

所有 fork 在共享文件中的修改都用 `>>> FORK-XYZ-START / <<< FORK-XYZ-END` 包裹。合并冲突时：

- 围栏内的代码就是 fork 自有内容，**全部保留**
- 围栏外冲突 → 上游改了 fork 没改的代码，**用上游版本**
- 围栏与上游改动交叉 → 手工合并，保持围栏闭合

---

## 5. 验收清单

合并 upstream 后必须跑通的检查项：

### 5.1 自动化验收

- [ ] `npm run type-check` 通过（无 TypeScript 错误）
- [ ] `npm run build` 通过（前端构建无错）
- [ ] `npm run encrypt`（如有 backend 改动）
- [ ] 后端启动无错（`npm run dev:backend`）

### 5.2 功能性验收

- [ ] **API 设置面板**：所有 provider 字段显示正常（贞贞、RH、七牛、Grsai、Geeknow）
- [ ] **七牛云生图**：选 `openai/gpt-image-2`，1K 比例 1:1 文生图成功
- [ ] **七牛云生图**：选 `gemini-3.1-flash-image-preview`，2K 比例 16:9 文生图成功
- [ ] **Grsai 生图**：选 `nano-banana-2`，1K 比例 1:1 文生图成功
- [ ] **Grsai 生图**：选 `gpt-image-2-vip`，2K 比例 1:1 文生图成功
- [ ] **LLM 直连**：选默认模型，发送 "你好" 流式响应正常
- [ ] **LLM Geeknow**：切换到 Geeknow TAB，选 `gemini-3.1-pro-preview` 流式响应正常
- [ ] **LLM Geeknow**：切换流式开关到「关」，非流式响应正常

### 5.3 持久化验收

- [ ] 关闭客户端再打开，所有 API Key 仍然脱敏显示
- [ ] 旧画布加载后所有 fork 节点（七牛 / Grsai 子模型 + LLM Geeknow TAB）状态正确

---

# 第二部分 · Provider 接入规范

## 6. 三种接入模式对比

| 模式 | 代表 provider | 节点 type | UI 接入点 |
|---|---|---|---|
| **图像 provider 模式** | qiniu / grsai | 共用 `image` | `ImageNode` 内嵌专属 Tab |
| **LLM provider 模式（v1.8.0+）** | geeknow | 共用 `llm` | `LLMNode` 内嵌 TAB 切换 |
| **独立节点模式（已废弃）** | ~~geeknow（v1.7.4）~~ | ~~`t8f-geeknow-llm`~~ | ~~独立 GeeknowLlmNode 组件~~ |

> v1.7.4 → v1.8.0 的演进：Geeknow 从独立节点模式迁移到 LLM TAB 切换模式，原因是用户反馈「两个相似节点 UI 不统一」。架构教训：**LLM provider 应优先复用 LLMNode 内的 TAB 切换**，独立节点仅在功能完全异质时才考虑。

## 7. 图像 provider 接入「四十分钟流程」

### Step 1 · 共享文件 sentinel 改动（不可避免）

参见 §2.2 共享文件清单。每处插 1-3 行，sentinel 包裹。

### Step 2 · 复制模板

```bash
cp -r src/integrations/qiniu src/integrations/<name>
```

需替换的位置（grep `Qiniu` / `qiniu` 全部替换）：
- 组件名 / props 接口字段 / API 服务函数名 / sizeMap 导出名
- 上游基址常量 `DEFAULT_QINIU_BASE` → `DEFAULT_<NAME>_BASE`
- 「获取 APIKey」外链改为该 provider 控制台 URL

### Step 3 · 比例 × 清晰度双控件（如适用）

参见 `src/integrations/README.md` 的「比例化 size 显示」章节。判断清单：
1. 上游文档明确列出至少 3 档清晰度官方推荐像素值
2. 上游 API 接受像素串
3. 同一比例不同档位 → 不同像素值
4. 文档预设表与计算公式混合

四点全部满足才做双控件。

## 8. LLM provider 接入流程（v1.8.0 模式）

### Step 1 · 共享文件改动

| 文件 | 改动 |
|---|---|
| `backend/src/routes/proxy.js` | 文件末尾 sentinel 围栏：`getXyzConfig` + `POST /llm-xyz`（SSE 透传） |
| `backend/src/routes/settings.js` | DEFAULT_SETTINGS 加 `xyzApiKey` + `xyzBaseUrl`；GET 路由 maskKey |
| `src/types/canvas.ts` `ApiSettings` | 加 `xyzApiKey?` + `xyzBaseUrl?` |
| `src/stores/apiKeys.ts` | 导出 `DEFAULT_XYZ_BASE`；DEFAULT 加字段 |
| `src/providers/models.ts` `ProviderType` | 加 `'xyz'` |
| `src/providers/models.ts` | 导出 `XYZ_LLM_MODELS` + `DEFAULT_XYZ_LLM_MODEL`；扩展 `getModelsByProvider` / `getDefaultModelForProvider` |
| `src/components/nodes/LLMNode.tsx` | TAB 按钮组加 XYZ；生成函数分流加 XYZ 分支 |
| `src/components/ApiSettings.tsx` | sentinel 围栏：import `<XyzSettingsSection>` / KeyField / emptyMap / state / effect / handleSave / JSX |

### Step 2 · 创建 integrations 目录

```
src/integrations/<name>/
├── <Name>SettingsSection.tsx   # API 设置面板独立块
└── run<Name>Llm.ts             # 服务层导出 generateXyzLlm / generateXyzLlmStream
```

### Step 3 · 测试矩阵

- [ ] 流式响应正确显示
- [ ] 非流式响应正确显示
- [ ] 模型切换不会导致预设跨 provider 串
- [ ] 切换 provider 时模型自动重置为默认值
- [ ] 多模态图像输入（vision 模型）正常

---

# 第三部分 · API 接口规范

## 9. 全局约定

| 项 | 值 |
|---|---|
| 前端开发端口 | `http://127.0.0.1:11422` |
| 后端 API 端口 | `http://127.0.0.1:18766` |
| Vite proxy | `/api`、`/files`、`/output`、`/input` 全部转发到后端 |
| 鉴权方式 | 全部 `Authorization: Bearer <ApiKey>` |
| Content-Type | 图像两家：`application/json`；LLM Geeknow：`application/json`（流式时 SSE） |
| 任务模式 | 图像两家「提交→异步任务 ID→轮询查询」三段式；LLM Geeknow 同步 / SSE |
| 轮询上限 | 图像 60 分钟（1800 × 2s）；LLM Geeknow 不轮询 |
| 前端字段命名 | 一律 **camelCase** |
| Key 隔离 | 每个 provider 独立 Key 字段，永不 fallback |
| 转存策略 | 图像上游返回 url/b64 由后端落盘到 `OUTPUT_DIR`，前端永远拿本地 `/files/output/` |

---

## 10. Grsai 接口规范

### 10.1 上游端点与认证

| 维度 | 值 |
|---|---|
| 国内端点（默认） | `https://grsai.dakka.com.cn` |
| 全球端点 | `https://grsaiapi.com` |
| 自定义反代 | 用户可在【API 设置 → Grsai Base URL】填写任意 https 反代 |
| 鉴权 Header | `Authorization: Bearer sk-xxxxxxxxxxx` |
| 控制台获取 Key | https://grsai.ai/zh/dashboard/api-keys |

### 10.2 路由清单

| HTTP 方法 | 路由 URL | 用途 |
|---|---|---|
| POST | `/api/proxy/grsai/image` | 同步包装：内部 submit + 60 分钟轮询 |
| POST | `/api/proxy/grsai/image/submit` | 异步提交，立即返回 `{ taskId, status:'pending' }` |
| GET | `/api/proxy/grsai/image/status/:tid` | 前端轮询状态 |

### 10.3 提交接口 — `POST {base}/v1/api/generate`

请求体：

```jsonc
{
  "model":      "<11 个模型之一>",
  "prompt":     "<提示词>",
  "replyType":  "async",                 // 后端固定写
  "aspectRatio": "auto | 1:1 | ... | 1024x1024",  // 驼峰
  "imageSize":  "1K | 2K | 4K",          // 仅 nano-banana 系列上送
  "images":     ["data:image/...;base64,...", "https://..."]  // 非空走图生图
}
```

响应（顶层无 `data` 包装）：

```jsonc
// 成功
{
  "id": "14-5f3cf761-...",
  "status": "succeeded",
  "results": [{ "url": "https://file1.aitohumanize.com/file/xxx.png" }],
  "progress": 100
}

// 失败 / 内容审核未通过
{ "id": "...", "status": "failed" | "violation", "error": "..." }
```

### 10.4 11 个支持模型清单

| 模型 ID | 系列 | aspectRatio | imageSize | 说明 |
|---|---|---|---|---|
| `nano-banana` / `-fast` | nano-banana | 通用 11 | 1K/2K/4K（上送） | 基础版 / 快速版 |
| `nano-banana-2` / `-cl` / `-4k-cl` | nano-banana-2 | 通用 11 + 4 极端 | 1K/2K/4K（上送） | 官方推荐 |
| `nano-banana-pro` / `-cl` / `-vip` / `-4k-vip` | nano-banana | 通用 11 | 1K/2K/4K（上送） | Pro 版 |
| `gpt-image-2` | gpt-image-2 | 通用 11 | ❌ 忽略 | 基础版 |
| `gpt-image-2-vip` | gpt-image-2 | 14 比例（去 auto + 加 4） | 1K/2K/4K（**本地查表，不上送**） | vip 版 |

**比例集合三类**：
- 通用 11：`auto, 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 5:4, 4:5, 21:9`
- nano-banana-2 额外 4 个极端：`1:4, 4:1, 1:8, 8:1`
- gpt-image-2-vip 14 个：去 `auto`，加 `1:3, 3:1, 2:1, 1:2`

### 10.5 vip 比例 × 清晰度策略

`gpt-image-2-vip` 必须传像素串（不接受比例字符串），由 `resolveGrsaiAspectRatio(ratio, apiModel, resolution)` 在 runner submit 前转换：

- 14 比例 × 3 档（1K/2K/4K）= 42 个文档预设值（`DOC_PRESETS_BY_RES`）
- 1:3 / 3:1 在 2K 档缺位，由 `computeVipSize(4MP)` 兜底
- 旧画布残留 `'auto'` 兜底到 `1024x1024`

### 10.6 状态归一化

| 上游 status | 后端识别集合 |
|---|---|
| 成功 | `succeeded` / `success` / `completed` / `done` |
| 失败（含违规） | `failed` / `failure` / `error` / `violation` |

**violation 归 failed 处理，但 `error` 文案必须透传给用户**（内容审核原因）。

---

## 11. 七牛云接口规范

### 11.1 上游端点与认证

| 维度 | 值 |
|---|---|
| 国内端点（默认） | `https://openai.qiniu.com` |
| 海外端点 | `https://openai.sufy.com` |
| 鉴权 Header | `Authorization: Bearer sk-xxx` |

### 11.2 路由清单

| HTTP 方法 | 路由 URL | 用途 |
|---|---|---|
| POST | `/api/proxy/qiniu/image` | 同步包装 |
| POST | `/api/proxy/qiniu/image/submit` | 异步提交 |
| GET | `/api/proxy/qiniu/image/status/:tid` | 状态查询 |

### 11.3 子模型分流（v1.6.2 起核心修复点）

`callQiniuImageUpstream()` 按 `model` 分流构造 body：

#### `openai/gpt-image-2`（OpenAI 兼容）

```jsonc
{
  "model":   "openai/gpt-image-2",
  "prompt":  "<提示词>",
  "quality": "auto",        // 顶层
  "size":    "1024x1024",   // 顶层，必须像素串或 'auto'
  "image":   ["data:..."]   // 仅 edits 模式
}
```

#### `gemini-3.1-flash-image-preview`（image_config 嵌套，v1.6.2 起）

```jsonc
{
  "model":  "gemini-3.1-flash-image-preview",
  "prompt": "<提示词>",
  "image_config": {                    // 嵌套对象，不是顶层
    "aspect_ratio": "16:9",            // 下划线
    "image_size":   "1K"               // 下划线
  },
  "image":  ["data:..."]               // 仅 edits 模式
}
```

> ⚠️ **关键修复**：v1.6.1 之前 `callQiniuImageUpstream` 把所有子模型按 OpenAI body 发，gemini 上游收到顶层 `size` 会**静默忽略**，导致比例参数不生效。v1.6.2 按 `model` 分流。

### 11.4 字段命名约定（外驼内蛇）

| 前端 / 后端代理字段 | 上游 OpenAI body | 上游 gemini body |
|---|---|---|
| `quality` | `quality`（顶层） | （忽略） |
| `size` | `size`（顶层） | （忽略） |
| `aspectRatio` | （忽略） | `image_config.aspect_ratio`（下划线） |
| `imageSize` | （忽略） | `image_config.image_size`（下划线） |

> 前后端字段名是 camelCase；只有写到 gemini 上游 body 才是 snake_case。这种「外驼内蛇」是 v1.6.2 修复的关键，**不要再做任何额外转换**。

---

## 12. Geeknow LLM 接口规范

### 12.1 上游端点与认证

| 维度 | 值 |
|---|---|
| 默认端点 | `https://www.geeknow.top` |
| 鉴权 Header | `Authorization: Bearer sk-xxx`（独立 `geeknowApiKey`） |
| 协议风格 | OpenAI Chat Completions 兼容 |

### 12.2 路由清单（v1.8.0）

| HTTP 方法 | 路由 URL | 用途 |
|---|---|---|
| POST | `/api/proxy/llm-geeknow` | 主推理（流式 / 非流式按 body.stream） |

> v1.8.0 起删除了 `GET /llm-geeknow/models` 路由（原用于动态拉模型列表，实际无用）。

### 12.3 模型清单（v1.8.0 精简版）

仅保留 5 个推理模型，**默认 `gemini-3.1-pro-preview`**：

| 模型 ID | 视觉支持 |
|---|---|
| `gpt-5.5` | ✓ |
| `gemini-3-pro-preview` | ✓ |
| `gemini-3.1-pro-preview` | ✓ **默认** |
| `gemini-3.5-flash` | ✓ |
| `deepseek-v4-pro` | ✗ |

### 12.4 请求体（OpenAI 兼容）

```jsonc
{
  "model":       "gemini-3.1-pro-preview",
  "messages":    [{"role": "user", "content": "..."}],
  "temperature": 0.7,
  "max_tokens":  4096,
  "stream":      true   // 走 SSE；false 走一次性 JSON
}
```

### 12.5 流式响应（SSE）

```
data: {"choices":[{"delta":{"content":"..."}}]}
data: {"choices":[{"delta":{"content":"..."}}]}
...
data: [DONE]
```

### 12.6 与原生 LLM 节点的关系（v1.8.0）

LLMNode 内部通过 TAB 切换：

```
┌──────────────────────────┐
│  [直连]    [Geeknow]     │  ← TAB 按钮组
├──────────────────────────┤
│  模型: <动态列表>          │
│  ...                     │
└──────────────────────────┘
```

- **直连**：调用 `generateLlm` / `generateLlmStream`（来自 `services/generation.ts`），路由 `/api/proxy/llm`
- **Geeknow**：调用 `generateGeeknowLlm` / `generateGeeknowLlmStream`（来自 `integrations/geeknow/runGeeknowLlm.ts`），路由 `/api/proxy/llm-geeknow`

预设系统按 provider 分开存储：
- 直连：`localStorage.t8-llm-sys-presets`
- Geeknow：`localStorage.t8f-geeknow-sys-presets`

---

## 13. 字段对照速查表

### 13.1 grsai：前端 camelCase ↔ 上游驼峰

| 前端 / runner | 后端代理 body | 上游 body | 上游 response |
|---|---|---|---|
| `apiModel` | `model` | `model` | — |
| `prompt` | `prompt` | `prompt` | — |
| `grsaiAspectRatio` | `aspectRatio` | `aspectRatio` | — |
| `grsaiImageSize` | `imageSize` | `imageSize`（仅 nano-banana） | — |
| 上游素材 → `images[]` | `images` | `images` | — |
| — | — | `replyType: 'async'` | — |
| — | — | — | `id` / `status` / `progress` / `results[].url` / `error` |

### 13.2 七牛：前端 camelCase ↔ 上游分流

| 前端 / runner | 后端代理 body | 上游（gpt-image-2） | 上游（gemini） |
|---|---|---|---|
| `apiModel` | `model` | `model` | `model` |
| `prompt` | `prompt` | `prompt` | `prompt` |
| `qiniuQuality` | `quality` | `quality`（顶层） | （忽略） |
| 比例 → 像素串 | `size` | `size`（顶层） | （忽略） |
| `qiniuSize` (UI 比例) | `aspectRatio` | （忽略） | `image_config.aspect_ratio` |
| `qiniuResolution` | `imageSize` | （忽略） | `image_config.image_size` |

### 13.3 Geeknow：OpenAI 兼容直透

| 前端 / runner | 后端代理 body | 上游 body |
|---|---|---|
| `model` | `model` | `model` |
| `messages` | `messages` | `messages` |
| `temperature` | `temperature` | `temperature` |
| `maxTokens` | `max_tokens` | `max_tokens` |
| `stream` | `stream` | `stream` |

---

## 14. 调试快捷链路

### 14.1 grsai 上游文档

| 内容 | 链接 |
|---|---|
| nano-banana 模型文档 | https://qmy27nhsd9.apifox.cn/452392911e0.md |
| gpt-image-2 模型文档 | https://qmy27nhsd9.apifox.cn/452409160e0.md |
| 查询接口文档 | https://qmy27nhsd9.apifox.cn/452409577e0.md |

### 14.2 七牛上游文档

| 内容 | 链接 |
|---|---|
| OpenAI 兼容文档 | 七牛云控制台 → AI 推理服务 |

### 14.3 Geeknow 上游文档

| 内容 | 链接 |
|---|---|
| 官方文档 | https://docs.geeknow.top |
| API Key 控制台 | https://www.geeknow.top |

### 14.4 cURL 验证

```bash
# Grsai
curl -X POST http://127.0.0.1:18766/api/proxy/grsai/image \
  -H 'Content-Type: application/json' \
  -d '{"model":"nano-banana-2","prompt":"test","aspectRatio":"1:1"}'

# 七牛
curl -X POST http://127.0.0.1:18766/api/proxy/qiniu/image \
  -H 'Content-Type: application/json' \
  -d '{"model":"openai/gpt-image-2","prompt":"test","size":"1024x1024"}'

# Geeknow（非流式）
curl -X POST http://127.0.0.1:18766/api/proxy/llm-geeknow \
  -H 'Content-Type: application/json' \
  -d '{"model":"gemini-3.1-pro-preview","messages":[{"role":"user","content":"hi"}],"stream":false}'
```

---

# 附录

## 附录 A · 变更记录（按 phase 追溯）

| Phase | 版本 | 关键变更 |
|---|---|---|
| phase80 | v1.5.8（fork） | 七牛 / Grsai 双 provider 接入；后端代理路由（60 分钟轮询）；11 比例 + sizeMap 映射 |
| phase81 | v1.5.9（fork） | 七牛 image-edits size 修复；vip 比例 × 清晰度双控件 + 14 × 3 档预设表 |
| phase82 | v1.6.1 | 合并 upstream v1.6.0；fork phase77/78 重命名为 phase80/81 避免撞号 |
| phase83 | v1.6.2 | 七牛 gemini 子模型 `image_config` 嵌套协议修复（按 model 分流构造 body） |
| phase84 | v1.7.0 | 合并 upstream main；fork 七牛 / grsai 完整保留 |
| phase96 | v1.7.4（fork） | Geeknow LLM 中转站接入（独立节点 `t8f-geeknow-llm`） |
| —— | v1.8.0（fork） | 合并 upstream v1.7.0~v1.7.4；建立 fork 版本策略；Geeknow 改为 LLMNode TAB 切换；删除独立节点 + 模型获取功能；模型瘦身到 5 个；默认模型 `gemini-3.1-pro-preview` |

## 附录 B · 常见问题（FAQ）

**Q1：grsai vip 模型的比例参数为什么必须是像素串？**
上游文档明确 `gpt-image-2-vip` 不接受 `auto` 比例和比例字符串，必须传像素串（如 `1024x1024`）。前端 `resolveGrsaiAspectRatio()` 自动按当前选中的比例 + 清晰度档查 `DOC_PRESETS_BY_RES` 表，未命中由 `computeVipSize()` 兜底。

**Q2：七牛 gemini 模型为什么 v1.6.1 之前比例不生效？**
v1.6.2 之前 `callQiniuImageUpstream` 把所有子模型按 OpenAI body 发（顶层 `size` / `quality`）。gemini 上游协议是 `image_config: { aspect_ratio, image_size }` 嵌套对象，收到顶层 `size` 会静默忽略。v1.6.2 按 `model` 分流修复。

**Q3：为什么 grsai 字段是驼峰、七牛 gemini 字段是下划线？**
两家上游文档命名风格不同。grsai 自有协议用驼峰；七牛 OpenAI 兼容子模型用顶层 `size` / `quality`（OpenAI 风格），七牛 gemini 子模型用 `image_config.{aspect_ratio,image_size}`（Google 风格）。前端统一 camelCase，后端按 model 分流时只对 gemini 做命名转换。

**Q4：参考图最多能传几张？**
两家前端都设 `maxReferenceImages: 4`。

**Q5：60 分钟轮询上限为什么定这么长？**
grsai vip 4K / 七牛 gemini 4K 的极端比例任务实测耗时可达 5~10 分钟，预留 6× 安全冗余。

**Q6：Geeknow 为什么 v1.7.4 用独立节点，v1.8.0 又合并到 LLMNode TAB？**
v1.7.4 时考虑到与上游 LLMNode 解耦，采用独立节点 `t8f-geeknow-llm` 模式。但实际使用中：
1. 用户需要在 Sidebar 中选择不同的节点卡片，UI 不够统一
2. 两个节点功能高度重叠，维护成本翻倍

v1.8.0 改为 TAB 切换：节点顶部「直连 / Geeknow」按钮组 + 动态模型列表 + 不同生成函数路由。删除独立节点类型，由 fork 版本策略保证不影响旧画布（fork 直接分发新版本）。

**Q7：为什么 Geeknow 默认模型从 gpt-4o-mini 改成 gemini-3.1-pro-preview？**
v1.8.0 模型瘦身到 5 个推理模型时，按用户偏好选 `gemini-3.1-pro-preview` 作为默认。该模型：
- 性能强（Gemini 3.1 Pro Preview）
- 多模态支持（vision: true）
- 长上下文（2M）
- 在 Geeknow 中转站中性价比合理

**Q8：Geeknow 删除「刷新模型列表」功能的原因？**
该功能调 `/v1/models` 端点拉取全集，但实际上：
1. Geeknow 上游模型列表频繁变动，用户更倾向于使用稳定的 5 个推理模型
2. 动态模型列表写入 localStorage，不同设备 / 浏览器之间数据不一致
3. 用户实际从未使用过该按钮（v1.8.0 调研结论）

v1.8.0 删除：前端按钮 + 后端 `/llm-geeknow/models` 路由 + `fetchGeeknowModels` 服务函数 + `localStorage.t8f-geeknow-dynamic-models` 缓存。

---

> **维护提示**：
> 1. 上游协议有变更时，按本文档第三部分排错流程图重新验证一遍
> 2. 同步更新 `src/integrations/{grsai,qiniu,geeknow}/` 隔离层 + `features.json` 新增 phase 编号 + 各模块 README
> 3. 合并 upstream 后**必须**递增 fork 版本号（永远领先 upstream 一个次版本号）
> 4. fork 自有的功能 / 文档变更要同步更新 `CLAUDE.md` 变更记录