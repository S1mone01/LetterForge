# LetterForge Pro – Desktop

Editor tipografico SVG, versione desktop (Electron).

## Requisiti
- **Node.js** 18+ → https://nodejs.org
- **npm** (incluso con Node.js)

## Installazione dipendenze (una volta sola)

```bash
npm install
```

## Avvio in modalità sviluppo

```bash
npm start
```

## Build eseguibile

### Windows (.exe installer)
```bash
npm run build:win
```
L'installer viene generato in `dist/`.

### macOS (.dmg)
```bash
npm run build:mac
```

### Linux (.AppImage)
```bash
npm run build:linux
```

---

## Font automatici

Metti i tuoi file `.ttf` / `.otf` / `.woff` / `.woff2` nella cartella **`font/`**
nella stessa directory dell'eseguibile.

Vengono caricati **automaticamente** all'avvio — senza dover cliccare "Carica Font".

**Struttura cartella dopo il build:**
```
LetterForge-Desktop/
├── LetterForge Pro.exe   ← eseguibile
└── font/
    ├── MioFont.ttf
    ├── AltroFont.otf
    └── ...
```

---

## Icona personalizzata (opzionale)

Aggiungi nella cartella `assets/`:
- `icon.ico` per Windows (256×256 consigliato)
- `icon.icns` per macOS
- `icon.png` per Linux (512×512)

Se non trovi i file icona, rimuovi le righe `"icon"` dal `package.json` e
`electron-builder` userà l'icona di default di Electron.
