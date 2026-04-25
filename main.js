const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path  = require('path');
const fs    = require('fs');
const pkg   = require('./package.json');

// ── Fix cache permission errors on Windows ──
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

// MCP Server
const mcpServer = require('./mcp-server');

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

// ── Percorso cartella salvataggi ──
function getSalvataggioDir() {
  const userData = app.getPath('userData');
  return path.join(userData, 'saved');
}

// ── MIGRAZIONE: Copia file dalla vecchia cartella (accanto all'exe) alla userData ──
function migrateUserFiles() {
  const userData = app.getPath('userData');
  const oldBase = app.isPackaged ? path.dirname(process.execPath) : __dirname;
  
  // Crea directory utente se non esistono
  const newFontDir = path.join(userData, 'font');
  const newSvgDir = path.join(userData, 'svg');
  const newSaveDir = path.join(userData, 'saved');
  
  try {
    if (!fs.existsSync(newFontDir)) fs.mkdirSync(newFontDir, { recursive: true });
    if (!fs.existsSync(newSvgDir)) fs.mkdirSync(newSvgDir, { recursive: true });
    if (!fs.existsSync(newSaveDir)) fs.mkdirSync(newSaveDir, { recursive: true });
  } catch (e) {
    console.warn('Errore nel creare directory utente:', e.message);
    return;
  }

  // Migra font dalla vecchia cartella
  const oldFontDir = path.join(oldBase, 'font');
  migrateFiles(oldFontDir, newFontDir, ['.ttf', '.otf', '.woff', '.woff2']);

  // Migra SVG dalla vecchia cartella
  const oldSvgDir = path.join(oldBase, 'svg');
  migrateFiles(oldSvgDir, newSvgDir, ['.svg']);

  // Migra Salvataggi dalla vecchia cartella (salvataggio o saved)
  const oldSalvataggioDir = path.join(oldBase, 'salvataggio');
  const oldSavedDir = path.join(oldBase, 'saved');
  migrateFiles(oldSalvataggioDir, newSaveDir, ['.json']);
  migrateFiles(oldSavedDir, newSaveDir, ['.json']);

  // Migra anche dal vecchio percorso in userData se esisteva come "salvataggio"
  const oldUserDataSaveDir = path.join(userData, 'salvataggio');
  if (fs.existsSync(oldUserDataSaveDir) && oldUserDataSaveDir !== newSaveDir) {
    migrateFiles(oldUserDataSaveDir, newSaveDir, ['.json']);
  }
}

function migrateFiles(srcDir, destDir, extensions) {
  if (fs.existsSync(srcDir) && srcDir !== destDir) {
    try {
      const files = fs.readdirSync(srcDir);
      files.forEach(file => {
        const ext = path.extname(file).toLowerCase();
        if (extensions && !extensions.includes(ext)) return;
        
        const src = path.join(srcDir, file);
        const dest = path.join(destDir, file);
        if (!fs.existsSync(dest)) {
          try {
            fs.copyFileSync(src, dest);
          } catch (e) {
            console.warn(`Errore nel copiare ${file}:`, e.message);
          }
        }
      });
    } catch (e) {
      console.warn(`Errore nella migrazione da ${srcDir}:`, e.message);
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

// ── Leggi tutti gli SVG dalla cartella come testo puro ──────────
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

    // Set feed URL for GitHub releases
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'S1mone01',
      repo: 'LetterForge'
    });

    autoUpdater.on('checking-for-update', () => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('update-status', { status: 'checking' });
      }
    });

    autoUpdater.on('update-available', (info) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('update-status', {
          status: 'available',
          version: info.version,
          releaseNotes: info.releaseNotes
        });
      }
    });

    autoUpdater.on('update-not-available', (info) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('update-status', {
          status: 'not-available',
          version: info.version
        });
      }
    });

    autoUpdater.on('download-progress', (progressObj) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('update-status', {
          status: 'downloading',
          percent: progressObj.percent
        });
      }
    });

    autoUpdater.on('update-downloaded', (info) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('update-status', {
          status: 'downloaded',
          version: info.version
        });
      }
    });

    autoUpdater.on('error', (err) => {
      console.error('[AUTO-UPDATE] Error:', err.message);
      if (win && !win.isDestroyed()) {
        win.webContents.send('update-status', {
          status: 'error',
          error: err.message
        });
      }
    });

    // Initial check
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(err => console.log('Auto-check skipped:', err.message));
    }, 2000);
  }

  // ── IPC handlers for auto-update ────────────────────────────────────────
  ipcMain.handle('check-for-updates', async () => {
    if (!autoUpdater) {
      if (win && !win.isDestroyed()) {
        win.webContents.send('update-status', { status: 'not-available', version: pkg.version });
      }
      return { available: false, reason: 'dev-mode' };
    }
    try {
      const result = await autoUpdater.checkForUpdates();
      return { available: result?.updateInfo != null };
    } catch (error) {
      return { available: false, error: error.message };
    }
  });

  ipcMain.handle('download-update', async () => {
    if (!autoUpdater) return { success: false, reason: 'dev-mode' };
    try {
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('quit-and-install', async () => {
    if (!autoUpdater) return { success: false, reason: 'dev-mode' };
    autoUpdater.quitAndInstall();
    return { success: true };
  });

  // Quando la pagina è pronta
  win.webContents.once('did-finish-load', () => {
    win.webContents.send('app-version', pkg.version);

    updateSplashProgress(20, 'Caricamento font...');
    const fontDir = getFontDir();
    const fonts = loadFontsFromDir(fontDir);
    if (fonts.length > 0) win.webContents.send('fonts-loaded', fonts);

    updateSplashProgress(50, 'Caricamento SVG...');
    const svgDir = getSvgDir();
    const svgs = loadSvgsFromDir(svgDir);
    if (svgs.length > 0) win.webContents.send('svgs-loaded', svgs);
    
    updateSplashProgress(100, 'Pronto!');
    setTimeout(() => {
      win.show();
      hideSplashWindow();
    }, 500);
  });
}

app.whenReady().then(() => {
  migrateUserFiles();
  createWindow();

  ipcMain.handle('save-svg', async (event, svgString) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Salva SVG',
      defaultPath: 'letterforge.svg',
      filters: [{ name: 'SVG', extensions: ['svg'] }]
    });
    if (canceled || !filePath) return false;
    fs.writeFileSync(filePath, svgString, 'utf-8');
    return true;
  });
  
  ipcMain.handle('save-project', async (event, content) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Salva Progetto',
      defaultPath: 'progetto.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (canceled || !filePath) return false;
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  });

  ipcMain.handle('save-project-internal', async (event, name, content) => {
    try {
      const saveDir = getSalvataggioDir();
      if (!fs.existsSync(saveDir)) {
        fs.mkdirSync(saveDir, { recursive: true });
      }
      const filePath = path.join(saveDir, name);
      
      if (name.endsWith('.png') && content.startsWith('data:image/png;base64,')) {
        const base64Data = content.replace(/^data:image\/png;base64,/, "");
        fs.writeFileSync(filePath, base64Data, 'base64');
      } else {
        fs.writeFileSync(filePath, content, 'utf-8');
      }
      return true;
    } catch (error) {
      console.error('Error saving internal project:', error);
      return false;
    }
  });

  ipcMain.handle('save-and-open-3mf-bambu', async (event, content) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Salva 3MF',
      defaultPath: 'modello.3mf',
      filters: [{ name: '3MF', extensions: ['3mf'] }]
    });
    if (canceled || !filePath) return { success: false };
    try {
      fs.writeFileSync(filePath, content, 'binary');
      const bambuPaths = [
        'C:\\Program Files\\Bambu Studio\\bin\\bambu-studio.exe',
        'C:\\Program Files (x86)\\Bambu Studio\\bin\\bambu-studio.exe'
      ];
      let bambuPath = bambuPaths.find(p => fs.existsSync(p));
      if (bambuPath) {
        const { spawn } = require('child_process');
        spawn(bambuPath, [filePath], { detached: true }).unref();
        return { success: true, method: 'bambu' };
      }
      shell.openPath(filePath);
      return { success: true, method: 'default' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  
  ipcMain.handle('load-project', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    });
    if (canceled || !filePaths.length) return null;
    return JSON.parse(fs.readFileSync(filePaths[0], 'utf-8'));
  });

  ipcMain.handle('list-saved-projects', async () => {
    const saveDir = getSalvataggioDir();
    if (!fs.existsSync(saveDir)) return [];
    try {
      return fs.readdirSync(saveDir)
        .filter(f => f.endsWith('.json'))
        .map(f => {
          const name = f;
          const fullPath = path.join(saveDir, f);
          const previewPath = fullPath.replace('.json', '.png');
          const hasPreview = fs.existsSync(previewPath);
          return {
            name: f,
            path: fullPath,
            preview: hasPreview ? previewPath : null,
            mtime: fs.statSync(fullPath).mtime
          };
        })
        .sort((a, b) => b.mtime - a.mtime);
    } catch (e) { return []; }
  });

  ipcMain.handle('load-saved-project-by-path', async (event, filePath) => {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  });

  ipcMain.handle('import-stl', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Importa STL',
      filters: [{ name: 'STL', extensions: ['stl'] }],
      properties: ['openFile']
    });
    if (canceled || !filePaths.length) return null;
    try {
      const content = fs.readFileSync(filePaths[0]);
      return {
        name: path.basename(filePaths[0]),
        data: content.toString('base64')
      };
    } catch (e) {
      console.error('Errore lettura STL:', e);
      return null;
    }
  });

  ipcMain.handle('open-font-folder', async () => {
    const dir = getFontDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    shell.openPath(dir);
    return { success: true };
  });

  ipcMain.handle('open-svg-folder', async () => {
    const dir = getSvgDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    shell.openPath(dir);
    return { success: true };
  });

  ipcMain.handle('mcp-start-server', async (event, port) => {
    const result = await mcpServer.start(port);
    mcpServer.on('execute-operation', (operation, resolve) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win) {
        win.webContents.send('mcp-execute-operation', operation);
        ipcMain.once('mcp-operation-result', (e, res) => resolve(res));
      } else resolve({ success: false });
    });
    return result;
  });

  ipcMain.handle('mcp-stop-server', () => mcpServer.stop());
  ipcMain.handle('mcp-update-canvas-state', (e, state) => mcpServer.updateCanvasState(state));

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });