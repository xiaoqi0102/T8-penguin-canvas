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

If a Python entry and a CLI entry are both present, T8 probes the Python module
first with a lightweight import/version check. This keeps the packaged app from
misreporting "not installed" when the CLI cold-starts slowly in Torch/diffusers
environments.

Recommended manifest:

`runtime-manifest.json` with upstream commit/version, Python version, torch build,
CUDA build, and installed extras (`gpu`, `detect`, `trustmark`, `lama`).

Current bridge target:

- Upstream: `wiltodelta/remove-ai-watermarks`
- Version: `0.8.7` or newer
- Required CLI behavior: invisible text/face protection is opt-in
  (`--protect-text` / `--protect-faces` only when the user enables it);
  do not package an older runtime that only supports `--no-protect-*`.
- Rebuild this sidecar whenever upstream changes CLI options, mark registry,
  optional extras, or model cache layout.
