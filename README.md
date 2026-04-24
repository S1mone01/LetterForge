# LetterForge Pro – Desktop

[![Version](https://img.shields.io/github/v/release/S1mone01/LetterForge?label=version&color=00c8ff)](https://github.com/S1mone01/LetterForge/releases/latest)
[![Platform](https://img.shields.io/badge/platform-windows%20%7C%20macos%20%7C%20linux-lightgrey)](https://github.com/S1mone01/LetterForge/releases)

**LetterForge Pro** è un editor tipografico SVG e 3D per desktop per creare, manipolare ed esportare lettere, logo e modelli 3D stampabili. Costruito con Electron.

> 🎨 **Editor visivo intuitivo** · 🔤 **Gestione font avanzata** · ⬡ **Libreria SVG** · 🧊 **Operazioni booleane 3D** · 💾 **Esportazione SVG/STL/3MF**

![Logo](images/Logo.png)

---

## ✨ Caratteristiche

- **Editor Canvas**: griglia, guide di allineamento, snap-to-guide
- **Trasformazioni complete**: posizione, rotazione, scala, inclinazione
- **Multi-select**: manipola più elementi contemporaneamente
- **Gestione Font**: supporto .ttf, .otf, .woff, .woff2
- **Libreria SVG**: importa e usa elementi SVG come asset
- **3D Preview**: anteprima 3D con operazioni booleane (unione, sottrazione)
- **OpenJSCAD Integration**: mesh watertight per stampa 3D
- **Esportazione**: SVG, STL, 3MF
- **Undo/Redo**: cronologia completa delle operazioni
- **Salva/Carica Progetto**: ripristina lo stato completo del workspace
- **Auto-Update**: aggiornamento automatico all'avvio

---

## 📸 Screenshot

### Editor 2D

![Editor 2D](images/2d.png)

### Anteprima 3D

![Anteprima 3D](images/3d.png)

---

## 🚀 Installazione

### Download
👉 **[GitHub Releases](https://github.com/S1mone01/LetterForge/releases/latest)**

### Sviluppo

```bash
git clone https://github.com/S1mone01/LetterForge-Desktop.git
cd LetterForge-Desktop
npm install
npm start
```

### Comandi Disponibili

| Comando | Descrizione |
|---------|-------------|
| `npm start` | Avvia in modalità sviluppo |
| `npm run build:win` | Crea installer Windows (.exe) |
| `npm run build:mac` | Crea DMG per macOS |
| `npm run build:linux` | Crea AppImage per Linux |
| `npm run release` | Build + publish su GitHub |

---

## 📖 Guida Rapida

### Scorciatoie da Tastiera

| Scorciatoia | Azione |
|-------------|--------|
| `Ctrl+Z` / `Ctrl+Y` | Annulla / Ripristina |
| `Spazio+Drag` | Pan canvas |
| `Shift+Click` | Multi-select |
| `Y` | Attiva/disattiva snap |
| `Ctrl+A` | Seleziona tutto |
| `Ctrl+D` | Duplica selezione |
| `Canc/Backspace` | Elimina selezionati |
| `Ctrl++/-` | Zoom in/out |
| `Ctrl+0` | Reset zoom |
| `Frecce direzionali` | Muovi selezione (1px, 10px con Shift) |

### Esportazione 3D

1. Aggiungi testo o elementi SVG
2. Apri anteprima 3D
3. Seleziona 2 elementi (Shift+click)
4. Clicca **Union** o **Subtract**
5. Esporta come STL o 3MF per stampa 3D

---

## 📂 Struttura del Progetto

```
LetterForge-Desktop/
├── main.js              # Electron main process (IPC, auto-update)
├── preload.js           # Preload script (contextBridge)
├── package.json         # Configurazione progetto e build
├── src/
│   ├── index.html       # UI renderer + logica frontend
│   └── splash.html      # Splash screen di caricamento
├── font/                # Font automatici (sviluppo)
├── svg/                 # Asset SVG (sviluppo)
└── assets/              # Icone app
```

**Nota**: In produzione, font e SVG utente sono salvati in `%APPDATA%/LetterForge Pro/` (Windows) e migrati automaticamente dagli aggiornamenti.

---

## 🛠️ Tecnologie

- **Runtime**: Electron 29.x
- **3D/CSG Engine**: OpenJSCAD (@jscad/modeling v2.13.0)
- **3D Rendering**: Three.js
- **Font Parsing**: opentype.js
- **Build Tool**: electron-builder 24.x
- **State Management**: Oggetto globale `S` (vanilla JS)

---

## 📚 Documentazione

| File | Descrizione |
|------|-------------|
| [`README.md`](README.md) | Panoramica del progetto |
| [`QWEN.md`](QWEN.md) | Architettura, OpenJSCAD integration, convenzioni di sviluppo |

---

*Versione corrente: 4.3.5*
