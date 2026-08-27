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
& $python -m PyInstaller --onefile --clean --collect-all rawpy --name "frameraw-backend-$target" --distpath "../src-tauri/binaries" main.py
