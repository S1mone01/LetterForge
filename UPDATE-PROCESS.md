# LetterForge Pro - Procedura Aggiornamento Automatico

## 📋 Checklist Rapida (Copia-Incolla)

### 1. Aggiorna Versione

**File da modificare:**
- `package.json` → `"version": "4.0.X"`
- `src/index.html` → `<span id="app-version">v4.0.X</span>`
- `src/index.html` → `<div class="un-ver" id="un-version">Versione 4.0.X</div>`

### 2. Pubblica Release

```batch
set GITHUB_TOKEN=ghp_XXXXXXXXXXXXXXXXXXXX
npm run release
```

**Fatto!** ✅ Il build crea e pubblica automaticamente su GitHub.

---

## 📦 Processo Completo (Step-by-Step)

### Step 1: Prepara i File

#### A. Aggiorna `package.json`
```json
{
  "name": "letterforge-pro",
  "version": "4.0.7",
  ...
}
```

#### B. Aggiorna `src/index.html` (2 punti)

**Riga ~350** - Versione nella sidebar:
```html
<span id="app-version">v4.0.7</span>
```

**Riga ~541** - Versione nella notifica update:
```html
<div class="un-ver" id="un-version">Versione 4.0.7</div>
```

### Step 2: Build & Publish

#### Windows (PowerShell)
```powershell
$env:GITHUB_TOKEN="ghp_XXXXXXXXXXXXXXXXXXXX"
npm run release
```

#### Windows (CMD)
```batch
set GITHUB_TOKEN=ghp_XXXXXXXXXXXXXXXXXXXX
npm run release
```

#### Script alternativo (se npm fallisce)
```batch
set GITHUB_TOKEN=ghp_XXXXXXXXXXXXXXXXXXXX
npx electron-builder --win --publish always
```

### Step 3: Verifica il Release

1. Vai su: https://github.com/S1mone01/LetterForge/releases
2. Controlla che il tag `v4.0.7` sia stato creato
3. Verifica che ci siano 3 file:
   - ✅ `LetterForge Pro Setup 4.0.7.exe`
   - ✅ `latest.yml`
   - ✅ `blockmap`

### Step 4: Testa l'Aggiornamento

1. **Installa la versione precedente** (es. 4.0.6)
2. **Apri l'app** e aspetta 2 secondi
3. **Dovrebbe apparire la notifica** in alto a sinistra
4. **Clicca "Scarica e installa"**
5. **Aspetta il download** (vedi % nella notifica)
6. **Clicca "↻ Riavvia e installa"**
7. **L'app si riavvia** con la nuova versione ✓

---

## 🔧 Configurazione Auto-Update

### File Principali

| File | Scopo |
|------|-------|
| `package.json` | Versione + config electron-builder |
| `main.js` | IPC handlers + auto-update logic |
| `preload.js` | Espone API al renderer |
| `src/index.html` | UI + gestione notifica |

### Come Funziona il Flusso

```
┌─────────────────────────┐
│  App si avvia           │
└───────────┬─────────────┘
            │
    (2 secondi delay)
            │
            ▼
┌─────────────────────────┐
│  checkForUpdates()      │
│  (main.js riga ~233)    │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  GitHub Releases API    │
│  Controlla latest.yml   │
└───────────┬─────────────┘
            │
     ┌──────┴──────┐
     │             │
     ▼             ▼
┌─────────┐   ┌──────────┐
│ Update  │   │ Nessun   │
│ Available│   │ Update   │
└────┬────┘   └──────────┘
     │
     ▼
┌─────────────────────────┐
│ Invia 'update-status'   │
│ al renderer             │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ handleUpdateStatus()    │
│ (index.html riga ~2918) │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Mostra notifica         │
│ "Scarica e installa"    │
└─────────────────────────┘
```

### Codice Chiave

#### main.js - Auto-Check all'Avvio
```javascript
// Righe 231-238
setTimeout(() => {
  console.log('Auto-checking for updates...');
  autoUpdater.checkForUpdates().catch(err => {
    console.error('Auto-check failed:', err.message);
  });
}, 2000);
```

#### main.js - Download Handler
```javascript
// Righe 257-269
ipcMain.handle('download-update', async () => {
  if (!autoUpdater) {
    return { success: false, reason: 'dev-mode' };
  }
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (error) {
    console.error('Error downloading update:', error);
    return { success: false, error: error.message };
  }
});
```

#### main.js - Quit & Install
```javascript
// Righe 271-278
ipcMain.handle('quit-and-install', async () => {
  if (!autoUpdater) {
    return { success: false, reason: 'dev-mode' };
  }
  autoUpdater.quitAndInstall();
  return { success: true };
});
```

#### preload.js - IPC Bridge
```javascript
// Righe 21-24
onUpdateStatus: (callback) => ipcRenderer.on('update-status', (_event, value) => callback(value)),
checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
downloadUpdate: () => ipcRenderer.invoke('download-update'),
quitAndInstall: () => ipcRenderer.invoke('quit-and-install')
```

#### src/index.html - Renderer Listener
```javascript
// Righe 2973-2975
if (window.electronAPI && window.electronAPI.onUpdateStatus) {
  window.electronAPI.onUpdateStatus(handleUpdateStatus);
}
```

---

## 🐛 Debug & Troubleshooting

### Abilita Logging

Il logging è già incluso nelle versioni 4.0.6+:

**Console principale (main process):**
```
[AUTO-UPDATE] Checking for updates...
[AUTO-UPDATE] Update available: 4.0.6
[AUTO-UPDATE] Download progress: 45%
```

**DevTools Console (renderer):**
```
[RENDERER] Update status received: {status: 'available', version: '4.0.6'}
```

### Problemi Comuni

#### ❌ "Cannot find channel latest.yml"
**Causa:** Il file `latest.yml` non è stato caricato su GitHub  
**Soluzione:** Controlla che il release abbia tutti e 3 i file

#### ❌ "404 Not Found"
**Causa:** Token GitHub non valido o repo sbagliato  
**Soluzione:** 
1. Verifica il token: https://github.com/settings/tokens
2. Controlla `package.json`: `"owner": "S1mone01", "repo": "LetterForge"`

#### ❌ Update non viene rilevato
**Causa:** Versione nel release ≤ versione installata  
**Soluzione:** Assicurati che la versione su GitHub sia più alta

#### ❌ Download fallisce
**Causa:** File non accessibili o token scaduto  
**Soluzione:** Verifica che il release sia pubblico

### Comandi di Test

```batch
# Build locale (senza publish)
npm run build:win -- --publish=never

# Controlla file generati
dir dist

# Dovresti vedere:
# - LetterForge Pro Setup 4.0.7.exe
# - latest.yml
# - blockmap
```

---

## 📝 Comandi Utili

| Comando | Descrizione |
|---------|-------------|
| `npm start` | Sviluppo (dev mode, no auto-update) |
| `npm run build:win` | Build installer (senza publish) |
| `npm run release` | Build + publish automatico |
| `npx electron-builder --win --publish always` | Alternativa a npm run release |

---

## 🔐 Sicurezza Token

### ⚠️ MAI fare:
```batch
❌ git add .
❌ git commit -m "update token"
❌ git push
```

### ✅ SEMPRE fare:
```batch
# Usa variabili d'ambiente temporanee
set GITHUB_TOKEN=xxx
npm run release
set GITHUB_TOKEN=

# Oppure in PowerShell:
$env:GITHUB_TOKEN="xxx"
npm run release
Remove-Item Env:\GITHUB_TOKEN
```

### Revoca Token Compromessi
1. Vai su: https://github.com/settings/tokens
2. Trova il token esposto
3. Clicca "Delete"
4. Creane uno nuovo

---

## 📊 Struttura Release GitHub

### Tag
```
v4.0.7
```

### Titolo
```
LetterForge Pro 4.0.7
```

### Descrizione Template
```markdown
## LetterForge Pro v4.0.7

### Changelog
- Fix: [descrizione fix]
- New: [nuova feature]
- Update: [miglioramento]

### Installazione
1. Scarica `LetterForge Pro Setup 4.0.7.exe`
2. Esegui l'installer
3. L'aggiornamento automatico è attivo per le versioni future
```

### Asset (3 file obbligatori)
1. `LetterForge Pro Setup 4.0.7.exe` - Installer NSIS
2. `latest.yml` - Metadata per electron-updater
3. `blockmap` - Differential update data

---

## 🚀 Quick Reference (Copia-Incolla)

```batch
REM === AGGIORNA VERSIONE ===
REM 1. Modifica package.json: "version": "4.0.7"
REM 2. Modifica src/index.html (2 punti)

REM === BUILD & PUBLISH ===
set GITHUB_TOKEN=ghp_XXXXXXXXXXXXXXXXXXXX
npm run release

REM === VERIFICA ===
REM Visita: https://github.com/S1mone01/LetterForge/releases

REM === DEBUG (se necessario) ===
REM Apri app → Ctrl+Shift+I → Console
REM Cerca: [RENDERER] e [AUTO-UPDATE]
```

---

## 📞 Supporto

Se qualcosa non funziona:

1. **Controlla i log** in DevTools Console
2. **Verifica i file** su GitHub Releases
3. **Testa in produzione** (non in dev mode)
4. **Cerca errori** con `[AUTO-UPDATE]` o `[RENDERER]`

---

**Ultimo aggiornamento:** 2025-04-03  
**Versione corrente:** 4.0.7  
**Repo:** https://github.com/S1mone01/LetterForge
