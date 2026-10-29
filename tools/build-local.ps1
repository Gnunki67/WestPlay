param(
    [switch]$PackageOnly,
    [switch]$Offline,
    [ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9_-]*$')]
    [string]$Name = 'WestPlay-Local-Radio'
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $projectRoot
try {
    if (-not $PackageOnly) {
        if (-not (Test-Path -LiteralPath 'ui/public/brand-logos/volvo.svg')) {
            throw 'Restore the original brand-logo asset pack in ui/public/brand-logos before building this local version.'
        }
        & npm --prefix ui ci
        if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
        & npm --prefix ui run build:release
        if ($LASTEXITCODE -ne 0) { throw 'UI build failed' }
        $previousOffline = $env:WESTPLAY_OFFLINE_BUILD
        try {
            if ($Offline) { $env:WESTPLAY_OFFLINE_BUILD = '1' }
            else { Remove-Item Env:WESTPLAY_OFFLINE_BUILD -ErrorAction SilentlyContinue }
            & cargo build --release -p westplay-app -p westplay-plugin --features westplay-app/custom-protocol
        } finally { $env:WESTPLAY_OFFLINE_BUILD = $previousOffline }
        if ($LASTEXITCODE -ne 0) { throw 'Native build failed' }
    }
    if (-not (Test-Path -LiteralPath 'ui/dist/brand-logos/volvo.svg')) { throw 'Packaged UI is missing the Volvo boot logo.' }
    $delivery = Join-Path $projectRoot 'delivery'
    $package = Join-Path $delivery $Name
    if (Test-Path -LiteralPath $package) { throw "Output already exists: $package. Preserve or rename it before packaging again." }
    New-Item -ItemType Directory -Force -Path $delivery | Out-Null
    New-Item -ItemType Directory -Path $package | Out-Null
    Copy-Item -LiteralPath 'target/release/westplay.exe', 'target/release/westplay.dll' -Destination $package
    # GNU builds load WebView2 through its redistributable loader DLL; MSVC may link it statically.
    if (Test-Path -LiteralPath 'target/release/WebView2Loader.dll') {
        Copy-Item -LiteralPath 'target/release/WebView2Loader.dll' -Destination $package
    }
    Copy-Item -LiteralPath 'ui/dist' -Destination (Join-Path $package 'ui') -Recurse
    Copy-Item -LiteralPath 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_LICENSES.md' -Destination $package
    Copy-Item -LiteralPath 'docs/RADIO-FM-AND-CONTROLS.md' -Destination (Join-Path $package 'README.md')
    @("WestPlay update checks: $(if ($Offline) { 'disabled (private local build)' } else { 'enabled (standard release)' })", 'Radio streams and third-party services still use the internet.') |
        Set-Content -LiteralPath (Join-Path $package 'BUILD-INFO.txt')
    $validation = Join-Path $package 'validation'
    New-Item -ItemType Directory -Path $validation | Out-Null
    foreach ($logName in @('ui-tests.log', 'tests-workspace.log', 'plugin-tests.log', 'plugin-sync-tests.log', 'webview-test.log', 'radio-relay-tests.log', 'radio-spatial-native.log', 'pr-inspect-fixed.log', 'pr-roads.log', 'npm-audit.json')) {
        $path = Join-Path $projectRoot "tools/local-build/$logName"
        if (Test-Path -LiteralPath $path) { Copy-Item -LiteralPath $path -Destination $validation }
    }
    Get-ChildItem -LiteralPath $package -File | Where-Object Extension -in '.exe', '.dll' | Get-FileHash -Algorithm SHA256 |
        ForEach-Object { "$($_.Hash)  $(Split-Path -Leaf $_.Path)" } |
        Set-Content -LiteralPath (Join-Path $package 'SHA256.txt')
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = Join-Path $delivery "$Name.zip"
    [IO.Compression.ZipFile]::CreateFromDirectory($package, $archive, [IO.Compression.CompressionLevel]::Optimal, $true)
    Get-Item -LiteralPath $archive
} finally { Pop-Location }
