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
CUDA build, and installed extras (`gpu`, `detect`, `trustmark`, `lama`, `restore`).

Current bridge target:

- Upstream: `wiltodelta/remove-ai-watermarks`
- Version: `0.8.9` or newer for the current full UI
- Required CLI behavior: invisible removal supports `--auto`,
  `--pipeline controlnet`, `--min-resolution`, `--controlnet-scale`,
  `--adaptive-polish`, `--unsharp`, and optional GFPGAN `--restore-faces`.
  T8 still keeps a version-aware compatibility path for old 0.8.7 runtimes
  (`ctrlregen` / `--protect-text` / `--protect-faces`), but release packages
  should be rebuilt on 0.8.9+ so the UI matches the bundled CLI.
- Rebuild this sidecar whenever upstream changes CLI options, mark registry,
  optional extras, or model cache layout.
