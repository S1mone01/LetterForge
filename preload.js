const { contextBridge, ipcRenderer } = require('electron');

// Try to load OpenJSCAD modeling from node_modules
// Note: Primary loading is via CDN in index.html, this is a fallback
let jscadModeling = null;
try {
  jscadModeling = require('@jscad/modeling');
  console.log('✓ OpenJSCAD modeling loaded in preload');
} catch (err) {
  // Silent fail - CDN in index.html is the primary source
  // console.log('OpenJSCAD will be loaded via CDN');
}

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

    // Salva 3MF e apri in Bambu Studio
    saveAndOpen3MFInBambu: (content) => ipcRenderer.invoke('save-and-open-3mf-bambu', content),

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

    // OpenJSCAD loader
    loadOpenJSCAD: async () => {
      if (jscadModeling) {
        return jscadModeling;
      }
      throw new Error('OpenJSCAD modeling not available');
    }
});
