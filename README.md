# LetterForge Pro – Desktop

[![Version](https://img.shields.io/github/v/release/S1mone01/LetterForge?label=version&color=00c8ff)](https://github.com/S1mone01/LetterForge/releases/latest)
[![License](https://img.shields.io/badge/license-proprietary-blue)](https://github.com/S1mone01/LetterForge)
[![Platform](https://img.shields.io/badge/platform-windows%20%7C%20macos%20%7C%20linux-lightgrey)](https://github.com/S1mone01/LetterForge/releases)

**LetterForge Pro** è un editor tipografico SVG desktop per creare, manipolare ed esportare lettere e logo personalizzati. Costruito con Electron per un'esperienza cross-platform.

> 🎨 **Editor visivo intuitivo** · 🔤 **Gestione font avanzata** · ⬡ **Libreria SVG** · 💾 **Esportazione veloce e semplice**

---

## ✨ Caratteristiche Principali

### 🎨 Editor Visivo
- **Canvas SVG** con griglia e guide di allineamento
- **Trasformazioni complete**: posizione, rotazione, scala, inclinazione
- **Multi-select**: seleziona e manipola più elementi contemporaneamente
- **Snap-to-guide**: allineamento automatico per precisione pixel-perfect

### 🔤 Gestione Font
- Supporto **.ttf, .otf, .woff, .woff2**
- Caricamento automatico dalla cartella `font/`
- Anteprima in tempo reale
- Libreria font organizzata e ricercabile

### ⬡ Libreria SVG
- Importa elementi SVG come asset
- Trascina e rilascia sulla canvas
- Modifica proprietà e trasformazioni
- Libreria persistente tra le sessioni

### 💾 Salvataggio ed Esportazione
- **Esporta SVG**: salva il tuo design come file SVG standard
- **Salva progetto**: salva lo stato completo (elementi, canvas, libreria)
- **Carica progetto**: riprendi il lavoro da dove hai lasciato

### 🤖 AI Assistant & MCP Server

**AI Assistant Integrato:**
- **Editing intelligente** basato su prompt testuali
- **Analisi del contesto** del canvas completo
- **Operazioni automatiche**: modifica, aggiungi, duplica, sposta, ridimensiona

**MCP Server (Host Locale):**
LetterForge include un server MCP integrato che permette a client AI esterni (Claude, GPT, script personalizzati) di controllare il canvas tramite HTTP.

- **Endpoint**: `http://localhost:3100/mcp`
- **Protocollo**: JSON-RPC 2.0 / MCP
- **Tools disponibili**: `get_canvas_state`, `add_text`, `modify_element`, `move_element`, `delete_element`, `duplicate_element`, `add_svg`, `resize_canvas`, `calculate_position_relative`, e altri
- **Avvio**: Clicca "Avvia Host MCP" nel pannello AI Assistant
- **Health Check**: `GET http://localhost:3100/health`

**Esempio di utilizzo (Python):**
```python
import requests
MCP_URL = "http://localhost:3100/mcp"
response = requests.post(MCP_URL, json={
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {"name": "add_text", "arguments": {"text": "Hello!", "x": 400, "y": 250}},
    "id": 1
})
```

### 🔄 Auto-Update Integrato
- Controllo automatico all'avvio (dopo 2 secondi)
- Notifica visiva per nuovi aggiornamenti
- Download automatico con barra di progresso
- Riavvio e installazione con un clic

---

## 📋 Requisiti di Sistema

| Sistema Operativo | Versione Minima | Architettura |
|-------------------|-----------------|--------------|
| Windows           | 10 o superiore  | x64          |
| macOS             | 10.13 o superiore | x64/arm64  |
| Linux             | Ubuntu 18.04+   | x64          |

### Requisiti Software
- **Node.js** 18+ → [Download](https://nodejs.org)
- **npm** (incluso con Node.js)
- **RAM**: 4GB minimi, 8GB consigliati
- **Spazio disco**: 500MB per l'installazione

---

## 🚀 Installazione

### Download Rapido
Scarica l'ultima versione da:
👉 **[GitHub Releases](https://github.com/S1mone01/LetterForge/releases/latest)**

### Installazione Manuale

1. **Clona o scarica il repository**:
   ```bash
   git clone https://github.com/S1mone01/LetterForge-Desktop.git
   cd LetterForge-Desktop
   ```

2. **Installa le dipendenze**:
   ```bash
   npm install
   ```

3. **Avvia in modalità sviluppo**:
   ```bash
   npm start
   ```

---

## 🛠️ Sviluppo

### Comandi Disponibili

| Comando | Descrizione |
|---------|-------------|
| `npm start` | Avvia in modalità sviluppo (hot reload disabilitato) |
| `npm run build:win` | Crea installer Windows (.exe) |
| `npm run build:mac` | Crea DMG per macOS |
| `npm run build:linux` | Crea AppImage per Linux |
| `npm run release` | Build + publish automatico su GitHub |

### Struttura del Progetto

```
LetterForge-Desktop/
├── main.js              # Electron main process (IPC, auto-update)
├── preload.js           # Preload script (contextBridge)
├── package.json         # Configurazione progetto e build
├── src/
│   ├── index.html       # UI renderer + logica frontend
│   └── splash.html      # Splash screen di caricamento
├── font/                # Font automatici (caricati all'avvio)
├── svg/                 # Asset SVG (caricati all'avvio)
├── assets/              # Icone app (ico, icns, png)
├── dist/                # Output build (generato automaticamente)
└── docs/                # Documentazione aggiuntiva
```

### Tecnologie Utilizzate

- **Runtime**: Electron 29.x
- **Font Parsing**: opentype.js (CDN)
- **Build Tool**: electron-builder 24.x
- **Aggiornamenti**: electron-updater 6.x
- **Styling**: CSS custom con variabili (nessun framework)
- **State Management**: Oggetto globale `S` (vanilla JS)

---

## 📖 Guida all'Uso

### Primi Passi

1. **Avvia l'applicazione**
   - Dopo l'installazione, trova LetterForge Pro nel menu Start (Windows) o Applications (macOS)
   - La splash screen mostrerà il caricamento delle risorse

2. **Carica i tuoi font** (opzionale)
   - I font nella cartella `font/` vengono caricati automaticamente
   - Oppure usa "Carica Font" per importare file .ttf/.otf

3. **Aggiungi testo**
   - Scrivi nel campo "Testo" in alto
   - Imposta dimensione (pt) e colore
   - Clicca "Aggiungi" o premi Invio

4. **Importa SVG** (opzionale)
   - Clicca "Importa SVG" nella sidebar sinistra
   - Seleziona file SVG dalla tua libreria
   - Trascina sulla canvas

5. **Manipola gli elementi**
   - **Selezione**: clicca su un elemento
   - **Multi-select**: Shift+Click per selezionare più elementi
   - **Sposta**: trascina con il mouse
   - **Ridimensiona**: usa le maniglie agli angoli
   - **Ruota**: usa lo slider rotazione nel pannello destro
   - **Allinea**: le guide rosa appaiono per aiutarti

6. **Esporta il lavoro**
   - Clicca "⬇ SVG" per esportare il design
   - Oppure "Salva" per salvare l'intero progetto

### Scelte Rapide da Tastiera

| Scorciatoia | Azione |
|-------------|--------|
| `Ctrl+Z` | Annulla |
| `Ctrl+Y` | Ripristina |
| `Spazio+Drag` | Pan canvas |
| `Shift+Click` | Multi-select |
| `Y` | Attiva/disattiva snap |
| `Invio` (nell'input testo) | Aggiungi testo |
| `Ctrl+A` | Seleziona tutto |
| `Ctrl+D` | Duplica selezione |
| `Canc/Backspace` | Elimina selezionati |
| `Ctrl++/-` | Zoom in/out |
| `Ctrl+0` | Reset zoom |
| `Frecce direzionali` | Muovi selezione (1px, 10px con Shift) |

---

## 🔄 Sistema di Auto-Update

LetterForge Pro include un sistema di aggiornamento automatico integrato che controlla i GitHub Releases all'avvio.

### Come Funziona

```
App si avvia → (2s delay) → Check GitHub → Update disponibile? → Notifica → Download → Installa
```

### Per gli Sviluppatori: Pubblicare un Aggiornamento

**Prerequisiti:**
- Node.js 18+
- GitHub Personal Access Token con scope `repo`

**Procedura (3 step):**

1. **Aggiorna la versione** in:
   - `package.json`: `"version": "X.Y.Z"`
   - `src/index.html`: `<span id="app-version">vX.Y.Z</span>` e `<div class="un-ver" id="un-version">Versione X.Y.Z</div>`

2. **Imposta il token GitHub**:
   ```powershell
   # PowerShell
   $env:GITHUB_TOKEN="ghp_XXXXXXXXXXXXXXXXXXXX"
   
   # CMD
   set GITHUB_TOKEN=ghp_XXXXXXXXXXXXXXXXXXXX
   ```

3. **Build e pubblica**:
   ```bash
   npm run release
   ```

**Cosa viene pubblicato:**
| File | Scopo |
|------|-------|
| `LetterForge Pro Setup X.Y.Z.exe` | Installer NSIS |
| `latest.yml` | Metadata per auto-update |
| `blockmap` | Update differenziale (più veloce) |

### Comandi Utili

| Comando | Descrizione |
|---------|-------------|
| `npm start` | Sviluppo (dev mode, no auto-update) |
| `npm run build:win` | Build installer (senza publish) |
| `npm run release` | Build + publish automatico |

### Troubleshooting

| Problema | Soluzione |
|----------|-----------|
| Build fallisce | Esegui come Administrator |
| Errore 404 | Verifica GITHUB_TOKEN e nome repo |
| Update non rilevato | Controlla che `latest.yml` sia su GitHub |
| Download fallisce | Verifica che il release sia pubblico |

**⚠️ Sicurezza:** Mai committare `GITHUB_TOKEN` nel version control!

---

## 🗂️ Gestione Risorse

### Font

I font vengono caricati automaticamente da:
- **Sviluppo**: cartella `font/` nel progetto
- **Produzione**: cartella `font/` accanto all'eseguibile

**Formati supportati**: `.ttf`, `.otf`, `.woff`, `.woff2`

### SVG

Gli asset SVG vengono caricati automaticamente da:
- **Sviluppo**: cartella `svg/` nel progetto
- **Produzione**: cartella `svg/` accanto all'eseguibile

**Struttura consigliata**:
```
font/
├── Roboto-Regular.ttf
├── Montserrat-Bold.otf
└── OpenSans.woff2

svg/
├── logo-company.svg
├── icon-set.svg
└── decorative-elements.svg
```

---

## 🎨 Personalizzazione

### Icone dell'App

Aggiungi nella cartella `assets/`:
- `icon.ico` per Windows (256×256 consigliato)
- `icon.icns` per macOS
- `icon.png` per Linux (512×512)

Se le icone non sono presenti, rimuovi le righe `"icon"` da `package.json`.

### Temi e Colori

L'app usa un tema scuro con colori personalizzabili via CSS variables:

```css
:root {
  --bg: #0d0d0f;      /* Sfondo principale */
  --panel: #13131a;   /* Pannelli */
  --accent: #c8ff00;  /* Colore accento (lime) */
  --accent2: #ff6b35; /* Secondo accento (arancio) */
  --text: #e8e8f0;    /* Testo */
}
```

---

## 📦 Build per la Distribuzione

### Windows (Consigliato: NSIS Installer)

```bash
npm run build:win
```

**Output**: `dist/LetterForge Pro Setup X.Y.Z.exe`

Il build crea:
- ✅ Installer NSIS (.exe)
- ✅ File `latest.yml` (auto-update)
- ✅ File `blockmap` (update differenziale)

### macOS

```bash
npm run build:mac
```

**Output**: `dist/LetterForge Pro-X.Y.Z.dmg`

### Linux

```bash
npm run build:linux
```

**Output**: `dist/LetterForge Pro-X.Y.Z.AppImage`

---

## 🐛 Troubleshooting

### Problemi Comuni

#### L'app non si avvia
```bash
# Reinstalla dipendenze
rm -rf node_modules
npm install
npm start
```

#### I font non vengono caricati
- Verifica che i file siano nella cartella `font/`
- Controlla che le estensioni siano `.ttf`, `.otf`, `.woff`, `.woff2`
- Riavvia l'app

#### Font non visualizzati correttamente nell'anteprima 3D
L'anteprima 3D richiede che i font siano parsati correttamente da opentype.js. Se un font non viene visualizzato:

1. **Diagnostica font** - Apri DevTools (Ctrl+Shift+I) e nella console digita:
   ```javascript
   // Diagnostica un font specifico
   diagnoseFont('NomeFont')
   
   // Oppure diagnostica tutti i font
   diagnoseAllFonts()
   ```
   
2. **Cause comuni**:
   - Font corrotto o non valido
   - Font senza dati glyph (nessun contorno vettoriale)
   - Font in formato non supportato da opentype.js
   
3. **Soluzione**:
   - Prova a convertire il font in un altro formato (es. da .ttf a .otf)
   - Usa un font alternativo
   - Verifica che il font abbia contorni vettoriali (non tutti i font li hanno)

#### L'auto-update non funziona
- Assicurati di essere in **produzione** (non `npm start`)
- Controlla i log in DevTools (Ctrl+Shift+I)
- Verifica che `latest.yml` sia presente su GitHub Releases

#### Errori di build
```bash
# Pulisci la cartella dist
rm -rf dist
npm run build:win

# Esegui come amministratore se necessario
```

### Log e Debug

Per visualizzare i log dell'auto-update:
1. Apri l'app installata (non in dev mode)
2. Premi `Ctrl+Shift+I` per aprire DevTools
3. Vai sulla Console
4. Cerca i log con prefisso `[AUTO-UPDATE]` e `[RENDERER]`

---

## 📚 Documentazione

| File | Descrizione |
|------|-------------|
| [`README.md`](README.md) | Questo file - panoramica completa |
| [`QWEN.md`](QWEN.md) | Convenzioni di sviluppo e architettura |

**Nota:** La documentazione dettagliata su MCP e Auto-Update è ora inclusa in questo file.

---

## 🤝 Contributi

Questo è un progetto privato. Per segnalare bug o richiedere funzionalità, usa la sezione [Issues](https://github.com/S1mone01/LetterForge/issues) di GitHub.

---

## 📄 Licenza

Copyright © 2024 LetterForge. Tutti i diritti riservati.

Questo software è proprietario e non può essere distribuito, modificato o utilizzato per scopi commerciali senza autorizzazione esplicita.

---

## 📞 Supporto

- **GitHub Issues**: [https://github.com/S1mone01/LetterForge/issues](https://github.com/S1mone01/LetterForge/issues)
- **Releases**: [https://github.com/S1mone01/LetterForge/releases](https://github.com/S1mone01/LetterForge/releases)
- **Repository**: [https://github.com/S1mone01/LetterForge](https://github.com/S1mone01/LetterForge)

---

## 🙏 Ringraziamenti

- **Electron Team** - Per il framework Electron
- **opentype.js** - Per il parsing dei font
- **Google Fonts** - Per i font 'DM Mono' e 'Syne'
- **electron-builder** - Per il sistema di build e update

---

**Sviluppato con ❤️ da S1mone01**

*Ultimo aggiornamento: 3 Aprile 2025*  
*Versione corrente: 4.0.6*
