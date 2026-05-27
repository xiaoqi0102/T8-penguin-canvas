[根目录](../CLAUDE.md) > **electron**

# electron · Electron 33 桌面端打包与加密装载

> 范围：`d:\T8-penguin-canvas\electron\**`  ·  入口：`electron/main.cjs`
>
> 角色：Windows NSIS 桌面端打包；Electron 内置 Node 同进程拉起 Express 后端；bytenode + T8ENC1 二次加密保护后端字节码；IPC 桥接前端与系统能力。

---

## 一、模块职责

1. **主进程**（`main.cjs`）：拉起后端 Express 同进程 / 子进程、创建 BrowserWindow 加载前端 SPA、IPC 处理、端口探测/重试
2. **加密装载**（`loader.cjs`）：内存解密 `.t8c` 字节码、复刻 bytenode `.jsc` 加载逻辑、MODULE_NOT_FOUND 兜底回退到 app.asar/node_modules
3. **加密脚本**（`encrypt.cjs`）：用 Electron 内置 Node 跑 `bytenode` 编译 `.jsc`，再 T8ENC1（AES-256-CBC）二次加密为 `.t8c`
4. **打包后置校验**（`_post_build.cjs`）：验 11 个 `.t8c` 必存、`resources/frontend/index.html` + assets 必存、主题音乐资源完整、清除明文 `src/` 残留、扫描充值密钥泄漏（用户分发包安全闸）
5. **预加载**（`preload.cjs`）：白名单 IPC 桥接（窗口控制、外部链接、版本号、日志）

---

## 二、入口与启动

### 2.1 `electron/main.cjs`（主进程）

启动顺序：
1. `app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors')` 规避 GPU 沙盒延迟
2. `app.whenReady()` → 探测后端端口（默认 18766，被占则 +1 重试 20 次）
3. 注入环境变量：`T8PC_PACKAGED` / `T8PC_USER_DATA` = `app.getPath('userData')` / `T8PC_FRONTEND_DIST` = `path.join(process.resourcesPath, 'frontend')` / `T8PC_RES` = `process.resourcesPath`
4. **同进程加载后端**：require `./loader.cjs` 注册 `.t8c` hook → require backend-enc/server.t8c → Express 启动监听
5. 创建 BrowserWindow，`loadURL('http://127.0.0.1:18766')`（后端已托管前端 SPA）
6. 创建独立日志窗口（`logBuffer` 500 条回环 + `executeJavaScript` 追加显示）
7. 注册 IPC：版本号 / 打开外部链接（HTTP/HTTPS 白名单） / 日志窗口控制

### 2.2 `electron/loader.cjs`（关键 · 加密装载）

注册 Node `.t8c` 文件扩展 require hook：
1. 读取 `.t8c` 二进制 → 调用 T8ENC1 解密（密钥派生自 appId）
2. 得到 `.jsc` 字节码 → 复刻 bytenode 内置 `.jsc` loader：
   - `generateScript` 生成 dummy JS（`fixBytecode` 按 Node 版本拷贝字节码 flag 区）
   - `vm.Script` + `cachedData` 在原始 `.t8c` fileModule 上下文 `runInThisContext`
   - 手动 apply CommonJS wrapper `(exports, require, module, __filename, __dirname, process, global)`
3. **MODULE_NOT_FOUND 兜底**：自定义 `req(id)` 包装 `fileModule.require`，捕获错误时回退到 `loader.cjs` 自身的 `require`（loader 在 app.asar 内，可解析 app.asar/node_modules 的 express/cors/multer/sharp）

> 这是 `phase27` 三处根因修复的核心：原方案写 Temp/.jsc 二次 require 会导致 `fileModule.paths` 沿 Temp 路径向上查找，找不到 asar 内的 express。新方案直接在原始 .t8c 上下文执行，避免 paths 错位。

### 2.3 `electron/encrypt.cjs`（加密脚本）

`npm run encrypt` = `cross-env ELECTRON_RUN_AS_NODE=1 electron electron/encrypt.cjs`

- 必须用 Electron 内置 Node（V8 字节码版本对齐）
- 输出 `build/backend-enc/*.t8c`（11 个文件 = server + config + routes/{canvas,settings,proxy,files,imageOps,recharge,resources,themes} + utils/duckPayload）
- 流程：`backend/src/*.js` → bytenode compile `.jsc` → T8ENC1 AES-256-CBC 加密 → `.t8c`

### 2.4 `electron/_post_build.cjs`（打包后置校验）

`electron-builder` 完成后自动执行：

**必跑校验项**：
- ✅ 11 个 `.t8c` 必存（server / config / 8 routes / duckPayload）
- ✅ `resources/frontend/index.html` + `resources/frontend/assets/` 必存
- ✅ `src/assets/theme-music/*.mp3` 经 Vite 输出到 `resources/frontend/assets`
- ✅ 自动清除任何意外混入的 `resources/{app,backend}/src` 明文目录
- ⚠️ **充值密钥安全闸**：扫描 `RECHARGE_DEFAULT_ENC`/`AGENT_HMAC_KEY`/`DULUPAY_KEY` 非空 / `resources/data/recharge.private.json` 存在 / 遗留 ZZENC1 密文 → 任一发现立即 fail，用户分发包不得携带

### 2.5 `electron/preload.cjs`（IPC 桥接）

`contextBridge.exposeInMainWorld('t8pc', { ... })`：版本号、`openExternal(url)`（HTTP/HTTPS 白名单）、日志窗口操作。**禁止暴露任意 require**。

---

## 三、对外接口（与 npm scripts 对应）

| 命令 | 作用 |
|---|---|
| `npm run electron:dev` | `cross-env T8PC_PACKAGED=0 electron electron/main.cjs`，开发模式（前端走 11422 Vite） |
| `npm run encrypt` | 用 Electron 内置 Node 调 `encrypt.cjs` 出 `build/backend-enc/*.t8c` |
| `npm run prepack:enc` | `vite build` + `encrypt`，出 `dist/` 前端 + `build/backend-enc/` 后端密文 |
| `npm run dist:dir` | `prepack:enc` + `electron-builder --win --x64 --dir` + `_post_build.cjs`，仅出 win-unpacked 目录 |
| `npm run dist` | 同上但出最终 NSIS 安装包 `dist_electron/T8-PenguinCanvas-Setup-<version>.exe` |

---

## 四、关键依赖与配置

### 4.1 `package.json` Electron 相关
- `electron ^33.4.11` — 主框架
- `electron-builder ^25.1.8` — 打包（`build.appId = cn.t8star.penguin-canvas`、`productName = T8-PenguinCanvas`）
- `bytenode ^1.5.7` — JS → V8 字节码编译
- `cross-env ^7.0.3` — Windows/Unix 通用环境变量
- `concurrently ^9.0.0` — `npm run dev` 同时拉前后端

### 4.2 `package.json` 的 `build` 配置（关键片段）

| 字段 | 值 / 说明 |
|---|---|
| `compression` | `store`（无压缩，加快启动） |
| `asar` | `true` |
| `asarUnpack` | `node_modules/sharp/**`、`node_modules/@img/**`（sharp 原生模块必须解包） |
| `files` | 包含 `electron/{main,preload,loader}.cjs` + `package.json` + `node_modules/**`；**排除** `electron-builder` 自身、`*.md`、`*.ts`、`*.map`、`*.d.ts`、`test/`、`docs/`、`backend/src/`（防明文泄漏）、`src/`、`data/`、`input/`、`output/`、`thumbnails/`、`dist_electron/`、`build/` |
| `extraResources` | `build/backend-enc → resources/backend-enc/`、`dist → resources/frontend/`（**asar 外**，运行时可读） |
| `win.target` | `nsis x64` |
| `win.artifactName` | `${productName}-Setup-${version}.${ext}` |
| `nsis` | `oneClick: false`、`perMachine: false`、`allowToChangeInstallationDirectory: true`、`deleteAppDataOnUninstall: false`、`shortcutName: 贞贞的无限画布`、桌面+开始菜单快捷方式 |

### 4.3 安装位置与数据位置

- 应用安装：用户可选目录（NSIS 弹窗）
- 用户数据：`%APPDATA%/t8-penguin-canvas/`（`app.getPath('userData')` 派生）
- 卸载不删数据（`deleteAppDataOnUninstall: false`），用户主动清理

---

## 五、数据模型（产物拓扑）

```
dist_electron/T8-PenguinCanvas-Setup-<ver>.exe   # NSIS 安装包
  → win-unpacked/
      ├── T8-PenguinCanvas.exe                   # 主程序
      ├── resources/
      │   ├── app.asar                            # 含 electron/{main,loader,preload}.cjs + node_modules + package.json
      │   ├── app.asar.unpacked/node_modules/sharp/  # 原生模块解包区
      │   ├── backend-enc/                        # 11 个 .t8c 后端密文 (asar 外)
      │   └── frontend/                           # dist/ 前端 SPA + 主题音乐 mp3 (asar 外)
      ├── *.dll                                   # Electron 运行时
      └── locales/                                # i18n
```

---

## 六、测试与质量

- ✅ **打包后必跑实测**：启动 `win-unpacked/T8-PenguinCanvas.exe`，检查日志窗：
  - `[backend] started in-process on http://127.0.0.1:18766`
  - `环境: production`
  - `数据目录: %APPDATA%\t8-penguin-canvas\data`
  - `GET / 200`
  - 窗口标题：`贞贞的无限画布（企鹅共创版）`
- ✅ `_post_build.cjs` 自动校验（见 §2.4）
- ❌ 无自动化测试
- ⚠️ 打包前必检 6 项（`features.json.packaging.checklist`）：
  1. `bytenode` 已 npm install 且用 Electron 内置 Node
  2. `backend/src/` 改动后必须重新 `npm run encrypt`
  3. **版本号四处同步**：`package.json` ↔ `main.cjs` 三处（窗口标题/log 窗/IPC version） ↔ `backend/src/config.js APP_VERSION`
  4. `_post_build.cjs` 验证 11 个 `.t8c` 与前端资源完整性
  5. 拦截充值代理 HMAC 密钥泄漏（`RECHARGE_DEFAULT_ENC` 非空、`recharge.private.json` 等）
  6. 实测启动后端日志含「环境=production / GET / 200」

---

## 七、常见问题 (FAQ)

**Q1：启动报 `Cannot find module 'express'`？**
A：`loader.cjs` 已实现 MODULE_NOT_FOUND 兜底（`phase27`）。如果重写过 loader 一定保留 `req(id)` 包装与 `req.resolve` 兜底。或者 `_post_build.cjs` 误删了 app.asar 内的 node_modules。

**Q2：bytenode 编译报 `V8 bytecode version mismatch`？**
A：`encrypt` 必须用 Electron 内置 Node：`cross-env ELECTRON_RUN_AS_NODE=1 electron electron/encrypt.cjs`。直接 `node encrypt.cjs` 会用系统 Node 编译，与 Electron V8 版本不匹配。

**Q3：sharp 模块在打包后报错？**
A：`build.asarUnpack` 必须包含 `node_modules/sharp/**` 与 `node_modules/@img/**`，否则原生 `.node` 文件无法从 asar 内加载。

**Q4：用户安装包体积过大？**
A：检查 `build.files` 是否正确排除 `*.md`、`*.ts`、`*.map`、`test/`、`docs/`、`examples/`。`compression: 'store'` 是有意为之（加快启动）。当前 v1.5.x 实测产物约 100MB 量级（v1.4.2 为 104.58MB）。

**Q5：用户报告"启动卡在『启动中...』"？**
A：参考 `phase27`。三个根因：(1) loader 用 Temp/.jsc 二次 require 找不到 asar 内 node_modules；(2) backend/config.js 未识别 `T8PC_*` 环境变量，数据目录写到只读区；(3) server.js 未挂载前端静态托管，GET / 返回 `Cannot GET /`。全部已修复。

**Q6：能不能在用户分发包中携带 agent HMAC 密钥实现充值？**
A：**不能**（`phase42` 安全闸）。`_post_build.cjs` 强制扫描密钥泄漏，发现即 fail。用户充值必须走 VPS `pay.t8star.org` 公开接口（`phase43`）。

---

## 八、相关文件清单

```
electron/
├── main.cjs              # 主进程入口 (~300+ 行) — 拉后端 / 创窗口 / IPC / 端口探测
├── loader.cjs            # .t8c 加密装载（bytenode .jsc loader 复刻 + MODULE_NOT_FOUND 兜底）
├── encrypt.cjs           # bytenode 编译 + T8ENC1 二次加密
├── preload.cjs           # IPC 桥接（白名单）
└── _post_build.cjs       # 打包后置校验（11 .t8c / 前端 / 主题音乐 / 充值密钥安全闸 / 明文清理）
```

打包产物路径（仅参考，已 `.gitignore`）：
- `build/backend-enc/*.t8c` — 11 个后端密文
- `dist/` — Vite 前端产物
- `dist_electron/` — `T8-PenguinCanvas-Setup-<version>.exe` + `win-unpacked/`

---

## 九、变更记录 (Changelog)

| 日期 | 变更 |
|---|---|
| 2026-05-27 | 初次生成 electron 模块 CLAUDE.md，覆盖 5 个 .cjs 文件 + 打包链路与安全闸 |
