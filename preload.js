const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Font e SVG loaders
    onFontsLoaded: (callback) => ipcRenderer.on('fonts-loaded', (_event, value) => callback(value)),
    onSVGsLoaded: (callback) => ipcRenderer.on('svgs-loaded', (_event, value) => callback(value)),

    // Salva SVG
    saveSVG: (svgString) => ipcRenderer.invoke('save-svg', svgString),

    // Splash screen
    onSplashProgress: (callback) => ipcRenderer.on('splash-progress', (_event, value) => callback(value)),
    onSplashHide: (callback) => ipcRenderer.on('splash-hide', (_event) => callback()),

    // Salva e carica progetto
    saveProjectFile: (content) => ipcRenderer.invoke('save-project', content),
    loadProjectFile: () => ipcRenderer.invoke('load-project'),

    // Apri cartelle utente
    openFontFolder: () => ipcRenderer.invoke('open-font-folder'),
    openSVGFolder: () => ipcRenderer.invoke('open-svg-folder'),

    // Auto-update
    onUpdateStatus: (callback) => ipcRenderer.on('update-status', (_event, value) => callback(value)),
    onAppVersion: (callback) => ipcRenderer.on('app-version', (_event, value) => callback(value)),
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    downloadUpdate: () => ipcRenderer.invoke('download-update'),
    quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),

    // MCP Server
    mcpStartServer: (port) => ipcRenderer.invoke('mcp-start-server', port),
    mcpStopServer: () => ipcRenderer.invoke('mcp-stop-server'),
    mcpUpdateCanvasState: (canvasState) => ipcRenderer.invoke('mcp-update-canvas-state', canvasState),
    onMCPExecuteOperation: (callback) => ipcRenderer.on('mcp-execute-operation', (_event, operation) => callback(operation)),
    mcpOperationResult: (result) => ipcRenderer.send('mcp-operation-result', result),
});
