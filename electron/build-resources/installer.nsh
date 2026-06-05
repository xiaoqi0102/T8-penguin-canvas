!macro customInit
  ; Older updater clients may pass /S. Keep the installer visible so users can
  ; confirm the update flow instead of watching the app disappear silently.
  SetSilent normal
!macroend
