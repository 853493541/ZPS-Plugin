$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT' -or -not $env:RUNNER_TEMP) {
    throw 'The installer smoke test is restricted to a disposable Windows CI runner.'
}
$root = Join-Path $env:RUNNER_TEMP ('zps-installer-' + [guid]::NewGuid())
$installDir = Join-Path $root '安装 测试'
$dataDir = Join-Path $root '用户 导出'
$stateFile = Join-Path $root 'state.json'
New-Item -ItemType Directory -Force -Path $root, $dataDir | Out-Null
$installer = @(Get-ChildItem 'dist/*.exe' | Where-Object { $_.Name -like '*Setup*' })
if ($installer.Count -ne 1) { throw 'Expected exactly one NSIS setup artifact.' }
$installedExe = Join-Path $installDir 'ZPS Studio.exe'
$uninstaller = Join-Path $installDir 'Uninstall ZPS Studio.exe'
function Wait-ForRemoval([string]$file) {
    $deadline = (Get-Date).AddSeconds(60)
    while ((Test-Path $file) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
    if (Test-Path $file) { throw "Uninstall did not remove $file" }
}
try {
    # NSIS requires /D to be last and its directory to remain unquoted.
    $process = Start-Process -FilePath $installer[0].FullName -ArgumentList "/S /currentuser /D=$installDir" -PassThru -Wait
    if ($process.ExitCode -ne 0) { throw "Installer exited $($process.ExitCode)" }
    if (-not (Test-Path $installedExe) -or -not (Test-Path $uninstaller)) { throw 'Installed executables are missing.' }
    $env:ZPS_EXECUTABLE_PATH = $installedExe
    $env:ZPS_SMOKE_DATA_DIR = $dataDir
    $env:ZPS_SMOKE_STATE = $stateFile
    node tools/smoke-desktop.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Installed application smoke test failed.' }
    $state = Get-Content $stateFile -Raw | ConvertFrom-Json
    $process = Start-Process -FilePath $uninstaller -ArgumentList '/S' -PassThru -Wait
    if ($process.ExitCode -ne 0) { throw "Uninstaller exited $($process.ExitCode)" }
    Wait-ForRemoval $installedExe
    foreach ($file in $state.retainedFiles) {
        if (-not (Test-Path $file.path)) { throw "Uninstall removed retained user data: $($file.path)" }
        if ((Get-FileHash -LiteralPath $file.path -Algorithm SHA256).Hash -ne $file.sha256) {
            throw "Uninstall changed retained user data: $($file.path)"
        }
    }
    if ((Get-Content $state.probeFile -Raw) -ne 'preserve-on-uninstall') { throw 'Retained user data changed.' }
    Remove-Item $state.probeFile -Force
    Write-Output 'PASS NSIS install, installed application, Chinese paths, export backup, restart, uninstall and retained user data.'
} finally {
    Remove-Item Env:ZPS_EXECUTABLE_PATH, Env:ZPS_SMOKE_DATA_DIR, Env:ZPS_SMOKE_STATE -ErrorAction SilentlyContinue
    # The CI runner discards this directory, preserving evidence when a check fails.
}
