@echo off
setlocal
cd /d "%~dp0..\.."
set T8_FIGMA_BRIDGE_KEEP_ALIVE_ON_EXISTING=1
node tools\figma-bridge\server.cjs
set EXIT_CODE=%ERRORLEVEL%
if "%EXIT_CODE%"=="0" (
  echo.
  echo [t8-figma-bridge] 桥接进程已正常退出，或已有桥接正在运行。
  echo [t8-figma-bridge] 如果 Figma 仍无法导入，请保持一个桥接窗口打开后再运行插件。
  pause
  exit /b 0
)
if not "%EXIT_CODE%"=="0" (
  echo.
  echo [t8-figma-bridge] 启动失败。请按任意键关闭窗口，然后按上方错误提示处理。
  pause
)
exit /b %EXIT_CODE%
