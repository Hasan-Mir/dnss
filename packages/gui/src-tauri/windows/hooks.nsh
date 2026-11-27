; NSIS installer hooks for DNSS (referenced via tauri.windows.conf.json).
; Runs elevated once during per-machine installation/uninstallation to manage
; the `DnssService` background service so standard users can switch DNS
; without repeated UAC prompts.

; Align the 150x57 header logo (`headerImage`) to the right edge of the white
; MUI2 header bar so page titles and subtitles stay cleanly left-aligned.
!define MUI_HEADERIMAGE_RIGHT

!macro _DNSS_STOP_SERVICE
  nsExec::ExecToLog '"$SYSDIR\sc.exe" stop DnssService'
  Pop $0
  ; Poll up to 15 seconds until DnssService reaches STOPPED (or does not exist),
  ; whether `sc stop` returned 0 or 1061 (stop already pending).
  StrCpy $1 0
  ${DoWhile} $1 < 30
    nsExec::ExecToLog '"$SYSDIR\sc.exe" query DnssService'
    Pop $0
    ${If} $0 != 0
      ${ExitDo}
    ${EndIf}
    nsExec::ExecToLog '"$SYSDIR\cmd.exe" /C ""$SYSDIR\sc.exe" query DnssService | "$SYSDIR\findstr.exe" /C:"STOPPED""'
    Pop $2
    ${If} $2 == 0
      ${ExitDo}
    ${EndIf}
    Sleep 500
    IntOp $1 $1 + 1
  ${Loop}
  ; Brief grace period for the process image lock to release after SERVICE_STOPPED.
  Sleep 300
!macroend

!macro NSIS_HOOK_PREINSTALL
  ; Stop any running DnssService and wait for it to exit before overwriting
  ; `${MAINBINARYNAME}.exe` during an upgrade.
  !insertmacro _DNSS_STOP_SERVICE
!macroend

!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "Installing and starting DNSS background service..."
  nsExec::ExecToLog '"$INSTDIR\${MAINBINARYNAME}.exe" --install-service'
  Pop $0
  ${If} $0 != 0
    DetailPrint "Warning: Failed to install DnssService (exit code $0)."
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "Stopping and removing DNSS background service..."
  ${If} ${FileExists} "$INSTDIR\${MAINBINARYNAME}.exe"
    nsExec::ExecToLog '"$INSTDIR\${MAINBINARYNAME}.exe" --uninstall-service'
    Pop $0
  ${Else}
    !insertmacro _DNSS_STOP_SERVICE
    nsExec::ExecToLog '"$SYSDIR\sc.exe" delete DnssService'
    Pop $0
  ${EndIf}
!macroend
