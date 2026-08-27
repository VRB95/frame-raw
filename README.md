# FrameRaw

Aplicație desktop pentru încadrarea non-distructivă a fotografiilor RAW în formate fizice de print.

## Ce funcționează în MVP

- import prin dialog sau drag & drop pentru ARW/DNG/NEF/CR2/CR3/RAF/ORF/RW2;
- preview sRGB generat de backend;
- canvas 10×15, 13×18 sau 15×21 cm, portret/peisaj;
- Fill, Fit, Center, drag, zoom, rotație și border;
- export JPEG 98, 4:4:4, cu DPI în metadata;
- geometrie non-distructivă partajată conceptual între preview și export.

## Dezvoltare UI

```powershell
npm install
npm run dev
```

Browserul permite verificarea UI-ului. Importul și exportul au nevoie de shell-ul Tauri.

## Backend local

Folosește Python 3.12 (rawpy nu oferă întotdeauna imediat wheel-uri pentru cea mai nouă versiune Python):

```powershell
py -3.12 -m venv .venv
.venv\Scripts\python -m pip install -r backend\requirements.txt
.venv\Scripts\python backend\main.py preview --input sample.jpg --output preview.jpg
```

## Desktop și installer Windows

Instalează Rust stable și Microsoft C++ Build Tools, apoi:

```powershell
npm install
cd backend
..\.venv\Scripts\python -m pip install -r requirements.txt
.\build-sidecar.ps1
cd ..
npm run tauri build
```

Installerul NSIS este generat în `src-tauri/target/release/bundle/nsis`.
