param(
    [string]$PreviousVersion = '0.0.9',
    [string]$FeedDirectory = 'dist'
)
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT' -or $env:GITHUB_ACTIONS -ne 'true' -or -not $env:RUNNER_TEMP) {
    throw 'Upgrade smoke is restricted to a disposable Windows GitHub Actions runner.'
}
if ($PreviousVersion -notmatch '^\d+\.\d+\.\d+$') { throw 'PreviousVersion must be a stable numeric version.' }
$currentVersion = (Get-Content (Join-Path $PSScriptRoot '../package.json') -Raw | ConvertFrom-Json).version
if ([version]$PreviousVersion -ge [version]$currentVersion) { throw 'Fixture version must be older than the current package.' }
$feed = (Resolve-Path $FeedDirectory).Path
if (-not (Test-Path (Join-Path $feed 'latest.yml'))) { throw 'Build the current NSIS release before the upgrade smoke test.' }
$root = Join-Path $env:RUNNER_TEMP ('zps-upgrade-' + [guid]::NewGuid())
$fixture = Join-Path $root 'previous'
$installDir = Join-Path $root '安装 测试'
$installedExe = Join-Path $installDir 'ZPS Studio.exe'
$uninstaller = Join-Path $installDir 'Uninstall ZPS Studio.exe'
$node = (Get-Command node).Source
New-Item -ItemType Directory -Force -Path $root | Out-Null
Write-Output "Upgrade smoke evidence: $root"

function Invoke-Bounded([string]$file, [string]$arguments, [int]$seconds) {
    $process = Start-Process -FilePath $file -ArgumentList $arguments -PassThru -NoNewWindow
    if (-not $process.WaitForExit($seconds * 1000)) {
        & taskkill.exe /PID $process.Id /T /F | Out-Null
        throw "Process exceeded $seconds seconds: $file"
    }
    $process.Refresh()
    if ($process.ExitCode -ne 0) { throw "Process exited $($process.ExitCode): $file" }
}

$environmentNames = @('ZPS_EXECUTABLE_PATH', 'ZPS_UPDATER_ROOT', 'ZPS_UPDATER_FEED', 'ZPS_UPDATER_PREVIOUS_VERSION', 'ZPS_UPDATER_PHASE')
$savedEnvironment = @{}
foreach ($name in $environmentNames) { $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
try {
    Invoke-Bounded $node ('"node_modules/electron-builder/cli.js" --win nsis --x64 --publish never --config.extraMetadata.version=' + $PreviousVersion + ' --config.directories.output="' + $fixture + '"') 300
    $previous = @(Get-ChildItem -LiteralPath $fixture -Filter '*Setup*.exe')
    if ($previous.Count -ne 1) { throw 'Expected exactly one previous-version NSIS fixture.' }
    # NSIS requires /D last and the directory unquoted, including spaces.
    Invoke-Bounded $previous[0].FullName ("/S /currentuser /D=$installDir") 120
    if (-not (Test-Path $installedExe) -or -not (Test-Path $uninstaller)) { throw 'Previous-version install is missing executables.' }
    $env:ZPS_EXECUTABLE_PATH = $installedExe
    $env:ZPS_UPDATER_ROOT = $root
    $env:ZPS_UPDATER_FEED = $feed
    $env:ZPS_UPDATER_PREVIOUS_VERSION = $PreviousVersion
    $env:ZPS_UPDATER_PHASE = 'upgrade'
    Invoke-Bounded $node 'tools/smoke-updater.mjs' 180
    $deadline = (Get-Date).AddSeconds(120)
    do {
        Start-Sleep -Milliseconds 500
        try { $installedVersion = (Get-Item $installedExe -ErrorAction Stop).VersionInfo.ProductVersion }
        catch { $installedVersion = '' }
        $updaterInstallers = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
            $_.Path -and $_.Path.StartsWith((Join-Path $root 'updater-cache') + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)
        })
    } while (($installedVersion -ne $currentVersion -or $updaterInstallers.Count -ne 0) -and (Get-Date) -lt $deadline)
    if ($installedVersion -ne $currentVersion -or $updaterInstallers.Count -ne 0) { throw "Updater did not finish replacing the installed application with $currentVersion within 120 seconds." }
    $env:ZPS_UPDATER_PHASE = 'verify'
    Invoke-Bounded $node 'tools/smoke-updater.mjs' 180
    $state = Get-Content (Join-Path $root 'state.json') -Raw | ConvertFrom-Json
    if (-not $state.upgradeVerified -or -not $state.noUpdateVerified) { throw 'Upgrade verification evidence is incomplete.' }
    Invoke-Bounded $uninstaller '/S' 90
    $deadline = (Get-Date).AddSeconds(60)
    while ((Test-Path $installedExe) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
    if (Test-Path $installedExe) { throw 'Smoke cleanup did not uninstall the test application.' }
    Write-Output "PASS real installed upgrade $PreviousVersion -> $currentVersion; evidence retained at $root"
} finally {
    foreach ($name in $environmentNames) { [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process') }
    Get-Process -ErrorAction SilentlyContinue | Where-Object {
        $_.Path -and $_.Path.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)
    } | Stop-Process -Force -ErrorAction SilentlyContinue
}
