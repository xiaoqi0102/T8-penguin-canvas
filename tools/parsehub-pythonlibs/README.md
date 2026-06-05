ParseHub dependency target for Electron packaging.

This directory is intentionally a generated runtime slot. Keep this README in
git, but do not commit installed Python packages here.

Refresh locally before a self-contained Electron release:

```
tools\remove-ai-watermarks-runtime\python\python.exe -m pip install --upgrade --target tools\parsehub-pythonlibs .\ParseHub
```

The backend bridge also supports `T8_PARSEHUB_PYTHON` and
`T8_PARSEHUB_LIB_PATHS` for development overrides.
