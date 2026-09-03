$ErrorActionPreference = "Stop"
$rust = Get-Command rustc -ErrorAction SilentlyContinue
$target = if ($rust) {
    rustc -vV | Select-String "host:" | ForEach-Object { $_.Line.Split()[1] }
} elseif ([Environment]::Is64BitOperatingSystem) {
    "x86_64-pc-windows-msvc"
} else {
    "i686-pc-windows-msvc"
}
$python = Join-Path $PSScriptRoot "..\.venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $python)) { throw "Create .venv first and install backend/requirements.txt." }
$binaryOutput = Join-Path $PSScriptRoot "..\src-tauri\binaries"
Push-Location -LiteralPath $PSScriptRoot
try {
    & $python -m PyInstaller --onefile --clean --collect-all rawpy --name "frameraw-backend-$target" --distpath $binaryOutput main.py
    if ($LASTEXITCODE -ne 0) { throw "PyInstaller failed with exit code $LASTEXITCODE." }
} finally {
    Pop-Location
}
