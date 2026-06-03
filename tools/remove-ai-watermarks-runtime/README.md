This folder is the optional Electron sidecar runtime slot for the
`remove-ai-watermarks` CLI.

Keep large Python/Torch files out of git. For a self-contained user release,
place a prepared runtime here before packaging so electron-builder copies it to:

`resources/tools/remove-ai-watermarks`

Accepted shapes:

- `remove-ai-watermarks.exe`
- `Scripts/remove-ai-watermarks.exe`
- `python.exe` with `remove_ai_watermarks` installed
- `python/python.exe` with `remove_ai_watermarks` installed
- `.venv/Scripts/python.exe` with `remove_ai_watermarks` installed

Recommended manifest:

`runtime-manifest.json` with upstream commit/version, Python version, torch build,
CUDA build, and installed extras (`gpu`, `detect`, `trustmark`, `lama`).
