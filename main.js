const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path  = require('path');
const fs    = require('fs');

// Auto-update (only loaded in production)
let autoUpdater = null;
if (app.isPackaged) {
  autoUpdater = require('electron-updater').autoUpdater;
}

// ── Splash screen window ───────────────────────────────────────────────────
let splashWindow = null;

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 500,
    height: 400,
    frame: false,
    transparent: true,
    backgroundColor: '#0d0d0f',
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    center: true,
  });
  
  splashWindow.loadFile(path.join(__dirname, 'src', 'splash.html'));
  return splashWindow;
}

function updateSplashProgress(progress, status) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send('splash-progress', { progress, status });
  }
}

function hideSplashWindow() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send('splash-hide');
    setTimeout(() => {
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close();
        splashWindow = null;
      }
    }, 500);
  }
}

// ── Percorso cartella font (user data directory - persists across updates) ─
function getFontDir() {
  const userData = app.getPath('userData');
  return path.join(userData, 'font');
}

// ── Percorso cartella svg (user data directory - persists across updates) ──
function getSvgDir() {
  const userData = app.getPath('userData');
  return path.join(userData, 'svg');
}

// ── MIGRAZIONE: Copia file dalla vecchia cartella (accanto all'exe) alla userData ──
function migrateUserFiles() {
  const userData = app.getPath('userData');
  const oldBase = app.isPackaged ? path.dirname(process.execPath) : __dirname;
  
  // Crea directory utente se non esistono
  const newFontDir = path.join(userData, 'font');
  const newSvgDir = path.join(userData, 'svg');
  
  try {
    if (!fs.existsSync(newFontDir)) {
      fs.mkdirSync(newFontDir, { recursive: true });
    }
    if (!fs.existsSync(newSvgDir)) {
      fs.mkdirSync(newSvgDir, { recursive: true });
    }
  } catch (e) {
    console.warn('Errore nel creare directory utente:', e.message);
    return;
  }

  // Migra font dalla vecchia cartella
  const oldFontDir = path.join(oldBase, 'font');
  if (fs.existsSync(oldFontDir) && oldFontDir !== newFontDir) {
    try {
      const files = fs.readdirSync(oldFontDir);
      const EXTS = ['.ttf', '.otf', '.woff', '.woff2'];
      let migrated = 0;
      
      files.forEach(file => {
        const ext = path.extname(file).toLowerCase();
        if (!EXTS.includes(ext)) return;
        
        const src = path.join(oldFontDir, file);
        const dest = path.join(newFontDir, file);
        
        // Copia solo se non esiste già nella destinazione
        if (!fs.existsSync(dest)) {
          try {
            fs.copyFileSync(src, dest);
            migrated++;
          } catch (e) {
            console.warn(`Errore nel copiare font ${file}:`, e.message);
          }
        }
      });
      
      if (migrated > 0) {
        console.log(`Migrati ${migrated} font da ${oldFontDir} a ${newFontDir}`);
      }
    } catch (e) {
      console.warn('Errore nel migrare font:', e.message);
    }
  }

  // Migra SVG dalla vecchia cartella
  const oldSvgDir = path.join(oldBase, 'svg');
  if (fs.existsSync(oldSvgDir) && oldSvgDir !== newSvgDir) {
    try {
      const files = fs.readdirSync(oldSvgDir);
      let migrated = 0;
      
      files.forEach(file => {
        const ext = path.extname(file).toLowerCase();
        if (ext !== '.svg') return;
        
        const src = path.join(oldSvgDir, file);
        const dest = path.join(newSvgDir, file);
        
        // Copia solo se non esiste già nella destinazione
        if (!fs.existsSync(dest)) {
          try {
            fs.copyFileSync(src, dest);
            migrated++;
          } catch (e) {
            console.warn(`Errore nel copiare SVG ${file}:`, e.message);
          }
        }
      });
      
      if (migrated > 0) {
        console.log(`Migrati ${migrated} SVG da ${oldSvgDir} a ${newSvgDir}`);
      }
    } catch (e) {
      console.warn('Errore nel migrare SVG:', e.message);
    }
  }
}

// ── Leggi tutti i font dalla cartella e restituiscili come base64 ─────────
function loadFontsFromDir(dir) {
  if (!fs.existsSync(dir)) return [];

  const EXTS = ['.ttf', '.otf', '.woff', '.woff2'];
  const results = [];

  try {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      const ext = path.extname(file).toLowerCase();
      if (!EXTS.includes(ext)) return;

      const filePath = path.join(dir, file);
      try {
        const data   = fs.readFileSync(filePath);
        const base64 = data.toString('base64');
        const name   = path.basename(file, ext);
        results.push({ name, base64, ext: ext.slice(1) });
      } catch (e) {
        console.warn('Impossibile leggere font:', filePath, e.message);
      }
    });
  } catch (e) {
    console.warn('Impossibile leggere cartella font:', dir, e.message);
  }

  return results;
}

// ── AGGIUNTO: Leggi tutti gli SVG dalla cartella come testo puro ──────────
function loadSvgsFromDir(dir) {
  if (!fs.existsSync(dir)) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch(e) {}
    return [];
  }

  const results = [];

  try {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      const ext = path.extname(file).toLowerCase();
      if (ext !== '.svg') return;

      const filePath = path.join(dir, file);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        results.push({ name: file, content: content });
      } catch (e) {
        console.warn('Impossibile leggere SVG:', filePath, e.message);
      }
    });
  } catch (e) {
    console.warn('Impossibile leggere cartella SVG:', dir, e.message);
  }

  return results;
}

// ── Crea la finestra principale ───────────────────────────────────────────
function createWindow() {
  // Crea splash screen prima della finestra principale
  createSplashWindow();

  const win = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'LetterForge Pro',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    backgroundColor: '#0d0d0f',
    show: false, // Nascondi finché non è pronta
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'src', 'index.html'));

  // Rimuovi menu di default
  win.setMenuBarVisibility(false);

  // ── Auto-update configuration (only in production) ──────────────────────
  if (autoUpdater) {
    // Disable automatic download in production
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowDowngrade = false;
    autoUpdater.allowPrerelease = false;

    // Log update events (useful for debugging)
    autoUpdater.logger = null; // Disable built-in logger, use console

    // Set feed URL for GitHub releases (required for electron-updater)
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'S1mone01',
      repo: 'LetterForge'
    });

    autoUpdater.on('checking-for-update', () => {
      console.log('[AUTO-UPDATE] Checking for updates...');
      if (win && !win.isDestroyed()) {
        win.webContents.send('update-status', { status: 'checking' });
      }
    });

    autoUpdater.on('update-available', (info) => {
      console.log('[AUTO-UPDATE] Update available:', info.version);
      console.log('[AUTO-UPDATE] Release notes:', info.releaseNotes);
      if (win && !win.isDestroyed()) {
        win.webContents.send('update-status', {
          status: 'available',
          version: info.version,
          releaseNotes: info.releaseNotes
        });
      }
    });

    autoUpdater.on('update-not-available', (info) => {
      console.log('[AUTO-UPDATE] Update not available, version:', info.version);
      if (win && !win.isDestroyed()) {
        win.webContents.send('update-status', {
          status: 'not-available',
          version: info.version
        });
      }
    });

    autoUpdater.on('download-progress', (progressObj) => {
      console.log(`[AUTO-UPDATE] Download progress: ${progressObj.percent}%`);
      console.log(`[AUTO-UPDATE] Speed: ${progressObj.bytesPerSecond} bytes/sec`);
      if (win && !win.isDestroyed()) {
        win.webContents.send('update-status', {
          status: 'downloading',
          percent: progressObj.percent,
          bytesPerSecond: progressObj.bytesPerSecond,
          transferred: progressObj.transferred,
          total: progressObj.total
        });
      }
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log('[AUTO-UPDATE] Update downloaded:', info.version);
      console.log('[AUTO-UPDATE] Downloaded file:', info.downloadedFile);
      if (win && !win.isDestroyed()) {
        win.webContents.send('update-status', {
          status: 'downloaded',
          version: info.version
        });
      }
    });

    autoUpdater.on('error', (err) => {
      console.error('[AUTO-UPDATE] Error:', err);
      console.error('[AUTO-UPDATE] Error message:', err.message);
      console.error('[AUTO-UPDATE] Error stack:', err.stack);
      if (win && !win.isDestroyed()) {
        win.webContents.send('update-status', {
          status: 'error',
          error: err.message
        });
      }
    });

    // Check for updates after app is loaded (2 seconds delay)
    setTimeout(() => {
      console.log('Auto-checking for updates...');
      autoUpdater.checkForUpdates().catch(err => {
        console.error('Auto-check failed:', err.message);
      });
    }, 2000);
  }

  // ── IPC handlers for auto-update ────────────────────────────────────────
  ipcMain.handle('check-for-updates', async () => {
    if (!autoUpdater) {
      return { available: false, reason: 'dev-mode' };
    }
    try {
      console.log('Manual check for updates triggered...');
      const result = await autoUpdater.checkForUpdates();
      console.log('Check result:', result?.updateInfo?.version);
      return { available: result?.updateInfo != null };
    } catch (error) {
      console.error('Error checking for updates:', error);
      return { available: false, error: error.message };
    }
  });

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

  ipcMain.handle('quit-and-install', async () => {
    if (!autoUpdater) {
      return { success: false, reason: 'dev-mode' };
    }
    autoUpdater.quitAndInstall();
    return { success: true };
  });

  // Quando la pagina è pronta, invia i font E GLI SVG
  win.webContents.once('did-finish-load', () => {
    // Invia la versione dell'app dal package.json
    const pkg = require('./package.json');
    win.webContents.send('app-version', pkg.version);
    
    updateSplashProgress(20, 'Caricamento font...');

    // 1. CARICAMENTO FONT
    const fontDir  = getFontDir();
    const fonts    = loadFontsFromDir(fontDir);
    if (fonts.length > 0) {
      win.webContents.send('fonts-loaded', fonts);
      console.log(`Caricati ${fonts.length} font da: ${fontDir}`);
    } else {
      console.log(`Nessun font trovato in: ${fontDir}`);
    }
    
    updateSplashProgress(50, 'Caricamento SVG...');

    // 2. CARICAMENTO SVG
    const svgDir = getSvgDir();
    const svgs   = loadSvgsFromDir(svgDir);
    if (svgs.length > 0) {
      win.webContents.send('svgs-loaded', svgs);
      console.log(`Caricati ${svgs.length} SVG da: ${svgDir}`);
    } else {
      console.log(`Nessun SVG trovato in: ${svgDir}`);
    }
    
    updateSplashProgress(100, 'Pronto!');
    
    // Mostra la finestra principale e nascondi splash
    setTimeout(() => {
      win.show();
      hideSplashWindow();
    }, 500);
  });
}

app.whenReady().then(() => {
  // Migra file utente prima di creare la finestra (prima esecuzione dopo update)
  migrateUserFiles();
  
  createWindow();

  // ── Gestione salvataggio SVG ────────────────────────────────────────────
  ipcMain.handle('save-svg', async (event, svgString) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Salva Lettera/Logo come SVG',
      defaultPath: 'letterforge.svg',
      filters: [
        { name: 'Immagini SVG', extensions: ['svg'] }
      ]
    });

    if (canceled || !filePath) {
      return false;
    }

    try {
      fs.writeFileSync(filePath, svgString, 'utf-8');
      return true;
    } catch (error) {
      console.error('Errore durante la scrittura del file:', error);
      throw error;
    }
  });
  
  // ── Gestione salvataggio progetto ───────────────────────────────────────
  ipcMain.handle('save-project', async (event, content) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Salva Progetto LetterForge',
      defaultPath: 'progetto-letterforge.json',
      filters: [
        { name: 'Progetto LetterForge', extensions: ['json'] }
      ]
    });

    if (canceled || !filePath) {
      return false;
    }

    try {
      fs.writeFileSync(filePath, content, 'utf-8');
      return true;
    } catch (error) {
      console.error('Errore durante il salvataggio del progetto:', error);
      throw error;
    }
  });
  
  // ── Gestione caricamento progetto ───────────────────────────────────────
  ipcMain.handle('load-project', async (event) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Carica Progetto LetterForge',
      filters: [
        { name: 'Progetto LetterForge', extensions: ['json'] }
      ],
      properties: ['openFile']
    });

    if (canceled || !filePaths || !filePaths.length) {
      return null;
    }

    try {
      const content = fs.readFileSync(filePaths[0], 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.error('Errore durante il caricamento del progetto:', error);
      throw error;
    }
  });

  // ── Apri cartella font utente ───────────────────────────────────────
  ipcMain.handle('open-font-folder', async () => {
    const fontDir = getFontDir();
    const { shell } = require('electron');
    try {
      // Crea la cartella se non esiste
      if (!fs.existsSync(fontDir)) {
        fs.mkdirSync(fontDir, { recursive: true });
      }
      await shell.openPath(fontDir);
      return { success: true };
    } catch (error) {
      console.error('Errore nell\'apertura della cartella font:', error);
      return { success: false, error: error.message };
    }
  });

  // ── Apri cartella SVG utente ───────────────────────────────────────
  ipcMain.handle('open-svg-folder', async () => {
    const svgDir = getSvgDir();
    const { shell } = require('electron');
    try {
      // Crea la cartella se non esiste
      if (!fs.existsSync(svgDir)) {
        fs.mkdirSync(svgDir, { recursive: true });
      }
      await shell.openPath(svgDir);
      return { success: true };
    } catch (error) {
      console.error('Errore nell\'apertura della cartella SVG:', error);
      return { success: false, error: error.message };
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});