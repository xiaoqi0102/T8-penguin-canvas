# Runtime archives

`npm run prepack:runtimes` generates local ZIP archives here before Electron packaging.

The ZIP files are intentionally ignored by Git:

- `remove-ai-watermarks-runtime.zip`
- `parsehub-pythonlibs.zip`
- `runtime-archives-manifest.json`

Electron packages these archives through `build.extraResources`. The app extracts them into the user's runtime cache only when the related node is actually used, so NSIS installation does not need to copy tens of thousands of small Python runtime files.
