const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // La funzione che avevi già per i font
    onFontsLoaded: (callback) => ipcRenderer.on('fonts-loaded', (_event, value) => callback(value)),

    // AGGIUNTO: Il nuovo canale per gli SVG automatici
    onSVGsLoaded: (callback) => ipcRenderer.on('svgs-loaded', (_event, value) => callback(value)),

    // La funzione per salvare l'SVG
    saveSVG: (svgString) => ipcRenderer.invoke('save-svg', svgString),

    // Canale per aggiornamenti splash screen (usato solo dalla splash)
    onSplashProgress: (callback) => ipcRenderer.on('splash-progress', (_event, value) => callback(value)),
    onSplashHide: (callback) => ipcRenderer.on('splash-hide', (_event) => callback()),

    // Salva e carica progetto
    saveProjectFile: (content) => ipcRenderer.invoke('save-project', content),
    loadProjectFile: () => ipcRenderer.invoke('load-project'),

    // Apri cartelle utente
    openFontFolder: () => ipcRenderer.invoke('open-font-folder'),
    openSVGFolder: () => ipcRenderer.invoke('open-svg-folder'),

    // ── Auto-update IPC handlers ──────────────────────────────────────────
    onUpdateStatus: (callback) => ipcRenderer.on('update-status', (_event, value) => callback(value)),
    onAppVersion: (callback) => ipcRenderer.on('app-version', (_event, value) => callback(value)),
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    downloadUpdate: () => ipcRenderer.invoke('download-update'),
    quitAndInstall: () => ipcRenderer.invoke('quit-and-install')
});