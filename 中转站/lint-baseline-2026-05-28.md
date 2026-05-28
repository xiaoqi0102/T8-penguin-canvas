# ESLint 基线报告（2026-05-28）

> 本文档记录 fork 仓库引入 ESLint 后的首次 lint 基线，未对历史代码做任何修复。
> 适用范围：T8-penguin-canvas fork（含七牛云 / Grsai 图像 provider 自有扩展）。

---

## 一、背景

- **fork 关系**：本仓库 fork 自 [T8mars/T8-penguin-canvas](https://github.com/T8mars/T8-penguin-canvas)。
- **fork 自有改动**：仅在 `src/integrations/qiniu/**`、`src/integrations/grsai/**`、`backend/src/routes/proxy.js`（七牛/grsai 段，约 2166–2629 行）、`features.json` 中新增了七牛云和 Grsai 两个图像 provider 的接入。
- **本次任务**：用户希望让 `npm run lint` 能跑起来。在 fork 上安装 ESLint v8 + 写最小 `.eslintrc.cjs`，得到首次 lint 基线。
- **本次七牛/grsai 修复（同日）**：图生图 size bug 修复 + 1K/2K/4K 清晰度档接入，详见 `C:/Users/Admin/.claude/plans/1-2-compiled-panda.md`。
- **本次 ESLint 引入不修任何业务代码**，只记录现状供后续决策。

---

## 二、ESLint 安装清单

### `package.json > devDependencies` 新增

| 包 | 版本 | 用途 |
|---|---|---|
| `eslint` | `^8.57.1` | 核心（v8 与现有 `--ext ts,tsx` lint script 兼容） |
| `@typescript-eslint/parser` | latest | TS 解析器 |
| `@typescript-eslint/eslint-plugin` | latest | TS 规则集 |
| `eslint-plugin-react` | latest | React JSX 规则 |
| `eslint-plugin-react-hooks` | v5（React 19 配套） | Hooks 规则 + React 19 编译期检查 |
| `eslint-plugin-react-refresh` | `0.4.x` | Vite Fast Refresh 友好性检查（最新版要求 ESLint v9，故锁 0.4） |

注：`npm install` 报 11 high severity vulnerabilities（依赖链里的，未处理；建议日后单独跑 `npm audit fix` 评估）。

### 配置文件 `.eslintrc.cjs`

- 已添加到仓库根（与现有 `lint` script `eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0` 100% 兼容）。
- **关闭的规则**：`@typescript-eslint/no-explicit-any` / `ban-ts-comment` / `no-namespace` / `react/react-in-jsx-scope` / `react/prop-types` / `react/no-unescaped-entities` / `react-hooks/set-state-in-effect` / `react-hooks/refs` / `jsx-a11y/alt-text`（后三条是 React 19 / a11y 新规则，仓库未按其约束写）。
- **保留 warn 级**：`@typescript-eslint/no-unused-vars`（允许 `_` 前缀） / `react-hooks/exhaustive-deps` / `react-refresh/only-export-components` / `no-empty`（允许空 catch） / `no-useless-escape`。
- **ignore**：`dist/` / `dist_electron/` / `build/` / `node_modules/` / `backend/` / `electron/` / `data/` / `input/` / `output/` / `thumbnails/` / `public/` / `zzenv/` / `*.config.{ts,js}` / `*.cjs` / `*.mjs`。

---

## 三、lint 结果总览

```
✖ 60 problems (14 errors, 46 warnings)
```

- 涉及文件：30 个 `.tsx` / `.ts`
- **Fork 自有目录（`src/integrations/qiniu/**`、`src/integrations/grsai/**`）：0 个问题** ✅
- 上游遗留目录（`src/components/**`、`src/hooks/**`、`src/providers/**`、`src/utils/**`）：60 个问题（全部）

---

## 四、Errors 清单（14 个 · 全部上游遗留）

| 文件 | 位置 | 规则 | 描述 |
|---|---|---|---|
| `src/components/Canvas.tsx` | 1062:13 | `prefer-const` | `let s` 从未重新赋值 |
| `src/components/Canvas.tsx` | 1063:13 | `prefer-const` | `let t` 从未重新赋值 |
| `src/components/ErrorBoundary.tsx` | 34:5 | Unused eslint-disable | 无效的 `// eslint-disable ... no-console` 注释 |
| `src/components/nodes/GroupBoxNode.tsx` | 164:18 | react-hooks（v5 编译检查） | Cannot access variable before declared |
| `src/components/nodes/GroupBoxNode.tsx` | 189:5 | react-hooks（v5 编译检查） | Compilation Skipped: Existing memoization could not be preserved |
| `src/components/nodes/ImageEditModal.tsx` | 307:5 | Unused eslint-disable | `react-hooks/exhaustive-deps` |
| `src/components/nodes/ImageEditModal.tsx` | 361:5 | Unused eslint-disable | `react-hooks/exhaustive-deps` |
| `src/components/nodes/ImageEditModal.tsx` | 1053:5 | Unused eslint-disable | `react-hooks/exhaustive-deps` |
| `src/components/nodes/ImageEditModal.tsx` | 630:26 | react-hooks（v5 编译检查） | Cannot access variable before declared |
| `src/components/nodes/ImageEditModal.tsx` | 2030:24 | `jsx-a11y/alt-text` | Definition for rule was not found（disable 注释指向未装的插件） |
| `src/components/nodes/ImageEditModal.tsx` | 2305:14 | `jsx-a11y/alt-text` | 同上 |
| `src/components/nodes/MaterialPreviewSection.tsx` | 88:51 | react-hooks（v5 编译检查） | Cannot call impure function during render |
| `src/components/nodes/TextSplitNode.tsx` | 213:7 | Unused eslint-disable | `no-new` |
| `src/components/nodes/UploadNode.tsx` | 137:38 | `no-irregular-whitespace` | 字符串中有不规则空白字符 |

**Errors 分类**
- 6 个：`Unused eslint-disable directive`（删 disable 注释即可，0 风险）
- 4 个：`react-hooks` v5 编译期错误（React 19 新检查，需重构代码或加 disable）
- 2 个：`prefer-const`（一行改字即可）
- 2 个：`jsx-a11y/alt-text` 规则未定义（删 disable 注释 或 装 `eslint-plugin-jsx-a11y`）
- 1 个：`no-irregular-whitespace`（替换不可见字符）

---

## 五、Warnings 清单（46 个 · 全部上游遗留）

### 按规则汇总

| 规则 | 数量 | 涉及文件（去重） |
|---|---|---|
| `react-hooks/exhaustive-deps` | 21 | `ThemeMusicToggle`, `BpNode`, `FrameExtractorNode`, `ImageCompareNode`, `ImageNode`, `LLMNode`, `OutputNode`, `PortraitMetadataNode`, `RHToolsNode`, `RelayNode`, `SeedanceNode`, `StoryboardGridNode`, `VideoNode`, `VideoOutputNode`, `useMaterialDropTarget` |
| `@typescript-eslint/no-unused-vars` | 21 | `ImageEditModal`, `ImageNode`, `LLMNode`, `LoopNode`, `MaterialPreviewSection`, `PickFromSetNode`, `RunningHubNode`, `ToolboxParamNode`, `VideoNode`, `nodePlacement` |
| `no-useless-escape` | 2 | `MentionPromptInput`（行 60 `\(` `\[`） |
| `react-refresh/only-export-components` | 2 | `RHToolsProvider`（行 184、191 导出了非组件） |

### `react-hooks/exhaustive-deps` 典型样本

- `ImageNode.tsx:134` — `refImages` 在条件表达式里，可能让 useMemo 依赖每次变化
- `LLMNode.tsx:406` — `useLayoutEffect` 缺依赖数组，可能死循环更新
- `SeedanceNode.tsx:91-93` — `localRefImages/Videos/Audios` 在条件表达式
- `RHToolsNode.tsx:120-121` — `categories` / `tools` 逻辑表达式造成 useMemo 依赖每次变化

### `@typescript-eslint/no-unused-vars` 典型样本

- `LLMNode.tsx`: `ImageIcon`、`X`、`upstreamImages`、`removePickedAt`、`handleColor`
- `ImageEditModal.tsx`: `ImageIconLucide`、`RotateCw`、`c`、`err`
- `ToolboxParamNode.tsx`: `Crosshair`、`chipClass`、`miniControlActiveStyle`
- `VideoNode.tsx`: `getEdges`、`getNodes`
- `nodePlacement.ts`: `computeAdaptiveStep`、`e`

---

## 六、修复策略建议

### Fork 自有代码（`src/integrations/qiniu/**`、`src/integrations/grsai/**`）

- **现状**：0 问题 ✅
- **守则**：未来扩展该目录时，必须保持 0 errors / 0 warnings。

### 上游遗留问题（其余全部）

**不建议在 fork 上直接修复**，原因：
1. 修改上游代码会让未来 `merge upstream` 产生冲突（参考根 `CLAUDE.md` §八「不要随意 git pull --rebase」）。
2. 这些是源仓库 [T8mars/T8-penguin-canvas](https://github.com/T8mars/T8-penguin-canvas) 的代码质量问题，应由上游或 PR 贡献者处理。

**可选处理路径**：

| 方案 | 操作 | 收益 | 代价 |
|---|---|---|---|
| **A. 维持现状** | 不动代码也不动配置；`npm run lint` 非零退出当作已知基线 | 0 风险；fork 与上游 100% diff 干净 | CI 若强制 lint 会挂；本地开发可手动跳过 |
| **B. 配置降级** | `.eslintrc.cjs` 加 `overrides` 给 `src/components/**`、`src/hooks/**`、`src/providers/**`、`src/utils/**` 关闭报错规则；或去掉 lint script 的 `--max-warnings 0` | `npm run lint` 通过；fork 不动代码 | 上游问题被永久屏蔽，新增问题也看不到 |
| **C. 向上游反馈** | 给 [T8mars/T8-penguin-canvas](https://github.com/T8mars/T8-penguin-canvas) 提 issue / PR | 根本解决 | 需要上游配合 |
| **D. 在 fork 上修** | 直接改代码 | lint 通过 | 与上游 merge 会冲突；维护成本高 |

**当前选择**：A（已记录基线）。

---

## 七、重现命令

```bash
# 安装依赖（首次）
npm install --save-dev eslint@8 @typescript-eslint/parser @typescript-eslint/eslint-plugin \
  eslint-plugin-react eslint-plugin-react-hooks eslint-plugin-react-refresh@0.4

# 跑 lint（输出会显示 14 errors + 46 warnings）
npm run lint

# 把完整输出存档
npm run lint > lint-report.txt 2>&1

# 按规则汇总
grep -E "^\s+[0-9]+:[0-9]+\s+(error|warning)" lint-report.txt | \
  awk '{print $NF}' | sort | uniq -c | sort -rn
```

---

## 八、相关文件

| 路径 | 角色 | 已 commit? |
|---|---|---|
| `.eslintrc.cjs` | ESLint 配置（本次新增） | 待你决定是否 commit |
| `package.json` | devDependencies 新增 6 个 ESLint 包 | 待你决定 |
| `package-lock.json` | 锁定上述新依赖 | 同上 |
| `中转站/lint-baseline-2026-05-28.md` | 本文档 | 同上 |
| `C:/Users/Admin/.claude/plans/1-2-compiled-panda.md` | 同日七牛 size bug 修复方案 | （在 Claude 本地，不入仓） |

---

## 九、变更记录

| 日期 | 变更 |
|---|---|
| 2026-05-28 | 首次 lint 基线（14 errors + 46 warnings，全部上游遗留；fork 自有目录 0 问题） |
