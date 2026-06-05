!macro preInit
  ; Skip running the old uninstaller during overwrite/upgrade installs.
  ; Old uninstallers (compiled without customCheckAppRunning) use nsProcess::FindProcess
  ; which can falsely report the app as running, causing "无法关闭" errors even when
  ; no T8-PenguinCanvas.exe process exists. Clearing UninstallString makes the new
  ; installer's uninstallOldVersion step find nothing and overwrite files directly.
  SetRegView 64
  DeleteRegValue HKCU "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
  DeleteRegValue HKCU "${UNINSTALL_REGISTRY_KEY}" "QuietUninstallString"
  DeleteRegValue HKLM "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
  DeleteRegValue HKLM "${UNINSTALL_REGISTRY_KEY}" "QuietUninstallString"
  SetRegView 32
  DeleteRegValue HKCU "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
  DeleteRegValue HKCU "${UNINSTALL_REGISTRY_KEY}" "QuietUninstallString"
  DeleteRegValue HKLM "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
  DeleteRegValue HKLM "${UNINSTALL_REGISTRY_KEY}" "QuietUninstallString"
!macroend

!macro customInit
  ; Older updater clients may pass /S. Keep the installer visible so users can
  ; confirm the update flow instead of watching the app disappear silently.
  SetSilent normal
!macroend

!macro customCheckAppRunning
  ; Force close the running app regardless of UAC context.
  ; Default CHECK_APP_RUNNING is skipped inside UAC inner instance for assisted
  ; installers, causing "file in use" failures on overwrite/upgrade installs.
  ; No PID filter needed — installer exe name differs from app exe name.
  nsExec::Exec `"$SYSDIR\cmd.exe" /c taskkill /f /im "${APP_EXECUTABLE_FILENAME}" 2>nul`
  Pop $R0
  Sleep 800
!macroend

!macro customInstall
  ; Electron-builder normally creates these, but updater/reinstall paths can keep
  ; missing shortcuts. Recreate them explicitly so users always get launch entry
  ; points after a foreground install or update.
  CreateShortCut "$newStartMenuLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
  ClearErrors
  WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"

  CreateShortCut "$DESKTOP\${SHORTCUT_NAME}.lnk" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
  ClearErrors
  WinShell::SetLnkAUMI "$DESKTOP\${SHORTCUT_NAME}.lnk" "${APP_ID}"
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend
