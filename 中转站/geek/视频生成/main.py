"""
Geeknow 中转插件 - TypeTale 视频生成插件
通过 Geeknow API 调用 Sora2/Veo3.1/蛤肉/豆包/wan2.6 模型生成视频，支持 sora-2, sora2-pro-landscape-25s, veo_3_1, veo_3_1-fast, 蛤肉3(grok-video-3)、蛤肉-pro(grok-video-3-pro, 10s)、蛤肉-max(grok-video-3-max, 15s), 豆包 Seedance1.5Pro, wan2.6-t2v, wan2.6-i2v 等模型
"""

import base64
import collections
import hashlib
import json
import logging
import math
import os
import re
import shutil
import sqlite3
import sys
import tempfile
import threading
import time
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Optional
from urllib.parse import unquote, urlparse

import requests

plugin_dir = Path(__file__).parent

sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from plugin_utils import load_plugin_config


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


def _build_folder_manifest(folder_path, exclude_patterns=None):
    """
    遍历文件夹，计算每个文件的 SHA256，返回 {相对路径: sha256} 字典
    exclude_patterns: 相对路径前缀或子串列表，匹配则跳过
    """
    folder = Path(folder_path)
    exclude_patterns = exclude_patterns or []
    manifest = {}
    for file_path in sorted(folder.rglob('*')):
        if not file_path.is_file():
            continue
        rel = file_path.relative_to(folder).as_posix()
        if any(rel.startswith(p) or p in rel for p in exclude_patterns):
            continue
        manifest[rel] = _compute_sha256(file_path)
    return manifest


def _verify_folder_integrity(folder_path, manifest, exclude_patterns=None):
    """
    校验文件夹与 manifest 的一致性
    manifest: {相对路径: sha256} 字典，或 manifest JSON 文件路径
    exclude_patterns: 相对路径前缀或子串列表，匹配则跳过
    返回: {'ok': bool, 'modified': [...], 'missing': [...], 'extra': [...]}
    """
    folder = Path(folder_path)
    if not folder.is_dir():
        return {'ok': False, 'error': f'目录不存在: {folder_path}'}

    exclude_patterns = exclude_patterns or []

    # 支持传入 manifest JSON 文件路径
    if isinstance(manifest, (str, Path)):
        manifest_path = Path(manifest)
        if not manifest_path.exists():
            return {'ok': False, 'error': f'manifest 文件不存在: {manifest_path}'}
        try:
            with open(manifest_path, 'r', encoding='utf-8') as f:
                manifest = json.load(f)
        except Exception as e:
            return {'ok': False, 'error': f'读取 manifest 失败: {e}'}

    current = _build_folder_manifest(folder_path, exclude_patterns)

    modified = [p for p in current if p in manifest and current[p] != manifest[p]]
    missing = [p for p in manifest if p not in current]
    extra = [p for p in current if p not in manifest]

    return {
        'ok': not modified and not missing,
        'modified': modified,
        'missing': missing,
        'extra': extra,
    }


# --------------------- 自动更新 ---------------------

# --------------------- 请求选项 ---------------------
def _normalize_audio_generation(value):
    """
    视频有声/无声选项
    """
    text = str(value or '').strip().lower()
    if text in {'enabled', 'enable', 'true', '1', 'on', '有声'}:
        return 'Enabled'
    return 'Disabled'


def _infer_resolution_from_size(size_value):
    """
    视频清晰度选项
    """
    size_text = str(size_value or '').lower()
    if '1080' in size_text:
        return '1080P'
    if '720' in size_text:
        return '720P'
    if '540' in size_text:
        return '540P'
    if '480' in size_text:
        return '480P'
    return ''


def _mask_headers_for_log(headers):
    """
    隐藏请求头中的敏感信息(API Key)
    """
    masked_headers = dict(headers or {})
    auth_value = masked_headers.get('Authorization')
    if auth_value:
        auth_text = str(auth_value)
        if len(auth_text) > 20:
            masked_headers['Authorization'] = auth_text[:16] + '***'
        else:
            masked_headers['Authorization'] = '***'
    return masked_headers


# --------------------- 请求选项 ---------------------

# --------------------- 工具 ---------------------
def _normalize_base_url(url):
    """
    统一移除 URL 末尾的斜杠, 便于比较和展示
    """
    if not url:
        return ''
    return url.rstrip('/')


def _is_seedance_2_model(model_name):
    """
    Seedance 2.0 中转模型使用 JSON 提交，参考图通过公开 URL 传递。
    """
    raw = str(model_name or '').strip().lower().replace('_', '-')
    return raw.startswith('seedance-2.0') or raw == 'sd2'


_SEEDANCE_2_API_MODEL = 'sd2_manxue_720p'
_SEEDANCE_2_MODEL_MAP = {
    'seedance-2.0': _SEEDANCE_2_API_MODEL,
    'seedance-2.0-lite': _SEEDANCE_2_API_MODEL,
    'seedance-2.0-pro': _SEEDANCE_2_API_MODEL,
    'seedance-2.0-fast': _SEEDANCE_2_API_MODEL,
    'sd2': _SEEDANCE_2_API_MODEL,
}
_SEEDANCE_2_MAX_IMAGES = 9
_SEEDANCE_2_IMAGE_FORMATS = {'.jpeg', '.jpg', '.png', '.webp', '.bmp', '.tiff', '.gif', '.heic', '.heif'}
_SEEDANCE_2_MAX_IMAGE_BYTES = 30 * 1024 * 1024


def _seedance_2_api_model_name(model_name):
    """
    将 UI 展示模型归一到 GeekNow Seedance 2.0 中转模型 ID。
    """
    raw = str(model_name or 'seedance-2.0').strip().lower().replace('_', '-')
    return _SEEDANCE_2_MODEL_MAP.get(raw, _SEEDANCE_2_API_MODEL)


def _normalize_seedance_2_resolution(value):
    """
    Seedance 2.0 中转协议目前只整理为 480p/720p。
    """
    text = str(value or '').strip().lower()
    if '480' in text:
        return '480p'
    return '720p'


def _is_url_like(value):
    text = str(value or '').strip().lower()
    return text.startswith(('http://', 'https://', 'data:'))


def _is_json_submission_model(model_name):
    """
    判断模型是否使用 JSON 格式提交
    """
    model_text = str(model_name or '')
    return (
            model_text.startswith('sora')
            or model_text.startswith('veo')
            or model_text.startswith('wan2.6')
            or model_text.startswith('omni-fast')
            or model_text.startswith('Vidu-')
            or model_text.startswith('Kling-')
            or model_text.startswith('Hailuo-')
            or model_text.startswith('Hunyuan-')
            or model_text.startswith('Mingmou-')
            or model_text.startswith('OS-')
            or model_text.startswith('GV-')
            or model_text.startswith('SV-')
            or model_text.startswith('JV-')
            or _is_seedance_2_model(model_text)
    )


def _inject_files_into_json_payload(payload, files_list):
    """
    将文件列表转换为 Base64 并注入到 JSON payload
    """
    for field_name, file_tuple in files_list or []:
        if field_name == 'placeholder':
            continue
        if len(file_tuple) < 2 or not file_tuple[1]:
            continue

        mime_type = file_tuple[2] if len(file_tuple) > 2 and file_tuple[2] else 'image/png'
        b64_str = base64.b64encode(file_tuple[1]).decode('utf-8')
        data_url = f"data:{mime_type};base64,{b64_str}"

        existing_value = payload.get(field_name)
        if existing_value is None:
            payload[field_name] = data_url
        elif isinstance(existing_value, list):
            existing_value.append(data_url)
        else:
            payload[field_name] = [existing_value, data_url]


def _get_valid_base_url(url):
    """
    返回限定范围内的 Base URL, 非法值将回退到默认线路
    """
    normalized = _normalize_base_url(url)
    if normalized in _VALID_BASE_URLS:
        return normalized
    return _normalize_base_url(_DEFAULT_BASE_URL)


def _parse_error_keywords(value):
    """
    解析配置中的错误关键词（按换行或逗号分隔）
    """
    if not value:
        return []
    if isinstance(value, (list, tuple, set)):
        raw_items = [str(item) for item in value]
    else:
        raw_items = str(value).replace('\r', '\n').replace('，', ',').split('\n')
        raw_items = [part for item in raw_items for part in item.split(',')]  # 将逗号也视为分隔符
    keywords = []
    for item in raw_items:
        stripped = item.strip()
        if stripped:
            keywords.append(stripped)
    return keywords


def _match_keyword(message, keywords):
    """
    如果 message 包含关键词则返回该关键词, 否则返回 None
    """
    if not message or not keywords:
        return None
    for keyword in keywords:
        if keyword and keyword in message:
            return keyword
    return None


def _canonicalize_model_name(model_name):
    """
    规范化模型名称
    """
    text = str(model_name or '').strip()
    if not text:
        return text
    return text


def _parse_seconds_from_model_name(model_name: str):
    """
    从模型名末尾解析固定秒数(例如: xxx-25s)
    """
    if not model_name:
        return None
    m = re.search(r'-(\d{1,3})s$', str(model_name).strip())
    if not m:
        return None
    try:
        return int(m.group(1))
    except Exception:
        return None


def _normalize_reference_image_type(reference_image_type):
    if isinstance(reference_image_type, str):
        return [reference_image_type]
    if isinstance(reference_image_type, list):
        return reference_image_type
    return []


def _resolve_selected_reference_image(reference_images, reference_image_type, default_type="首帧图片"):
    type_list = _normalize_reference_image_type(reference_image_type)
    ref_type = type_list[0] if type_list else default_type
    img_path = None
    if ref_type == "首帧图片":
        img_path = reference_images.get("首帧")
    elif ref_type == "尾帧图片":
        img_path = reference_images.get("尾帧")
    elif str(ref_type).startswith("参考图"):
        try:
            idx = int(str(ref_type).replace("参考图", "")) - 1
            img_path = reference_images.get("参考图片MAP", {}).get(idx)
        except Exception:
            img_path = None
    return img_path, ref_type


def _upload_reference_images(image_paths, max_images, log_prefix):
    urls = []
    seen_paths = set()
    for img_path in image_paths:
        if len(urls) >= max_images:
            break
        if not img_path:
            continue
        path_key = str(img_path)
        if path_key in seen_paths:
            continue
        seen_paths.add(path_key)
        image_url = _upload_image_to_host(img_path)
        if image_url:
            urls.append(image_url)
    if urls:
        _log(f"[{log_prefix}] 已上传参考图 URL {len(urls)} 张")
    return urls


def _normalize_seedance_2_local_path(value):
    if not value:
        return ''
    text = str(value).strip().strip('"').strip("'")
    if not text:
        return ''
    if _is_url_like(text):
        return text
    if text.startswith(('file://', 'local-file://')):
        try:
            parsed = urlparse(text)
            text = unquote(parsed.path or '')
            if text.startswith('/') and len(text) >= 3 and text[2] == ':':
                text = text[1:]
        except Exception:
            text = text.split('://', 1)[-1]
    return text.split('?', 1)[0].replace('\\', os.sep).replace('/', os.sep)


def _seedance_2_image_is_valid(image_path):
    if _is_url_like(image_path):
        return True
    clean_path = _normalize_seedance_2_local_path(image_path)
    if not clean_path or not os.path.exists(clean_path):
        _log(f"[Seedance 2.0] 参考图不存在: {clean_path or image_path}")
        return False
    ext = os.path.splitext(clean_path)[1].lower()
    if ext not in _SEEDANCE_2_IMAGE_FORMATS:
        _log(f"[Seedance 2.0] 不支持的参考图格式 {ext}: {clean_path}")
        return False
    try:
        size = os.path.getsize(clean_path)
        if size > _SEEDANCE_2_MAX_IMAGE_BYTES:
            _log(f"[Seedance 2.0] 参考图超过 30MB: {clean_path} ({size / 1024 / 1024:.1f}MB)")
            return False
    except OSError:
        return False
    return True


def _seedance_2_mime_type(file_path):
    ext = os.path.splitext(str(file_path))[1].lower()
    mime_map = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp',
        '.gif': 'image/gif',
        '.tiff': 'image/tiff',
        '.heic': 'image/heic',
        '.heif': 'image/heif',
    }
    return mime_map.get(ext, 'application/octet-stream')


def _upload_seedance_2_asset(file_path, *, api_key='', base_url='', asset_type='image', raise_on_error=False):
    """
    参考 example 的 Seedance 2.0 素材链路：presign -> OSS -> createMedia -> asset URL。
    raise_on_error=True 时上传失败抛异常（首尾帧用）；默认返回 None（普通参考图降级用）。
    """
    clean_path = _normalize_seedance_2_local_path(file_path)
    if _is_url_like(clean_path):
        return clean_path
    if not clean_path or not os.path.exists(clean_path):
        _log(f"[Seedance 2.0] 素材不存在: {clean_path or file_path}")
        return None

    base = _normalize_base_url(base_url) or _normalize_base_url(_DEFAULT_BASE_URL)
    filename = os.path.basename(clean_path)
    content_type = _seedance_2_mime_type(clean_path)
    auth_headers = {
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json',
    }

    try:
        _log(f"[Seedance 2.0] 获取上传地址: {filename} ({content_type})")
        presign_resp = requests.post(
            f"{base}/api/upload/presign",
            headers=auth_headers,
            json={'file_name': filename, 'content_type': content_type},
            timeout=30,
        )
        if presign_resp.status_code not in range(200, 300):
            _log(f"[Seedance 2.0] 获取上传地址失败: HTTP {presign_resp.status_code} {presign_resp.text[:200]}")
            return None
        presign_payload = presign_resp.json()
        data_block = presign_payload.get('data') or {}
        upload_url = data_block.get('upload_url') or ''
        public_url = data_block.get('public_url') or ''
        if not upload_url or not public_url:
            _log(f"[Seedance 2.0] 上传地址返回不完整: {json.dumps(presign_payload, ensure_ascii=False)[:300]}")
            return None

        with open(clean_path, 'rb') as file_obj:
            put_resp = requests.put(
                upload_url,
                data=file_obj,
                headers={'Content-Type': content_type},
                timeout=300,
            )
        if put_resp.status_code not in range(200, 300):
            _log(f"[Seedance 2.0] OSS 上传失败: HTTP {put_resp.status_code} {put_resp.text[:200]}")
            return None

        create_resp = requests.post(
            'https://api.geeknow.top/api/asset/createMedia',
            headers=auth_headers,
            json={'url': public_url, 'name': os.path.splitext(filename)[0], 'assetType': asset_type},
            timeout=60,
        )
        if create_resp.status_code not in range(200, 300):
            _log(f"[Seedance 2.0] 素材注册失败: HTTP {create_resp.status_code} {create_resp.text[:200]}")
            return public_url

        create_payload = create_resp.json()
        result = create_payload.get('Result') or create_payload.get('result') or {}
        asset_url = result.get('URL') or result.get('url') or ''
        if not asset_url:
            urls = create_payload.get(f'{asset_type}Urls')
            if isinstance(urls, list) and urls:
                asset_url = urls[0]
        asset_url = asset_url or create_payload.get('url') or create_payload.get('URL') or public_url
        _log(f"[Seedance 2.0] 素材就绪: {asset_url[:120]}")
        return asset_url
    except Exception as e:
        if raise_on_error:
            raise Exception(f"PLUGIN_ERROR:::Seedance 2.0 素材上传失败: {e}")
        _log(f"[Seedance 2.0] 素材上传异常: {e}")
        return None


def _resolve_seedance_2_reference_url(image_path, *, api_key='', base_url='', raise_on_error=False):
    if not image_path:
        return None
    normalized = _normalize_seedance_2_local_path(image_path)
    if _is_url_like(normalized):
        return normalized
    if not _seedance_2_image_is_valid(normalized):
        return None
    return _upload_seedance_2_asset(normalized, api_key=api_key, base_url=base_url, asset_type='image',
                                    raise_on_error=raise_on_error)


def _serialize_reference_images(ref_images):
    """
    将参考图片信息序列化为 JSON 字符串(只保留路径, 不保留二进制数据)
    """
    if not ref_images:
        return '{}'
    try:
        serializable = {}
        for k, v in ref_images.items():
            if isinstance(v, dict):
                serializable[str(k)] = {str(kk): str(vv) for kk, vv in v.items()}
            else:
                serializable[str(k)] = str(v)
        return json.dumps(serializable, ensure_ascii=False)
    except Exception:
        return '{}'


def _dict_to_json(d):
    if not d:
        return '{}'
    try:
        return json.dumps(d, ensure_ascii=False)
    except Exception:
        return '{}'


def _ensure_min_size(file_data, min_width=300, min_height=300):
    """
    确保图片宽高均 >= min_width/min_height，不足则等比放大
    使用 ceil 向上取整，避免截断导致仍不满足最小尺寸
    """
    try:
        from PIL import Image
        import io
        img = Image.open(io.BytesIO(file_data))
        w, h = img.size
        if w >= min_width and h >= min_height:
            return file_data

        scale = max(min_width / w, min_height / h)
        # 用 ceil 向上取整，确保放大后一定满足最小尺寸
        new_w = math.ceil(w * scale)
        new_h = math.ceil(h * scale)
        _log(f"图片尺寸 {w}x{h} 不满足最小要求，自动放大至 {new_w}x{new_h}")

        img = img.resize((new_w, new_h), Image.LANCZOS)
        buf = io.BytesIO()
        # 保存时明确指定格式，不依赖 img.format（内存中打开的图片 format 可能为 None）
        fmt = (img.format or 'PNG').upper()
        if fmt not in ('PNG', 'JPEG', 'WEBP', 'GIF'):
            fmt = 'PNG'
        img.save(buf, format=fmt)
        return buf.getvalue()
    except ImportError:
        _log("警告: 未安装 Pillow，无法自动调整图片尺寸，请手动确保图片宽高 >= 300px")
        return file_data
    except Exception as e:
        _log(f"警告: 自动调整图片尺寸失败: {e}，将使用原图")
        return file_data


# --------------------- 工具 ---------------------


# --------------------- 日志相关 ---------------------

class _BufferingHandler(logging.Handler):
    def emit(self, record):
        global _log_index
        try:
            msg = self.format(record)
            with _log_lock:
                _log_index += 1
                _log_buffer.append({
                    'index': _log_index,
                    'time': record.created,
                    'level': record.levelname,
                    'msg': msg,
                })
        except Exception:
            self.handleError(record)


def _mask_base64_in_payload(payload):
    """
    隐藏 payload 中的 base64 数据
    """
    if not isinstance(payload, dict):
        return payload

    masked_payload = {}
    for key, value in payload.items():
        if isinstance(value, str):
            # 检测 data URI 格式的 base64
            if value.startswith('data:') and ';base64,' in value:
                parts = value.split(';base64,', 1)
                if len(parts) == 2:
                    masked_payload[key] = f"{parts[0]};base64,<base64数据已隐藏，长度: {len(parts[1])} 字符>"
                else:
                    masked_payload[key] = value
            # 检测纯 base64 字符串（长度超过 100 且只包含 base64 字符）
            elif len(value) > 100 and all(
                    c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=' for c in value):
                masked_payload[key] = f"<base64数据已隐藏，长度: {len(value)} 字符>"
            else:
                masked_payload[key] = value
        elif isinstance(value, list):
            # 处理列表中的 base64 数据
            masked_list = []
            for item in value:
                if isinstance(item, str):
                    if item.startswith('data:') and ';base64,' in item:
                        parts = item.split(';base64,', 1)
                        if len(parts) == 2:
                            masked_list.append(f"{parts[0]};base64,<base64数据已隐藏，长度: {len(parts[1])} 字符>")
                        else:
                            masked_list.append(item)
                    elif len(item) > 100 and all(
                            c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=' for c in item):
                        masked_list.append(f"<base64数据已隐藏，长度: {len(item)} 字符>")
                    else:
                        masked_list.append(item)
                else:
                    masked_list.append(item)
            masked_payload[key] = masked_list
        elif isinstance(value, dict):
            # 递归处理嵌套字典
            masked_payload[key] = _mask_base64_in_payload(value)
        else:
            masked_payload[key] = value

    return masked_payload


def _build_files_log(files_list):
    """
    构建文件列表的日志友好格式
    """
    files_display = []
    for field_name, file_tuple in files_list or []:
        if field_name == 'placeholder':
            files_display.append({
                'field': field_name,
                'placeholder': True,
            })
            continue

        filename = file_tuple[0] if len(file_tuple) > 0 else None
        file_data = file_tuple[1] if len(file_tuple) > 1 else b''
        mime_type = file_tuple[2] if len(file_tuple) > 2 else None
        files_display.append({
            'field': field_name,
            'filename': filename,
            'size_bytes': len(file_data) if file_data is not None else 0,
            'mime_type': mime_type,
        })
    return files_display


def _log_final_request(endpoint, headers, payload, timeout, *, request_format, files_list=None):
    """
    统一格式化并记录最终请求信息
    """
    request_snapshot = {
        'url': endpoint,
        'format': request_format,
        'timeout': timeout,
        'headers': _mask_headers_for_log(headers),
    }

    if request_format == 'json':
        request_snapshot['json'] = _mask_base64_in_payload(payload)
    else:
        # multipart/form-data 的 data 字段同样需要脱敏(doubao 会把 base64 放在 payload 里)
        request_snapshot['data'] = _mask_base64_in_payload(payload) if isinstance(payload, dict) else payload
        request_snapshot['files'] = _build_files_log(files_list)

    _log('[Geeknow最终请求] ' + json.dumps(request_snapshot, indent=2, ensure_ascii=False))


def _setup_logging():
    """
    初始化全局 Logger
    """
    logger = logging.getLogger("video.GeekNow")
    logger.setLevel(logging.INFO)
    logger.handlers = []

    # 控制台 Handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(logging.Formatter('[%(name)s] %(message)s'))
    logger.addHandler(console_handler)

    buf_handler = _BufferingHandler()
    buf_handler.setFormatter(logging.Formatter('%(asctime)s - %(message)s', datefmt='%H:%M:%S'))
    logger.addHandler(buf_handler)

    return logger


def get_buffered_logs(since_index=0):
    with _log_lock:
        return [e for e in _log_buffer if e['index'] > since_index]


def _log(msg, level='INFO'):
    """
    日志桥接
    """
    level_upper = str(level).upper()
    if level_upper == 'ERROR':
        _logger.error(msg)
    elif level_upper == 'WARNING':
        _logger.warning(msg)
    elif level_upper == 'DEBUG':
        _logger.debug(msg)
    else:
        _logger.info(msg)


# --------------------- 日志相关 ---------------------


# --------------------- SQLite 任务日志 ---------------------


_STATUS_DISPLAY_MAP = {
    'running': ('生成中', '#FFD600'),
    'success': ('成功', '#4CAF50'),
    'manual_success': ('手动下载成功', '#4CAF50'),
    'failed': ('失败(重试耗尽)', '#FF5252'),
    'no_retry_error': ('失败(不可重试)', '#FF5252'),
    'download_failed': ('下载失败', '#42A5F5'),
    'manual_failed': ('手动下载失败', '#42A5F5'),
}


def _get_status_display(status):
    status = (status or '').lower()
    return _STATUS_DISPLAY_MAP.get(status, (status or '未知', '#FFFFFF'))


def _init_task_log_db():
    """
    初始化视频任务日志数据库
    """
    try:
        conn = sqlite3.connect(str(_TASK_LOG_DB_PATH))
        c = conn.cursor()
        c.execute("""
            CREATE TABLE IF NOT EXISTS video_task_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT,
                completed_at TEXT,
                model_display TEXT,
                model_name TEXT,
                prompt TEXT,
                aspect_ratio TEXT,
                duration TEXT,
                reference_images TEXT,
                base_url TEXT,
                endpoint TEXT,
                generation_mode TEXT,
                api_task_id TEXT,
                status TEXT,
                video_url TEXT,
                local_path TEXT,
                error TEXT,
                metadata TEXT
            )
        """)
        c.execute("CREATE INDEX IF NOT EXISTS idx_video_logs_status ON video_task_logs(status)")
        c.execute("CREATE INDEX IF NOT EXISTS idx_video_logs_api_task_id ON video_task_logs(api_task_id)")
        conn.commit()
        conn.close()
        _log(f"[Geeknow Plugin] 任务日志数据库已就绪: {_TASK_LOG_DB_PATH}")
    except Exception as e:
        _log(f"[Geeknow Plugin] 初始化任务日志数据库失败: {e}")


def _insert_task_log_entry(entry):
    """
    插入一条任务日志, 返回 row id
    """
    try:
        conn = sqlite3.connect(str(_TASK_LOG_DB_PATH))
        c = conn.cursor()
        c.execute("""
            INSERT INTO video_task_logs
                (created_at, completed_at, model_display, model_name, prompt,
                 aspect_ratio, duration, reference_images, base_url, endpoint,
                 generation_mode, api_task_id, status, video_url, local_path, error, metadata)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            entry.get('created_at'), entry.get('completed_at'),
            entry.get('model_display'), entry.get('model_name'),
            entry.get('prompt'), entry.get('aspect_ratio'),
            entry.get('duration'), entry.get('reference_images'),
            entry.get('base_url'), entry.get('endpoint'),
            entry.get('generation_mode'), entry.get('api_task_id'),
            entry.get('status', 'running'), entry.get('video_url'),
            entry.get('local_path'), entry.get('error'),
            entry.get('metadata'),
        ))
        row_id = c.lastrowid
        conn.commit()
        conn.close()
        return row_id
    except Exception as e:
        _log(f"[任务日志] 插入失败: {e}")
        return None


def _update_task_log_entry(log_id, updates):
    """更新指定日志记录的字段"""
    if not log_id or not updates:
        return
    try:
        conn = sqlite3.connect(str(_TASK_LOG_DB_PATH))
        c = conn.cursor()
        set_parts = []
        values = []
        for k, v in updates.items():
            set_parts.append(f"{k} = ?")
            values.append(v)
        values.append(log_id)
        c.execute(f"UPDATE video_task_logs SET {', '.join(set_parts)} WHERE id = ?", values)
        conn.commit()
        conn.close()
    except Exception as e:
        _log(f"[任务日志] 更新失败: {e}")


def _fetch_task_logs(limit=50, status_filter=None, task_ids=None, require_url=False):
    """
    查询任务日志
    """
    try:
        conn = sqlite3.connect(str(_TASK_LOG_DB_PATH))
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        query = "SELECT * FROM video_task_logs WHERE 1=1"
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
            query += " AND video_url IS NOT NULL AND video_url != ''"
        query += " ORDER BY id DESC"
        if limit:
            query += " LIMIT ?"
            params.append(limit)
        c.execute(query, params)
        rows = [dict(r) for r in c.fetchall()]
        conn.close()
        return rows
    except Exception as e:
        _log(f"[任务日志] 查询失败: {e}")
        return []


def get_recent_task_logs(limit=50, status=None):
    """
    外部可调用：获取最近的任务日志
    """
    status_filter = [status] if status else None
    rows = _fetch_task_logs(limit=limit, status_filter=status_filter)
    for r in rows:
        r['status_display'] = _get_status_display(r.get('status', ''))
    return rows


def _log_task_result(task_context, status, video_url=None, local_path=None,
                     error=None, log_id=None, completed=True, api_task_id=None):
    """
    统一的日志记录/更新入口
    """
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    updates = {'status': status}
    if completed:
        updates['completed_at'] = now_str
    if video_url:
        updates['video_url'] = video_url
    if local_path:
        updates['local_path'] = local_path
    if error:
        updates['error'] = str(error)[:2000]
    if api_task_id:
        updates['api_task_id'] = api_task_id

    if log_id:
        _update_task_log_entry(log_id, updates)
        _log(f"[任务日志] 已更新 id={log_id} status={status}")
        return log_id
    else:
        entry = {
            'created_at': now_str,
            'completed_at': now_str if completed else None,
            'model_display': task_context.get('model_display', ''),
            'model_name': task_context.get('model_name', ''),
            'prompt': task_context.get('prompt', ''),
            'aspect_ratio': task_context.get('aspect_ratio', ''),
            'duration': task_context.get('duration', ''),
            'reference_images': task_context.get('reference_images', '{}'),
            'base_url': task_context.get('base_url', ''),
            'endpoint': task_context.get('endpoint', ''),
            'generation_mode': task_context.get('generation_mode', ''),
            'api_task_id': api_task_id or '',
            'status': status,
            'video_url': video_url,
            'local_path': local_path,
            'error': str(error)[:2000] if error else None,
            'metadata': task_context.get('metadata', '{}'),
        }
        new_id = _insert_task_log_entry(entry)
        _log(f"[任务日志] 已插入 id={new_id} status={status}")
        return new_id


def download_videos_from_logs(task_ids=None, status_filter=None, output_dir=None, limit=50, download_timeout=900):
    """
    对日志中下载失败的记录重新下载视频
    """
    if status_filter is None and task_ids is None:
        status_filter = ['download_failed']
    logs = _fetch_task_logs(limit=limit, status_filter=status_filter, task_ids=task_ids)

    if not logs:
        _log("[重新下载] 没有找到符合条件的记录")
        return []

    results = []
    for row in logs:
        log_id = row['id']
        video_url = row.get('video_url')
        if not video_url:
            _log(f"[重新下载] id={log_id} 没有 video_url，跳过")
            _update_task_log_entry(log_id, {'status': 'manual_failed', 'error': '无 video_url',
                                            'completed_at': datetime.now().strftime("%Y-%m-%d %H:%M:%S")})
            continue

        save_dir = output_dir or '.'
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        filename = f"redownload_{log_id}_{timestamp}.mp4"
        save_path = os.path.join(save_dir, filename)

        try:
            _log(f"[重新下载] id={log_id} 正在下载: {video_url}")
            download_headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': '*/*',
                'Referer': 'https://www.geeknow.top/',
            }
            # /content 端点需要鉴权
            if '/v1/videos/' in video_url and video_url.endswith('/content'):
                api_key = get_params().get('api_key', '')
                if api_key:
                    download_headers['Authorization'] = f'Bearer {api_key}'
            resp = requests.get(video_url, headers=download_headers,
                                timeout=download_timeout, stream=True)
            if resp.status_code != 200:
                raise Exception(f"HTTP {resp.status_code}")

            total_size = 0
            with open(save_path, 'wb') as f:
                for chunk in resp.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        total_size += len(chunk)

            file_mb = total_size / (1024 * 1024)
            _log(f"[重新下载] id={log_id} 成功: {save_path} ({file_mb:.2f} MB)")
            _update_task_log_entry(log_id, {
                'status': 'manual_success', 'local_path': save_path,
                'completed_at': datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                'error': None,
            })
            results.append({'id': log_id, 'status': 'manual_success', 'path': save_path})

        except Exception as e:
            _log(f"[重新下载] id={log_id} 失败: {e}")
            _update_task_log_entry(log_id, {
                'status': 'manual_failed',
                'error': str(e)[:2000],
                'completed_at': datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            })
            results.append({'id': log_id, 'status': 'manual_failed', 'error': str(e)})

    return results


# --------------------- SQLite 任务日志 ---------------------


# --------------------- generate ---------------------

def _preprocess_params(plugin_params, context):
    """
    参数预处理：处理模型名后缀、分辨率映射、时长转换等逻辑
    """
    # 基础参数获取
    model = _canonicalize_model_name(plugin_params.get('model', 'sora-2'))  # 模型 ID
    aspect_ratio = plugin_params.get('aspect_ratio', '16:9')  # 宽高比 常见的有 16:9 (横屏) 或 9:16 (竖屏)
    generation_mode = plugin_params.get('generation_mode', '文生视频')  # 生成模式 决定图片如何参与生成: 文生视频、首帧生视频、首尾帧、参考生视频
    duration_str = plugin_params.get('duration', '15')  # 视频时长

    # 转换时长为整数
    try:
        duration_int = int(duration_str)  # 视频时长
    except ValueError:
        duration_int = 15

    # Veo 模型特殊逻辑: 保持原始模型名，仅在参考生视频模式下限制宽高比
    if model.startswith('veo'):
        if generation_mode == '参考生视频':
            # Veo 参考生视频强制横屏
            if aspect_ratio != '16:9':
                _log("警告: Veo 参考生视频模式仅支持 16:9, 已自动调整")
                aspect_ratio = '16:9'

    # 分辨率(size)计算
    size = ""
    if model.startswith('wan2.6-') and ':' in model:  # 处理 Wan2.6 特殊格式 (wan2.6-t2v:1920*1080)
        parts = model.split(':', 1)
        model = parts[0]
        size = parts[1]
    elif model.startswith('grok'):
        # 优先使用前端传入的 size 参数，如果是标准格式（如 480P/720P/1080P）则直接使用
        # 否则通过 _infer_resolution_from_size 推断，最后默认 1080P
        size_param = plugin_params.get('size', '')
        if size_param and size_param.upper() in ['480P', '720P', '1080P', '540P']:
            size = size_param.upper()
        else:
            size = _infer_resolution_from_size(size_param) or '1080P'
    elif _is_seedance_2_model(model):
        size = _normalize_seedance_2_resolution(
            plugin_params.get('video_resolution')
            or plugin_params.get('resolution')
            or plugin_params.get('size')
            or '720p'
        )
        if duration_int < 5:
            _log(f"警告: Seedance 2.0 模型时长最小建议为 5s，已从 {duration_int}s 自动调整为 5s")
            duration_int = 5
        elif duration_int > 15:
            _log(f"警告: Seedance 2.0 模型时长最大建议为 15s，已从 {duration_int}s 自动调整为 15s")
            duration_int = 15
    elif model.startswith('doubao'):
        # 豆包 size 字段直接传宽高比字符串，如 "16:9" / "9:16" / "4:3" 等
        # 支持的值: 16:9 / 4:3 / 1:1 / 3:4 / 9:16 / 21:9 / keep_ratio / adaptive
        size = aspect_ratio
        # 豆包时长限制: 4 <= seconds < 12，自动修正越界值
        if duration_int < 4:
            _log(f"警告: 豆包模型时长最小为 4s，已从 {duration_int}s 自动调整为 4s")
            duration_int = 4
        elif duration_int >= 12:
            _log(f"警告: 豆包模型时长最大为 11s，已从 {duration_int}s 自动调整为 11s")
            duration_int = 11
    else:
        size = "1280x720" if aspect_ratio == "16:9" else "720x1280"

    return {
        "model": model,
        "aspect_ratio": aspect_ratio,
        "size": size,
        "duration": duration_int,
        "audio_generation": _normalize_audio_generation(plugin_params.get('audio_generation', 'Disabled'))
        # 音频开关 对应 Enabled (有声) 或 Disabled (无声)
    }


def _build_request_payload(model, prompt, size, duration, aspect_ratio, audio_generation, generation_mode,
                           reference_images, reference_image_type, *, api_key='', base_url=''):
    """
    请求构建：根据不同模型和生成模式，构建 payload 和 files_list
    返回: (payload, files_list)
    """
    if model.startswith('omni-fast'):
        return _build_omni_fast_payload(
            model, prompt, aspect_ratio, duration, generation_mode,
            reference_images, reference_image_type
        )

    if model.startswith('doubao'):
        return _build_doubao_payload(
            model, prompt, size, duration, generation_mode,
            reference_images, reference_image_type
        )

    if _is_seedance_2_model(model):
        return _build_seedance_2_payload(
            model, prompt, size, aspect_ratio, duration, audio_generation, generation_mode,
            reference_images, reference_image_type, api_key=api_key, base_url=base_url
        )

    if model.startswith('Hailuo-'):
        return _build_hailuo_payload(
            model, prompt, aspect_ratio, duration, generation_mode,
            reference_images, reference_image_type
        )

    if model.startswith('Vidu-'):
        return _build_vidu_payload(
            model, prompt, aspect_ratio, duration, generation_mode,
            reference_images, reference_image_type
        )

    if model.startswith('grok'):
        return _build_grok_payload(
            model, prompt, size, aspect_ratio, duration, generation_mode,
            reference_images, reference_image_type
        )

    if model.startswith('Kling-'):
        return _build_kling_payload(
            model, prompt, aspect_ratio, duration, audio_generation, generation_mode,
            reference_images, reference_image_type
        )

    is_kling = False

    payload = {
        "model": model,
        "prompt": prompt,
        "size": size,
        "seconds": str(duration)
    }
    output_config = {"aspect_ratio": aspect_ratio, "audio_generation": audio_generation}
    resolution = _infer_resolution_from_size(size)
    if resolution: output_config["resolution"] = resolution
    payload["metadata"] = {"output_config": output_config}

    # 2. 准备添加文件的方法
    files_list = []

    def _add_file(field_name, path):
        if not path: return False
        clean_path = path.split('?')[0]
        if os.path.exists(clean_path):
            with open(clean_path, 'rb') as f:
                files_list.append((field_name, (os.path.basename(clean_path), f.read(),
                                                'image/png')))  # 关键: 允许添加多个同名的 field_name，实现多图上传
            return True
        return False

    # 统一将 reference_image_type 转为列表
    if isinstance(reference_image_type, str):
        type_list = [reference_image_type]
    elif isinstance(reference_image_type, list):
        type_list = reference_image_type
    else:
        type_list = []

    if not type_list and generation_mode != '文生视频':
        _log("检测到前端未选择参考图类型，默认按顺序尝试获取全部图片")
        type_list = ["首帧图片", "尾帧图片", "参考图1", "参考图2", "参考图3", "参考图4", "参考图5", "参考图6", ]

    if generation_mode == '文生视频':
        pass

    else:
        # 针对 Grok、Sora 等支持多图的模型，遍历选中的所有类型
        for r_type in type_list:
            img_path = None

            # 根据选中的文字提取路径
            if r_type == "首帧图片":
                img_path = reference_images.get("首帧")
            elif r_type == "尾帧图片":
                img_path = reference_images.get("尾帧")
            elif r_type.startswith("参考图"):
                try:
                    idx = int(r_type.replace("参考图", "")) - 1
                    img_path = reference_images.get("参考图片MAP", {}).get(idx)
                except:
                    pass

            if not img_path:
                continue

            # 根据模型分配字段名
            if model.startswith('doubao'):  # 豆包通常只能处理固定字段，建议如果是多选，按顺序分配
                field = 'first_frame_image' if r_type == "首帧图片" else 'last_frame_image'
                _add_file(field, img_path)
            elif model.startswith('wan2.6-i2v'):
                _add_file('image', img_path)
            else:
                # Grok、Sora2、Veo 等：所有图片依次放入 input_reference
                _add_file('input_reference', img_path)
                _log(f"已添加参考图字段 [input_reference]: {r_type}")

    # 4. Multipart 兜底 (保持不变)
    if not files_list and not _is_json_submission_model(model) and not is_kling:
        files_list.append(('placeholder', (None, '')))

    return payload, files_list


def _read_image_as_base64_data_url(image_path):
    """
    读取图片文件并返回 Base64 Data URL 字符串
    返回 None 如果路径无效或读取失败
    """
    if not image_path:
        return None
    clean_path = str(image_path).split('?')[0]
    if not os.path.exists(clean_path):
        _log(f"警告: 图片文件不存在: {clean_path}")
        return None
    try:
        # 根据扩展名推断 MIME 类型
        ext = os.path.splitext(clean_path)[1].lower()
        mime_map = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.webp': 'image/webp',
            '.gif': 'image/gif',
        }
        mime_type = mime_map.get(ext, 'image/png')
        with open(clean_path, 'rb') as f:
            b64_str = base64.b64encode(f.read()).decode('utf-8')
        return f"data:{mime_type};base64,{b64_str}"
    except Exception as e:
        _log(f"警告: 读取图片失败 {clean_path}: {e}")
        return None


def _upload_image_to_host(image_path, timeout=60):
    """
    将本地图片上传到图床，返回可访问的 URL；失败返回 None
    """
    if not image_path:
        return None
    clean_path = str(image_path).split('?')[0]
    if not os.path.exists(clean_path):
        _log(f"[图床] 文件不存在: {clean_path}")
        return None
    upload_url = "https://imageproxy.zhongzhuan.chat/api/upload"
    try:
        with open(clean_path, 'rb') as f:
            resp = requests.post(upload_url, files={'file': (os.path.basename(clean_path), f)}, timeout=timeout)
        if resp.status_code == 200:
            url = resp.json().get('url')
            if url:
                _log(f"[图床] 上传成功: {url}")
                return url
        _log(f"[图床] 上传失败: {resp.status_code} {resp.text[:200]}")
        return None
    except Exception as e:
        _log(f"[图床] 上传异常: {e}")
        return None


def _build_seedance_2_payload(model, prompt, resolution, aspect_ratio, duration, audio_generation, generation_mode,
                              reference_images, reference_image_type, *, api_key='', base_url=''):
    """
    Seedance 2.0 专用请求构建。
    对齐 example/main.py 的 GeekNow 中转协议：/v1/videos JSON、素材 URL、reference_image_urls、
    first_frame_url / last_frame_url。
    """
    files_list = []
    first_frame = None
    last_frame = None
    reference_paths = []
    seen_paths = set()

    def _add_reference(path):
        if not path or len(reference_paths) >= _SEEDANCE_2_MAX_IMAGES:
            return
        key = str(path)
        if key in seen_paths:
            return
        seen_paths.add(key)
        reference_paths.append(path)

    if generation_mode == '文生视频':
        pass
    elif generation_mode == '首帧生视频':
        first_frame, ref_type = _resolve_selected_reference_image(reference_images, reference_image_type)
        if not first_frame:
            _log(f"警告: Seedance 2.0 首帧生视频未找到参考图片({ref_type})，将按文生视频提交")
    elif generation_mode == '首尾帧':
        first_frame = reference_images.get("首帧")
        last_frame = reference_images.get("尾帧")
        if not first_frame:
            _log("警告: Seedance 2.0 首尾帧模式未找到首帧图片")
        if not last_frame:
            _log("警告: Seedance 2.0 首尾帧模式未找到尾帧图片")
    elif generation_mode in ('参考生视频', '首帧生视频+参考图'):
        if generation_mode == '首帧生视频+参考图':
            first_frame, ref_type = _resolve_selected_reference_image(reference_images, reference_image_type)
            if not first_frame:
                _log(f"警告: Seedance 2.0 未找到首帧图片({ref_type})")

        ref_map = reference_images.get("参考图片MAP", {})
        for key in sorted(ref_map.keys()):
            _add_reference(ref_map[key])

        if not reference_paths and not first_frame:
            _log("警告: Seedance 2.0 参考生视频模式未找到参考图，将按文生视频提交")
    else:
        _log(f"警告: Seedance 2.0 暂不识别生成模式 {generation_mode}，将按文生视频提交")

    first_frame_url = _resolve_seedance_2_reference_url(first_frame, api_key=api_key, base_url=base_url,
                                                         raise_on_error=bool(first_frame))
    last_frame_url = _resolve_seedance_2_reference_url(last_frame, api_key=api_key, base_url=base_url,
                                                        raise_on_error=bool(last_frame))

    reference_urls = []
    for path in reference_paths:
        if path in (first_frame, last_frame):
            continue
        url = _resolve_seedance_2_reference_url(path, api_key=api_key, base_url=base_url)
        if url and url not in reference_urls:
            reference_urls.append(url)

    if first_frame and not first_frame_url:
        raise Exception("PLUGIN_ERROR:::Seedance 2.0 首帧素材上传失败，请检查文件格式或网络")
    if last_frame and not last_frame_url:
        raise Exception("PLUGIN_ERROR:::Seedance 2.0 尾帧素材上传失败，请检查文件格式或网络")
    if reference_paths and not reference_urls:
        raise Exception("PLUGIN_ERROR:::Seedance 2.0 参考图上传失败，请检查网络或文件格式")

    prompt_prefix = ''
    if reference_urls:
        mentions = [f"@图片{i + 1} 这是参考图{i + 1}" for i in range(len(reference_urls))]
        prompt_prefix = '；'.join(mentions) + '；'

    payload = {
        "model": _seedance_2_api_model_name(model),
        "prompt": f"{prompt_prefix}{prompt or ''}",
        "resolution": _normalize_seedance_2_resolution(resolution),
        "ratio": aspect_ratio,
        "duration": int(duration),
        "generate_audio": audio_generation == 'Enabled',
        "watermark": False,
    }

    if first_frame_url:
        payload["first_frame_url"] = first_frame_url
    if last_frame_url:
        payload["last_frame_url"] = last_frame_url
    if reference_urls:
        payload["reference_image_urls"] = reference_urls

    return payload, files_list


def _build_doubao_payload(model, prompt, size, duration, generation_mode,
                          reference_images, reference_image_type):
    """
    豆包模型专用请求构建
    必须走 multipart/form-data，图片作为真正的文件字段上传（二进制），
    不能用 Base64 字符串放在 data 字段（会导致 buffer full）
    """
    payload = {
        "model": model,
        "prompt": prompt,
        "seconds": str(duration),
    }

    if size:
        payload["size"] = size

    files_list = []

    def _add_image_file(field_name, img_path):
        """读取图片二进制，加入 files_list"""
        if not img_path:
            return False
        clean_path = str(img_path).split('?')[0]
        if not os.path.exists(clean_path):
            _log(f"警告: 图片文件不存在: {clean_path}")
            return False
        try:
            ext = os.path.splitext(clean_path)[1].lower()
            mime_map = {
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.webp': 'image/webp',
                '.gif': 'image/gif',
            }
            mime_type = mime_map.get(ext, 'image/png')
            with open(clean_path, 'rb') as f:
                file_data = f.read()

            file_data = _ensure_min_size(file_data, min_width=300, min_height=300)

            files_list.append((field_name, (os.path.basename(clean_path), file_data, mime_type)))
            _log(f"已添加文件字段 [{field_name}]: {os.path.basename(clean_path)}, {len(file_data)} bytes")
            return True
        except Exception as e:
            _log(f"警告: 读取图片失败 {clean_path}: {e}")
            return False

    # 处理图片字段
    ref_type = reference_image_type[0] if isinstance(reference_image_type, list) else reference_image_type
    if generation_mode == '首帧生视频':
        img_path = None
        if ref_type == "首帧图片":
            img_path = reference_images.get("首帧")
        elif ref_type == "尾帧图片":
            img_path = reference_images.get("尾帧")
        elif str(ref_type).startswith("参考图"):
            idx = int(str(ref_type).replace("参考图", "")) - 1
            img_path = reference_images.get("参考图片MAP", {}).get(idx)

        if not _add_image_file('first_frame_image', img_path):
            _log("警告: 首帧生视频模式未能读取到有效图片，将退化为文生视频")

    elif generation_mode == '首尾帧':
        if not _add_image_file('first_frame_image', reference_images.get("首帧")):
            _log("警告: 首尾帧模式未能读取到首帧图片")
        if not _add_image_file('last_frame_image', reference_images.get("尾帧")):
            _log("警告: 首尾帧模式未能读取到尾帧图片")

    elif generation_mode == '参考生视频':
        _log("警告: 豆包模型不支持参考生视频模式，将退化为文生视频")

    # 没有图片时加 placeholder 触发 multipart
    if not files_list:
        files_list.append(('placeholder', ('placeholder', b'', 'application/octet-stream')))

    return payload, files_list


def _build_hailuo_payload(model, prompt, aspect_ratio, duration, generation_mode,
                          reference_images, reference_image_type):
    """
    Hailuo (海螺) 模型专用请求构建
    走 JSON 格式，支持文生视频 / 首帧生视频
    注意：Hailuo 不支持 aspect_ratio 参数
    """
    # Hailuo 不支持 aspect_ratio，只传 resolution
    output_config = {
        "resolution": "720P",
    }

    payload = {
        "model": model,
        "prompt": prompt,
        "metadata": {
            "output_config": output_config
        }
    }

    if duration:
        payload["seconds"] = str(duration)

    files_list = []

    ref_type = reference_image_type[0] if isinstance(reference_image_type, list) else reference_image_type
    if generation_mode == '首帧生视频':
        img_path = None
        if ref_type == "首帧图片":
            img_path = reference_images.get("首帧")
        elif ref_type == "尾帧图片":
            img_path = reference_images.get("尾帧")
        elif str(ref_type).startswith("参考图"):
            idx = int(str(ref_type).replace("参考图", "")) - 1
            img_path = reference_images.get("参考图片MAP", {}).get(idx)

        image_url = _upload_image_to_host(img_path)
        if image_url:
            payload["image"] = image_url
        else:
            _log("警告: Hailuo 首帧生视频模式图片上传失败，将退化为文生视频")

    elif generation_mode == '首尾帧':
        _log("警告: Hailuo 模型暂不支持首尾帧模式，将退化为文生视频")

    elif generation_mode == '参考生视频':
        _log("警告: Hailuo 模型暂不支持参考生视频模式，将退化为文生视频")

    return payload, files_list


def _build_kling_payload(model, prompt, aspect_ratio, duration, audio_generation, generation_mode,
                         reference_images, reference_image_type):
    """
    Kling 模型专用请求构建
    走 JSON 格式，图片通过图床上传获取 URL（腾讯 VOD 不支持 data URI）
    """
    output_config = {
        "aspect_ratio": aspect_ratio,
        "audio_generation": audio_generation,
        "duration": duration,
    }
    resolution = _infer_resolution_from_size(None)
    if resolution:
        output_config["resolution"] = resolution

    payload = {
        "model": model,
        "prompt": prompt,
        "seconds": str(duration),
        "metadata": {"output_config": output_config}
    }

    files_list = []

    if generation_mode != '文生视频':
        ref_type = reference_image_type[0] if isinstance(reference_image_type, list) else reference_image_type
        img_path = None
        if ref_type == "首帧图片":
            img_path = reference_images.get("首帧")
        elif ref_type == "尾帧图片":
            img_path = reference_images.get("尾帧")
        elif str(ref_type).startswith("参考图"):
            try:
                idx = int(str(ref_type).replace("参考图", "")) - 1
                img_path = reference_images.get("参考图片MAP", {}).get(idx)
            except:
                pass

        if img_path:
            image_url = _upload_image_to_host(img_path)
            if image_url:
                payload["image"] = image_url
                _log(f"[Kling] 图片已上传图床: {image_url}")
            else:
                _log("警告: Kling 图片上传图床失败，将退化为文生视频")
        else:
            _log("警告: Kling 未找到参考图片，将退化为文生视频")

    return payload, files_list


def _build_vidu_payload(model, prompt, aspect_ratio, duration, generation_mode,
                        reference_images, reference_image_type):
    """
    Vidu 模型专用请求构建
    走 JSON 格式，支持文生视频 / 首帧生视频 / 首尾帧 / 参考生视频
    图片通过图床上传获取 URL，不使用 base64
    """
    output_config = {
        "aspect_ratio": aspect_ratio,
        "resolution": "720P",
    }

    payload = {
        "model": model,
        "prompt": prompt,
        "metadata": {
            "output_config": output_config
        }
    }

    if duration:
        payload["seconds"] = str(duration)

    files_list = []

    ref_type = reference_image_type[0] if isinstance(reference_image_type, list) else reference_image_type
    if generation_mode == '首帧生视频':
        img_path = None
        if ref_type == "首帧图片":
            img_path = reference_images.get("首帧")
        elif ref_type == "尾帧图片":
            img_path = reference_images.get("尾帧")
        elif str(ref_type).startswith("参考图"):
            idx = int(str(ref_type).replace("参考图", "")) - 1
            img_path = reference_images.get("参考图片MAP", {}).get(idx)

        image_url = _upload_image_to_host(img_path)
        if image_url:
            payload["image"] = image_url
        else:
            _log("警告: Vidu 首帧生视频模式图片上传失败，将退化为文生视频")

    elif generation_mode == '首尾帧':
        first_url = _upload_image_to_host(reference_images.get("首帧"))
        last_url = _upload_image_to_host(reference_images.get("尾帧"))

        if first_url:
            payload["image"] = first_url
        else:
            _log("警告: Vidu 首尾帧模式首帧图片上传失败")

        if last_url:
            payload["metadata"]["last_frame_url"] = last_url
        else:
            _log("警告: Vidu 首尾帧模式尾帧图片上传失败")

    elif generation_mode == '参考生视频':
        ref_map = reference_images.get("参考图片MAP", {})
        urls = []
        for key in sorted(ref_map.keys()):
            if len(urls) >= 3:
                break
            url = _upload_image_to_host(ref_map[key])
            if url:
                urls.append(url)
        if urls:
            payload["images"] = urls
        else:
            _log("警告: Vidu 参考生视频模式未能上传任何图片，将退化为文生视频")

    return payload, files_list


def _build_grok_payload(model, prompt, size, aspect_ratio, duration, generation_mode,
                        reference_images, reference_image_type):
    """
    Grok 模型专用请求构建
    走 multipart/form-data，参考图字段为 input_reference（支持多张）
    aspect_ratio 支持 2:3 / 3:2 / 1:1
    size 传 720P 或 1080P
    """
    payload = {
        "model": model,
        "prompt": prompt,
        "seconds": str(duration),
    }
    if aspect_ratio:
        payload["aspect_ratio"] = aspect_ratio
    if size:
        payload["size"] = size

    files_list = []

    def _add_image_file(img_path):
        if not img_path:
            return False
        clean_path = str(img_path).split('?')[0]
        if not os.path.exists(clean_path):
            _log(f"警告: 图片文件不存在: {clean_path}")
            return False
        try:
            ext = os.path.splitext(clean_path)[1].lower()
            mime_map = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                        '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif'}
            mime_type = mime_map.get(ext, 'image/png')
            with open(clean_path, 'rb') as f:
                file_data = f.read()
            files_list.append(('input_reference', (os.path.basename(clean_path), file_data, mime_type)))
            _log(f"已添加 input_reference: {os.path.basename(clean_path)}, {len(file_data)} bytes")
            return True
        except Exception as e:
            _log(f"警告: 读取图片失败 {clean_path}: {e}")
            return False

    if isinstance(reference_image_type, str):
        type_list = [reference_image_type]
    elif isinstance(reference_image_type, list):
        type_list = reference_image_type
    else:
        type_list = []

    if generation_mode == '文生视频':
        pass

    elif generation_mode == '首帧生视频':
        ref_type = type_list[0] if type_list else "首帧图片"
        if ref_type == "首帧图片":
            img_path = reference_images.get("首帧")
        elif ref_type == "尾帧图片":
            img_path = reference_images.get("尾帧")
        elif str(ref_type).startswith("参考图"):
            idx = int(str(ref_type).replace("参考图", "")) - 1
            img_path = reference_images.get("参考图片MAP", {}).get(idx)
        else:
            img_path = None
        if not _add_image_file(img_path):
            _log("警告: Grok 首帧生视频模式未能读取到有效图片，将退化为文生视频")

    elif generation_mode == '首尾帧':
        if not _add_image_file(reference_images.get("首帧")):
            _log("警告: Grok 首尾帧模式未能读取到首帧图片")
        if not _add_image_file(reference_images.get("尾帧")):
            _log("警告: Grok 首尾帧模式未能读取到尾帧图片")

    elif generation_mode == '参考生视频':
        ref_map = reference_images.get("参考图片MAP", {})
        added = 0
        for key in sorted(ref_map.keys()):
            if added >= 6:
                break
            if _add_image_file(ref_map[key]):
                added += 1
        if added == 0:
            _log("警告: Grok 参考生视频模式未能读取到任何图片，将退化为文生视频")

    elif generation_mode == '首帧生视频+参考图':
        ref_type = type_list[0] if type_list else "首帧图片"
        if ref_type == "首帧图片":
            img_path = reference_images.get("首帧")
        elif ref_type == "尾帧图片":
            img_path = reference_images.get("尾帧")
        elif str(ref_type).startswith("参考图"):
            idx = int(str(ref_type).replace("参考图", "")) - 1
            img_path = reference_images.get("参考图片MAP", {}).get(idx)
        else:
            img_path = None
        if not _add_image_file(img_path):
            _log("警告: Grok 首帧生视频+参考图模式未能读取到首帧图片")
        ref_map = reference_images.get("参考图片MAP", {})
        added = 0
        for key in sorted(ref_map.keys()):
            if added >= 6:
                break
            if _add_image_file(ref_map[key]):
                added += 1
        if added == 0:
            _log("警告: Grok 首帧生视频+参考图模式未能读取到任何参考图片")

    if not files_list:
        files_list.append(('placeholder', ('placeholder', b'', 'application/octet-stream')))

    return payload, files_list


def _build_omni_fast_payload(model, prompt, aspect_ratio, duration, generation_mode,
                              reference_images, reference_image_type):
    """
    omni-fast / omni-fast-v2v 专用请求构建
    走 JSON 格式，图片通过 data URI (base64) 或公开 URL 传递
    支持: 文生视频 / 首帧生视频 / 首尾帧 / 参考生视频 (最多5张)
    时长: 4~30s
    """
    payload = {
        "model": model,
        "prompt": prompt,
        "seconds": str(duration),
        "resolution": "720p",
    }
    if aspect_ratio:
        payload["aspect_ratio"] = aspect_ratio

    files_list = []

    def _get_image_value(img_path):
        if not img_path:
            return None
        if _is_url_like(img_path):
            return img_path
        return _read_image_as_base64_data_url(img_path)

    if generation_mode == '文生视频':
        pass

    elif generation_mode == '首帧生视频':
        ref_type = reference_image_type[0] if isinstance(reference_image_type, list) else reference_image_type
        img_path = None
        if ref_type == "首帧图片":
            img_path = reference_images.get("首帧")
        elif ref_type == "尾帧图片":
            img_path = reference_images.get("尾帧")
        elif str(ref_type).startswith("参考图"):
            try:
                idx = int(str(ref_type).replace("参考图", "")) - 1
                img_path = reference_images.get("参考图片MAP", {}).get(idx)
            except Exception:
                pass
        image_val = _get_image_value(img_path)
        if image_val:
            payload["first_image_url"] = image_val
        else:
            _log("警告: omni-fast 首帧生视频模式未能读取到有效图片，将退化为文生视频")

    elif generation_mode == '首尾帧':
        first_val = _get_image_value(reference_images.get("首帧"))
        last_val = _get_image_value(reference_images.get("尾帧"))
        if first_val:
            payload["first_image_url"] = first_val
        else:
            _log("警告: omni-fast 首尾帧模式未能读取到首帧图片")
        if last_val:
            payload["last_image_url"] = last_val
        else:
            _log("警告: omni-fast 首尾帧模式未能读取到尾帧图片")

    elif generation_mode == '参考生视频':
        ref_map = reference_images.get("参考图片MAP", {})
        images = []
        for key in sorted(ref_map.keys()):
            if len(images) >= 5:
                break
            val = _get_image_value(ref_map[key])
            if val:
                images.append(val)
        if images:
            payload["images"] = images
        else:
            _log("警告: omni-fast 参考生视频模式未能读取到任何图片，将退化为文生视频")

    elif generation_mode == '首帧生视频+参考图':
        ref_type = reference_image_type[0] if isinstance(reference_image_type, list) else reference_image_type
        img_path = None
        if ref_type == "首帧图片":
            img_path = reference_images.get("首帧")
        elif ref_type == "尾帧图片":
            img_path = reference_images.get("尾帧")
        elif str(ref_type).startswith("参考图"):
            try:
                idx = int(str(ref_type).replace("参考图", "")) - 1
                img_path = reference_images.get("参考图片MAP", {}).get(idx)
            except Exception:
                pass
        first_val = _get_image_value(img_path)
        if first_val:
            payload["first_image_url"] = first_val
        else:
            _log("警告: omni-fast 首帧生视频+参考图模式未能读取到首帧图片")
        ref_map = reference_images.get("参考图片MAP", {})
        images = []
        for key in sorted(ref_map.keys()):
            if len(images) >= 5:
                break
            val = _get_image_value(ref_map[key])
            if val:
                images.append(val)
        if images:
            payload["images"] = images
        else:
            _log("警告: omni-fast 首帧生视频+参考图模式未能读取到任何参考图片")

    return payload, files_list


def _poll_video_status(base_url, task_id, headers, max_poll_attempts, poll_interval, progress_callback):
    """
    轮询视频生成状态
    """
    attempts = 0
    error_count = 0
    max_error_count = 5

    while attempts < max_poll_attempts:

        time.sleep(poll_interval)
        attempts += 1

        try:
            status_response = requests.get(f"{base_url}/v1/videos/{task_id}", headers=headers, timeout=900)
        except Exception as e:
            error_count += 1
            _log(f"请求异常 ({error_count}/{max_error_count}): {e}")
            if error_count >= max_error_count:
                raise Exception(f"PLUGIN_ERROR:::连续请求异常超过 {max_error_count} 次，最后一次异常: {e}")
            continue

        if status_response.status_code != 200:
            error_count += 1
            _log(f"状态查询失败 ({error_count}/{max_error_count}): {status_response.status_code}")
            if error_count >= max_error_count:
                raise Exception(
                    f"PLUGIN_ERROR:::连续请求失败超过 {max_error_count} 次，最后状态码: {status_response.status_code}")
            continue

        try:
            status_data = status_response.json()
        except Exception as e:
            error_count += 1
            _log(f"响应解析异常 ({error_count}/{max_error_count}): {e}")
            if error_count >= max_error_count:
                raise Exception(f"PLUGIN_ERROR:::连续响应解析异常超过 {max_error_count} 次，最后一次异常: {e}")
            continue

        # 请求成功，重置异常计数
        error_count = 0

        status = str(status_data.get("status") or '').strip().lower()
        _log(f"data: {status_data}")

        # 解析进度
        progress_percent = None
        detail = status_data.get("detail") or {}
        pending_info = detail.get("pending_info") or {}
        progress_pct = pending_info.get("progress_pct")
        if progress_pct is not None:  # 只有真正有值时,才会执行类型转换,避免 ValueError
            progress_percent = int(float(progress_pct) * 100)

        if progress_percent is None:
            top_progress = status_data.get("progress")
            if top_progress is not None:
                progress_percent = int(top_progress)

        _log(
            f"[{attempts}/{max_poll_attempts}] 状态: {status}, 进度: {progress_percent if progress_percent is not None else 'N/A'}")

        if progress_callback:
            if progress_percent is not None:
                progress_callback("生成中", progress_percent)
            elif status in ["pending", "queued"]:
                progress_callback("排队中")
            elif status in ["processing", "in_progress", "running", "generating"]:
                progress_callback("生成中")
            elif status in ["completed", "succeeded", "success"]:
                progress_callback("生成中", 100)

        video_url: Optional[str] = None
        if status in {"completed", "succeeded", "success"}:
            content = status_data.get("content")
            if content and isinstance(content, dict):
                video_url = content.get("video_url") or content.get("url")
            output = status_data.get("output")
            if not video_url and output and isinstance(output, dict):
                video_url = output.get("url")
            if not video_url:
                video_url = status_data.get("video_url") or status_data.get("url")
            if not video_url and detail:
                video_url = detail.get("url")
            # 兼容 data[0].url 格式（omni-fast 等接口）
            if not video_url:
                data_list = status_data.get("data")
                if isinstance(data_list, list) and data_list:
                    video_url = data_list[0].get("url") if isinstance(data_list[0], dict) else None

            if video_url:
                _log(f"视频生成成功: {video_url}")
                return video_url
            else:
                # 接口未返回 URL，但任务已完成，降级到 /content 端点下载
                _log(f"API 未返回 video_url，将通过 /content 端点下载 (task_id={task_id})")
                return f"__content_endpoint__{task_id}"

        elif status in {"failed", "fail", "error", "cancelled", "canceled", "expired", "deleted"}:
            fail_reason = None
            if detail and isinstance(detail, dict):
                pending_info = detail.get("pending_info")
                if pending_info and isinstance(pending_info, dict):
                    fail_reason = pending_info.get("failure_reason")
                if not fail_reason:
                    fail_reason = detail.get("failure_reason")
            if not fail_reason:
                for key in ("fail_reason", "message", "msg", "reason", "error"):
                    value = status_data.get(key)
                    if value:
                        fail_reason = value
                        break
            if isinstance(fail_reason, dict):
                fail_reason = fail_reason.get("message") or fail_reason.get("code") or str(fail_reason)
            if not fail_reason:
                fail_reason = "任务失败，但未提供原因。"
            _log(f" 视频生成失败 (来自 API): {fail_reason}")
            raise Exception(f"PLUGIN_ERROR:::{fail_reason}")

    return None


def _download_video(video_url, output_path, base_url, task_id, headers):
    """
    下载视频到本地
    """
    download_headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
        'Referer': 'https://www.geeknow.top/',
    }

    # 接口未返回 URL 时，跳过方式1，直接走 /content 端点
    skip_direct = (video_url or '').startswith('__content_endpoint__')

    # 方式1: 直接下载 video_url
    if not skip_direct:
        try:
            _log(f"正在下载视频: {video_url}")
            video_response = requests.get(video_url, headers=download_headers, stream=True, timeout=9000)

            if video_response.status_code == 200:
                total_size = 0
                with open(output_path, 'wb') as f:
                    for chunk in video_response.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)
                            total_size += len(chunk)
                            if total_size % (10 * 1024 * 1024) < 8192:
                                _log(f"  已下载: {total_size / (1024 * 1024):.2f} MB")

                _log(f"视频已保存: {output_path}")
                _log(f"文件大小: {total_size / (1024 * 1024):.2f} MB")
                return True
        except Exception as e:
            _log(f"URL下载失败: {str(e)}")

    # 方式2: 备用 content API
    try:
        content_endpoint = f"{base_url}/v1/videos/{task_id}/content"
        _log(f"使用备用方式下载: {content_endpoint}")

        video_response = requests.get(content_endpoint, headers=headers, stream=True, timeout=9000)

        if video_response.status_code != 200:
            raise Exception(f"备用下载失败: {video_response.status_code}")

        total_size = 0
        with open(output_path, 'wb') as f:
            for chunk in video_response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                    total_size += len(chunk)

        _log(f"视频已保存（备用方式）: {output_path}")
        _log(f"文件大小: {total_size / (1024 * 1024):.2f} MB")
        return True
    except Exception as e:
        _log(f"备用下载失败: {str(e)}")

    return False

# 核心生成函数
def generate(context):
    """
    生成视频的主函数 - Geeknow API

    注意：参数同步已由 plugin_engine 在主线程中调用 _force_sync_params_from_ui() 完成
    不要在此函数中调用，因为此函数在工作线程中执行，无法安全访问UI控件
    """
    _log("\n" + "=" * 60)
    _log("[Geeknow Plugin] 开始生成视频")
    _log("=" * 60)

    # 获取参数
    prompt = context.get('prompt', '')
    reference_images = context.get('reference_images', {})
    output_dir = context.get('output_dir', context.get('project_path', '.'))
    plugin_params = context.get('plugin_params', _global_params)
    progress_callback = context.get('progress_callback')

    _log(f"--------------------------------------{plugin_params.get('model', '')}")
    _log(f"--------------------------------------{_MODEL_DISPLAY_MAP.get(plugin_params.get('model', ''), '')}")

    # 标准化 reference_images 结构
    if reference_images and "参考图片MAP" not in reference_images:
        if all(isinstance(k, int) or (isinstance(k, str) and k.isdigit()) for k in reference_images.keys()):
            reference_images = {"参考图片MAP": reference_images.copy()}

    reference_img_map = reference_images.get("参考图片MAP")
    if isinstance(reference_img_map, dict):
        normalized_reference_img_map = {}
        for key, value in reference_img_map.items():
            normalized_key = int(key) if isinstance(key, str) and key.isdigit() else key
            normalized_reference_img_map[normalized_key] = value
        reference_images["参考图片MAP"] = normalized_reference_img_map

    first_frame_path = context.get('first_frame_path')
    end_frame_path = context.get('end_frame_path')
    if first_frame_path:
        reference_images['首帧'] = first_frame_path
    if end_frame_path:
        reference_images['尾帧'] = end_frame_path

    # 获取插件配置
    api_key = plugin_params.get('api_key', '')
    base_url = _get_valid_base_url(plugin_params.get('base_url'))
    timeout = plugin_params.get('timeout', 900)
    max_poll_attempts = plugin_params.get('max_poll_attempts', 300)
    poll_interval = plugin_params.get('poll_interval', 10)
    generation_mode = plugin_params.get('generation_mode', '文生视频')
    reference_image_type = plugin_params.get('reference_image_type', '首帧图片')

    if not api_key:
        raise Exception("PLUGIN_ERROR:::API Key 未设置，请在插件设置中配置")

    # 参数预处理
    processed = _preprocess_params(plugin_params, context)
    model = processed['model']
    aspect_ratio = processed['aspect_ratio']
    size = processed['size']
    duration = processed['duration']
    audio_generation = processed['audio_generation']

    _log(f"提示词: {prompt}")
    _log(f"模型: {model}")
    _log(f"生成模式: {generation_mode}")
    _log(f"宽高比: {aspect_ratio}")
    _log(f"时长: {duration}秒")
    _log(f"音频: {'有声' if audio_generation == 'Enabled' else '无声'}")

    # 任务日志初始化
    model_display = _MODEL_REAL_TO_DISPLAY.get(model, model)
    task_log_context = {
        'model_display': model_display,
        'model_name': model,
        'prompt': prompt,
        'aspect_ratio': aspect_ratio,
        'duration': str(duration),
        'reference_images': _serialize_reference_images(reference_images),
        'base_url': base_url,
        'endpoint': f"{base_url}/v1/videos",
        'generation_mode': generation_mode,
        'metadata': '{}',
    }
    task_log_id = _log_task_result(task_log_context, 'running', completed=False)

    task_id = None
    try:
        # 构建请求
        payload, files_list = _build_request_payload(
            model, prompt, size, duration, aspect_ratio, audio_generation,
            generation_mode, reference_images, reference_image_type,
            api_key=api_key, base_url=base_url
        )

        headers = {"Authorization": f"Bearer {api_key}"}
        endpoint = f"{base_url}/v1/videos"

        if progress_callback:
            progress_callback("准备中")

        # 发送创建任务请求
        _log(f"正在发送请求到: {endpoint}")
        is_json_model = _is_json_submission_model(model)

        try:
            if is_json_model:
                _log(f"[Geeknow] 使用 JSON 格式发送请求 (模型: {model})")
                _inject_files_into_json_payload(payload, files_list)
                headers["Content-Type"] = "application/json"
                _log_final_request(endpoint, headers, payload, timeout, request_format='json')
                response = requests.post(endpoint, headers=headers, json=payload, timeout=timeout)
            else:
                request_kwargs = {
                    "headers": headers,
                    "data": payload,
                    "timeout": 9000
                }
                if files_list:
                    request_kwargs["files"] = files_list
                _log_final_request(endpoint, headers, payload, timeout, request_format='multipart/form-data',
                                   files_list=files_list)
                response = requests.post(endpoint, **request_kwargs, proxies={"http": None, "https": None})
        except requests.exceptions.ConnectionError as e:
            _log(f"[Geeknow] 连接异常详情: type={type(e).__name__}, args={e.args}")
            if e.args and hasattr(e.args[0], 'reason'):
                _log(f"[Geeknow] 底层原因: {type(e.args[0].reason).__name__}: {e.args[0].reason}")
            raise Exception(
                f"PLUGIN_ERROR:::连接失败（服务端未响应即断开）\n"
                f"目标地址: {endpoint}\n"
                f"请求格式: {'JSON' if is_json_model else 'multipart/form-data'}\n"
                f"原始错误: {e}\n"
                f"建议: 1.检查网络连接 2.尝试切换线路(base_url) 3.如上传图片过大请压缩后重试"
            )
        except requests.exceptions.Timeout as e:
            raise Exception(
                f"PLUGIN_ERROR:::请求超时\n"
                f"目标地址: {endpoint}\n"
                f"超时设置: {timeout if is_json_model else 9000}s\n"
                f"建议: 1.检查网络连接 2.尝试切换线路(base_url)"
            )
        except requests.exceptions.RequestException as e:
            raise Exception(
                f"PLUGIN_ERROR:::请求异常: {type(e).__name__}\n"
                f"目标地址: {endpoint}\n"
                f"详情: {e}"
            )

        if response.status_code not in range(200, 300):
            raise Exception(f"PLUGIN_ERROR:::API 错误: {response.status_code} - {response.text}")

        result = response.json()
        _log(f"API 响应: {result}")

        if "id" not in result and "task_id" not in result:
            raise Exception("PLUGIN_ERROR:::API 响应中没有 'id' 或 'task_id'。请检查 API 响应或联系中转站。")

        task_id = result.get("id") or result.get("task_id")
        _log(f"任务ID: {task_id}")
        _update_task_log_entry(task_log_id, {'api_task_id': task_id})
        _log("等待视频生成...")

        # 轮询任务状态
        video_url = _poll_video_status(base_url, task_id, headers, max_poll_attempts, poll_interval, progress_callback)
        if not video_url:
            raise Exception(f"PLUGIN_ERROR:::超过最大轮询次数 ({max_poll_attempts})，视频未生成")

        # 下载视频
        viewer_index = context.get('viewer_index', 0)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        filename = f"{viewer_index:04d}_video_{timestamp}.mp4"
        output_path = os.path.join(output_dir, filename)

        download_success = _download_video(video_url, output_path, base_url, task_id, headers)

        # sentinel 表示接口未返回公开 URL，改用 /content 端点地址记入日志，方便后续手动重下
        if (video_url or '').startswith('__content_endpoint__'):
            log_video_url = f"{base_url}/v1/videos/{task_id}/content"
        else:
            log_video_url = video_url

        if not download_success:
            _log_task_result(task_log_context, 'download_failed', video_url=log_video_url, error='所有下载方式均失败',
                             log_id=task_log_id, api_task_id=task_id)
            raise Exception("PLUGIN_ERROR:::视频下载失败，请通过插件任务日志下载重新拉取")

        _log("=" * 60)
        _log_task_result(task_log_context, 'success', video_url=log_video_url, local_path=output_path, log_id=task_log_id,
                         api_task_id=task_id)

        return [output_path]

    except Exception as e:
        # 拦截以上所有步骤的崩溃, 强制写入 failed 状态!
        error_msg = str(e)
        _log(f"生成过程中断: {error_msg}")

        # 防止重复写状态(如果在下载环节已经写了 download_failed, 这里就跳过)
        if '所有下载方式均失败' not in error_msg:
            _log_task_result(task_log_context, 'failed', error=error_msg, log_id=task_log_id, api_task_id=task_id)

        # 继续向外抛出异常, 通知主线程 UI 报错
        if error_msg.startswith("PLUGIN_ERROR:::"):
            raise e
        else:
            raise Exception(f"PLUGIN_ERROR:::{error_msg}")

# --------------------- 插件必要 ---------------------
def get_info():
    """
    返回插件信息
    """
    return {
        "name": "GeekNow 中转插件(推荐)",
        "description": "通过 GeekNow 中转API 调用 Sora2/Veo3.1/蛤肉/豆包/wan2.6/Vidu/Kling/Hailuo 模型生成视频（Vidu/Kling/Hailuo 仅基础模型，组合计费模型由中转处理）\n支持音频生成控制、插件自动更新、任务日志管理等功能\n注意：软件未与任何中转平台达成合作，不对任何中转平台的安全性负责，请谨慎辨别。",
        "version": _PLUGIN_VERSION,
        "author": "unknown"
    }


def handle_action(action, data=None):
    """
    新版本的引擎触发器
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
        try:
            db_path = plugin_dir / 'video_task_logs.db'
            if not db_path.exists():
                return {'ok': True, 'logs': []}
            conn = sqlite3.connect(str(db_path))
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute(
                'SELECT * FROM video_task_logs ORDER BY created_at DESC LIMIT ?',
                (int(data.get('limit', 200)),),
            )
            logs = [dict(row) for row in cur.fetchall()]
            conn.close()
            return {'ok': True, 'logs': logs}
        except Exception as e:
            return {'ok': False, 'error': str(e)}

    elif action == 'download_videos':
        try:
            task_ids = data.get('task_ids', [])
            if not task_ids:
                return {'ok': False, 'error': '未选择任务'}
            results = download_videos_from_logs(task_ids)
            return {'ok': True, 'results': results}
        except Exception as e:
            return {'ok': False, 'error': str(e)}

    elif action == 'get_logs':
        since = int(data.get('since_index', 0))
        return {'ok': True, 'entries': get_buffered_logs(since)}

    elif action == 'get_announcement':
        try:
            resp = requests.get('https://www.geeknow.top/api/status', timeout=10)
            resp.raise_for_status()
            announcements = resp.json().get('data', {}).get('announcements', [])
            content = announcements[0].get('content', '') if announcements else ''
            _log(content)
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

# 保存插件文件路径
_PLUGIN_FILE = __file__
_PLUGIN_ID = 'video'
_PLUGIN_VERSION = '3.1.16'

_BASE_URL_OPTIONS = [
    ("主节点", "https://geeknow.ai"),
    ("副节点", "https://api.geeknow.ai"),
]
_DEFAULT_BASE_URL = _BASE_URL_OPTIONS[1][1]

_log_buffer = collections.deque(maxlen=2000)
_log_index = 0
_log_lock = threading.Lock()
_logger = _setup_logging()

_VALID_BASE_URLS = {_normalize_base_url(url) for _, url in _BASE_URL_OPTIONS}

_TASK_LOG_DB_PATH = plugin_dir / "video_task_logs.db"
_init_task_log_db()

_default_params = {  # 默认参数
    'api_key': '',
    'base_url': _DEFAULT_BASE_URL,
    'model': 'sora-2',
    'aspect_ratio': '16:9',
    'duration': '4',
    'audio_generation': 'Disabled',
    'timeout': 900,
    'max_poll_attempts': 300,
    'poll_interval': 10,
    'generation_mode': '文生视频',
    'retry_count': 3,
    'reference_image_type': '首帧图片',  # Sora首帧生视频时使用的参考图片
    'retry_error_keywords': '',
    'no_retry_error_keywords': '',
    'update_manifest_url': '',
    'size': '720P'  # 清晰度参数，用于支持 size 的模型（如 Grok）
}

_MODEL_DISPLAY_MAP = {  # 模型显示名称映射 (显示名: 实际模型名)
    'sora-2': 'sora-2',
    # 'sora-2[vip]': 'sora-2[vip]',
    # Sora2 Pro 变体（参数字段与 sora-2 保持一致: prompt/size/seconds）
    'sora2-pro-landscape-25s（Pro横屏/25s，参数同sora-2）': 'sora2-pro-landscape-25s',
    'sora2-pro-landscape-hd-10s（Pro横屏高清/10s，参数同sora-2）': 'sora2-pro-landscape-hd-10s',
    'sora2-pro-landscape-hd-15s（Pro横屏高清/15s，参数同sora-2）': 'sora2-pro-landscape-hd-15s',
    'sora2-pro-portrait-25s（Pro竖屏/25s，参数同sora-2）': 'sora2-pro-portrait-25s',
    'sora2-pro-portrait-hd-10s（Pro竖屏高清/10s，参数同sora-2）': 'sora2-pro-portrait-hd-10s',
    'sora2-pro-portrait-hd-15s（Pro竖屏高清/15s，参数同sora-2）': 'sora2-pro-portrait-hd-15s',
    'sora3': 'sora3',
    'sora-2-oai': 'sora-2-oai',  # OpenAI官方Sora2，仅支持4/8/12秒

    'veo_3_1': 'veo_3_1',
    'veo_3_1-fast': 'veo_3_1-fast',

    '蛤肉3': 'grok-video-3',  # 谐音名规避
    '蛤肉-pro(10s)': 'grok-video-3-pro',  # 固定10秒的蛤肉模型
    '蛤肉-max(15s)': 'grok-video-3-max',  # 固定15秒的蛤肉模型

    '豆包Seedance1.5Pro-480p': 'doubao-seedance-1-5-pro_480p',
    '豆包Seedance1.5Pro-720p': 'doubao-seedance-1-5-pro_720p',
    '豆包Seedance1.5Pro-1080p': 'doubao-seedance-1-5-pro_1080p',
    '豆包Seedance2.0 Lite': 'seedance-2.0-lite',
    '豆包Seedance2.0 Pro': 'seedance-2.0-pro',
    '豆包Seedance2.0 Fast': 'seedance-2.0-fast',

    'wan2.6-t2v-1280*720（阿里文生视频，价格较低）': 'wan2.6-t2v:1280*720',
    'wan2.6-t2v-1920*1080（阿里文生视频，价格较高）': 'wan2.6-t2v:1920*1080',
    'wan2.6-i2v-1280*720（阿里图生视频，价格较低）': 'wan2.6-i2v:1280*720',
    'wan2.6-i2v-1920*1080（阿里图生视频，价格较高）': 'wan2.6-i2v:1920*1080',

    'Vidu-q3-pro': 'Vidu-q3-pro',
    'Vidu-q3-turbo': 'Vidu-q3-turbo',

    'Kling-3.0': 'Kling-3.0',
    'Kling-3.0-Omni': 'Kling-3.0-Omni',

    'Hailuo-2.3': 'Hailuo-2.3',
    'Hailuo-2.3-fast': 'Hailuo-2.3-fast',
    'dance2-fast-15s': 'dance2-fast-15s',

    'omni-fast': 'omni-fast',
    'omni-fast-v2v': 'omni-fast-v2v',
}

_MODEL_INFO = {  # 模型说明(用于 UI 展示/tooltip) 说明尽量写"能力/推荐参数"
    'sora-2': 'Sora2 VIP：文生视频/首帧生视频；参数：prompt/size/seconds；宽高比：16:9/9:16；时长：4/8/12s。',
    # 'sora-2[vip]': 'Sora2 VIP：与 sora-2 参数一致；具体额度/优先级以中转平台为准。',
    'sora3': '按秒计费',
    'sora2-pro-landscape-25s': 'Sora2 Pro 横屏 25s：参数与 sora-2 一致（prompt/size/seconds）；推荐 16:9；推荐 25s。',
    'sora2-pro-landscape-hd-10s': 'Sora2 Pro 横屏高清 10s：参数与 sora-2 一致（prompt/size/seconds）；推荐 16:9；推荐 10s。',
    'sora2-pro-landscape-hd-15s': 'Sora2 Pro 横屏高清 15s：参数与 sora-2 一致（prompt/size/seconds）；推荐 16:9；推荐 15s。',
    'sora2-pro-portrait-25s': 'Sora2 Pro 竖屏 25s：参数与 sora-2 一致（prompt/size/seconds）；推荐 9:16；推荐 25s。',
    'sora2-pro-portrait-hd-10s': 'Sora2 Pro 竖屏高清 10s：参数与 sora-2 一致（prompt/size/seconds）；推荐 9:16；推荐 10s。',
    'sora2-pro-portrait-hd-15s': 'Sora2 Pro 竖屏高清 15s：参数与 sora-2 一致（prompt/size/seconds）；推荐 9:16；推荐 15s。',
    'veo_3_1': 'Veo 3.1：支持文生视频/首尾帧/参考生视频（参考生视频最多3张且仅16:9）。',
    'veo_3_1-fast': 'Veo 3.1 Fast：同 veo_3_1，但速度/效果取舍以中转平台为准。',
    'grok-video-3': '蛤肉3：文生视频/首帧生视频/首尾帧/参考生视频（参考生视频最多6张）；宽高比支持竖/横（内部会换算为分辨率）。',
    'grok-video-3-pro': '蛤肉 Pro：固定 10s（插件会自动把 seconds 设为 10）；支持文生视频/首帧生视频/首尾帧/参考生视频。',
    'grok-video-3-max': '蛤肉 Max：固定 15s（插件会自动把 seconds 设为 15）；支持文生视频/首帧生视频/首尾帧/参考生视频。',
    'doubao-seedance-1-5-pro_480p': '豆包 Seedance 1.5 Pro 480p：时长 4-11s；宽高比选项更多；支持首帧/首尾帧。',
    'doubao-seedance-1-5-pro_720p': '豆包 Seedance 1.5 Pro 720p：同上，分辨率不同。',
    'doubao-seedance-1-5-pro_1080p': '豆包 Seedance 1.5 Pro 1080p：同上，分辨率不同。',
    'seedance-2.0-lite': '豆包 Seedance 2.0 Lite：走 GeekNow /v1/videos JSON 中转协议；本地参考图先上传素材库，再通过 reference_image_urls / first_frame_url / last_frame_url 发送；最多 9 张参考图。',
    'seedance-2.0-pro': '豆包 Seedance 2.0 Pro：走 GeekNow /v1/videos JSON 中转协议；本地参考图先上传素材库，再通过 reference_image_urls / first_frame_url / last_frame_url 发送；最多 9 张参考图。',
    'seedance-2.0-fast': '豆包 Seedance 2.0 Fast：走 GeekNow /v1/videos JSON 中转协议；本地参考图先上传素材库，再通过 reference_image_urls / first_frame_url / last_frame_url 发送；最多 9 张参考图。',
    'wan2.6-t2v:1280*720': '阿里万象 wan2.6 文生视频：参数同 sora-2（prompt/size/seconds）；分辨率 1280*720（价格较低）或 1920*1080（价格较高）。',
    'wan2.6-t2v:1920*1080': '阿里万象 wan2.6 文生视频：参数同 sora-2（prompt/size/seconds）；分辨率 1280*720（价格较低）或 1920*1080（价格较高）。',
    'wan2.6-i2v:1280*720': '阿里万象 wan2.6 图生视频：参数同 sora-2（prompt/size/seconds）；分辨率 1280*720（价格较低）或 1920*1080（价格较高）；支持首帧生视频。',
    'wan2.6-i2v:1920*1080': '阿里万象 wan2.6 图生视频：参数同 sora-2（prompt/size/seconds）；分辨率 1280*720（价格较低）或 1920*1080（价格较高）；支持首帧生视频。',
    'sora-2-oai': 'OpenAI官方Sora2：文生视频/首帧生视频；参数：prompt/size/seconds；宽高比：16:9/9:16；时长：仅支持4/8/12s。',
    'Vidu-q3-pro': 'Vidu q3-pro（基础模型）。',
    'Vidu-q3-turbo': 'Vidu q3-turbo（基础模型）。',
    'Kling-3.0': '可灵 3.0（基础模型）。',
    'Kling-3.0-Omni': '可灵 3.0 Omni（基础模型）。',
    'Hailuo-2.3': '海螺 2.3（基础模型）。',
    'Hailuo-2.3-fast': '海螺 2.3 fast（基础模型）。',
    'dance2-fast-15s': 'dance2-fast-15s：请求方式与 Sora 一致（prompt/size/seconds）；固定 15s。',
    'omni-fast': 'omni-fast：文生视频/首帧生视频/首尾帧/参考生视频；JSON格式；图片支持本地文件(自动转base64)或URL；参考图最多5张；时长4~30s。',
    'omni-fast-v2v': 'omni-fast-v2v：在 omni-fast 基础上额外支持参考视频编辑(V2V)，需上传不超过15MB的MP4。',
}

_MODEL_FIXED_PARAMS = {  # 某些模型名/产品形态是"固定参数"的: 这里统一做默认值/自动纠正
    'grok-video-3-pro': {'seconds': 10},  # 该模型本身固定 10s
    'grok-video-3-max': {'seconds': 15},  # 该模型本身固定 15s
    # Sora2 Pro 系列: 从名字可读的固定参数
    'sora2-pro-landscape-25s': {'seconds': 25, 'aspect_ratio': '16:9'},
    'sora2-pro-landscape-hd-10s': {'seconds': 10, 'aspect_ratio': '16:9'},
    'sora2-pro-landscape-hd-15s': {'seconds': 15, 'aspect_ratio': '16:9'},
    'sora2-pro-portrait-25s': {'seconds': 25, 'aspect_ratio': '9:16'},
    'sora2-pro-portrait-hd-10s': {'seconds': 10, 'aspect_ratio': '9:16'},
    'sora2-pro-portrait-hd-15s': {'seconds': 15, 'aspect_ratio': '9:16'},
    'seedance-2.0-lite': {'seconds': 5, 'aspect_ratio': '16:9'},
    'seedance-2.0-pro': {'seconds': 5, 'aspect_ratio': '16:9'},
    'seedance-2.0-fast': {'seconds': 5, 'aspect_ratio': '16:9'},
    'dance2-fast-15s': {'seconds': 15},
}

_MODEL_REAL_TO_DISPLAY = {v: k for k, v in _MODEL_DISPLAY_MAP.items()}  # 反向映射(实际模型名 -> 显示名)

_global_params = _default_params.copy()  # 全局参数存储
_global_params.update(load_plugin_config(_PLUGIN_FILE))

_global_params['base_url'] = _get_valid_base_url(_global_params.get('base_url', _DEFAULT_BASE_URL))

print(
    f"[Geeknow Plugin] 插件初始化完成，API Key: {'已设置(' + str(len(_global_params.get('api_key', ''))) + '字符)' if _global_params.get('api_key') else '未设置'}")
