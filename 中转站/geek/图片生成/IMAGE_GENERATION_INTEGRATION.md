# 图片生成插件对接说明

本文档基于 `图片生成/main.py` 当前实现整理，用于其他程序直接对接图片生成插件，或按相同协议自行调用 GeekNow 图片生成接口。

## 1. 核心结论

图片生成模块是**同步结果返回模式**，不是远端 `task_id` 轮询模式。

标准调用流程是：

```text
调用 generate(context)
  -> 校验参数并写入本地 SQLite 日志 running
  -> 同步 POST 图片生成 API
  -> API 直接返回 b64_json 或图片 URL
  -> 如果是 b64_json：本地解码保存 PNG
  -> 如果是 URL：同步下载图片并保存 PNG
  -> generate(context) 返回本地图片路径列表
```

当前图片模块没有以下远端任务流程：

```text
POST 创建远端任务
  -> 返回 task_id
GET /tasks/{task_id}
  -> 轮询 pending / running / completed
completed
  -> 再获取图片结果
```

需要特别区分：

| 名称 | 来源 | 含义 | 能否用于远端查询 |
|---|---|---|---:|
| `task_log_id` / SQLite `id` | 本地 SQLite | 本地日志 ID | 否 |
| `image_url` | API 响应 | 已生成图片的下载 URL | 只能下载图片，不能查任务 |
| `generated_files` | `generate()` 返回值 | 本地 PNG 文件路径列表 | 否 |
| `task_id` | 当前图片 API | 当前实现不存在 | 否 |

与 `视频生成` 模块不同：视频模块会 `POST /v1/videos` 返回远端 `id` 并轮询；图片模块不会。

## 2. 入口函数

主入口：

```python
def generate(context):
    ...
    return generated_files
```

成功返回：

```python
[
    "C:/path/to/output/0000_image_20260529_153000_123456.png"
]
```

失败抛出：

```text
PLUGIN_ERROR:::<错误详情>
```

## 3. 输入参数结构

### 3.1 最小文生图示例

```python
context = {
    "prompt": "一张未来城市夜景，电影感，高细节，霓虹灯",
    "reference_images": {},
    "output_dir": "C:/path/to/output",
    "plugin_params": {
        "api_key": "YOUR_API_KEY",
        "base_url": "https://api.geeknow.ai",
        "model": "gemini-2.5-flash-image-preview",
        "aspect_ratio": "16:9",
        "image_size": "2K",
        "request_timeout": 300,
        "download_timeout": 300
    },
    "viewer_index": 0
}
```

### 3.2 图生图示例

```python
context = {
    "prompt": "保持人物主体一致，改成赛博朋克街景风格",
    "reference_images": {
        "参考图1": "C:/path/to/ref1.png",
        "参考图2": "C:/path/to/ref2.jpg"
    },
    "output_dir": "C:/path/to/output",
    "plugin_params": {
        "api_key": "YOUR_API_KEY",
        "base_url": "https://api.geeknow.ai",
        "model": "gpt-image-2-pro",
        "aspect_ratio": "16:9(2K)",
        "image_size": "2K",
        "request_timeout": 300,
        "download_timeout": 300
    },
    "viewer_index": 0
}
```

### 3.3 字段说明

| 字段 | 类型 | 必填 | 说明 |
|---|---:|---:|---|
| `prompt` | `str` | 是 | 图片生成提示词。 |
| `reference_images` | `dict` | 否 | 参考图片路径字典。为空时为文生图；非空时为图生图。 |
| `output_dir` | `str` | 是 | 本地输出目录。插件会 `os.makedirs(output_dir, exist_ok=True)`。 |
| `plugin_params.api_key` | `str` | 是 | GeekNow API Key。为空会直接报错。 |
| `plugin_params.base_url` | `str` | 否 | Base URL。仅接受插件内置有效线路，非法值回退默认线路。 |
| `plugin_params.endpoint` | `str` | 否 | 兼容旧配置；会与 `base_url` 一起参与线路选择。 |
| `plugin_params.model` | `str` | 否 | 模型显示名或实际模型名。 |
| `plugin_params.aspect_ratio` | `str` | 否 | 图片比例或尺寸档位，例如 `16:9`、`1:1`、`9:16`、`16:9(2K)`。 |
| `plugin_params.image_size` | `str` | 否 | Gemini 图片尺寸，默认 `2K`；非 Gemini 模型通常不直接使用。 |
| `plugin_params.request_timeout` | `int` | 否 | API 请求超时，单位秒。 |
| `plugin_params.download_timeout` | `int` | 否 | 图片 URL 下载超时，单位秒。 |
| `viewer_index` | `int` | 否 | 输出文件名前缀，如 `0000_image_...png`。 |

## 4. Base URL 与模型映射

### 4.1 内置线路

插件允许的 Base URL：

| 名称 | URL |
|---|---|
| 主节点 | `https://geeknow.ai` |
| 副节点 | `https://api.geeknow.ai` |

默认线路：

```text
https://api.geeknow.ai
```

如果传入的 `base_url` 不在上述列表中，会自动回退到默认线路。

### 4.2 支持模型

| 显示名 | 实际模型名 | API 风格 |
|---|---|---|
| `gemini-3-pro-image-preview` | `gemini-3-pro-image-preview` | Gemini generateContent |
| `gemini-2.5-flash-image-preview` | `gemini-2.5-flash-image-preview` | Gemini generateContent |
| `gemini-3.1-flash-image-preview` | `gemini-3.1-flash-image-preview` | Gemini generateContent |
| `豆包即梦4.5` | `doubao-seedream-4-5-251128` | OpenAI Images |
| `豆包即梦5.0` | `doubao-seedream-5-0-260128` | OpenAI Images |
| `Grok 4.2 Image` | `grok-4-2-image` | OpenAI Images |
| `gpt-image-2` | `gpt-image-2` | OpenAI Images |
| `gpt-image-2-pro` | `gpt-image-2-pro` | OpenAI Images |

### 4.3 端点选择规则

代码逻辑：

```python
is_openai_style_model = (
    model.startswith('doubao-')
    or model.startswith('grok-')
    or model.startswith('gpt-image-')
)

endpoint = normalized_base if is_openai_style_model else f"{normalized_base}/v1beta"
```

最终请求端点：

| 模型类型 | 请求地址 |
|---|---|
| `doubao-*` | `POST {base_url}/v1/images/generations` |
| `grok-*` | `POST {base_url}/v1/images/generations` |
| `gpt-image-*` | `POST {base_url}/v1/images/generations` |
| `gemini-*` | `POST {base_url}/v1beta/models/{model}:generateContent` |

## 5. 同步生成流程

完整流程：

```text
1. 读取 context.prompt / reference_images / output_dir / plugin_params
2. 规范化 base_url，映射 model_display -> model
3. 判断 OpenAI Images 风格或 Gemini 风格，拼出 endpoint
4. 校验 api_key 和 endpoint
5. 创建 output_dir
6. 写入本地 SQLite 日志，状态 running
7. 根据模型调用：
   - send_grok_request()
   - send_doubao_request()
   - send_gpt_image_2_request()
   - send_gemini_request()
8. API 同步返回：
   - image_data_base64
   - image_source_url
9. 如果有 image_data_base64：
   - base64 解码
   - 用 PIL 保存为 PNG
   - 日志更新 success
10. 如果有 image_source_url：
   - 日志先更新 generated
   - 同步下载 URL
   - 保存为 PNG
   - 日志更新 success
11. 如果所有 URL 下载失败：
   - 日志更新 download_failed
   - 抛出 PLUGIN_ERROR
12. 返回 generated_files
```

外部调用方看到的是一个同步阻塞函数。它不会在中途把远端任务 ID 返回给调用方。

## 6. 各模型请求协议

## 6.1 Grok 图片模型

请求：

```text
POST {base_url}/v1/images/generations
Authorization: Bearer <api_key>
Content-Type: application/json
```

请求体：

```json
{
  "model": "grok-4-2-image",
  "prompt": "一只赛博朋克风格的猫",
  "n": 1,
  "size": "2560x1440",
  "image": ["<base64参考图片，可选>"]
}
```

响应要求：

```json
{
  "data": [
    {
      "url": "https://example.com/generated.png"
    }
  ]
}
```

解析规则：

- 只从 `data[].url` 收集图片 URL。
- 不读取 `b64_json`。
- 不读取 `task_id`。
- 如果 `data` 中有多个 URL，会逐个下载。

## 6.2 Doubao Seedream 图片模型

请求：

```text
POST {base_url}/v1/images/generations
Authorization: Bearer <api_key>
Content-Type: application/json
```

请求体：

```json
{
  "model": "doubao-seedream-5-0-260128",
  "prompt": "一张电影海报",
  "n": 1,
  "size": "2560x1440",
  "image": ["<base64参考图片，可选>"]
}
```

响应可以是：

```json
{
  "data": [
    {
      "b64_json": "<base64图片数据>",
      "url": "https://example.com/generated.png"
    }
  ]
}
```

解析优先级：

1. 优先使用 `data[0].b64_json`，直接保存。
2. 没有 `b64_json` 时使用 `data[0].url`，下载后保存。
3. 不读取 `task_id`。

## 6.3 GPT Image 2 / GPT Image 2 Pro

请求：

```text
POST {base_url}/v1/images/generations
Authorization: Bearer <api_key>
Content-Type: application/json
```

请求体：

```json
{
  "model": "gpt-image-2-pro",
  "prompt": "产品摄影风格的耳机广告图",
  "n": 1,
  "size": "2048x1152",
  "quality": "high",
  "response_format": "url",
  "image": ["<base64参考图片，可选>"]
}
```

响应解析：

- 如果 `data[].b64_json` 存在，直接保存第一张 base64 图片。
- 否则收集 `data[].url` 并逐个下载。
- 不读取 `task_id`。

### GPT Image 尺寸处理

插件内置尺寸映射包含：

```text
1:1        -> 1024x1024
4:3        -> 1536x1152
2:3        -> 1024x1536
3:2        -> 1536x1024
16:9       -> 1920x1080
9:16       -> 1080x1920
1:1(2K)    -> 2048x2048
16:9(2K)   -> 2048x1152
16:9(4K)   -> 3840x2160
9:16(4K)   -> 2160x3840
```

如果尺寸不是模型官方支持尺寸，插件会选择接近的官方尺寸，并把比例提示追加到 prompt 中。

## 6.4 Gemini 图片模型

请求：

```text
POST {base_url}/v1beta/models/{model}:generateContent
Authorization: Bearer <api_key>
Content-Type: application/json
```

请求体：

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "text": "生成一张科幻城市夜景"
        },
        {
          "inlineData": {
            "mimeType": "image/png",
            "data": "<base64参考图片，可选>"
          }
        }
      ]
    }
  ],
  "generationConfig": {
    "responseModalities": ["IMAGE", "TEXT"],
    "temperature": 1.0,
    "topP": 0.95,
    "maxOutputTokens": 8192,
    "imageConfig": {
      "aspectRatio": "16:9",
      "imageSize": "2K"
    }
  }
}
```

实际 `imageSize` 规则：

```text
gemini-3-pro-image-preview -> 使用 plugin_params.image_size
gemini-2.5 / 3.1 flash 等其他 Gemini 模型 -> 固定 1K
```

响应解析支持三类：

### inlineData.data 为 URL

```json
{
  "candidates": [
    {
      "content": {
        "parts": [
          {
            "inlineData": {
              "data": "https://example.com/generated.png"
            }
          }
        ]
      }
    }
  ]
}
```

### inlineData.data 为 base64

```json
{
  "candidates": [
    {
      "content": {
        "parts": [
          {
            "inlineData": {
              "data": "<base64图片数据>"
            }
          }
        ]
      }
    }
  ]
}
```

### text 中包含图片链接或 data URI

```markdown
![image](https://example.com/generated.png)
```

或：

```text
data:image/png;base64,<base64图片数据>
```

解析规则：

- 遍历 `candidates[0].content.parts`。
- 找到 URL 或 base64 后立即返回。
- 不读取 `task_id`。

## 7. 参考图片处理

### 7.1 OpenAI Images 风格模型

包括：

```text
Grok / Doubao / GPT Image
```

处理方式：

```text
读取本地参考图片
  -> base64 编码
  -> 放入 JSON body 的 image 数组
```

例如：

```json
{
  "image": [
    "<base64图片1>",
    "<base64图片2>"
  ]
}
```

### 7.2 Gemini 模型

处理方式：

```text
读取本地参考图片
  -> 判断 MIME 类型
  -> base64 编码
  -> 作为 inlineData 加入 contents[0].parts
```

例如：

```json
{
  "inlineData": {
    "mimeType": "image/png",
    "data": "<base64图片>"
  }
}
```

### 7.3 参考图片有效性

插件只会加入满足以下条件的图片：

```text
路径存在
文件大小 > 0
```

如果参考图片读取失败，通常只记录日志，不一定中断整个生成流程。

## 8. 返回值与保存规则

### 8.1 本地保存文件名

保存格式：

```text
{viewer_index:04d}_image_{YYYYMMDD_HHMMSS_microseconds}.png
```

示例：

```text
0000_image_20260529_153000_123456.png
```

多图 URL 返回时，会追加后缀：

```text
0000_image_20260529_153000_123456_n1.png
0000_image_20260529_153001_234567_n2.png
```

### 8.2 返回值

成功：

```python
[
    "C:/output/0000_image_20260529_153000_123456.png"
]
```

多图成功：

```python
[
    "C:/output/0000_image_20260529_153000_123456_n1.png",
    "C:/output/0000_image_20260529_153001_234567_n2.png"
]
```

如果 API 返回了 URL，但全部下载失败：

```text
PLUGIN_ERROR:::图片已生成但下载失败，可通过「任务日志/手动拉图」功能稍后下载
```

## 9. 本地任务日志

插件会写入 SQLite：

```text
图片生成/image_task_logs.db
```

表名：

```text
image_task_logs
```

### 9.1 字段说明

| 字段 | 说明 |
|---|---|
| `id` | 本地日志 ID，不是远端 task_id。 |
| `created_at` | 日志创建时间。 |
| `completed_at` | 完成时间，未完成时为空。 |
| `model_display` | 传入或 UI 显示的模型名。 |
| `model_name` | 实际 API 模型名。 |
| `prompt` | 提示词。 |
| `aspect_ratio` | 图片比例。 |
| `image_size` | 图片尺寸配置。 |
| `reference_images` | 参考图片路径信息 JSON。 |
| `base_url` | Base URL。 |
| `endpoint` | 实际请求 endpoint。 |
| `task_mode` | `文生图` 或 `图生图`。 |
| `status` | 本地日志状态。 |
| `image_url` | API 返回的图片 URL。 |
| `local_path` | 本地保存路径。 |
| `error` | 错误信息。 |
| `metadata` | 额外信息，例如 timeout、viewer_index、source。 |

### 9.2 状态说明

| 状态 | 含义 |
|---|---|
| `running` | 本地任务已开始，正在同步请求 API。 |
| `generated` | API 已返回图片 URL，但本地未必下载完成。 |
| `success` | 图片已保存到本地。 |
| `failed` | API 调用失败或响应无效。 |
| `no_retry_error` | 状态表中存在，当前主流程较少直接写入。 |
| `download_failed` | API 已返回 URL 或数据，但本地保存/下载失败。 |
| `manual_success` | 后续手动拉图成功。 |
| `manual_failed` | 后续手动拉图失败。 |

### 9.3 查询本地日志

插件动作：

```python
handle_action('get_task_logs', {
    'limit': 200,
    'status': None
})
```

返回示例：

```python
{
    'ok': True,
    'logs': [
        {
            'id': 1,
            'status': 'success',
            'status_display': '下载成功',
            'status_color': '#4CAF50',
            'image_url': 'https://example.com/generated.png',
            'local_path': 'C:/output/0000_image_xxx.png'
        }
    ]
}
```

注意：

```text
logs[].id 是本地 SQLite 日志 ID，不是远端 task_id。
```

## 10. 手动拉图

当 API 已返回 `image_url` 但下载失败，插件可从本地日志重新下载。

调用：

```python
handle_action('download_images', {
    'task_ids': [1, 2, 3]
})
```

内部流程：

```text
读取本地 image_task_logs
  -> 根据本地 id 找到 image_url
  -> 下载图片
  -> 默认保存到 图片生成/manual_downloads
  -> 更新日志状态 manual_success / download_failed
```

这不是远端生成任务查询，也不会重新提交图片生成请求。

## 11. 实时日志

插件维护进程内日志缓冲区：

```python
get_buffered_logs(since_index=0)
```

插件动作：

```python
handle_action('get_logs', {
    'since_index': 0
})
```

返回：

```python
{
    'ok': True,
    'logs': [
        {
            'index': 1,
            'time': '15:30:00',
            'level': 'INFO',
            'message': '...'
        }
    ]
}
```

实时日志只在当前进程内有效；历史任务请查询 SQLite 日志。

## 12. 错误处理约定

### 12.1 API Key 缺失

```text
PLUGIN_ERROR:::未设置 API Key，请在插件设置中填写 API Key
```

### 12.2 Endpoint 缺失

理论上 base_url 会回退默认线路，通常不会出现；若 endpoint 为空：

```text
PLUGIN_ERROR:::未设置 Endpoint
```

### 12.3 网络连接异常

```text
PLUGIN_ERROR:::API 调用失败: 连接异常（服务端未响应即断开）
目标地址: <endpoint>
模型: <model>
原始错误: <error>
建议: 1.检查网络连接 2.尝试切换线路(base_url) 3.如参考图片过大请压缩后重试
```

### 12.4 请求超时

```text
PLUGIN_ERROR:::API 调用失败: 请求超时
目标地址: <endpoint>
模型: <model>
超时设置: <request_timeout>s
建议: 1.检查网络连接 2.尝试切换线路(base_url)
```

### 12.5 HTTP 错误

例如：

```text
PLUGIN_ERROR:::API 调用失败:Exception: HTTP 400: <response text>
```

### 12.6 API 响应无图片

```text
PLUGIN_ERROR:::API 响应中未包含图片数据
```

内部函数也可能抛出：

```text
NO_RETRY:::API 未返回有效结果
NO_RETRY:::API 响应中未包含任何图片 URL
NO_RETRY:::响应格式错误
NO_RETRY:::API 未返回有效候选结果
```

这些最终通常会被包装为：

```text
PLUGIN_ERROR:::API 调用失败:<异常类型>: <异常内容>
```

### 12.7 保存或下载失败

如果 API 直接返回 base64，但本地保存失败：

```text
图片保存失败: <error>
```

日志状态会变为 `download_failed`。

如果 API 返回 URL，但全部下载失败：

```text
PLUGIN_ERROR:::图片已生成但下载失败，可通过「任务日志/手动拉图」功能稍后下载
```

## 13. 其他程序对接方式

## 13.1 方式 A：直接调用 `generate(context)`

适合：

- 其他程序与插件在同一 Python 环境。
- 希望复用插件内置模型映射、图片转换、日志、下载保存逻辑。
- 接受同步阻塞调用。

示例：

```python
import importlib.util

plugin_path = r"C:/Users/Admin/Desktop/geek/图片生成/main.py"
spec = importlib.util.spec_from_file_location("image_plugin", plugin_path)
image_plugin = importlib.util.module_from_spec(spec)
spec.loader.exec_module(image_plugin)

context = {
    "prompt": "一只穿宇航服的柴犬，写实摄影风格",
    "reference_images": {},
    "output_dir": r"C:/Users/Admin/Desktop/geek/output",
    "plugin_params": {
        "api_key": "YOUR_API_KEY",
        "base_url": "https://api.geeknow.ai",
        "model": "gemini-2.5-flash-image-preview",
        "aspect_ratio": "16:9",
        "image_size": "2K",
        "request_timeout": 300,
        "download_timeout": 300
    },
    "viewer_index": 0
}

try:
    files = image_plugin.generate(context)
    print("生成成功:", files)
except Exception as exc:
    print("生成失败:", exc)
```

注意：

- `main.py` 依赖上级目录 `plugin_utils.py`。
- 直接导入时要保持目录结构：`图片生成/main.py` 的上级目录需要有 `plugin_utils.py`。
- `generate(context)` 会阻塞直到 API 返回并完成保存，建议放到后台线程或任务队列。

## 13.2 方式 B：直接对接 GeekNow 图片 API

适合：

- 只对接固定模型。
- 不想依赖插件文件结构。
- 自己管理日志、并发、重试和存储。

OpenAI Images 风格伪代码：

```python
import base64
import requests

base_url = "https://api.geeknow.ai"
api_key = "YOUR_API_KEY"

payload = {
    "model": "gpt-image-2-pro",
    "prompt": "产品摄影风格的耳机广告图",
    "n": 1,
    "size": "2048x1152",
    "quality": "high",
    "response_format": "url"
}

headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json"
}

resp = requests.post(f"{base_url}/v1/images/generations", json=payload, headers=headers, timeout=300)
resp.raise_for_status()
data = resp.json()

item = data["data"][0]
if item.get("b64_json"):
    raw = base64.b64decode(item["b64_json"])
elif item.get("url"):
    raw = requests.get(item["url"], timeout=300).content
else:
    raise RuntimeError("API 响应中未包含图片数据")

with open("output.png", "wb") as f:
    f.write(raw)
```

Gemini 风格伪代码：

```python
import base64
import requests

base_url = "https://api.geeknow.ai"
model = "gemini-2.5-flash-image-preview"
api_key = "YOUR_API_KEY"

payload = {
    "contents": [
        {
            "role": "user",
            "parts": [
                {"text": "生成一张未来城市夜景"}
            ]
        }
    ],
    "generationConfig": {
        "responseModalities": ["IMAGE", "TEXT"],
        "temperature": 1.0,
        "topP": 0.95,
        "maxOutputTokens": 8192,
        "imageConfig": {
            "aspectRatio": "16:9",
            "imageSize": "1K"
        }
    }
}

headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json"
}

resp = requests.post(f"{base_url}/v1beta/models/{model}:generateContent", json=payload, headers=headers, timeout=300)
resp.raise_for_status()
data = resp.json()

# 按插件逻辑解析 inlineData / text URL / data URI
```

核心原则：

```text
图片接口当前直接返回 b64_json 或 url。
不要实现远端 task_id 轮询，除非上游 API 另行提供明确的图片异步任务接口。
```

## 13.3 方式 C：封装成自己的 HTTP 服务

如果你希望前端或其他服务不被同步调用阻塞，可以在自己的服务层封装异步任务。

推荐服务层接口：

```text
POST /image-jobs
  -> 返回 local_job_id

GET /image-jobs/{local_job_id}
  -> 返回你的服务层状态
```

内部实现：

```text
你的服务生成 local_job_id
  -> 后台线程调用 generate(context)
  -> generate 同步请求图片 API 并保存图片
  -> 你的服务记录 local_path / status / error
```

注意：

```text
local_job_id 是你自己服务的任务 ID。
它不是 GeekNow 图片 API 返回的远端 task_id。
当前图片插件没有远端 task_id。
```

完成响应示例：

```json
{
  "ok": true,
  "local_job_id": "img_job_001",
  "status": "success",
  "files": [
    "C:/output/0000_image_20260529_153000_123456.png"
  ]
}
```

失败响应示例：

```json
{
  "ok": false,
  "local_job_id": "img_job_001",
  "status": "failed",
  "error": "PLUGIN_ERROR:::API 调用失败: 请求超时"
}
```

## 14. 超时与阻塞

当前图片模块有两段同步等待：

```text
1. 生成请求：requests.post(...)
2. URL 下载：requests.get(image_url, timeout=download_timeout, stream=True)
```

影响：

- 调用线程会阻塞到 API 返回、下载完成或超时。
- `request_timeout` 控制 API 请求等待时间。
- `download_timeout` 控制图片 URL 下载等待时间。
- 如果封装 HTTP 服务，不建议在主请求线程里直接长时间阻塞；更推荐后台任务。

当前代码中部分 `requests.post()` 没有显式传入 `timeout`：

- Grok：`requests.post(url, json=payload, headers=headers)`
- Doubao：`requests.post(url, json=payload, headers=headers)`
- Gemini：`requests.post(url, json=payload, headers=headers)`
- GPT Image：`requests.post(api_endpoint, json=payload, headers=headers, timeout=request_timeout)`

因此如果你自行对接 API，建议所有请求都显式设置 timeout。

## 15. 容易误解的点

### 15.1 `task_log_id` 不是 `task_id`

代码里：

```python
task_log_id = _log_task_result(task_log_context, status='running')
```

这是本地 SQLite 插入后的自增 ID，只能用于更新本地日志，不能用于远端 API 查询。

### 15.2 `generated` 不代表本地文件可用

`generated` 表示 API 返回了图片 URL。

只有状态变成 `success`，并且 `local_path` 有值，才代表本地文件已保存成功。

### 15.3 手动拉图不是重新生成

`download_images` 只读取本地日志里的旧 `image_url` 再下载，不会再次调用图片生成 API。

### 15.4 多 URL 的额外日志可能不完整

当前多图 URL 场景中：

```python
log_id = task_log_id if idx == 0 else None
```

第一张图会复用初始日志 ID；后续图片在写 `generated/success` 时 `log_id=None`，会新插入日志记录。由于新插入时使用同一 `task_log_context`，部分字段会完整保存，但具体 `image_url/local_path` 依赖 `_log_task_result()` 的插入参数。

对接方如果强依赖多图日志，建议以 `generate()` 返回的 `generated_files` 为准。

### 15.5 API 返回 URL 后，插件会立即下载

如果你只想拿 URL，不想下载，需要修改 `generate()` 的 URL 分支；当前实现会下载并返回本地路径。

## 16. 如果未来要改成真正远端 task_id 轮询

当前代码不支持图片远端任务轮询。如果上游未来提供图片异步接口，可以新增：

```text
POST /v1/images/tasks
  -> 返回 task_id

GET /v1/images/tasks/{task_id}
  -> 返回 pending/running/completed/failed

completed
  -> 返回 b64_json 或 image_url
```

插件需要增加：

1. `create_image_task()`：提交图片任务。
2. `poll_image_task()`：轮询远端图片任务。
3. SQLite 字段：例如 `api_task_id` 或 `remote_task_id`。
4. UI 日志区分：本地日志 `id` 与远端任务 `api_task_id`。
5. 下载/保存逻辑复用当前 URL/base64 分支。

在上游未提供异步图片接口前，不建议把本地 SQLite `id` 伪装成远端 `task_id`。

## 17. 最小协议总结

图片插件外部调用语义：

```text
generate(context) 是同步阻塞函数。
成功返回本地 PNG 路径列表。
失败抛出 PLUGIN_ERROR 异常。
本地 SQLite id 只是日志 ID。
当前图片 API 没有远端 task_id 查询或轮询。
```

GeekNow 图片 API 最小协议：

```text
OpenAI Images 风格：
POST {base_url}/v1/images/generations
  -> 返回 data[].b64_json 或 data[].url

Gemini 风格：
POST {base_url}/v1beta/models/{model}:generateContent
  -> 返回 inlineData.data / text 中的 URL / data URI
```

推荐对接策略：

| 场景 | 推荐方式 |
|---|---|
| 快速复用插件能力 | 直接调用 `generate(context)` |
| 固定模型、服务端可控 | 直接实现对应 API 协议 |
| 前端需要非阻塞体验 | 自己服务层封装 `local_job_id` 后台任务 |
| 需要远端 `task_id` | 当前图片模块不支持，不能用本地日志 ID 替代 |
