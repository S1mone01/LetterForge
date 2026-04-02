const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path  = require('path');
const fs    = require('fs');

// Auto-update imports (only in production)
const { autoUpdater } = require('electron-updater');

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

// ── Percorso cartella font (stessa dir dell'exe / del progetto) ──────────
function getFontDir() {
  const base = app.isPackaged
    ? path.dirname(process.execPath)
    : __dirname;
  return path.join(base, 'font');
}

// ── AGGIUNTO: Percorso cartella svg ───────────────────────────────────────
function getSvgDir() {
  const base = app.isPackaged
    ? path.dirname(process.execPath)
    : __dirname;
  return path.join(base, 'svg');
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
    try { fs.mkdirSync(dir); } catch(e) {}
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

  // ── Auto-update configuration ───────────────────────────────────────────
  // Disable automatic download in production
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;
  autoUpdater.allowPrerelease = false;

  // Log update events (useful for debugging)
  autoUpdater.logger = null; // Disable built-in logger, use console

  autoUpdater.on('checking-for-update', () => {
    console.log('Checking for updates...');
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-status', { status: 'checking' });
    }
  });

  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version);
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-status', { 
        status: 'available', 
        version: info.version,
        releaseNotes: info.releaseNotes 
      });
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('Update not available:', info.version);
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-status', { 
        status: 'not-available', 
        version: info.version 
      });
    }
  });

  autoUpdater.on('download-progress', (progressObj) => {
    console.log(`Download progress: ${progressObj.percent}%`);
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
    console.log('Update downloaded:', info.version);
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-status', { 
        status: 'downloaded', 
        version: info.version 
      });
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('Update error:', err);
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-status', { 
        status: 'error', 
        error: err.message 
      });
    }
  });

  // Check for updates after a delay (allow window to load)
  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdates();
    }, 5000);
  }

  // ── IPC handlers for auto-update ────────────────────────────────────────
  ipcMain.handle('check-for-updates', async () => {
    if (!app.isPackaged) {
      return { available: false, reason: 'dev-mode' };
    }
    try {
      const result = await autoUpdater.checkForUpdates();
      return { available: result?.updateInfo != null };
    } catch (error) {
      console.error('Error checking for updates:', error);
      return { available: false, error: error.message };
    }
  });

  ipcMain.handle('download-update', async () => {
    if (!app.isPackaged) {
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
    if (!app.isPackaged) {
      return { success: false, reason: 'dev-mode' };
    }
    autoUpdater.quitAndInstall();
    return { success: true };
  });

  // Quando la pagina è pronta, invia i font E GLI SVG
  win.webContents.once('did-finish-load', () => {
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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});