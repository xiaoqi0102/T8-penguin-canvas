# Electron 打包与分发指南

> 适用版本：v2.1.0（fork）· 更新时间：2026-06-04
>
> 范围：覆盖 Electron 桌面端从源码到 NSIS 安装包的完整链路、sidecar runtime 机制、压缩模式实测结论、体积估算与产物校验清单。

本文档与 [`README.md`](../README.md) 的「Electron 桌面端打包」一节互补：README 给出"使用者视角"的 5 行入门，本文给出"维护者 / 发版者视角"的全链路细节。

---

## 一、打包链路全景

```
┌──────────────────────────────────────────────────────────────────────────┐
│ npm run dist                                                             │
│  └─ npm run prepack:enc                                                  │
│      ├─ npm run build       # tsc -b && vite build  →  dist/             │
│      └─ npm run encrypt     # bytenode + T8ENC1     →  build/backend-enc │
│  └─ electron-builder --win --x64  →  dist_electron/{win-unpacked,*.exe}  │
│  └─ node electron/_post_build.cjs  → 产物完整性校验 + 安全闸             │
└──────────────────────────────────────────────────────────────────────────┘
```

| 阶段 | 命令 | 产物 | 关键约束 |
|---|---|---|---|
| 前端构建 | `vite build` | `dist/` | `__APP_VERSION__` 必须与 `package.json` / `electron/main.cjs` / `backend/src/config.js` 三处版本号一致（共 8 处同步位） |
| 后端加密 | `encrypt.cjs` | `build/backend-enc/*.t8c` | **必须** `cross-env ELECTRON_RUN_AS_NODE=1`（用 Electron 内置 Node，否则 V8 字节码版本不匹配） |
| Electron 打包 | `electron-builder --win --x64` | `dist_electron/win-unpacked/` + `*.exe` | `extraResources` 把 `dist/` + `build/backend-enc/` + sidecar runtimes 复制到 `resources/` |
| 后置校验 | `_post_build.cjs` | 控制台报告 | 详见 §五 |

---

## 二、产物拓扑

```
dist_electron/
├── T8-PenguinCanvas-Setup-<ver>.exe        # NSIS 安装包（最终分发物）
└── win-unpacked/                            # 解压后的应用目录
    ├── T8-PenguinCanvas.exe                 # 主程序（Electron 壳）
    ├── *.dll                                # Electron / Node 运行时
    ├── locales/                             # Electron i18n
    └── resources/
        ├── app.asar                         # electron/{main,loader,preload}.cjs + package.json + node_modules
        ├── app.asar.unpacked/
        │   └── node_modules/sharp/          # sharp 原生模块（asarUnpack 强制解包）
        ├── backend-enc/                     # 27 个 .t8c 加密后端字节码（asar 外）
        │   ├── server.t8c · config.t8c
        │   ├── routes/{canvas,settings,proxy,externalProviders,files,imageOps,
        │   │           resources,themes,eagle,aiWatermark,cloudUploads}.t8c
        │   ├── providers/{registry,mediaResolver,adapters,openaiCompatible,
        │   │              llmMedia,modelscope,volcengine,comfyui,jimengCli}.t8c
        │   ├── cloudUploads/{settings,uploader}.t8c
        │   ├── tools/aiWatermark/{runner,media}.t8c
        │   └── utils/duckPayload.t8c
        ├── frontend/                        # vite build 产物（asar 外，便于热替换）
        │   ├── index.html
        │   └── assets/
        │       ├── *.mp3 / *.mid             # 主题音乐
        │       └── *-{hash}.{js,css}
        └── tools/                           # sidecar runtimes（asar 外）
            ├── remove-ai-watermarks/        # AI 去水印 Python 运行时（约 1.8 GB）
            │   ├── runtime-manifest.json
            │   └── python/
            │       ├── python.exe           # 嵌入式 Python 3.12.9
            │       ├── Scripts/remove-ai-watermarks.exe
            │       └── Lib/site-packages/   # torch / diffusers / transformers / onnxruntime / ...
            └── ffmpeg/
                └── ffmpeg.exe               # LLM 视频抽帧用的内置 ffmpeg
```

---

## 三、Sidecar Runtime 机制

T8 把"重型外部依赖"（Python + Torch + ffmpeg）打成 sidecar，与主程序解耦：

- **不进 asar**，通过 `extraResources` 直接复制到 `resources/tools/`
- 后端代码通过 `T8PC_RES` 环境变量定位 sidecar 根目录
- 用户安装即用，无需自行配置 Python / pip / 环境变量
- 不带 sidecar 的"瘦版" build 仍可工作 —— 节点会优雅显示"未安装"而不是炸后端

### 3.1 AI 去水印 sidecar（`remove-ai-watermarks`）

**源路径**：`tools/remove-ai-watermarks-runtime/`
**目标路径**：`resources/tools/remove-ai-watermarks/`

**电池信息**（v2.1.0 实测）：

| 项 | 值 |
|---|---|
| Python | 3.12.9（嵌入式） |
| `remove-ai-watermarks` | 0.8.7（与上游 `wiltodelta/remove-ai-watermarks` commit `b25276c` 对齐） |
| torch | 2.12.0+cpu（478 MB） |
| diffusers | 0.38.0（25 MB） |
| transformers | 5.9.0（49 MB） |
| onnxruntime | 1.26.0（38 MB） |
| opencv-python-headless | 4.11.0.86 |
| trustmark | 0.9.1 |
| 总体积 | **1.8 GB**（包含 90 个 `__pycache__` 占 13 MB + 各 `*.dist-info` 占 13 MB） |
| 已启用能力 | visible / invisible / lama / detect / trustmark / metadata-{check,remove} / identify |
| markKeys | `gemini` / `doubao` / `jimeng` |

**后端 runner 探测顺序**（`backend/src/tools/aiWatermark/runner.js` `commandCandidates()`）：

1. `T8_REMOVE_AI_WATERMARKS_BIN` env 显式指定 CLI
2. `T8_REMOVE_AI_WATERMARKS_RUNTIME` env 指定 runtime 根目录
3. **`T8PC_RES/tools/remove-ai-watermarks/`**（打包模式默认命中）
4. `T8_REMOVE_AI_WATERMARKS_SRC` 指定的本地源码 clone
5. 开发环境 `_external/remove-ai-watermarks/`（仅 `IS_PACKAGED=false`）
6. `python` / `py -3` PATH（fallback）
7. `remove-ai-watermarks.exe` / `.cmd` / 无扩展 PATH（fallback）

对每个 candidate 区分两种 kind：
- `python-module`：跑 `python -c "import remove_ai_watermarks ..."` 轻量 probe（命中即直接用 `python -m remove_ai_watermarks.cli`）
- `cli-bin`：跑 `<bin> --version` 探测

**优先 `python-module` 的原因**：上游 CLI `remove-ai-watermarks.exe --version` 在某些版本下没有 `--version` 选项（exit=1），但 import probe 稳定返回版本与能力清单。

### 3.2 ffmpeg sidecar

**源路径**：`tools/ffmpeg-runtime/`（filter 仅复制 `ffmpeg.exe` / `ffmpeg` / `README.md`）
**目标路径**：`resources/tools/ffmpeg/ffmpeg.exe`

**用途**：LLM 视频输入节点（`backend/src/providers/llmMedia.js`）按整段视频均匀抽帧发送给上游多模态 LLM，**必须**使用内置 ffmpeg，不能依赖系统 PATH。

---

## 四、Compression 模式实测（重要）

很多人以为 electron-builder 的 `build.compression` 字段会直接控制安装包体积，**实际上不是**。

### 4.1 实测对比（v2.1.0 · 完整 sidecar）

| 模式 | 耗时 | `Setup-2.1.0.exe` 体积 | 差异 |
|---|---:|---:|---:|
| `store` | 4 min 00 s | **529 MB** | 基线 |
| `maximum` | 3 min 52 s | **528 MB** | -1 MB（0.2%） |

### 4.2 为什么几乎没差？

1. NSIS 安装器（`makensis`）默认开启 `SetCompressor /SOLID lzma`，对整个 `setup.exe` 做 LZMA solid 压缩 —— 这一层 electron-builder 不控制
2. `compression` 字段主要影响 **asar 内压缩级别** + electron-builder 自己的 7z 中间产物
3. 1.8 GB 的 sidecar 是 `extraResources`，**不进 asar**，直接被 NSIS solid-LZMA 处理
4. NSIS 外层压缩主导了一切，无论 store / normal / maximum，最终体积都被它压到差不多

### 4.3 结论与建议

| 模式 | 适用场景 |
|---|---|
| `store`（**推荐**，当前配置） | 默认。打包略快 ~10 秒，对 CI 更友好 |
| `normal` | 不推荐，没有明显收益 |
| `maximum` | 仅在你确认 asar 内部有大量可压缩文本资源时再考虑 |

**真正能瘦身的方向**（按收益排序）：

| 方案 | 预计 setup.exe | 工作量 |
|---|---:|---|
| 排除 sidecar 内 `__pycache__` + `tests/**` + `*.dist-info` + `*.pyc` | ~510 MB（-20 MB） | 改 `extraResources.filter`，5 分钟 |
| 把 sidecar 拆为可选独立下载，首启动从云端拉取 | **~120 MB** | 主程序加首启动检查逻辑，1-2 天 |
| 砍 torch CPU 改 ONNX-only 推理 | 视场景 | 重大改造，需上游适配 |

---

## 五、`_post_build.cjs` 校验清单（v2.1.0）

`electron-builder` 完成后自动跑，任一项 fail 立即非零退出。

### 5.1 必存项

| 类别 | 路径 | 数量 |
|---|---|---:|
| 加密后端字节码 | `resources/backend-enc/**/*.t8c` | **27** |
| 前端 SPA | `resources/frontend/index.html` + `assets/**` | 1 + N |
| 主题音乐 | `resources/frontend/assets/{classic-one-summer-day,pixel-theme-of-sss,op-battle-scars,rh-tide,rh-hidden-saya,naruto-shinsei-gyakuten,eva-decisive-battle,yyh-unbalanced-kiss-piano,yyh-hidden-tonight,slamdunk-kimi-ga-suki,soccer-tsubasa-burning-hero}.{mp3,mid}` | 11 |
| ffmpeg sidecar | `resources/tools/ffmpeg/ffmpeg.exe` | 1（强制） |
| AI 水印 sidecar | `resources/tools/remove-ai-watermarks/python/python.exe`（或 `Scripts/remove-ai-watermarks.exe` 等任一入口） | 至少 1 |

### 5.2 安全闸（fail-fast）

- ❌ `resources/{app,backend}/src` 明文目录残留 → 自动 nuke（双保险）
- ❌ `RECHARGE_DEFAULT_ENC` / `AGENT_HMAC_KEY` / `DULUPAY_KEY` 非空 → 立即 fail（充值密钥不得入分发包）
- ❌ `resources/data/recharge.private.json` 存在 → 立即 fail
- ❌ 任何 `RHToolboxMakerNode` / `RH工具箱制作器` / `rh-toolbox-maker` 字样出现在 `resources/frontend` 的小文本文件里 → 立即 fail（v2.1.0 接受 upstream 删除该节点的决策）
- ❌ 旧 ZZENC1 密文残留 → 立即 fail

### 5.3 可控警告

- ⚠️ AI 水印 sidecar 缺失：默认仅警告（开发期 build 允许）
  - **正式分发**建议在 `npm run dist` 前 `export T8_REQUIRE_AI_WATERMARK_RUNTIME=1` ，缺失即 fail
- ⚠️ `runtime-manifest.json` 缺失：仅警告，不影响功能

---

## 六、正式版发布 SOP

适用 GitHub Release / 内网分发 / 企业级用户包。

```bash
# 0. 前置检查
git status                   # 必须 clean
node -v                      # ≥ 18
npm ls bytenode              # 已装

# 1. 确认 sidecar 就位
ls tools/remove-ai-watermarks-runtime/python/python.exe
ls tools/ffmpeg-runtime/ffmpeg.exe

# 2. 版本号同步（8 处）
#    package.json · vite.config.ts (__APP_VERSION__) · backend/src/config.js (APP_VERSION)
#    electron/main.cjs (3 处：窗口标题 / log 窗 / IPC version) · features.json (version + semverVersion + versionNote) · README.md 徽章

# 3. 类型检查 + 构建
npm run type-check
npm run build

# 4. 正式打包（强制 sidecar 校验）
T8_REQUIRE_AI_WATERMARK_RUNTIME=1 npm run dist     # bash / git bash
# 或 PowerShell: $env:T8_REQUIRE_AI_WATERMARK_RUNTIME='1'; npm run dist

# 5. 产物校验
ls -lh dist_electron/T8-PenguinCanvas-Setup-*.exe
sha256sum dist_electron/T8-PenguinCanvas-Setup-*.exe       # 与 latest.yml 内 sha512 一并随分发提供

# 6. 实测启动（必跑）
./dist_electron/win-unpacked/T8-PenguinCanvas.exe
#   - 日志窗显示 [backend] started in-process on http://127.0.0.1:18766
#   - 数据目录: %APPDATA%\t8-penguin-canvas\data
#   - GET / 200
#   - 窗口标题: 贞贞的无限画布（企鹅共创版） vX.Y.Z

# 7. 用打包后的 sidecar 跑能力 probe（确认 AI 水印开箱可用）
./dist_electron/win-unpacked/resources/tools/remove-ai-watermarks/python/python.exe -c "
import remove_ai_watermarks as r
from remove_ai_watermarks import watermark_registry
print(r.__version__, list(watermark_registry.mark_keys()))
"
# 期望输出: 0.8.7 ['gemini', 'doubao', 'jimeng']
```

---

## 七、常见问题

**Q1：`Setup.exe` 偏大 / 想瘦身怎么办？**
A：v2.1.0 体积 529 MB 中 sidecar 占 ~410 MB，主程序 ~120 MB。若必须瘦身参考 §4.3 方案表。注意切 maximum 几乎无收益（§4.2）。

**Q2：sidecar 缺失但还是想出包？**
A：不要 `export T8_REQUIRE_AI_WATERMARK_RUNTIME=1`，post-build 会给警告但不 fail。最终用户使用去水印节点时会看到"未安装"提示，其他节点正常工作。

**Q3：sidecar 想换 GPU 版 torch？**
A：在外部环境装好 `remove-ai-watermarks[gpu,detect,trustmark,lama]` + CUDA torch，把整个 Python 环境拷到 `tools/remove-ai-watermarks-runtime/python/`，更新 `runtime-manifest.json` 的 `torch` 字段，重新 `npm run dist`。注意体积会增加 1-2 GB。

**Q4：打包后启动卡在"启动中..."？**
A：参考 `electron/CLAUDE.md` §七 Q5（`phase27` 三处根因修复）。

**Q5：用户机器没装 Python，sidecar 能跑吗？**
A：能。`tools/remove-ai-watermarks-runtime/python/` 是嵌入式 Python，自带 DLL（包括 `vcruntime140.dll` / `api-ms-win-core-*.dll` 等），不依赖系统 Python 或 VC++ Redistributable。

**Q6：CI（GitHub Actions）能打吗？**
A：可以。注意：
- `windows-latest` runner 默认硬盘 14 GB，1.8 GB sidecar + ~5 GB 中间产物 + ~530 MB 最终包 = 紧张但够用
- 必须先把 sidecar 上传到 release artifact 或 LFS，CI 拉取后放到 `tools/remove-ai-watermarks-runtime/`（不要 commit 到主仓）
- Job timeout 默认 6 小时充足；store 模式 4 分钟完成

---

## 八、相关文件

| 文件 | 角色 |
|---|---|
| `package.json` `build.*` | electron-builder 配置（appId / asar / extraResources / nsis） |
| `electron/main.cjs` | 主进程，注入 `T8PC_RES` 等环境变量 |
| `electron/encrypt.cjs` | bytenode + T8ENC1 加密脚本 |
| `electron/loader.cjs` | `.t8c` 加密装载（MODULE_NOT_FOUND 兜底） |
| `electron/_post_build.cjs` | 后置校验（必存项 + 安全闸 + 警告） |
| `backend/src/tools/aiWatermark/runner.js` | sidecar 探测与调用 |
| `backend/src/providers/llmMedia.js` | ffmpeg sidecar 抽帧 |
| `tools/remove-ai-watermarks-runtime/runtime-manifest.json` | sidecar 版本/能力声明 |
| `features.json` `.packaging` / `.aiWatermarkRuntime` | 单一事实来源（防丢失锁） |

---

## 九、变更记录

| 日期 | 变更 |
|---|---|
| 2026-06-04 | 初版。沉淀 v2.1.0 打包链路、AI 去水印 sidecar 集成、ffmpeg sidecar、compression 实测（store 529 MB / maximum 528 MB）、post-build 校验项（27 个 .t8c）、正式版 SOP |
