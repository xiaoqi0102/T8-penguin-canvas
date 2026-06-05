#!/usr/bin/env python
"""T8 ParseHub bridge.

Reads a JSON payload from stdin and writes a single JSON object to stdout.
This small adapter keeps the Electron/Node backend isolated from ParseHub's
Python API shape, so upstream ParseHub updates usually only touch this file.
"""

from __future__ import annotations

import dataclasses
import enum
import importlib.metadata
import json
import os
import platform
import sys
import traceback
from pathlib import Path
from typing import Any


def _bootstrap_paths() -> None:
    script = Path(__file__).resolve()
    root = script.parents[2] if len(script.parents) >= 3 else script.parent
    candidates: list[Path] = [
        root / "tools" / "parsehub-pythonlibs",
        root / "ParseHub" / "src",
    ]
    for raw in os.environ.get("T8_PARSEHUB_LIB_PATHS", "").split(os.pathsep):
        if raw.strip():
            candidates.insert(0, Path(raw.strip()))
    for item in candidates:
        if item.exists():
            text = str(item)
            if text not in sys.path:
                sys.path.insert(0, text)


_bootstrap_paths()


def _jsonable(value: Any) -> Any:
    if value is None or isinstance(value, str | int | float | bool):
        return value
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, enum.Enum):
        return value.value
    if dataclasses.is_dataclass(value):
        return {k: _jsonable(v) for k, v in dataclasses.asdict(value).items()}
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_jsonable(v) for v in value]
    if hasattr(value, "model_dump"):
        return _jsonable(value.model_dump())
    if hasattr(value, "to_dict"):
        return _jsonable(value.to_dict())
    if hasattr(value, "__dict__"):
        return {
            str(k): _jsonable(v)
            for k, v in vars(value).items()
            if not str(k).startswith("_")
        }
    return str(value)


def _kind_from_media_ref(item: Any) -> str:
    name = item.__class__.__name__.lower()
    if "video" in name:
        return "video"
    if "audio" in name:
        return "audio"
    if "livephoto" in name:
        return "image"
    if "ani" in name:
        return "image"
    if "image" in name:
        return "image"
    ext = str(getattr(item, "ext", "") or "").lower()
    if ext in {"mp4", "webm", "mov", "m4v", "mkv"}:
        return "video"
    if ext in {"mp3", "wav", "ogg", "m4a", "flac", "aac"}:
        return "audio"
    if ext in {"jpg", "jpeg", "png", "webp", "gif", "bmp", "avif"}:
        return "image"
    return "file"


def _iter_media(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, (str, bytes)):
        return [value]
    if isinstance(value, (list, tuple, set)):
        return list(value)
    return [value]


def _media_ref_to_dict(item: Any, index: int) -> dict[str, Any]:
    data = _jsonable(item)
    if not isinstance(data, dict):
        data = {"url": str(data)}
    data.setdefault("kind", _kind_from_media_ref(item))
    data.setdefault("index", index)
    return data


def _media_file_to_dict(item: Any, index: int) -> dict[str, Any]:
    data = _jsonable(item)
    if not isinstance(data, dict):
        data = {"path": str(data)}
    name = item.__class__.__name__.lower()
    if "video" in name:
        data.setdefault("kind", "video")
    elif "audio" in name:
        data.setdefault("kind", "audio")
    elif "image" in name or "ani" in name or "livephoto" in name:
        data.setdefault("kind", "image")
    else:
        data.setdefault("kind", "file")
    data.setdefault("index", index)
    return data


def _parse_result_to_dict(result: Any) -> dict[str, Any]:
    raw = result.to_dict() if hasattr(result, "to_dict") else _jsonable(result)
    if not isinstance(raw, dict):
        raw = {"value": raw}
    media = [_media_ref_to_dict(item, index) for index, item in enumerate(_iter_media(getattr(result, "media", None)))]
    platform_obj = getattr(result, "platform", None)
    platform_id = getattr(platform_obj, "id", None) or raw.get("platform")
    platform_name = getattr(platform_obj, "display_name", None) or platform_id
    return {
        **raw,
        "platform": platform_id,
        "platformName": platform_name,
        "type": raw.get("type") or str(getattr(getattr(result, "type", None), "value", "") or ""),
        "title": raw.get("title") or getattr(result, "title", "") or "",
        "content": raw.get("content") or getattr(result, "content", "") or "",
        "raw_url": raw.get("raw_url") or getattr(result, "raw_url", None),
        "media": media,
    }


def _download_result_to_dict(result: Any) -> dict[str, Any]:
    media = [_media_file_to_dict(item, index) for index, item in enumerate(_iter_media(getattr(result, "media", None)))]
    return {
        "output_dir": str(getattr(result, "output_dir", "") or ""),
        "media": media,
    }


def _parse_cookie(value: Any) -> str | dict[str, Any] | None:
    if value is None:
        return None
    if isinstance(value, dict):
        return value
    text = str(value).strip()
    if not text:
        return None
    if text.startswith("{") and text.endswith("}"):
        try:
            parsed = json.loads(text)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            return text
    return text


def _package_version(name: str) -> str:
    try:
        return importlib.metadata.version(name)
    except Exception:
        return "unknown"


def _status() -> dict[str, Any]:
    from parsehub import ParseHub

    hub = ParseHub()
    return {
        "ok": True,
        "available": True,
        "parsehubVersion": _package_version("parsehub"),
        "pythonVersion": platform.python_version(),
        "platforms": hub.get_platforms(),
    }


def _resolve(payload: dict[str, Any]) -> dict[str, Any]:
    from parsehub import ParseHub

    action = str(payload.get("action") or "parse").strip().lower()
    url_or_text = str(payload.get("input") or payload.get("url") or "").strip()
    if not url_or_text:
        raise ValueError("缺少分享链接或分享码")
    proxy = str(payload.get("proxy") or "").strip() or None
    cookie = _parse_cookie(payload.get("cookie"))
    hub = ParseHub()

    parsed = hub.parse_sync(url_or_text, proxy=proxy, cookie=cookie)
    data: dict[str, Any] = {
        "ok": True,
        "action": action,
        "parsehubVersion": _package_version("parsehub"),
        "pythonVersion": platform.python_version(),
        "parsed": _parse_result_to_dict(parsed),
    }
    if action == "download":
        output_dir = str(payload.get("downloadPath") or "").strip() or None
        save_metadata = bool(payload.get("saveMetadata"))
        download_proxy = str(payload.get("downloadProxy") or "").strip() or proxy
        downloaded = parsed.download_sync(
            path=output_dir,
            proxy=download_proxy,
            save_metadata=save_metadata,
        )
        data["download"] = _download_result_to_dict(downloaded)
    return data


def main() -> int:
    try:
        payload = json.load(sys.stdin)
        if not isinstance(payload, dict):
            raise ValueError("stdin JSON 必须是对象")
        action = str(payload.get("action") or "parse").strip().lower()
        if action == "status":
            result = _status()
        else:
            result = _resolve(payload)
        print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
        return 0
    except Exception as exc:
        error = {
            "ok": False,
            "error": str(exc) or exc.__class__.__name__,
            "errorType": exc.__class__.__name__,
            "trace": traceback.format_exc(limit=4),
            "pythonVersion": platform.python_version(),
        }
        print(json.dumps(error, ensure_ascii=False, separators=(",", ":")))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
