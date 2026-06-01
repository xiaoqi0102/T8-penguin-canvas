# -*- coding: utf-8 -*-
"""
Nano Banana 中转插件 - GeekNow
通过 GeekNow API 调用 Gemini 2.5 Flash Image 模型生成图片
"""
import base64
import collections
import hashlib
import json
import logging
import os
import re
import shutil
import sqlite3
import sys
import tempfile
import threading
import zipfile
from datetime import datetime
from io import BytesIO
from pathlib import Path
from urllib.parse import urlparse

import requests
from PIL import Image

sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from plugin_utils import load_plugin_config


# --------------------- 工具 ---------------------

def _serialize_reference_images(reference_images):
    try:
        return json.dumps(reference_images, ensure_ascii=False, default=str)
    except Exception as err:
        print(f"[TaskLog] 序列化参考图片失败: {err}")
        return str(reference_images)


def _dict_to_json(data):
    if not data:
        return None
    try:
        return json.dumps(data, ensure_ascii=False, default=str)
    except Exception as err:
        print(f"[TaskLog] 序列化 metadata 失败: {err}")
        return None


def _normalize_base_url(url: str) -> str:
    if not url:
        return ''
    return url.rstrip('/')


def image_to_base64(image_path):
    """
    将图片转换为 base64
    """
    try:
        with Image.open(image_path) as img:
            if img.mode != 'RGB':
                img = img.convert('RGB')

            buffered = BytesIO()
            img.save(buffered, format="PNG")
            base64_str = base64.b64encode(buffered.getvalue()).decode('utf-8')
            return base64_str
    except Exception as e:
        print(f"Error converting image to base64: {str(e)}")
        return None


class ImageDownloadError(Exception):
    def __init__(self, message, image_url=None):
        super().__init__(message)
        self.image_url = image_url


def _get_valid_base_url(url: str) -> str:
    normalized = _normalize_base_url(url)
    if not normalized:
        return _normalize_base_url(_DEFAULT_BASE_URL)
    for suffix in ('/v1beta', '/v1'):
        if normalized.endswith(suffix):
            normalized = _normalize_base_url(normalized[:-len(suffix)])
            break
    if normalized in _VALID_BASE_URLS:
        return normalized
    return _normalize_base_url(_DEFAULT_BASE_URL)


# --------------------- 工具 ---------------------

# --------------------- 自动更新 ---------------------

def get_params():
    params = _default_params.copy()
    params.update(load_plugin_config(_PLUGIN_FILE))
    params['base_url'] = _get_valid_base_url(
        params.get('base_url') or params.get('endpoint') or _DEFAULT_BASE_URL
    )
    return params


def _check_update_available():
    params = get_params()
    manifest_url = str(params.get('update_manifest_url', '')).strip()
    if not manifest_url:
        return {'ok': False, 'error': '请先填写更新清单 URL'}

    try:
        response = requests.get(manifest_url)
        if response.status_code != 200:
            raise Exception(f"HTTP {response.status_code}")
        manifest = response.json()
    except Exception as err:
        return {'ok': False, 'error': f'拉取清单失败: {err}'}

    plugins = manifest.get('plugins') if isinstance(manifest, dict) else None
    if not isinstance(plugins, list):
        return {'ok': False, 'error': 'manifest.json 格式错误：缺少 plugins'}

    remote = None
    for item in plugins:
        if isinstance(item, dict) and str(item.get('plugin_id', '')).strip() == _PLUGIN_ID:
            remote = item
            break

    if not remote:
        return {'ok': True, 'has_update': False, 'message': f'清单中未找到插件: {_PLUGIN_ID}'}

    remote_version = str(remote.get('version', '')).strip()
    if not remote_version:
        return {'ok': False, 'error': '清单缺少 version'}

    if not _is_newer_version(remote_version, _PLUGIN_VERSION):
        return {
            'ok': True,
            'has_update': False,
            'message': f'远端版本（{remote_version}）低于本地版本（{_PLUGIN_VERSION}），无需更新',
        }

    return {
        'ok': True,
        'has_update': True,
        'local_version': _PLUGIN_VERSION,
        'remote_version': remote_version,
        'changelog': str(remote.get('changelog', '')).strip() or '无',
        'download_url': str(remote.get('download_url', '')).strip(),
        'sha256': str(remote.get('sha256', '')).strip().lower(),
    }


def _execute_update(download_url, expected_sha256=''):
    if not download_url:
        return {'ok': False, 'error': '缺少 download_url'}

    work_dir = Path(tempfile.mkdtemp(prefix=f"{_PLUGIN_ID}_update_"))
    try:
        parsed = urlparse(download_url)
        file_name = Path(parsed.path).name or f"{_PLUGIN_ID}_update.pkg"
        package_path = work_dir / file_name

        with requests.get(download_url, timeout=120, stream=True) as stream_resp:
            if stream_resp.status_code != 200:
                raise Exception(f"下载失败: HTTP {stream_resp.status_code}")
            with open(package_path, 'wb') as file_obj:
                for chunk in stream_resp.iter_content(chunk_size=8192):
                    if chunk:
                        file_obj.write(chunk)

        if expected_sha256:
            actual_sha256 = _compute_sha256(package_path)
            if actual_sha256 != expected_sha256:
                raise Exception(f"SHA256 校验失败: {actual_sha256}")

        new_main = _resolve_update_main_py(package_path)
        backup_file = _install_main_py(new_main)
        _install_extra_files(new_main)
        return {
            'ok': True,
            'message': f'插件已更新，备份文件: {backup_file.name}\n请重启应用后生效',
        }
    except Exception as err:
        return {'ok': False, 'error': str(err)}
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def _compute_sha256(file_path):
    hasher = hashlib.sha256()
    with open(file_path, 'rb') as f:
        for chunk in iter(lambda: f.read(8192), b''):
            hasher.update(chunk)
    return hasher.hexdigest().lower()


def _parse_version(version_text):
    """
    解析版本
    """
    if version_text is None:
        return (0,)
    parts = []
    for segment in str(version_text).strip().split('.'):
        match = re.match(r'^(\d+)', segment)
        parts.append(int(match.group(1)) if match else 0)
    return tuple(parts) if parts else (0,)


def _is_newer_version(remote_version, local_version):
    """
    远端版本是否 >= 本地版本（同版本也视为可更新）
    """
    remote = list(_parse_version(remote_version))
    local = list(_parse_version(local_version))
    length = max(len(remote), len(local))
    remote.extend([0] * (length - len(remote)))
    local.extend([0] * (length - len(local)))
    return tuple(remote) >= tuple(local)


def _resolve_update_main_py(package_path):
    """
    处理更新 main 脚本
    """
    package_path = Path(package_path)
    if package_path.suffix.lower() == '.py':
        return package_path

    if package_path.suffix.lower() != '.zip':
        raise Exception(f"不支持的更新包格式: {package_path.suffix}")

    extract_dir = Path(tempfile.mkdtemp(prefix=f"{_PLUGIN_ID}_extract_"))
    with zipfile.ZipFile(package_path, 'r') as archive:
        archive.extractall(extract_dir)

    candidates = [
        extract_dir / 'main.py',
        extract_dir / _PLUGIN_ID / 'main.py',
    ]

    main_files = list(extract_dir.rglob('main.py'))
    plugin_candidates = [item for item in main_files if item.parent.name == _PLUGIN_ID]
    if plugin_candidates:
        candidates.extend(plugin_candidates)
    candidates.extend(main_files)

    for candidate in candidates:
        if candidate and candidate.exists() and candidate.is_file():
            return candidate

    raise Exception("更新包中未找到 main.py")


def _install_main_py(new_main_path):
    """
    安装main 脚本
    """
    target_file = Path(_PLUGIN_FILE)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_file = target_file.parent / f"main.py.bak.{timestamp}"
    shutil.copy2(target_file, backup_file)

    try:
        shutil.copy2(new_main_path, target_file)
    except Exception as err:
        shutil.copy2(backup_file, target_file)
        raise Exception(f"安装失败，已回滚: {err}")

    return backup_file


def _install_extra_files(new_main_path):
    """
    将更新包中 main.py 同级的其他文件/文件夹复制到插件目录
    对 .py 直接包（无解压目录）跳过处理
    """
    source_dir = Path(new_main_path).parent
    target_dir = Path(_PLUGIN_FILE).parent

    # 直接下载的 .py 文件：source_dir 是临时工作目录，不含附属文件，跳过
    if source_dir == target_dir:
        return

    copied, failed = [], []
    for item in source_dir.iterdir():
        if item.name == 'main.py':
            continue  # 已由 _install_main_py 处理
        dest = target_dir / item.name
        try:
            if item.is_dir():
                if dest.exists():
                    shutil.rmtree(dest)
                shutil.copytree(item, dest)
            else:
                shutil.copy2(item, dest)
            copied.append(item.name)
        except Exception as e:
            failed.append(item.name)
            _log(f"警告: 复制附属文件 {item.name} 失败: {e}")

    if copied:
        _log(f"已复制附属文件/目录: {', '.join(copied)}")
    if failed:
        _log(f"以下附属文件复制失败（不影响主程序更新）: {', '.join(failed)}")


# --------------------- 自动更新 ---------------------


# --------------------- SQLite 任务日志 ---------------------

_STATUS_DISPLAY_MAP = {
    'running': ('运行中', '#FFD600'),
    'generated': ('生成成功', '#4CAF50'),  # API 返回 URL，生成成功
    'success': ('下载成功', '#4CAF50'),  # 下载到本地成功
    'manual_success': ('手动下载成功', '#4CAF50'),
    'failed': ('生成失败', '#FF5252'),
    'no_retry_error': ('生成失败', '#FF5252'),
    'download_failed': ('下载失败', '#42A5F5'),
    'manual_failed': ('下载失败', '#42A5F5')
}


def _get_status_display(status_key):
    status_key = (status_key or '').lower()
    return _STATUS_DISPLAY_MAP.get(status_key, (status_key or '未知', '#FFFFFF'))


def _init_task_log_db():
    try:
        conn = sqlite3.connect(_TASK_LOG_DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS image_task_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT,
                completed_at TEXT,
                model_display TEXT,
                model_name TEXT,
                prompt TEXT,
                aspect_ratio TEXT,
                image_size TEXT,
                reference_images TEXT,
                base_url TEXT,
                endpoint TEXT,
                task_mode TEXT,
                status TEXT,
                image_url TEXT,
                local_path TEXT,
                error TEXT,
                metadata TEXT
            )
            """
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_image_logs_status ON image_task_logs(status)"
        )
        cursor.execute("PRAGMA table_info(image_task_logs)")
        existing_cols = {row[1] for row in cursor.fetchall()}
        if 'task_mode' not in existing_cols:
            cursor.execute("ALTER TABLE image_task_logs ADD COLUMN task_mode TEXT")
        if 'completed_at' not in existing_cols:
            cursor.execute("ALTER TABLE image_task_logs ADD COLUMN completed_at TEXT")
        conn.commit()
    except Exception as err:
        print(f"[TaskLog] 初始化数据库失败: {err}")
    finally:
        if 'conn' in locals():
            conn.close()


def _insert_task_log_entry(entry):
    try:
        conn = sqlite3.connect(_TASK_LOG_DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO image_task_logs (
                created_at, completed_at, model_display, model_name, prompt, aspect_ratio,
                image_size, reference_images, base_url, endpoint, task_mode, status,
                image_url, local_path, error, metadata
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                entry.get('created_at'),
                entry.get('completed_at'),
                entry.get('model_display'),
                entry.get('model_name'),
                entry.get('prompt'),
                entry.get('aspect_ratio'),
                entry.get('image_size'),
                entry.get('reference_images'),
                entry.get('base_url'),
                entry.get('endpoint'),
                entry.get('task_mode'),
                entry.get('status'),
                entry.get('image_url'),
                entry.get('local_path'),
                entry.get('error'),
                entry.get('metadata')
            )
        )
        conn.commit()
        return cursor.lastrowid
    except Exception as err:
        print(f"[TaskLog] 写入失败: {err}")
    finally:
        if 'conn' in locals():
            conn.close()
    return None


def _update_task_log_entry(log_id, **fields):
    if not fields:
        return
    assignments = []
    values = []
    for key, value in fields.items():
        assignments.append(f"{key} = ?")
        values.append(value)
    values.append(log_id)
    try:
        conn = sqlite3.connect(_TASK_LOG_DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
            f"UPDATE image_task_logs SET {', '.join(assignments)} WHERE id = ?",
            values
        )
        conn.commit()
    except Exception as err:
        print(f"[TaskLog] 更新失败: {err}")
    finally:
        if 'conn' in locals():
            conn.close()


def _fetch_task_logs(limit=None, status_filter=None, task_ids=None, require_url=False):
    try:
        conn = sqlite3.connect(_TASK_LOG_DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        query = "SELECT * FROM image_task_logs WHERE 1=1"
        params = []
        if status_filter:
            placeholders = ','.join(['?'] * len(status_filter))
            query += f" AND status IN ({placeholders})"
            params.extend(status_filter)
        if task_ids:
            placeholders = ','.join(['?'] * len(task_ids))
            query += f" AND id IN ({placeholders})"
            params.extend(task_ids)
        if require_url:
            query += " AND image_url IS NOT NULL AND image_url != ''"
        query += " ORDER BY id DESC"
        if limit:
            query += " LIMIT ?"
            params.append(limit)
        cursor.execute(query, params)
        rows = cursor.fetchall()
        return [dict(row) for row in rows]
    except Exception as err:
        print(f"[TaskLog] 查询失败: {err}")
        return []
    finally:
        if 'conn' in locals():
            conn.close()


def get_recent_task_logs(limit=20, status=None):
    status_filter = [status] if status else None
    return _fetch_task_logs(limit=limit, status_filter=status_filter)


def _download_file_from_url(image_url, timeout):
    download_headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
    }
    response = requests.get(
        image_url,
        headers=download_headers,
        timeout=timeout,
        stream=True,
    )
    if response.status_code != 200:
        raise Exception(f"HTTP {response.status_code}")
    return response.content


def _infer_filename_from_log(log):
    if log.get('local_path'):
        return os.path.basename(log['local_path'])
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return f"task_{log['id']}_{timestamp}.png"


def download_images_from_logs(task_ids=None, status_filter=None, output_dir=None, limit=None, download_timeout=300):
    logs = _fetch_task_logs(limit=limit, status_filter=status_filter, task_ids=task_ids, require_url=True)
    if not logs:
        _log("手动拉图: 未找到符合条件的任务")
        return []
    target_dir = Path(output_dir) if output_dir else (plugin_dir / 'manual_downloads')
    target_dir.mkdir(parents=True, exist_ok=True)
    _log(f"手动拉图: 共 {len(logs)} 个任务，保存目录: {target_dir}")
    results = []
    for log in logs:
        image_url = log.get('image_url')
        if not image_url:
            _log(f"手动拉图: ID={log['id']} 跳过，无图片URL")
            results.append({
                'id': log['id'],
                'status': 'skipped',
                'message': '日志中无图片URL'
            })
            continue
        metadata = {}
        if log.get('metadata'):
            try:
                metadata = json.loads(log['metadata'])
            except json.JSONDecodeError:
                metadata = {}
        timeout = int(metadata.get('download_timeout', download_timeout))
        filename = _infer_filename_from_log(log)
        dest_path = target_dir / filename
        _log(f"手动拉图: ID={log['id']} 开始下载 {image_url}")
        try:
            file_bytes = _download_file_from_url(image_url, timeout)
            with open(dest_path, 'wb') as f:
                f.write(file_bytes)
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            _update_task_log_entry(
                log['id'],
                status='manual_success',
                local_path=str(dest_path),
                error=None,
                completed_at=timestamp
            )
            _log(f"手动拉图: ID={log['id']} 下载成功 -> {dest_path}")
            results.append({
                'id': log['id'],
                'status': 'success',
                'message': str(dest_path)
            })
        except Exception as err:
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            _update_task_log_entry(
                log['id'],
                status='download_failed',
                error=str(err),
                completed_at=timestamp
            )
            _log(f"手动拉图: ID={log['id']} 下载失败: {err}", 'ERROR')
            results.append({
                'id': log['id'],
                'status': 'failed',
                'message': f"{err}"
            })
    return results


def _log_task_result(task_context, status, image_url=None, local_path=None, error=None, log_id=None, completed=False):
    if not task_context:
        return None
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    if log_id:
        update_fields = {
            'status': status,
            'image_url': image_url,
            'local_path': local_path,
            'error': error
        }
        if completed:
            update_fields['completed_at'] = timestamp
        _update_task_log_entry(log_id, **{k: v for k, v in update_fields.items() if v is not None})
        print(f"[TaskLog] 更新任务日志 ID={log_id}, 状态={status}")
        return log_id
    entry = {
        'created_at': timestamp,
        'completed_at': timestamp if completed else None,
        'model_display': task_context.get('model_display'),
        'model_name': task_context.get('model_name'),
        'prompt': task_context.get('prompt'),
        'aspect_ratio': task_context.get('aspect_ratio'),
        'image_size': task_context.get('image_size'),
        'reference_images': _serialize_reference_images(task_context.get('reference_images', {})),
        'base_url': task_context.get('base_url'),
        'endpoint': task_context.get('endpoint'),
        'task_mode': task_context.get('task_mode'),
        'status': status,
        'image_url': image_url or '',
        'local_path': local_path,
        'error': error,
        'metadata': _dict_to_json(task_context.get('metadata'))
    }
    log_id = _insert_task_log_entry(entry)
    if log_id:
        print(f"[TaskLog] 已记录任务日志 ID={log_id}, 状态={status}")
    return log_id


# --------------------- SQLite 任务日志 ---------------------

# --------------------- 实时日志 ---------------------


class _BufferingHandler(logging.Handler):
    """将日志记录缓存到内存，供 iframe 实时日志面板拉取。"""

    def emit(self, record):
        global _log_index
        with _log_lock:
            _log_index += 1
            _log_buffer.append({
                'index': _log_index,
                'time': datetime.fromtimestamp(record.created).strftime('%H:%M:%S'),
                'level': record.levelname,
                'message': self.format(record),
            })


def _setup_logging():
    """初始化全局 Logger"""
    logger = logging.getLogger("image.GeekNow")  # 要去video不同
    logger.setLevel(logging.INFO)
    logger.handlers = []

    fmt = logging.Formatter('[%(name)s] %(message)s')

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(fmt)
    logger.addHandler(console_handler)

    buf_handler = _BufferingHandler()
    buf_handler.setFormatter(fmt)
    logger.addHandler(buf_handler)

    return logger


def _log(msg, level='INFO'):
    """
    兼容旧代码的 _log 调用，转发到 standard logging
    """
    if str(level).upper() == 'ERROR':
        _logger.error(msg)
    elif str(level).upper() == 'WARNING':
        _logger.warning(msg)
    elif str(level).upper() == 'DEBUG':
        _logger.debug(msg)
    else:
        _logger.info(msg)


def get_buffered_logs(since_index=0):
    """返回索引 > since_index 的所有缓冲日志条目。"""
    with _log_lock:
        return [e for e in _log_buffer if e['index'] > since_index]


# --------------------- 实时日志 ---------------------

# --------------------- 插件必要 ---------------------
def get_info():
    """返回插件信息"""
    return {
        "name": "图片中转插件 - GeekNow(推荐)",
        "description": "通过中转 API 生成图片，支持文本提示词和参考图片\n注意：软件未与任何中转平台达成合作，不对任何中转平台的安全性负责，请谨慎辨别。",
        "version": "1.0.0",
        "author": "unknown"
    }


def handle_action(action, data=None):
    """
    处理来自 iframe 的自定义动作请求
    """
    if data is None:
        data = {}
    if action == 'open_live_logs':
        # 返回打开页面的指令，宿主引擎会据此打开 live_log.html
        return {
            'ok': True,
            'open_page': 'live_log.html'
        }
    elif action == 'open_task_logs':
        return {
            'ok': True,
            'open_page': 'task_log.html'
        }
    elif action == 'get_task_logs':
        limit = data.get('limit', 200)
        status = data.get('status')
        logs = get_recent_task_logs(limit=limit, status=status)
        for log in logs:
            status_key = log.get('status', '')
            display_text, color = _get_status_display(status_key)
            log['status_display'] = display_text
            log['status_color'] = color
        return {'ok': True, 'logs': logs}
    elif action == 'download_images':
        task_ids = data.get('task_ids', [])
        if not task_ids:
            return {'ok': False, 'error': '未选择任务'}
        results = download_images_from_logs(task_ids=task_ids)
        return {'ok': True, 'results': results}
    elif action == 'get_logs':
        since = data.get('since_index', 0)
        logs = get_buffered_logs(since_index=since)
        return {'ok': True, 'logs': logs}
    elif action == 'get_announcement':
        try:
            resp = requests.get('https://www.geeknow.top/api/status', timeout=10)
            resp.raise_for_status()
            announcements = resp.json().get('data', {}).get('announcements', [])
            content = announcements[0].get('content', '') if announcements else ''
            return {'ok': True, 'content': content}
        except Exception as e:
            return {'ok': False, 'error': str(e)}

    elif action == 'check_update':
        return _check_update_available()

    elif action == 'do_update':
        return _execute_update(
            data.get('download_url', ''),
            data.get('sha256', ''),
        )
    else:
        return {'ok': False, 'error': f'未知动作: {action}'}


# --------------------- 插件必要 ---------------------

# --------------------- generate ---------------------

def send_grok_request(api_key, endpoint, model, prompt, reference_images, aspect_ratio='16:9', request_timeout=300,
                      download_timeout=300):
    """
    发送 Grok API 请求生成图片（OpenAI 兼容格式）

    Args:
        api_key: API 密钥
        endpoint: API 端点
        model: 模型名称
        prompt: 提示词
        reference_images: 参考图片路径字典 {position: path}
        aspect_ratio: 图片比例 (例如: '16:9', '1:1', '9:16')
        request_timeout: 请求超时时间

    Returns:
        (base64 编码的图片数据, 图片URL/None)
    """
    _log(f"send_grok_request: model={model}, prompt={prompt}, aspect_ratio={aspect_ratio}")

    # 转换宽高比到具体尺寸
    size = GROK_SIZE_MAP.get(aspect_ratio, '2560x1440')
    _log(f"宽高比 {aspect_ratio} 映射到尺寸: {size}")

    # 处理参考图片 - 优先尝试上传到图床获取URL，任一失败则全部使用base64
    # 收集有效的图片路径
    valid_image_paths = []
    for position, img_path in reference_images.items():
        if os.path.exists(img_path) and os.path.getsize(img_path) > 0:
            valid_image_paths.append((position, img_path))

    image_list = []
    use_url_mode = False

    if valid_image_paths:
        # Grok API 不支持 URL 模式，直接使用 base64
        for position, img_path in valid_image_paths:
            try:
                with open(img_path, 'rb') as f:
                    image_data = base64.b64encode(f.read()).decode('utf-8')
                image_list.append(image_data)
                _log(f"添加参考图片(base64模式): {position} -> {img_path}")
            except Exception as e:
                _log(f"加载图片失败 {img_path}: {e}")

    # 构建请求
    url = f"{endpoint}/v1/images/generations"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }

    payload = {
        "model": model,
        "prompt": prompt,
        "n": 1,
        "size": size
    }

    # 如果有参考图片，添加到请求中
    if image_list:
        payload["image"] = image_list

    # 打印请求参数(隐藏base64图片数据)
    _log(f"[Grok API 请求] 请求端点: {url}")
    _log(f"[Grok API 请求] 请求头: Authorization=Bearer ***")
    _log(f"[Grok API 请求] 参考图片模式: {'URL' if use_url_mode else 'base64'}")

    payload_display = payload.copy()
    if "image" in payload_display:
        if use_url_mode:
            payload_display["image"] = payload_display["image"]  # URL直接显示
        else:
            payload_display["image"] = [f"<base64图片数据，长度: {len(img)} 字符>" for img in payload_display["image"]]
    _log(f"[Grok API 请求] 请求体: {json.dumps(payload_display, indent=2, ensure_ascii=False)}")

    # 发送请求
    response = requests.post(url, json=payload, headers=headers)

    if response.status_code != 200:
        raise Exception(f"HTTP {response.status_code}: {response.text}")

    # 解析响应
    data = response.json()
    _log(f"[Grok API 响应] {json.dumps(data, indent=2, ensure_ascii=False)[:500]}...")

    # OpenAI 格式的响应: {"data": [{"url": "..."}]}
    # 注意：Grok API 只返回 URL，不返回 b64_json
    if 'data' not in data or len(data['data']) == 0:
        raise Exception("NO_RETRY:::API 未返回有效结果")

    _log(f"[Grok] API 返回了 {len(data['data'])} 张图片")

    # 收集所有图片 URL
    image_urls = []
    for idx, image_result in enumerate(data['data']):
        _log(f"[Grok] 第 {idx + 1} 个结果: {image_result}")
        if 'url' in image_result and image_result['url']:
            image_urls.append(image_result['url'])
            _log(f"[Grok] 图片 {idx + 1} URL: {image_result['url']}")
        else:
            _log(f"[Grok] 图片 {idx + 1} 没有 URL")

    if not image_urls:
        raise Exception("NO_RETRY:::API 响应中未包含任何图片 URL")

    # 返回第一张图片的 URL(保持向后兼容) 注意: 多张图片的处理需要在 generate 函数中实现
    _log(f"[Grok] 共获取到 {len(image_urls)} 张图片 URL")
    return None, image_urls[0] if len(image_urls) == 1 else image_urls


def send_doubao_request(api_key, endpoint, model, prompt, reference_images, aspect_ratio='16:9', request_timeout=300,
                        download_timeout=300):
    """
    发送 Doubao Seedream API 请求生成图片

    Args:
        api_key: API 密钥
        endpoint: API 端点
        model: 模型名称
        prompt: 提示词
        reference_images: 参考图片路径字典 {position: path}
        aspect_ratio: 图片比例 (例如: '16:9', '1:1', '9:16')
        request_timeout: 请求超时时间

    Returns:
        (base64 编码的图片数据, 图片URL/None)
    """
    _log(f"send_doubao_request: model={model}, prompt={prompt}, aspect_ratio={aspect_ratio}")

    # 转换宽高比到具体尺寸
    size = DOUBAO_SIZE_MAP.get(aspect_ratio, '2560x1440')
    _log(f"宽高比 {aspect_ratio} 映射到尺寸: {size}")

    image_list = []

    for position, img_path in reference_images.items():
        if os.path.exists(img_path) and os.path.getsize(img_path) > 0:
            try:
                with open(img_path, 'rb') as f:
                    image_data = base64.b64encode(f.read()).decode('utf-8')
                image_list.append(image_data)
                _log(f"添加参考图片(base64模式): {position} -> {img_path}")
            except Exception as e:
                _log(f"加载图片失败 {img_path}: {e}")

    # 构建请求
    url = f"{endpoint}/v1/images/generations"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }

    payload = {
        "model": model,
        "prompt": prompt,
        "n": 1,
        "size": size
    }

    # 如果有参考图片，添加到请求中
    if image_list:
        payload["image"] = image_list

    # 打印请求参数（隐藏base64图片数据）
    _log(f"[Doubao API 请求] 请求端点: {url}")
    _log(f"[Doubao API 请求] 请求头: Authorization=Bearer ***")
    payload_display = payload.copy()
    if "image" in payload_display:
        payload_display["image"] = [f"<base64图片数据，长度: {len(img)} 字符>" for img in payload_display["image"]]
    _log(f"[Doubao API 请求] 请求体: {json.dumps(payload_display, indent=2, ensure_ascii=False)}")

    # 发送请求
    response = requests.post(url, json=payload, headers=headers)

    if response.status_code != 200:
        raise Exception(f"HTTP {response.status_code}: {response.text}")

    # 解析响应
    data = response.json()
    _log(f"[Doubao API 响应] {json.dumps(data, indent=2, ensure_ascii=False)[:500]}...")

    # OpenAI 格式的响应: {"data": [{"url": "...", "b64_json": "..."}]}
    if 'data' not in data or len(data['data']) == 0:
        raise Exception("NO_RETRY:::API 未返回有效结果")

    image_result = data['data'][0]

    # 优先使用 b64_json
    if 'b64_json' in image_result and image_result['b64_json']:
        _log("成功从 API 获取图片数据（b64_json 格式）")
        return image_result['b64_json'], image_result.get('url')

    # 否则使用 url，直接返回不下载
    if 'url' in image_result and image_result['url']:
        image_url = image_result['url']
        _log(f"从响应中获取到图片 URL: {image_url}")
        return None, image_url

    raise Exception("NO_RETRY:::API 响应中未包含图片数据")


def _build_gpt_image_2_inputs(reference_images):
    image_list = []
    for position, img_path in (reference_images or {}).items():
        if os.path.exists(img_path) and os.path.getsize(img_path) > 0:
            try:
                with open(img_path, 'rb') as f:
                    image_data = base64.b64encode(f.read()).decode('utf-8')
                image_list.append(image_data)
                _log(f"添加参考图片: {position} -> {img_path}")
            except Exception as e:
                _log(f"加载图片失败 {img_path}: {e}")
    return image_list


def send_gpt_image_2_request(api_key, endpoint, model, prompt, reference_images, aspect_ratio='16:9',
                             request_timeout=300, download_timeout=300):
    """
    发送 gpt-image-2/gpt-image-2-pro 请求生成图片

    统一使用 /v1/images/generations 端点，参考图片通过 JSON body 的 image 字段传递。

    请求格式:
        {
            "model": "gpt-image-2" | "gpt-image-2-pro",
            "prompt": "...",
            "n": 1,
            "size": "1024x1024",
            "response_format": "url",
            "image": ["base64..."]  # 可选，有参考图片时传入
        }
    """
    _log(f"send_gpt_image_2_request: model={model}, prompt={prompt}, aspect_ratio={aspect_ratio}")
    image_list = _build_gpt_image_2_inputs(reference_images)

    # 根据是否有参考图片选择端点
    api_endpoint = f"{endpoint}/v1/images/generations"

    size = GPT_IMAGE_2_SIZE_MAP.get(aspect_ratio, '1024x1024')
    api_size, needs_size_hint = _get_gpt_image_api_size(size, model)
    _log(f"宽高比 {aspect_ratio} 映射到尺寸: {size}")
    if needs_size_hint:
        ratio = aspect_ratio.split('(')[0]
        _log(f"非官方尺寸，通过 prompt 引导比例 {ratio}")
        prompt = f"{prompt}, 图片比例{ratio}"
        api_size = size

    _log(f"[GPT Image 请求] 模式: {'图生图' if image_list else '文生图'}")
    _log(f"[GPT Image 请求] 请求端点: {api_endpoint}")
    _log(f"[GPT Image 请求] 请求头: Authorization=Bearer ***")
    _log(f"[GPT Image 请求] 参考图片数量: {len(image_list)}")

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }
    payload = {
        "model": model,
        "prompt": prompt,
        "n": 1,
        "size": api_size,
        "quality": "high",
        "response_format": "url"
    }
    if image_list:
        payload["image"] = image_list

    payload_display = payload.copy()
    if "image" in payload_display:
        payload_display["image"] = [f"<base64图片数据，长度: {len(img)} 字符>" for img in payload_display["image"]]
    _log(f"[GPT Image 请求] 请求体: {json.dumps(payload_display, indent=2, ensure_ascii=False)}")

    response = requests.post(api_endpoint, json=payload, headers=headers, timeout=request_timeout)

    if response.status_code != 200:
        raise Exception(f"HTTP {response.status_code}: {response.text}")

    data = response.json()
    _log(f"[GPT Image 响应] {json.dumps(data, indent=2, ensure_ascii=False)[:500]}...")

    if 'data' not in data or len(data['data']) == 0:
        raise Exception("NO_RETRY:::API 未返回有效结果")

    image_urls = []
    for idx, image_result in enumerate(data['data']):
        _log(f"[GPT Image] 第 {idx + 1} 个结果: {image_result}")
        if 'b64_json' in image_result and image_result['b64_json']:
            _log(f"[GPT Image] 图片 {idx + 1} 返回 b64_json")
            return image_result['b64_json'], image_result.get('url')
        if 'url' in image_result and image_result['url']:
            image_urls.append(image_result['url'])
            _log(f"[GPT Image] 图片 {idx + 1} URL: {image_result['url']}")

    if image_urls:
        _log(f"[GPT Image] 共获取到 {len(image_urls)} 张图片 URL")
        return None, image_urls[0] if len(image_urls) == 1 else image_urls

    raise Exception("NO_RETRY:::API 响应中未包含图片数据")


def send_gemini_request(api_key, endpoint, model, prompt, reference_images, aspect_ratio='16:9', image_size='2K',
                        request_timeout=300, download_timeout=300):
    _log(
        f"send_gemini_request: {api_key}, {endpoint}, {model}, {prompt}, {reference_images}, {aspect_ratio}, {image_size}")
    """
    发送 Gemini API 请求生成图片

    Args:
        api_key: API 密钥
        endpoint: API 端点
        model: 模型名称
        prompt: 提示词
        reference_images: 参考图片路径字典 {position: path}
        aspect_ratio: 图片比例 (例如: '16:9', '1:1', '9:16')
        image_size: 图片尺寸 ('1K' 或 '2K')
        request_timeout: 请求超时时间
        download_timeout: 下载超时时间

    Returns:
        (base64 编码的图片数据, 图片URL/None)
    """
    # 构建请求内容
    parts = [{"text": prompt}]

    # 添加参考图片
    for position, img_path in reference_images.items():
        if os.path.exists(img_path) and os.path.getsize(img_path) > 0:
            try:
                with open(img_path, 'rb') as f:
                    image_data = base64.b64encode(f.read()).decode('utf-8')

                # 检测MIME类型
                if img_path.lower().endswith('.png'):
                    mime_type = 'image/png'
                elif img_path.lower().endswith(('.jpg', '.jpeg')):
                    mime_type = 'image/jpeg'
                elif img_path.lower().endswith('.webp'):
                    mime_type = 'image/webp'
                else:
                    mime_type = 'image/jpeg'

                parts.append({
                    "inlineData": {
                        "mimeType": mime_type,
                        "data": image_data
                    }
                })
                _log(f"添加参考图片: {position} -> {img_path}")
            except Exception as e:
                _log(f"加载图片失败 {img_path}: {e}")

    # 构建请求
    url = f"{endpoint}/models/{model}:generateContent"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }

    # 根据模型决定实际使用的图片尺寸
    # 只有 gemini-3-pro-image-preview 支持 2K，其他模型固定使用 1K
    actual_image_size = image_size if model == 'gemini-3-pro-image-preview' else '1K'

    payload = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {
            "responseModalities": ["IMAGE", "TEXT"],
            "temperature": 1.0,
            "topP": 0.95,
            "maxOutputTokens": 8192,
            "imageConfig": {
                "aspectRatio": aspect_ratio,
                "imageSize": actual_image_size
            }
        }
    }

    # 打印请求参数（隐藏base64图片数据）
    _log(f"[Gemini API 请求] 请求端点: {url}")
    _log(f"[Gemini API 请求] 请求头: {json.dumps(headers, indent=2, ensure_ascii=False)}")

    # 构建用于打印的payload（移除base64图片数据）
    payload_display = {
        "contents": [{"role": "user", "parts": []}],
        "generationConfig": payload["generationConfig"]
    }
    for part in parts:
        if "text" in part:
            payload_display["contents"][0]["parts"].append({"text": part["text"]})
        elif "inlineData" in part:
            payload_display["contents"][0]["parts"].append({
                "inlineData": {
                    "mimeType": part["inlineData"]["mimeType"],
                    "data": f"<base64图片数据，长度: {len(part['inlineData']['data'])} 字符>"
                }
            })
    _log(f"[Gemini API 请求] 请求体: {json.dumps(payload_display, indent=2, ensure_ascii=False)}")

    # 发送请求
    response = requests.post(url, json=payload, headers=headers)

    if response.status_code != 200:
        raise Exception(f"HTTP {response.status_code}: {response.text}")

    # 解析响应
    data = response.json()

    if 'candidates' not in data or len(data['candidates']) == 0:
        raise Exception("NO_RETRY:::API 未返回有效候选结果")

    candidate = data['candidates'][0]

    if 'content' not in candidate or 'parts' not in candidate['content']:
        raise Exception("NO_RETRY:::响应格式错误")

    # 提取图片数据
    for part in candidate['content']['parts']:
        if 'inlineData' in part:
            image_data = part['inlineData']['data']

            # 判断是 URL 还是 base64 数据
            if isinstance(image_data, str) and image_data.startswith(('http://', 'https://')):
                # 新格式：inlineData.data 是图片URL，直接返回不下载
                image_url = image_data
                _log(f"检测到 inlineData 中的 URL 格式: {image_url}")
                return None, image_url
            else:
                # 旧格式：直接是 base64 编码的图片数据
                _log(f"成功从 API 获取图片数据（inlineData base64 格式）")
                return image_data, None
        elif 'text' in part:
            # 新格式: 从文本中提取图片 URL 或 data URI 并下载/解码
            text = part['text']
            _log(f"Plugin API Part: {part}")

            import re
            # 先处理 data URI（例如 data:image/png;base64,xxx）
            data_uri_pattern = r'data:(image/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)'
            data_uri_match = re.search(data_uri_pattern, text)
            if data_uri_match:
                image_data_base64 = data_uri_match.group(2)
                _log("从响应文本中提取到 data URI 图片数据")
                return image_data_base64, None

            # 尝试从文本中提取图片 URL
            # 格式: ![image](URL), ![image1](URL) 或 ![其他](URL)
            # 支持的扩展名: jpg, jpeg, jpe, png, webp, gif
            url_pattern = r'!\[image\d*\]\((https?://[^\)]+)\)|!\[[^\]]*\]\((https?://[^\)]+\.(?:jpg|jpeg|jpe|png|webp|gif))\)'
            matches = re.findall(url_pattern, text)

            if matches:
                # 提取第一个匹配的 URL（matches 是元组列表）
                image_url = matches[0][0] if matches[0][0] else matches[0][1]
                _log(f"从响应文本中提取到图片 URL: {image_url}")
                return None, image_url
            else:
                _log(f"未能从文本中提取到图片 URL 或 data URI")

    raise Exception("NO_RETRY:::API 响应中未包含图片数据")


def _download_image_from_url(image_url, download_timeout=300):
    """
    从 URL 下载图片并返回 base64 数据

    Args:
        image_url: 图片 URL
        download_timeout: 下载超时时间

    Returns:
        base64 编码的图片数据

    Raises:
        ImageDownloadError: 下载失败时抛出
    """
    print(f"开始下载图片: {image_url}")
    try:
        download_headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
        }

        img_response = requests.get(
            image_url,
            headers=download_headers,
            timeout=download_timeout,
            stream=True,
        )

        if img_response.status_code == 200:
            image_data_base64 = base64.b64encode(img_response.content).decode('utf-8')
            print(f"✓ 成功下载图片")
            return image_data_base64
        else:
            error_msg = f"下载图片失败，HTTP 状态码: {img_response.status_code}"
            raise ImageDownloadError(error_msg, image_url)

    except requests.exceptions.Timeout as e:
        error_msg = f"下载图片超时: {str(e)}"
        raise ImageDownloadError(error_msg, image_url)
    except ImageDownloadError:
        raise
    except Exception as e:
        error_msg = f"下载图片时出错: {str(e)}"
        raise ImageDownloadError(error_msg, image_url)


def upload_image_to_host(image_path, timeout=60):
    """
    将图片上传到图床获取URL

    Args:
        image_path: 本地图片路径
        timeout: 请求超时时间

    Returns:
        str: 成功返回图片URL，失败返回None
    """
    url = "https://imageproxy.zhongzhuan.chat/api/upload"
    print(f"[图床] 正在上传: {image_path} 到 {url}")

    try:
        with open(image_path, 'rb') as f:
            files = {'file': (os.path.basename(image_path), f)}
            response = requests.post(url, files=files, timeout=timeout)

            if response.status_code == 200:
                data = response.json()
                image_url = data.get('url')
                if image_url:
                    print(f"[图床] 上传成功: {image_url}")
                    return image_url
                else:
                    print(f"[图床] 上传失败: 响应中未找到 'url' 字段。响应: {data}")
                    return None
            else:
                print(f"[图床] 上传失败: 状态码 {response.status_code}, 响应: {response.text}")
                return None
    except Exception as e:
        print(f"[图床] 上传时发生错误: {e}")
        return None


def generate(context):
    """
    主生成函数 - 通过中转 API 调用 Gemini 2.5 Flash Image 生成图片

    参数:
        context: 字典，包含以下键:
            - prompt: 正向提示词
            - reference_images: 参考图片字典 {位置: 图片路径}
            - output_dir: 输出目录
            - plugin_params: 插件自定义参数 (api_key, base_url 等)

    返回:
        生成的图片路径列表

    注意：参数同步已由 plugin_engine 在主线程中调用 _force_sync_params_from_ui() 完成
    不要在此函数中调用，因为此函数在工作线程中执行，无法安全访问UI控件
    """
    _log("\n" + "=" * 60)
    _log("Nano Banana GeekNow 插件开始生成")
    _log("=" * 60)

    # ── 解析参数 ──────────────────────────────────────────────
    prompt = context.get('prompt', '')
    reference_images = context.get('reference_images', {})
    output_dir = context.get('output_dir', '')
    plugin_params = context.get('plugin_params', {}) or {}
    viewer_index = context.get('viewer_index', 0)

    api_key = str(plugin_params.get('api_key', ''))
    base_url = _get_valid_base_url(
        plugin_params.get('base_url')
        or plugin_params.get('endpoint')
        or _init_params.get('base_url')
    )
    model_display = str(plugin_params.get('model', 'gemini-2.5-flash-image-preview'))
    aspect_ratio = str(plugin_params.get('aspect_ratio', '16:9'))
    image_size = str(plugin_params.get('image_size', '2K'))
    request_timeout = int(plugin_params.get('request_timeout', 300))
    download_timeout = int(plugin_params.get('download_timeout', 300))

    model = MODEL_NAME_MAP.get(model_display, model_display)

    # 构造 endpoint
    normalized_base = _normalize_base_url(base_url)
    is_openai_style_model = (
            model.startswith('doubao-')
            or model.startswith('grok-')
            or model.startswith('gpt-image-')
    )
    endpoint = normalized_base if is_openai_style_model else f"{normalized_base}/v1beta"

    # 日志摘要
    _log(f"\n===== 生成参数 =====")
    _log(f"正向提示词:   {prompt}")
    _log(f"参考图片数量: {len(reference_images)}")
    _log(f"API Key:      {'已设置 (' + str(len(api_key)) + ' 字符)' if api_key else '未设置'}")
    _log(f"Base URL:     {base_url}")
    _log(f"Endpoint:     {endpoint}")
    _log(f"模型:         {model_display}" + (f" -> {model}" if model != model_display else ""))
    _log(f"图片比例:     {aspect_ratio}")
    _log(f"图片尺寸:     {image_size}")
    _log(f"请求超时:     {request_timeout} 秒")
    _log(f"下载超时:     {download_timeout} 秒")
    _log(f"==================\n")

    # 前置校验
    if not api_key.strip():
        error_msg = "未设置 API Key，请在插件设置中填写 API Key"
        _log(f"错误: {error_msg}", 'ERROR')
        raise Exception(f"PLUGIN_ERROR:::{error_msg}")
    if not endpoint.strip():
        error_msg = "未设置 Endpoint"
        _log(f"错误: {error_msg}", 'ERROR')
        raise Exception(f"PLUGIN_ERROR:::{error_msg}")

    os.makedirs(output_dir, exist_ok=True)

    # 初始化任务日志
    task_log_context = {
        'model_display': model_display,
        'model_name': model,
        'prompt': prompt,
        'aspect_ratio': aspect_ratio,
        'image_size': image_size,
        'reference_images': {
            'local': reference_images.copy() if isinstance(reference_images, dict) else reference_images,
        },
        'base_url': base_url,
        'endpoint': endpoint,
        'task_mode': '图生图' if reference_images else '文生图',
        'metadata': {
            'request_timeout': request_timeout,
            'download_timeout': download_timeout,
            'viewer_index': viewer_index,
            'source': (
                'grok' if model.startswith('grok-') else
                'doubao' if model.startswith('doubao-') else
                'gpt-image-2' if model.startswith('gpt-image-') else
                'gemini'
            ),
        }
    }
    task_log_id = _log_task_result(task_log_context, status='running')

    # 调用 API
    clean_endpoint = endpoint.strip().rstrip('/')

    api_name_map = {
        'grok': 'Grok API',
        'doubao': 'Doubao Seedream API',
        'gpt-image-2': 'GPT Image API',
        'gemini': 'Gemini API'
    }
    api_name = api_name_map[task_log_context['metadata']['source']]
    _log(f"正在调用 {api_name}...")

    common_kwargs = dict(
        api_key=api_key,
        endpoint=clean_endpoint,
        model=model,
        prompt=prompt,
        reference_images=reference_images,
        aspect_ratio=aspect_ratio,
        request_timeout=request_timeout,
        download_timeout=download_timeout,
    )

    try:
        if model.startswith('grok-'):
            image_data_base64, image_source_url = send_grok_request(**common_kwargs)
        elif model.startswith('doubao-'):
            image_data_base64, image_source_url = send_doubao_request(**common_kwargs)
        elif model.startswith('gpt-image-'):
            image_data_base64, image_source_url = send_gpt_image_2_request(
                **common_kwargs
            )
        else:
            image_data_base64, image_source_url = send_gemini_request(
                **common_kwargs, image_size=image_size
            )
    except requests.exceptions.ConnectionError as e:
        _log(f"[连接异常详情] type={type(e).__name__}, args={e.args}")
        if e.args and hasattr(e.args[0], 'reason'):
            _log(f"[底层原因] {type(e.args[0].reason).__name__}: {e.args[0].reason}")
        error_msg = (
            f"API 调用失败: 连接异常（服务端未响应即断开）\n"
            f"目标地址: {clean_endpoint}\n"
            f"模型: {model}\n"
            f"原始错误: {e}\n"
            f"建议: 1.检查网络连接 2.尝试切换线路(base_url) 3.如参考图片过大请压缩后重试"
        )
        _log(f"{error_msg}", 'ERROR')
        _log_task_result(task_log_context, status='failed', error=error_msg,
                         log_id=task_log_id, completed=True)
        raise Exception(f"PLUGIN_ERROR:::{error_msg}")
    except requests.exceptions.Timeout as e:
        error_msg = (
            f"API 调用失败: 请求超时\n"
            f"目标地址: {clean_endpoint}\n"
            f"模型: {model}\n"
            f"超时设置: {request_timeout}s\n"
            f"建议: 1.检查网络连接 2.尝试切换线路(base_url)"
        )
        _log(f"{error_msg}", 'ERROR')
        _log_task_result(task_log_context, status='failed', error=error_msg,
                         log_id=task_log_id, completed=True)
        raise Exception(f"PLUGIN_ERROR:::{error_msg}")
    except Exception as e:
        error_msg = f"API 调用失败:{type(e).__name__}: {e}"
        _log(f"{error_msg}")
        import traceback;
        traceback.print_exc()
        _log_task_result(task_log_context, status='failed', error=error_msg,
                         log_id=task_log_id, completed=True)
        raise Exception(f"PLUGIN_ERROR:::{error_msg}")

    # 处理返回结果
    generated_files = []

    def _save_image(image_data: bytes, suffix: str = '') -> str:
        """将原始字节保存为 PNG，返回本地路径。"""
        img = Image.open(BytesIO(image_data))
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        filename = f"{viewer_index:04d}_image_{timestamp}{suffix}.png"
        path = str(Path(output_dir) / filename)
        img.save(path, 'PNG')
        return path

    if image_data_base64:
        # API 直接返回 base64
        try:
            output_path = _save_image(base64.b64decode(image_data_base64))
            generated_files.append(output_path)
            _log_task_result(task_log_context, status='success',
                             image_url=image_source_url, local_path=output_path,
                             log_id=task_log_id, completed=True)
            _log(f"✓ 图片保存成功: {output_path}")
        except Exception as e:
            error_msg = f"图片保存失败: {e}"
            _log(f"{error_msg}")
            _log("   提示: API 已返回数据，但保存到本地失败")
            _log_task_result(task_log_context, status='download_failed',
                             image_url=image_source_url, error=error_msg,
                             log_id=task_log_id, completed=True)

    elif image_source_url:
        # ─API 返回 URL（单个或列表）
        url_list = image_source_url if isinstance(image_source_url, list) else [image_source_url]
        _log(f"图片生成成功，共 {len(url_list)} 张图片")

        for idx, url in enumerate(url_list):
            _log(f"处理第 {idx + 1}/{len(url_list)} 张图片: {url}")
            log_id = task_log_id if idx == 0 else None
            suffix = f"_n{idx + 1}" if len(url_list) > 1 else ''

            _log_task_result(task_log_context, status='generated',
                             image_url=url, log_id=log_id, completed=False)
            try:
                raw = base64.b64decode(_download_image_from_url(url, download_timeout))
                output_path = _save_image(raw, suffix)
                generated_files.append(output_path)
                _log_task_result(task_log_context, status='success',
                                 local_path=output_path, log_id=log_id, completed=True)
                _log(f"✓ 图片 {idx + 1} 下载成功: {output_path}")
            except ImageDownloadError as e:
                error_msg = f"图片 {idx + 1} 下载失败: {e}"
                _log(f"{error_msg}")
                _log("   提示：图片已生成，可通过「任务日志/手动拉图」功能稍后下载")
                _log_task_result(task_log_context, status='download_failed',
                                 error=str(e), log_id=log_id, completed=True)

        if not generated_files:
            raise Exception("PLUGIN_ERROR:::图片已生成但下载失败，可通过「任务日志/手动拉图」功能稍后下载")
    else:
        error_msg = "API 响应中未包含图片数据"
        _log(f"{error_msg}")
        _log_task_result(task_log_context, status='failed', error=error_msg,
                         log_id=task_log_id, completed=True)
        raise Exception(f"PLUGIN_ERROR:::{error_msg}")

    _log("\n" + "=" * 60)
    _log(f"Nano Banana GeekNow 插件完成，共生成 {len(generated_files)} 张图片")
    _log("=" * 60 + "\n")

    return generated_files


# --------------------- generate ---------------------

# 保存插件文件路径，用于配置管理
_PLUGIN_FILE = __file__
_PLUGIN_ID = 'image'
_PLUGIN_VERSION = '3.0.20'

plugin_dir = Path(__file__).parent

# 可选的 API Base URL 选项（供用户切换不同线路）
_BASE_URL_OPTIONS = [
    ("主节点", "https://geeknow.ai"),
    ("副节点", "https://api.geeknow.ai"),
]

_DEFAULT_BASE_URL = _BASE_URL_OPTIONS[1][1]

_VALID_BASE_URLS = {_normalize_base_url(url) for _, url in _BASE_URL_OPTIONS}

_TASK_LOG_DB_PATH = plugin_dir / "image_task_logs.db"

_log_buffer = collections.deque(maxlen=1000)
_log_index = 0
_log_lock = threading.Lock()
_logger = _setup_logging()

_default_params = {
    'api_key': '',
    'base_url': _DEFAULT_BASE_URL,
    'model': 'gemini-2.5-flash-image-preview',
    'aspect_ratio': '16:9',
    'image_size': '2K',
    'request_timeout': 60000,
    'download_timeout': 60000,
    'retry_count': 0
}

# 模型列表(显示名称)
AVAILABLE_MODELS = [
    'gemini-3-pro-image-preview',
    # 'gemini-2.5-flash-image-preview-lite',
    'gemini-2.5-flash-image-preview',
    # 'gemini-3-pro-image-preview-lite',
    'gemini-3.1-flash-image-preview',
    '豆包即梦4.5',
    # '豆包即梦4.0',
    '豆包即梦5.0',
    'Grok 4.2 Image',
    'gpt-image-2',
    'gpt-image-2-pro',
]

# 显示名称到 API 模型名称的映射
MODEL_NAME_MAP = {
    'gemini-3-pro-image-preview': 'gemini-3-pro-image-preview',
    'gemini-2.5-flash-image-preview': 'gemini-2.5-flash-image-preview',
    'gemini-3.1-flash-image-preview': 'gemini-3.1-flash-image-preview',
    '豆包即梦4.5': 'doubao-seedream-4-5-251128',
    '豆包即梦5.0': 'doubao-seedream-5-0-260128',
    'Grok 4.2 Image': 'grok-4-2-image',
    'gpt-image-2': 'gpt-image-2',
    'gpt-image-2-pro': 'gpt-image-2-pro',
}

# Doubao 模型的宽高比到尺寸映射
DOUBAO_SIZE_MAP = {
    '1:1': '2048x2048',
    '4:3': '2304x1728',
    '3:4': '1728x2304',
    '16:9': '2560x1440',
    '9:16': '1440x2560',
    '3:2': '2496x1664',
    '2:3': '1664x2496',
    '21:9': '3024x1296',
}

# gpt-image-2 模型的宽高比到尺寸映射
GPT_IMAGE_2_SIZE_MAP = {
    '1:1': '1024x1024',
    '4:3': '1536x1152',
    '2:3': '1024x1536',
    '3:2': '1536x1024',
    '16:9': '1920x1080',
    '9:16': '1080x1920',
    '1:1(2K)': '2048x2048',
    '4:3(2K)': '2048x1536',
    '3:2(2K)': '2560x1712',
    '2:3(2K)': '1712x2560',
    '16:9(2K)': '2048x1152',
    '9:16(2K)': '1152x2048',
    '1:1(4K)': '2880x2880',
    '4:3(4K)': '3840x2880',
    '3:2(4K)': '3840x2560',
    '2:3(4K)': '2560x3840',
    '16:9(4K)': '3840x2160',
    '9:16(4K)': '2160x3840',
}

# gpt-image-2 官方支持的尺寸，非官方尺寸需要通过 prompt 引导
_GPT_IMAGE_2_OFFICIAL_SIZES = {'1024x1024', '1024x1536', '1536x1024'}
_GPT_IMAGE_2_PRO_OFFICIAL_SIZES = _GPT_IMAGE_2_OFFICIAL_SIZES | {'2048x2048', '2048x1152', '3840x2160', '2160x3840'}


def _get_gpt_image_api_size(size, model=''):
    official = _GPT_IMAGE_2_PRO_OFFICIAL_SIZES if model == 'gpt-image-2-pro' else _GPT_IMAGE_2_OFFICIAL_SIZES
    if size in official:
        return size, False
    w, h = map(int, size.split('x'))
    pixels = w * h
    best, best_diff = None, float('inf')
    for s in official:
        ow, oh = map(int, s.split('x'))
        if (w > h and ow <= oh) or (w < h and ow >= oh) or (w == h and ow != oh):
            continue
        diff = abs(ow * oh - pixels)
        if diff < best_diff:
            best, best_diff = s, diff
    return (best, True) if best else ('1024x1024', True)


# Grok 模型的宽高比到尺寸映射
GROK_SIZE_MAP = {
    '1:1': '2048x2048',
    '4:3': '2304x1728',
    '3:4': '1728x2304',
    '16:9': '2560x1440',
    '9:16': '1440x2560',
    '3:2': '2496x1664',
    '2:3': '1664x2496',
    '21:9': '3024x1296',
}

# 图片比例列表
ASPECT_RATIOS = [
    '1:1',
    '16:9',
    '9:16',
    '4:3',
    '3:4',
    '3:2',
    '2:3',
    '21:9',
]

_init_task_log_db()

_init_params = _default_params.copy()
_init_params.update(load_plugin_config(_PLUGIN_FILE))
_init_params['base_url'] = _get_valid_base_url(
    _init_params.get('base_url') or _init_params.get('endpoint') or _DEFAULT_BASE_URL
)
print(
    f"[Nano Banana GeekNow] 插件初始化完成，API Key: {'已设置(' + str(len(_init_params.get('api_key', ''))) + '字符)' if _init_params.get('api_key') else '未设置'}, Base URL: {_get_valid_base_url(_init_params.get('base_url', _DEFAULT_BASE_URL))}")
