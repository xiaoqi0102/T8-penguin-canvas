# Grsai 中转站接入说明（v1.5.6 首次接入 · v1.5.9 vip 双控件）

> 本目录是 T8-penguin-canvas 接入 **Grsai** 第三方中转站的隔离层。
> 走 Grsai **自有协议**（非 OpenAI 兼容），上游统一打 `POST /v1/api/generate` + `GET /v1/api/result?id=`。

---

## 一、上游端点与认证

| 维度 | 值 |
|---|---|
| 国内端点（默认） | `https://grsai.dakka.com.cn` |
| 全球端点 | `https://grsaiapi.com` |
| 认证 Header | `Authorization: Bearer sk-xxxxxxxxxxx` |
| 控制台获取 Key | https://grsai.ai/zh/dashboard/api-keys |

用户可以在【API 设置 → Grsai Base URL】里随时切换国内 / 全球（提供两个一键按钮），或填入自定义反代地址。

---

## 二、统一提交接口 `POST /v1/api/generate`

```jsonc
// Request body
{
  "model": "<11 个模型之一>",
  "prompt": "<提示词>",
  "images": ["url 或 data:image/...;base64,..."],   // 可选；非空走图生图
  "aspectRatio": "auto | 1:1 | ... | 1024x1024",     // 可选
  "imageSize": "1K | 2K | 4K",                        // 可选，nano-banana 系列上送上游；gpt-image-2-vip 本地查表（v1.5.9 起）
  "replyType": "async"                                 // 后端代理固定 'async'
}
```

**响应（顶层，无 data 包装）**：

```jsonc
// 异步任务首次返回
{ "id": "6-f671fc51-...", "status": "running" }

// succeeded
{ "id": "14-5f3cf761-...", "status": "succeeded",
  "results": [{ "url": "https://file1.aitohumanize.com/file/xxx.png" }],
  "progress": 100 }

// 失败
{ "id": "12-1f771fbf-...", "status": "failed", "error": "generate failed" }

// 违规
{ "id": "...", "status": "violation", "error": "..." }
```

**状态枚举**：`running` / `succeeded` / `failed` / `violation`。
**注意**：`succeeded`（不是 `success`），`violation` 要按 `failed` 处理但 error 文案要透传给用户。

---

## 三、查询接口 `GET /v1/api/result?id=<task_id>`

返回同上结构。后端轮询固定 2 秒 × 1800 次（60 分钟上限），与 qiniu 一致。

---

## 四、11 个支持模型

| 模型 ID | 系列 | aspectRatio | imageSize | 说明 |
|---|---|---|---|---|
| `nano-banana` | nano-banana | 通用 11 | 1K/2K/4K | 基础版 |
| `nano-banana-fast` | nano-banana | 通用 11 | 1K/2K/4K | 快速版 |
| `nano-banana-2` | nano-banana-2 | 通用 11 + 4 极端比例 | 1K/2K/4K | 默认推荐 |
| `nano-banana-2-cl` | nano-banana-2 | 通用 11 + 4 | 1K/2K/4K | 商用版 |
| `nano-banana-2-4k-cl` | nano-banana-2 | 通用 11 + 4 | 1K/2K/4K | 4K 商用 |
| `nano-banana-pro` | nano-banana | 通用 11 | 1K/2K/4K | Pro |
| `nano-banana-pro-cl` | nano-banana | 通用 11 | 1K/2K/4K | Pro 商用 |
| `nano-banana-pro-vip` | nano-banana | 通用 11 | 1K/2K/4K | Pro VIP |
| `nano-banana-pro-4k-vip` | nano-banana | 通用 11 | 1K/2K/4K | Pro 4K VIP |
| `gpt-image-2` | gpt-image-2 | 比例 / 像素串 | ❌ 忽略 | 基础 |
| `gpt-image-2-vip` | gpt-image-2 | 14 比例（去 auto，+1:3/3:1/2:1/1:2） | 1K/2K/4K（本地查表，不上送） | 1-4K，由 sizeMap 按 ratio × resolution 转像素串 |

**通用 11 比例**：`auto, 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 5:4, 4:5, 21:9`
**nano-banana-2 系列额外 4 个极端比例**：`1:4, 4:1, 1:8, 8:1`

---

## 五、`gpt-image-2-vip` 比例 × 清晰度双控件（v1.5.9）

> v1.5.6~v1.5.8 期间 vip 走的是「UI 仅比例 + runner 按 1 MP 固定算」单档模式（`COMMON_RATIO_TO_VIP_SIZE` 5 项 + `TARGET_PIXELS = 1_048_576`）。v1.5.9 起对齐七牛 `openai/gpt-image-2` 模式，UI 暴露双控件，runner 按 `DOC_PRESETS_BY_RES` 三档完整文档表查像素值。

**UI 层（`GrsaiImageTab.tsx`）**：
- 触发条件：`isNanoBananaSeries(apiModel) || isGptImage2VipModel(apiModel)`
- 比例下拉：vip 用 `GPT_IMAGE_2_VIP_RATIOS`（14 比例，去 `auto`，加 `1:3 / 3:1 / 2:1 / 1:2`）
- 清晰度下拉：`1K / 2K / 4K`，写回 `d.grsaiImageSize`（与 nano-banana 共用字段）

**runner 层（`runGrsaiImage.ts`）**：
- `resolveGrsaiAspectRatio(rawRatio, apiModel, imageSize)` 第三参数透传清晰度档
- 日志同时打印 `ratio` 与 `imageSize`，便于排错
- `req.imageSize` 仅 nano-banana 系列上送上游；vip 路径下 `imageSize` 只影响本地查表，不进入 HTTP body

**sizeMap 层（`sizeMap.ts`）**：
- 三档目标像素：`1K = 1 MP / 2K = 4 MP / 4K = 8.29 MP`
- `DOC_PRESETS_BY_RES` 三档独立预设表（按文档原文铺，1K 14 项 / 2K 12 项 / 4K 14 项；2K 缺 1:3 / 3:1）
- 未命中预设：`computeVipSize(w, h, targetPixels)` 按目标像素 + 16 对齐 + 长边 ≤3840 + 总像素 ≤8.29 MP 兜底（典型场景：vip 选 1:3 + 2K → 1184x3552）

**自定义像素值约束（上游文档原文）**：
- 最大边长 ≤ 3840px
- 两条边都必须是 16 的倍数
- 长边 / 短边比 ≤ 3:1
- 总像素数：655,360 ~ 8,294,400

**vip 三档完整预设表**：

| 比例 | 1K | 2K | 4K |
|---|---|---|---|
| 1:1 | 1024x1024 | 2048x2048 | 2880x2880 |
| 16:9 | 1280x720 | 2048x1152 | 3840x2160 |
| 9:16 | 720x1280 | 1152x2048 | 2160x3840 |
| 4:3 | 1152x864 | 2304x1728 | 3264x2448 |
| 3:4 | 864x1152 | 1728x2304 | 2448x3264 |
| 3:2 | 1536x1024 | 2048x1360 | 3504x2336 |
| 2:3 | 1024x1536 | 1360x2048 | 2336x3504 |
| 5:4 | 1120x896 | 2240x1792 | 3200x2560 |
| 4:5 | 896x1120 | 1792x2240 | 2560x3200 |
| 21:9 | 1456x624 | 2912x1248 | 3840x1648 |
| 1:3 | 688x2048 | (兜底算) | 1280x3840 |
| 3:1 | 2048x688 | (兜底算) | 3840x1280 |
| 2:1 | 1536x768 | 3072x1536 | 3840x1920 |
| 1:2 | 768x1536 | 1536x3072 | 1920x3840 |

**兼容性**：
- 旧画布 `grsaiAspectRatio` 为像素串（v1.5.6 早期 UI 允许）→ 原样返回
- 旧画布 vip 无 `grsaiImageSize` 字段 → 默认 `'1K'`，与 v1.5.8 行为完全一致
- 旧画布 vip 残留 `'auto'`（v1.5.9 起 UI 列表已去除）→ 退到 `1024x1024`

---

## 六、已知约束汇总

1. **`imageSize` 上送规则**：runner 用 `/^nano-banana/i` 判断是否携带到 HTTP body；gpt-image-2-vip 自 v1.5.9 起也读 `imageSize` 但只用于本地查表（不进入 body），普通 gpt-image-2 完全忽略该字段。
2. **`gpt-image-2-vip` 必须像素串**：v1.5.9 起 UI 改为「比例 × 清晰度」双控件，runner 按 `DOC_PRESETS_BY_RES` 查表（详见 §五）；旧画布残留的 `'auto'` 兜底到 `1024x1024`。
3. **violation 状态**：与 failed 同义但 `error` 字段可能是「内容审核未通过」等具体原因，必须透传给用户。
4. **驼峰字段名**：`aspectRatio` / `imageSize` / `replyType`，**严禁**在后端 / runner 任何一层做下划线转换。
5. **状态终态识别**：runner 与后端代理 SUCCESS 数组同时识别 `succeeded` 与 `success`、`completed`、`done`，避免上游字段微调时漏判。

---

## 七、对应的代码位置

| 文件 | 角色 |
|---|---|
| `GrsaiSettingsSection.tsx` | API 设置面板的 Key + baseUrl 块（国内 / 全球切换按钮 + 外链 grsai.ai dashboard） |
| `GrsaiImageTab.tsx` | ImageNode 内的 aspectRatio + imageSize 双下拉（v1.5.9 起 nano-banana 系列 + gpt-image-2-vip 都显示清晰度档） |
| `runGrsaiImage.ts` | `submitGrsaiImage` + `queryGrsaiImageStatus` 串接 + 轮询 + logBus 埋点（v1.5.9 起 `resolveGrsaiAspectRatio` 接受 `resolution` 第三参数，仅 vip 用） |
| `backend/src/routes/proxy.js` | `/api/proxy/grsai/image[/submit\|/status/:tid]` 三个路由 + 5 个辅助函数 |
| `src/services/generation.ts` | `submitGrsaiImage` / `queryGrsaiImageStatus` 客户端 |
| `src/providers/models.ts` IMAGE_MODELS | `id: 'grsai'` 条目，11 个 apiModelOptions |
| `features.json` modelRegistry.image | grsai 注册项（防丢失锁） |

---

## 八、调试快捷链路

如果上游协议有变化，按下表排查：

1. 用 firecrawl 重抓 apifox 文档（基础 URL 见 `中转站/grsai-llms.txt`）：
   - nano-banana: `https://qmy27nhsd9.apifox.cn/452392911e0.md`
   - gpt-image-2: `https://qmy27nhsd9.apifox.cn/452409160e0.md`
   - 查询接口: `https://qmy27nhsd9.apifox.cn/452409577e0.md`
2. 对照本 README 第二、三节确认请求 / 响应字段是否一致。
3. 调整 `runGrsaiImage.ts` 状态识别数组与 `proxy.js` 同步。
4. 更新本 README + `../README.md` 协议对照表 + `features.json` 注册项。
