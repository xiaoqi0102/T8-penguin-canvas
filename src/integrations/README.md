# integrations/ · 第三方中转站 / API Provider 接入隔离层

> 目的：把每个第三方 provider 的改动**集中**到独立子目录，让上游主项目（fork 来源）更新时合并冲突最小化。
>
> 工作流：fork → 加 provider → 上游更新 → `git merge upstream/main` → 几乎零冲突（已在 v1.5.5 三路合并实战验证）。

---

## 目录现状

```
src/integrations/
├── qiniu/                          # 七牛云 AI 图像（v1.5.6 首个示例，OpenAI 兼容协议）
│   ├── QiniuSettingsSection.tsx    # API 设置弹窗中独立的 Key + baseUrl 块
│   ├── QiniuImageTab.tsx           # ImageNode 内的 quality + size 专属面板
│   └── runQiniuImage.ts            # 提交 + 轮询的纯函数
└── grsai/                          # Grsai 中转站（v1.5.6 第二个验证案例，自有协议）
    ├── GrsaiSettingsSection.tsx    # API 设置弹窗中独立的 Key + baseUrl 块
    ├── GrsaiImageTab.tsx           # ImageNode 内的 aspectRatio + imageSize 面板
    ├── runGrsaiImage.ts            # 提交 + 轮询的纯函数
    └── README.md                   # 上游协议镜像 + 模型清单
```

---

## Provider 协议特征对照表

接入新中转站之前先把它的协议跟下表对照，能快速判断「直接复制 qiniu 模板就能用」还是「需要参考 grsai 的自有协议处理」。

| 维度 | qiniu | grsai |
|---|---|---|
| 上游路径 | `/v1/images/generations` + `/v1/images/edits` + `/v1/images/tasks/{tid}` | 统一 `/v1/api/generate` + `/v1/api/result?id=` |
| 文 / 图生图分流 | 路径不同（generations vs edits） | 路径一致，靠 `images` 数组是否空区分 |
| 字段命名风格 | OpenAI 下划线 `size` / `quality` | 驼峰 `aspectRatio` / `imageSize` / `replyType` |
| 异步标志 | 上游自决（路径加 `?async=true` 或上游识别） | 显式请求体 `replyType: "async"` |
| 状态枚举 | `succeed` / `processing` / `failed` | `succeeded` / `running` / `failed` / `violation` |
| 响应包装 | 顶层带 `data:{status,...}` 二层结构 | 直接顶层 `{id, status, results}` |
| 端点切换 | 国内 `openai.qiniu.com` / 海外 `openai.sufy.com` | 国内 `grsai.dakka.com.cn` / 全球 `grsaiapi.com` |
| 默认提交模式 | 上游 `?async=true` 直接异步 | 后端代理默认 `replyType=async` |
| 认证 Header | `Authorization: Bearer sk-xxx` | `Authorization: Bearer sk-xxx` |

**接入新 provider 时务必填一行进表**，让后续接入者能快速对比。

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
| `src/components/nodes/ImageNode.tsx` | 导入 `XyzImageTab` + `runXyzImage`；`isXyz` 标志；`switchModel` 加 else-if 分支；UI 条件加 `!isXyz`；插入 `<XyzImageTab>`；`handleGenerate` 加 `if (isXyz) return runXyzImage(...)`（全部 sentinel） | 5 个 sentinel 块 |
| `features.json` | `modelRegistry.image` 数组末尾追加注册项 | 紧贴 qiniu 注册项 |

### Step 2 · 复制 `qiniu/` 目录为模板（核心改动 95% 在此目录内）

```bash
cp -r src/integrations/qiniu src/integrations/xyz
# 然后逐文件改：
#   QiniuSettingsSection.tsx → XyzSettingsSection.tsx
#   QiniuImageTab.tsx        → XyzImageTab.tsx
#   runQiniuImage.ts         → runXyzImage.ts
```

需要改的位置（grep `Qiniu` / `qiniu` 全部替换）：
- 组件名 `QiniuSettingsSection` → `XyzSettingsSection` 等
- import 路径
- props 接口字段（`qiniuApiKeyInput` → `xyzApiKeyInput` 等）
- API 服务函数名（`submitQiniuImage` → `submitXyzImage`）
- 上游基址常量 `DEFAULT_QINIU_BASE` → `DEFAULT_XYZ_BASE`
- 文案 / 圆点配色（qiniu = `bg-sky-400`、grsai = `bg-violet-400`，新 provider 选一个未用的色）
- 外链「获取 APIKey」改为该 provider 的控制台 URL

### Step 3 · 接通 ImageNode handleGenerate

在 `runXyzImage.ts` 中实现：
- `submit + 轮询`（取决于上游协议是同步、异步、还是 FAL queue 等其他形态）
- 日志埋点 `logBus.{info|success|debug|error}`
- 写回节点 data：`status / progress / imageUrl / lastPrompt / usedI2I`

### 「以 grsai 接入为例」的完整路径示范

| 阶段 | 文件 | 一句话动作 |
|---|---|---|
| 抓 API 文档 | `中转站/grsai-llms.txt` 提取 nano-banana / gpt-image-2 / result 三个文档；firecrawl 拿到 yaml 规格 | — |
| 后端基础 | `backend/src/config.js` 加 `GRSAI_BASE_URL`；`settings.js` 加 `grsaiApiKey/grsaiBaseUrl` + 脱敏 | 6 行 |
| 后端代理 | `proxy.js` 末尾追加 `loadGrsai/refToGrsai/callGrsai/pollGrsai/normalizeGrsai` 5 个辅助 + 3 个 router 路由 | ≈220 行集中追加 |
| 类型 / 常量 / 服务 | `canvas.ts` / `apiKeys.ts` / `generation.ts` 各加几行 | < 50 行 |
| 模型注册 | `models.ts` ProviderType+ImageParamKind 加 `'grsai'`；IMAGE_MODELS 末尾加 grsai 条目（11 个 model） | ≈40 行 |
| 集成层 | 新建 `src/integrations/grsai/` 三个文件 + README | ≈400 行 |
| 父组件插入 | `ApiSettings.tsx` 6 处 sentinel；`ImageNode.tsx` 5 处 sentinel | ≈30 行散插 |
| 文档 | `features.json` 加注册项；本 README 加对照表行 | < 10 行 |

---

## 设计规范

### 每个 `integrations/<name>/` 必须只产出三类导出

| 文件命名 | 角色 | 父组件中的调用形式 |
|---|---|---|
| `<Name>SettingsSection.tsx` | API 设置弹窗中独立的 Key + baseUrl 块（含外链、端点切换按钮） | `<XyzSettingsSection ... />` |
| `<Name>ImageTab.tsx`（或 `<Name>VideoTab.tsx` 等） | 节点内的专属参数面板 | `{isXyz && <XyzImageTab d={d} update={update} ... />}` |
| `run<Name>Image.ts`（或 `run<Name>Video.ts` 等） | 提交 + 轮询 + 写回 node data；纯函数，不依赖任何 React | `if (isXyz) await runXyzImage({...})` |

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

| 文件 / 位置 | qiniu | grsai |
|---|---|---|
| `backend/src/config.js` | `QINIU_BASE_URL: 'https://openai.qiniu.com'` | `GRSAI_BASE_URL: 'https://grsai.dakka.com.cn'` |
| `backend/src/routes/settings.js` DEFAULT_SETTINGS | `qiniuApiKey` + `qiniuBaseUrl` | `grsaiApiKey` + `grsaiBaseUrl` |
| `backend/src/routes/proxy.js` | 七牛云块（5 辅助 + 3 路由 `/qiniu/image[/submit|/status/:tid]`） | grsai 块（5 辅助 + 3 路由 `/grsai/image[/submit|/status/:tid]`） |
| `src/types/canvas.ts` ApiSettings | `qiniuApiKey?` / `qiniuBaseUrl?` | `grsaiApiKey?` / `grsaiBaseUrl?` |
| `src/stores/apiKeys.ts` | `DEFAULT_QINIU_BASE` | `DEFAULT_GRSAI_BASE` |
| `src/services/generation.ts` | `submitQiniuImage` / `queryQiniuImageStatus` | `submitGrsaiImage` / `queryGrsaiImageStatus` |
| `src/providers/models.ts` ProviderType | 加 `'qiniu'` | 加 `'grsai'` |
| `src/providers/models.ts` ImageParamKind | 加 `'qiniu'` | 加 `'grsai'` |
| `src/providers/models.ts` IMAGE_MODELS | 追加 id=`'qiniu'` 条目 | 追加 id=`'grsai'` 条目 |
| `ApiSettings.tsx` KeyField | 加 `'qiniuApiKey'` | 加 `'grsaiApiKey'` |
| `ApiSettings.tsx` CUSTOM_PROVIDER_FIELDS | 含 `'qiniuApiKey'` | 含 `'grsaiApiKey'` |
| `ApiSettings.tsx` state | `qiniuBaseUrlInput` | `grsaiBaseUrlInput` |
| `ApiSettings.tsx` useEffect 回填 | `setQiniuBaseUrlInput(...)` | `setGrsaiBaseUrlInput(...)` |
| `ApiSettings.tsx` handleSave 对比 | `qiniuBaseUrl` 比较 | `grsaiBaseUrl` 比较 |
| `ApiSettings.tsx` JSX 渲染 | `<QiniuSettingsSection ... />` | `<GrsaiSettingsSection ... />` |
| `ImageNode.tsx` import | `QiniuImageTab` + `runQiniuImage` | `GrsaiImageTab` + `runGrsaiImage` |
| `ImageNode.tsx` 标志位 | `isQiniu` | `isGrsai` |
| `ImageNode.tsx` switchModel | `paramKind === 'qiniu'` 分支 | `paramKind === 'grsai'` 分支 |
| `ImageNode.tsx` handleGenerate | `if (isQiniu) return runQiniuImage(...)` | `if (isGrsai) return runGrsaiImage(...)` |
| `ImageNode.tsx` UI 比例条件 | `!isFal && !isMj && !isQiniu` | 同条件再加 `&& !isGrsai` |
| `ImageNode.tsx` JSX 面板 | `{isQiniu && <QiniuImageTab .../>}` | `{isGrsai && <GrsaiImageTab .../>}` |
| `features.json` | `modelRegistry.image` 末尾加 qiniu 注册项 | 末尾再加 grsai 注册项 |

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

**Q7：gpt-image-2-vip 的「必须传像素串、不接受比例字符串」怎么处理？**
`GrsaiImageTab.tsx` 内根据当前 `apiModel` 是否匹配 `/^gpt-image-2.*vip$/i` 动态切换候选：vip 模型只列像素串预设（1024x1024、2048x2048、2880x2880、3840x2160 等）；普通 gpt-image-2 同时列比例 + 像素串；nano-banana 系列额外允许 1:4/4:1/1:8/8:1。

**Q8：grsai 的 `imageSize` 是只 nano-banana 系列识别吗？怎么避免误传？**
`runGrsaiImage.ts` 内用 `isNanoBananaSeries(model)` 判断，**仅当 model 以 `nano-banana` 开头才把 imageSize 加进 request**；gpt-image-2 系列不带该字段。后端 `callGrsaiImageUpstream` 也会兜底跳过空字段。
