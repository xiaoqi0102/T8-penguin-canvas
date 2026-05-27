# Grsai 中转站接入说明（v1.5.6 首次接入）

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
  "imageSize": "1K | 2K | 4K",                        // 可选，仅 nano-banana 系列读
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
| `gpt-image-2-vip` | gpt-image-2 | **仅像素串** | ❌ 忽略 | 1-4K，约束严格 |

**通用 11 比例**：`auto, 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 5:4, 4:5, 21:9`
**nano-banana-2 系列额外 4 个极端比例**：`1:4, 4:1, 1:8, 8:1`

---

## 五、`gpt-image-2-vip` 像素串约束

仅接受形如 `<W>x<H>` 的像素串，且：
- 最大边长 ≤ 3840px
- 两条边都必须是 16 的倍数
- 长边 / 短边比 ≤ 3:1
- 总像素数：655,360 ~ 8,294,400

UI 中常用预设（已在 `GrsaiImageTab.tsx` 中提供）：
- `1024x1024`、`1536x1024`、`1024x1536`
- `2048x2048`、`2048x1152`、`2880x2880`
- `3840x2160`、`2160x3840`

---

## 六、已知约束汇总

1. **`imageSize` 仅 nano-banana 系列识别**：runner 用正则 `/^nano-banana/i` 判断是否携带；gpt-image-2 系列上游会忽略该字段。
2. **`gpt-image-2-vip` 必须像素串**：UI 自动切换比例下拉为仅像素串预设。
3. **violation 状态**：与 failed 同义但 `error` 字段可能是「内容审核未通过」等具体原因，必须透传给用户。
4. **驼峰字段名**：`aspectRatio` / `imageSize` / `replyType`，**严禁**在后端 / runner 任何一层做下划线转换。
5. **状态终态识别**：runner 与后端代理 SUCCESS 数组同时识别 `succeeded` 与 `success`、`completed`、`done`，避免上游字段微调时漏判。

---

## 七、对应的代码位置

| 文件 | 角色 |
|---|---|
| `GrsaiSettingsSection.tsx` | API 设置面板的 Key + baseUrl 块（国内 / 全球切换按钮 + 外链 grsai.ai dashboard） |
| `GrsaiImageTab.tsx` | ImageNode 内的 aspectRatio + imageSize 双下拉（根据 model 动态切换候选与显示） |
| `runGrsaiImage.ts` | `submitGrsaiImage` + `queryGrsaiImageStatus` 串接 + 轮询 + logBus 埋点 |
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
