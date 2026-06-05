!macro customInit
  ; Older updater clients may pass /S. Keep the installer visible so users can
  ; confirm the update flow instead of watching the app disappear silently.
  SetSilent normal
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
