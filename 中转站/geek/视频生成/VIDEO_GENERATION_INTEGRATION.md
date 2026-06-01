# 视频生成插件对接说明

本文档说明 `视频生成/main.py` 的视频生成调用方式，方便其他程序直接对接该插件或复用同等 API 调用流程。

## 1. 核心结论

视频生成与图片生成不同：当前标准 GeekNow 视频接口是**远端 task_id 轮询模式**。

标准流程是：

```text
调用 generate(context)
  -> POST {base_url}/v1/videos 提交视频生成任务
  -> API 返回 id，也就是远端 task_id
  -> 插件轮询 GET {base_url}/v1/videos/{task_id}
  -> 状态 completed 后解析 video_url
  -> 下载视频到本地 mp4
  -> generate(context) 返回本地视频路径列表
```

此外，代码里还有一个本地 Seedance 独立流程：

```text
POST http://localhost:3001/api/v1/generate
  -> 返回 jobId
  -> 轮询 GET http://localhost:3001/api/v1/jobs/{jobId}
  -> done 后取得 video.url/proxyUrl
  -> 下载视频到本地
```

所以对接时需要区分：

| 类型 | 是否返回任务 ID | 轮询接口 | 最终结果 |
|---|---:|---|---|
| 标准 GeekNow 视频接口 | 是，字段为 `id` | `GET /v1/videos/{id}` | `output.url` / `video_url` / `url` / `detail.url` |
| 本地 Seedance 服务 | 是，字段为 `jobId` | `GET /api/v1/jobs/{jobId}` | `video.url` / `video.proxyUrl` |
| 本地 SQLite 日志 | 本地 `id` | 本地数据库查询 | 历史记录，不是远端任务查询 |

## 2. 入口函数

主入口是：

```python
def generate(context):
    ...
    return [output_path]
```

位置：`视频生成/main.py`。

成功时返回本地 `.mp4` 路径列表；失败时抛出 `PLUGIN_ERROR:::` 前缀异常。

## 3. 输入参数结构

### 3.1 最小文生视频示例

```python
context = {
    "prompt": "一段电影感的未来城市航拍视频，夜景，霓虹灯，高细节",
    "reference_images": {},
    "output_dir": "C:/path/to/output",
    "plugin_params": {
        "api_key": "YOUR_API_KEY",
        "base_url": "https://api.geeknow.top",
        "model": "sora-2",
        "aspect_ratio": "16:9",
        "duration": "15",
        "audio_generation": "Disabled",
        "timeout": 900,
        "max_poll_attempts": 300,
        "poll_interval": 10,
        "generation_mode": "文生视频",
        "reference_image_type": "首帧图片"
    },
    "viewer_index": 0
}
```

### 3.2 图生视频示例

```python
context = {
    "prompt": "让画面中的人物缓慢转身，镜头轻微推进，电影质感",
    "reference_images": {
        "首帧": "C:/path/to/first.png",
        "尾帧": "C:/path/to/last.png",
        "参考图片MAP": {
            0: "C:/path/to/ref1.png",
            1: "C:/path/to/ref2.png"
        }
    },
    "first_frame_path": "C:/path/to/first.png",
    "end_frame_path": "C:/path/to/last.png",
    "output_dir": "C:/path/to/output",
    "plugin_params": {
        "api_key": "YOUR_API_KEY",
        "base_url": "https://api.geeknow.top",
        "model": "veo_3_1",
        "aspect_ratio": "16:9",
        "duration": "10",
        "generation_mode": "首尾帧",
        "reference_image_type": ["首帧图片", "尾帧图片"],
        "timeout": 900,
        "max_poll_attempts": 300,
        "poll_interval": 10
    },
    "viewer_index": 0
}
```

### 3.3 字段说明

| 字段 | 类型 | 必填 | 说明 |
|---|---:|---:|---|
| `prompt` | `str` | 是 | 视频提示词。 |
| `reference_images` | `dict` | 否 | 参考图片结构，支持首帧、尾帧、参考图集合。 |
| `first_frame_path` | `str` | 否 | 首帧图片路径，会写入 `reference_images['首帧']`。 |
| `end_frame_path` | `str` | 否 | 尾帧图片路径，会写入 `reference_images['尾帧']`。 |
| `output_dir` | `str` | 是 | 视频保存目录。 |
| `project_path` | `str` | 否 | `output_dir` 缺失时的兜底路径。 |
| `plugin_params.api_key` | `str` | 是 | GeekNow API Key。 |
| `plugin_params.base_url` | `str` | 否 | GeekNow Base URL，会被限制在内置线路里。 |
| `plugin_params.model` | `str` | 否 | 模型显示名或实际模型名。 |
| `plugin_params.aspect_ratio` | `str` | 否 | 宽高比，例如 `16:9`、`9:16`。 |
| `plugin_params.duration` | `str/int` | 否 | 视频时长，部分模型会自动修正。 |
| `plugin_params.audio_generation` | `str` | 否 | `Enabled` 表示有声，其他值默认为 `Disabled`。 |
| `plugin_params.timeout` | `int` | 否 | 创建任务请求超时，单位秒。 |
| `plugin_params.max_poll_attempts` | `int` | 否 | 最大轮询次数。默认 `300`。 |
| `plugin_params.poll_interval` | `int` | 否 | 每次轮询间隔秒数。默认 `10`。 |
| `plugin_params.generation_mode` | `str` | 否 | `文生视频`、`首帧生视频`、`首尾帧`、`参考生视频`、`首帧生视频+参考图`。 |
| `plugin_params.reference_image_type` | `str/list` | 否 | 指定参与生成的图片类型。 |
| `progress_callback` | `callable` | 否 | 进度回调，例如 `progress_callback("生成中", 50)`。 |
| `viewer_index` | `int` | 否 | 输出文件名前缀索引。 |

## 4. 返回值

`generate(context)` 成功返回本地视频路径列表：

```python
[
    "C:/path/to/output/0000_video_20260529_153000_123456.mp4"
]
```

当前主流程每次通常返回一个 `.mp4` 文件。

失败时抛出异常，例如：

```text
PLUGIN_ERROR:::API Key 未设置，请在插件设置中配置
PLUGIN_ERROR:::API 响应中没有 'id' (task_id)。请检查 API 响应或联系中转站。
PLUGIN_ERROR:::超过最大轮询次数 (300)，视频未生成
PLUGIN_ERROR:::视频下载失败，请通过插件任务日志下载重新拉取
```

## 5. 标准 GeekNow 视频接口流程

### 5.1 创建远端任务

请求地址：

```text
POST {base_url}/v1/videos
```

代码会根据模型决定请求格式：

| 模型类型 | 请求格式 |
|---|---|
| `wan2.6-*` | JSON |
| `Vidu-*` | JSON |
| `Kling-*` | JSON |
| `Hailuo-*` | JSON |
| `Hunyuan-*` / `Mingmou-*` / `OS-*` / `GV-*` / `SV-*` / `JV-*` | JSON |
| 其他模型，如 Sora / Veo / Grok / Doubao | multipart/form-data |

创建成功后，API 必须返回：

```json
{
  "id": "video_task_id"
}
```

如果响应里没有 `id`，插件会直接报错。

### 5.2 轮询远端任务

请求地址：

```text
GET {base_url}/v1/videos/{task_id}
```

默认：

```text
max_poll_attempts = 300
poll_interval = 10 秒
```

理论最大等待时间约：

```text
300 * 10 = 3000 秒，约 50 分钟
```

轮询时会处理以下状态：

| 状态 | 插件行为 |
|---|---|
| `pending` | 回调显示排队中。 |
| `queued` | 回调显示排队中。 |
| `processing` | 回调显示生成中。 |
| `in_progress` | 回调显示生成中。 |
| `completed` | 解析视频 URL 并结束轮询。 |
| `failed` | 解析失败原因并抛错。 |

进度字段兼容：

```text
detail.pending_info.progress_pct
progress
```

### 5.3 完成响应解析

当状态为 `completed` 时，插件按顺序尝试取视频 URL：

```python
output = status_data.get("output")
if output and isinstance(output, dict):
    video_url = output.get("url")

video_url = status_data.get("video_url") or status_data.get("url")
video_url = detail.get("url")
```

支持的响应示例：

```json
{
  "status": "completed",
  "output": {
    "url": "https://example.com/video.mp4"
  }
}
```

或：

```json
{
  "status": "completed",
  "video_url": "https://example.com/video.mp4"
}
```

或：

```json
{
  "status": "completed",
  "detail": {
    "url": "https://example.com/video.mp4"
  }
}
```

如果 `completed` 但没有 URL，会抛出：

```text
PLUGIN_ERROR:::API 报告 'completed' 但未返回 video_url
```

### 5.4 下载视频

拿到 `video_url` 后，插件会先直接下载：

```text
GET {video_url}
```

如果直接 URL 下载失败，会尝试备用下载接口：

```text
GET {base_url}/v1/videos/{task_id}/content
```

两种方式都失败时，任务日志会记录为 `download_failed`。

## 6. 本地 Seedance 独立流程

当模型映射结果包含 `doubao-seedance2.0-fast` 时，`generate(context)` 不走标准 GeekNow `/v1/videos`，而是进入 `_generate_seedance_local(context)`。

流程：

```text
1. 收集 1~5 张参考图片
2. POST http://localhost:3001/api/v1/generate
3. 响应中读取 jobId
4. 每 4 秒轮询 GET http://localhost:3001/api/v1/jobs/{jobId}
5. 最多轮询 300 次
6. status=done 后读取 video.url 或 video.proxyUrl
7. 下载视频并保存本地
```

提交请求示例：

```text
POST http://localhost:3001/api/v1/generate
Content-Type: multipart/form-data
```

表单字段：

| 字段 | 说明 |
|---|---|
| `prompt` | 视频提示词。 |
| `model` | 固定为 `seedance-2.0-fast`。 |
| `ratio` | 宽高比。 |
| `duration` | 时长，限制为 4~15 秒。 |
| `images` | 参考图片文件，最多 5 张。 |

成功响应必须包含：

```json
{
  "jobId": "local_job_id"
}
```

轮询响应完成示例：

```json
{
  "status": "done",
  "video": {
    "url": "/files/output.mp4",
    "proxyUrl": "http://localhost:3001/files/output.mp4"
  }
}
```

本地 Seedance 注意事项：

- 必须至少有 1 张参考图片。
- 代码中 `_init_seedance()` 未主动调用。
- 文件末尾会检测并删除同级 `seedance-fast` 目录；当前代码看起来不会保留本地 Seedance 服务目录。
- 若要启用本地 Seedance，需要额外确认目录、Node 服务和启动逻辑。

## 7. 请求 payload 构建规则

## 7.1 通用 payload

多数模型基础字段：

```json
{
  "model": "sora-2",
  "prompt": "视频提示词",
  "size": "1280x720",
  "seconds": "15",
  "metadata": {
    "output_config": {
      "aspect_ratio": "16:9",
      "audio_generation": "Disabled"
    }
  }
}
```

`aspect_ratio` 与 `size` 默认映射：

| `aspect_ratio` | `size` |
|---|---|
| `16:9` | `1280x720` |
| 非 `16:9` | `720x1280` |

## 7.2 JSON 模型

以下模型会通过 JSON 提交：

```text
wan2.6-*
Vidu-*
Kling-*
Hailuo-*
Hunyuan-*
Mingmou-*
OS-*
GV-*
SV-*
JV-*
```

如果有图片文件，插件会把文件注入为 base64 data URL：

```text
data:image/png;base64,<base64>
```

Vidu / Hailuo 的部分模式会先上传图片到图床，拿到 URL 后放入 payload。

## 7.3 multipart/form-data 模型

Sora / Veo / Grok / Doubao 等多数模型走 multipart。

表单字段一般包括：

```text
model
prompt
size
seconds
metadata
```

图片字段可能包括：

| 字段 | 用途 |
|---|---|
| `input_reference` | Sora / Veo / Grok 等参考图字段，可多张。 |
| `first_frame_image` | 豆包首帧图字段。 |
| `last_frame_image` | 豆包尾帧图字段。 |
| `image` | wan2.6-i2v 或部分 JSON 注入场景。 |

## 8. 生成模式说明

| 生成模式 | 说明 |
|---|---|
| `文生视频` | 仅使用 prompt，不上传图片。 |
| `首帧生视频` | 使用一张图片作为首帧。 |
| `首尾帧` | 使用首帧和尾帧两张图片。 |
| `参考生视频` | 使用多张参考图引导生成。 |
| `首帧生视频+参考图` | Grok 特化模式，首帧 + 多张参考图。 |

不同模型对模式支持不完全一致。代码会在不支持时降级或记录警告，例如：

- Hailuo 不支持首尾帧/参考生视频，会退化为文生视频。
- 豆包不支持参考生视频，会退化为文生视频。
- Veo 参考生视频强制 `16:9`。
- Vidu 参考生视频最多上传 3 张参考图。
- Grok 参考生视频最多上传 6 张参考图。

## 9. 模型映射

`plugin_params.model` 可以是显示名，也可以是实际模型名。主要映射如下：

| 显示名 | 实际模型名 |
|---|---|
| `sora-2` | `sora-2` |
| `sora-2[vip]` | `sora-2[vip]` |
| `sora3` | `sora3` |
| `sora-2-oai` | `sora-2-oai` |
| `veo_3_1` | `veo_3_1` |
| `veo_3_1-fast` | `veo_3_1-fast` |
| `蛤肉3` | `grok-video-3` |
| `蛤肉-pro(10s)` | `grok-video-3-pro` |
| `蛤肉-max(15s)` | `grok-video-3-max` |
| `豆包Seedance1.5Pro-480p` | `doubao-seedance-1-5-pro_480p` |
| `豆包Seedance1.5Pro-720p` | `doubao-seedance-1-5-pro_720p` |
| `豆包Seedance1.5Pro-1080p` | `doubao-seedance-1-5-pro_1080p` |
| `wan2.6-t2v-1280*720（阿里文生视频，价格较低）` | `wan2.6-t2v:1280*720` |
| `wan2.6-t2v-1920*1080（阿里文生视频，价格较高）` | `wan2.6-t2v:1920*1080` |
| `wan2.6-i2v-1280*720（阿里图生视频，价格较低）` | `wan2.6-i2v:1280*720` |
| `wan2.6-i2v-1920*1080（阿里图生视频，价格较高）` | `wan2.6-i2v:1920*1080` |
| `Vidu-q3-pro` | `Vidu-q3-pro` |
| `Vidu-q3-turbo` | `Vidu-q3-turbo` |
| `Kling-3.0` | `Kling-3.0` |
| `Kling-3.0-Omni` | `Kling-3.0-Omni` |
| `Hailuo-2.3` | `Hailuo-2.3` |
| `Hailuo-2.3-fast` | `Hailuo-2.3-fast` |
| `doubao-seedance2.0-fast` | `doubao-seedance2.0-fast` |
| `dance2-fast-15s` | `dance2-fast-15s` |

部分模型有固定参数：

| 模型 | 固定/推荐参数 |
|---|---|
| `grok-video-3-pro` | 10 秒。 |
| `grok-video-3-max` | 15 秒。 |
| `sora2-pro-landscape-25s` | 25 秒，`16:9`。 |
| `sora2-pro-portrait-25s` | 25 秒，`9:16`。 |
| `dance2-fast-15s` | 15 秒。 |

注意：`_MODEL_FIXED_PARAMS` 在当前代码中定义了固定参数表，但主流程没有统一应用这个表；部分约束是通过其他逻辑或模型侧处理。

## 10. 本地任务日志

插件会写入 SQLite 数据库：

```text
视频生成/video_task_logs.db
```

表名：

```text
video_task_logs
```

### 10.1 字段说明

| 字段 | 说明 |
|---|---|
| `id` | 本地日志 ID，不是远端 task_id。 |
| `created_at` | 创建时间。 |
| `completed_at` | 完成时间。 |
| `model_display` | 显示模型名。 |
| `model_name` | 实际模型名。 |
| `prompt` | 提示词。 |
| `aspect_ratio` | 宽高比。 |
| `duration` | 视频时长。 |
| `reference_images` | 参考图片路径 JSON。 |
| `base_url` | Base URL。 |
| `endpoint` | 创建任务接口地址。 |
| `generation_mode` | 生成模式。 |
| `api_task_id` | 远端任务 ID，标准接口为 `id`，Seedance 为 `jobId`。 |
| `status` | 本地日志状态。 |
| `video_url` | 生成完成后的视频 URL。 |
| `local_path` | 下载到本地的 mp4 路径。 |
| `error` | 错误信息。 |
| `metadata` | 额外信息。 |

### 10.2 状态说明

| 状态 | 含义 |
|---|---|
| `running` | 已提交或正在生成。 |
| `success` | 视频已下载并保存本地。 |
| `failed` | 生成失败或轮询失败。 |
| `download_failed` | 远端生成成功，但本地下载失败。 |
| `manual_success` | 从日志手动重新下载成功。 |
| `manual_failed` | 从日志手动重新下载失败。 |
| `no_retry_error` | 不可重试错误状态，状态表中存在但主流程较少直接写入。 |

### 10.3 查询本地日志

插件动作：

```python
handle_action('get_task_logs', {'limit': 200})
```

返回：

```python
{
    'ok': True,
    'logs': [
        {
            'id': 1,
            'api_task_id': 'remote_task_id',
            'status': 'success',
            'video_url': 'https://example.com/video.mp4',
            'local_path': 'C:/output/0000_video_xxx.mp4'
        }
    ]
}
```

注意：

- `id` 是本地日志 ID。
- `api_task_id` 才是远端 API 的任务 ID。

## 11. 手动重新下载

如果生成成功但下载失败，日志中会保存 `video_url`，状态为 `download_failed`。

可以调用：

```python
handle_action('download_videos', {
    'task_ids': [1, 2, 3]
})
```

内部执行：

```python
download_videos_from_logs(task_ids)
```

流程：

```text
读取本地日志 id
  -> 取出 video_url
  -> 重新下载视频
  -> 保存为 redownload_{id}_{timestamp}.mp4
  -> 更新日志为 manual_success 或 manual_failed
```

这不是重新向远端查询任务状态，也不是重新生成视频，只是用已保存的 `video_url` 再下载。

## 12. 实时日志

插件维护内存日志缓冲区：

```python
get_buffered_logs(since_index=0)
```

插件动作：

```python
handle_action('get_logs', {'since_index': 0})
```

返回：

```python
{
    'ok': True,
    'entries': [
        {
            'index': 1,
            'time': 1710000000.0,
            'level': 'INFO',
            'msg': '...'
        }
    ]
}
```

实时日志只在当前进程内有效，不等同于 SQLite 历史任务日志。

## 13. 错误处理约定

### 13.1 API Key 未设置

```text
PLUGIN_ERROR:::API Key 未设置，请在插件设置中配置
```

### 13.2 创建任务失败

```text
PLUGIN_ERROR:::API 错误: 400 - ...
```

### 13.3 创建任务响应缺少 task_id

```text
PLUGIN_ERROR:::API 响应中没有 'id' (task_id)。请检查 API 响应或联系中转站。
```

### 13.4 轮询连续失败

轮询状态接口连续失败超过 5 次会抛出：

```text
PLUGIN_ERROR:::连续请求失败超过 5 次，最后状态码: ...
PLUGIN_ERROR:::连续请求异常超过 5 次，最后一次异常: ...
PLUGIN_ERROR:::连续响应解析异常超过 5 次，最后一次异常: ...
```

### 13.5 远端任务失败

当远端状态为 `failed` 时，会尝试读取：

```text
detail.pending_info.failure_reason
detail.failure_reason
error
```

然后抛出：

```text
PLUGIN_ERROR:::<失败原因>
```

### 13.6 超过最大轮询次数

```text
PLUGIN_ERROR:::超过最大轮询次数 (300)，视频未生成
```

### 13.7 下载失败

```text
PLUGIN_ERROR:::视频下载失败，请通过插件任务日志下载重新拉取
```

### 13.8 本地 Seedance 错误

```text
PLUGIN_ERROR:::Seedance 模型需要至少 1 张参考图片
PLUGIN_ERROR:::响应中无 jobId: {...}
PLUGIN_ERROR:::任务不存在或已过期
PLUGIN_ERROR:::生成完成但无视频 URL
PLUGIN_ERROR:::超过最大轮询次数 (300)
```

## 14. 其他程序直接对接建议

## 14.1 方式 A：直接调用 `generate(context)`

适合：

- 其他程序和插件在同一 Python 环境。
- 希望复用插件内置模型映射、图片处理、轮询、下载和日志。
- 接受同步阻塞直到视频下载完成。

示例：

```python
import importlib.util

plugin_path = r"C:/Users/Admin/Desktop/geek/视频生成/main.py"
spec = importlib.util.spec_from_file_location("video_plugin", plugin_path)
video_plugin = importlib.util.module_from_spec(spec)
spec.loader.exec_module(video_plugin)

context = {
    "prompt": "一段未来城市航拍视频，电影感，夜景，高细节",
    "reference_images": {},
    "output_dir": r"C:/Users/Admin/Desktop/geek/output",
    "plugin_params": {
        "api_key": "YOUR_API_KEY",
        "base_url": "https://api.geeknow.top",
        "model": "sora-2",
        "aspect_ratio": "16:9",
        "duration": "15",
        "audio_generation": "Disabled",
        "timeout": 900,
        "max_poll_attempts": 300,
        "poll_interval": 10,
        "generation_mode": "文生视频",
        "reference_image_type": "首帧图片"
    },
    "viewer_index": 0
}

try:
    files = video_plugin.generate(context)
    print("生成成功:", files)
except Exception as exc:
    print("生成失败:", exc)
```

注意：

- `main.py` 依赖上级目录的 `plugin_utils.py`。
- `generate(context)` 是同步阻塞函数，视频生成可能持续数分钟到几十分钟。
- 建议在后台线程、任务队列或独立进程中调用。

## 14.2 方式 B：直接对接 GeekNow 标准视频 API

如果不依赖插件，可以按以下协议自行实现：

```python
import requests
import time

base_url = "https://api.geeknow.top"
headers = {"Authorization": "Bearer YOUR_API_KEY"}

payload = {
    "model": "sora-2",
    "prompt": "一段未来城市航拍视频",
    "size": "1280x720",
    "seconds": "15",
    "metadata": {
        "output_config": {
            "aspect_ratio": "16:9",
            "audio_generation": "Disabled"
        }
    }
}

create_resp = requests.post(f"{base_url}/v1/videos", headers=headers, data=payload, timeout=900)
create_resp.raise_for_status()
task_id = create_resp.json()["id"]

video_url = None
for _ in range(300):
    time.sleep(10)
    status_resp = requests.get(f"{base_url}/v1/videos/{task_id}", headers=headers, timeout=900)
    status_resp.raise_for_status()
    data = status_resp.json()
    status = data.get("status")

    if status == "completed":
        output = data.get("output") or {}
        video_url = output.get("url") or data.get("video_url") or data.get("url") or (data.get("detail") or {}).get("url")
        break
    if status == "failed":
        raise RuntimeError(data)

if not video_url:
    raise TimeoutError("视频生成超时")

video_data = requests.get(video_url, timeout=9000).content
with open("output.mp4", "wb") as f:
    f.write(video_data)
```

如果是 JSON 模型，把 `data=payload` 改为：

```python
headers["Content-Type"] = "application/json"
requests.post(f"{base_url}/v1/videos", headers=headers, json=payload, timeout=900)
```

## 14.3 方式 C：封装成自己的异步 HTTP 服务

推荐服务层语义：

```text
POST /video-jobs
  -> 返回 local_job_id

GET /video-jobs/{local_job_id}
  -> 返回 local status / progress / remote api_task_id / local_path
```

内部实现：

```text
你的服务创建 local_job_id
  -> 后台线程调用 generate(context)
  -> generate 内部再提交远端 task_id 并轮询
  -> 生成成功后保存 local_path
```

不要把本地日志 `id` 和远端 `api_task_id` 混用。

建议响应示例：

```json
{
  "ok": true,
  "local_job_id": "job_001",
  "status": "running",
  "api_task_id": "remote_video_task_id"
}
```

完成后：

```json
{
  "ok": true,
  "local_job_id": "job_001",
  "status": "success",
  "api_task_id": "remote_video_task_id",
  "video_url": "https://example.com/video.mp4",
  "local_path": "C:/output/0000_video_xxx.mp4"
}
```

## 15. 对接时容易误解的点

### 15.1 `api_task_id` 才是远端任务 ID

SQLite 表中：

```text
id          本地日志 ID
api_task_id 远端视频任务 ID
```

标准视频接口创建任务返回的 `result['id']` 会保存到 `api_task_id`。

### 15.2 `generate(context)` 虽然内部轮询，但外部表现是同步函数

调用方不会先拿到 task_id 再自己轮询；如果直接调用 `generate(context)`，它会一直阻塞到：

- 视频生成成功并下载完成；或
- 生成失败；或
- 轮询超时；或
- 下载失败。

如果其他程序需要立即返回任务 ID，需要自己封装服务层异步任务。

### 15.3 下载失败不等于远端生成失败

状态 `download_failed` 表示远端已经返回 `video_url`，只是本地下载失败。此时可以用任务日志里的 `video_url` 重新下载。

### 15.4 手动重新下载不是重新生成

`download_videos` 只用旧的 `video_url` 再下载一次，不会重新提交 `/v1/videos`，也不会轮询 `/v1/videos/{api_task_id}`。

### 15.5 图片输入格式会因模型不同而变化

同样是图生视频：

- 有些模型用 multipart 文件字段。
- 有些模型用 JSON base64 data URL。
- Vidu / Hailuo 部分场景会先上传到图床得到 URL。

建议优先复用插件的 `_build_request_payload()`，不要在外部手写所有模型分支，除非你只对接固定模型。

## 16. 推荐对接策略

### 16.1 如果只想快速集成

直接调用：

```python
files = generate(context)
```

优点：复用现有逻辑。  
缺点：同步阻塞，依赖插件文件结构。

### 16.2 如果要做稳定服务

建议自己封装：

```text
外部服务 local_job_id
  -> 后台调用 generate(context)
  -> 数据库记录 api_task_id / status / video_url / local_path / error
```

优点：调用方体验更好，可中断、可恢复、可查进度。  
缺点：需要自己管理任务队列和状态表。

### 16.3 如果只对接固定模型

可以直接实现：

```text
POST /v1/videos
GET /v1/videos/{id}
GET video_url 或 /v1/videos/{id}/content
```

优点：依赖少、可控。  
缺点：需要自己处理模型参数、图片字段、异常和兼容逻辑。

## 17. 最小协议总结

标准 GeekNow 视频生成最小协议：

```text
1. POST {base_url}/v1/videos
   返回: { "id": "task_id" }

2. GET {base_url}/v1/videos/{task_id}
   等待: status == "completed"
   失败: status == "failed"

3. 从响应中取视频 URL:
   output.url / video_url / url / detail.url

4. 下载视频:
   GET video_url
   备用: GET {base_url}/v1/videos/{task_id}/content
```

本插件外部调用最小语义：

```text
generate(context) 是同步阻塞函数。
内部会创建远端 task_id 并轮询。
成功返回本地 mp4 路径列表。
本地日志 id 不是远端 task_id。
远端 task_id 保存在 api_task_id 字段。
```
