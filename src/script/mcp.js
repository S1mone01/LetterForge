
// ═══════════════════════════════════════════════════════════════════
// AI INTEGRATION FUNCTIONS - MCP Server Host
// ═══════════════════════════════════════════════════════════════════

let aiPanelOpen = false;
let mcpServerRunning = false;
let aiProcessing = false;

// Toggle AI panel open/closed
function toggleAIPanel() {
  aiPanelOpen = !aiPanelOpen;
  const panel = document.getElementById('ai-panel');
  const chevron = document.getElementById('ai-chevron');

  if (aiPanelOpen) {
    panel.style.display = 'block';
    chevron.style.transform = 'rotate(180deg)';

    // Auto-start check when panel is opened
    checkAutoStart();
  } else {
    panel.style.display = 'none';
    chevron.style.transform = 'rotate(0deg)';
  }
}

// Check for saved MCP port and auto-start
async function checkAutoStart() {
  if (mcpServerRunning) return;

  const savedPort = localStorage.getItem('mcp-server-port');
  if (savedPort) {
    document.getElementById('mcp-server-port').value = savedPort;
  }
}

// Toggle MCP Server
async function toggleMCPServer() {
  if (mcpServerRunning) {
    await stopMCPServer();
  } else {
    await startMCPServer();
  }
}

// Start MCP Server
async function startMCPServer() {
  const port = parseInt(document.getElementById('mcp-server-port').value.trim());
  
  if (!port || isNaN(port) || port < 1024 || port > 65535) {
    toast('Inserisci una porta valida (1024-65535)');
    return;
  }

  // Save port for future auto-start
  localStorage.setItem('mcp-server-port', port);

  toast(`Avvio MCP Server sulla porta ${port}...`);
  updateMCPStatus('starting', `Avvio in corso...`);

  try {
    // Start server via IPC
    const response = await window.electronAPI.mcpStartServer(port);

    if (response.success) {
      mcpServerRunning = true;
      updateMCPStatus('running', `Server attivo`);
      
      // Update button to "Stop"
      const btn = document.getElementById('mcp-start-btn');
      btn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="6" y="4" width="4" height="16"></rect>
          <rect x="14" y="4" width="4" height="16"></rect>
        </svg>
        Arresta Host MCP
      `;
      btn.classList.remove('primary');
      btn.classList.add('danger');

      // Update info
      const info = document.getElementById('mcp-server-info');
      info.innerHTML = `
        <div>URL: <code style="background:var(--panel2);padding:2px 4px;border-radius:3px">http://localhost:${port}</code></div>
      `;
      
      toast(`MCP Server avviato sulla porta ${port}! ✨`);
      console.log(`✅ MCP Server attivo su http://localhost:${port}`);
      
      // Start state sync
      startMCPStateSync();
    } else {
      throw new Error(response.error || 'Avvio fallito');
    }
  } catch (error) {
    console.error('MCP Server start failed:', error);
    updateMCPStatus('error', `Errore: ${error.message}`);
    toast('Errore: ' + error.message);
  }
}

// Stop MCP Server
async function stopMCPServer() {
  mcpServerRunning = false;
  
  try {
    await window.electronAPI.mcpStopServer();
  } catch (error) {
    console.error('Error stopping server:', error);
  }
  
  // Update button to "Start"
  const btn = document.getElementById('mcp-start-btn');
  btn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="5 3 19 12 5 21 5 3"></polygon>
    </svg>
    Avvia Host MCP
  `;
  btn.classList.remove('danger');
  btn.classList.add('primary');

  // Reset info
  const info = document.getElementById('mcp-server-info');
  info.innerHTML = '';
  
  updateMCPStatus('stopped', 'Server non avviato');
  toast('MCP Server arrestato');
  
  // Stop state sync
  stopMCPStateSync();
}

// Update MCP Status UI
function updateMCPStatus(status, text) {
  const dot = document.getElementById('mcp-status-dot');
  const textEl = document.getElementById('mcp-status-text');
  
  textEl.textContent = text;
  
  switch (status) {
    case 'running':
      dot.style.background = '#00cc66';
      dot.style.boxShadow = '0 0 6px #00cc66';
      break;
    case 'starting':
      dot.style.background = '#ffaa00';
      dot.style.boxShadow = '0 0 6px #ffaa00';
      break;
    case 'error':
      dot.style.background = '#ff4455';
      dot.style.boxShadow = '0 0 6px #ff4455';
      break;
    default:
      dot.style.background = 'var(--muted)';
      dot.style.boxShadow = 'none';
  }
}

// ═══════════════════════════════════════════════════════════════════
// MCP SERVER OPERATION HANDLER
// ═══════════════════════════════════════════════════════════════════

// Listen for operations from MCP server
window.electronAPI.onMCPExecuteOperation(async (operation) => {
  try {
    let result;
    
    switch (operation.type) {
      case 'add':
        result = await mcpHandleAddText(operation);
        break;
      case 'modify':
        result = await mcpHandleModifyElement(operation);
        break;
      case 'move':
        result = await mcpHandleMoveElement(operation);
        break;
      case 'delete':
        result = await mcpHandleDeleteElement(operation);
        break;
      case 'duplicate':
        result = await mcpHandleDuplicateElement(operation);
        break;
      case 'recolor':
        result = await mcpHandleRecolorElement(operation);
        break;
      case 'resize':
        result = await mcpHandleResizeElement(operation);
        break;
      case 'set_layer':
        result = await mcpHandleSetElementLayer(operation);
        break;
      case 'add_svg':
        result = await mcpHandleAddSVG(operation);
        break;
      case 'select':
        result = await mcpHandleSelectElements(operation);
        break;
      case 'resize_canvas':
        result = await mcpHandleResizeCanvas(operation);
        break;
      default:
        result = { success: false, error: `Unknown operation type: ${operation.type}` };
    }
    
    // Send result back to main process
    window.electronAPI.mcpOperationResult(result);
  } catch (error) {
    console.error('[MCP] Operation execution error:', error);
    window.electronAPI.mcpOperationResult({
      success: false,
      error: error.message
    });
  }
});

// Periodically update MCP server with canvas state
let mcpStateUpdateInterval = null;

function startMCPStateSync() {
  if (mcpStateUpdateInterval) return;
  
  // Update canvas state immediately
  updateMCPCanvasState();
  
  // Then update every 500ms
  mcpStateUpdateInterval = setInterval(() => {
    updateMCPCanvasState();
  }, 500);
}

function stopMCPStateSync() {
  if (mcpStateUpdateInterval) {
    clearInterval(mcpStateUpdateInterval);
    mcpStateUpdateInterval = null;
  }
}

function updateMCPCanvasState() {
  if (!mcpServerRunning) return;

  // Calculate bounding box for each element
  const lettersWithBBox = S.letters.map((el, idx) => {
    const bbox = getLetterBBoxTransformed(idx);
    return {
      id: el.id,
      index: idx,
      type: el.isSvgImport ? 'svg' : (el.customPath ? 'custom' : 'text'),
      ch: el.ch,
      x: el.x,
      y: el.y,
      fontSize: el.fontSize,
      fill: el.fill,
      fontFamily: el.fontFamily,
      rotation: el.rot || 0,
      skew: el.skew || 0,
      scaleX: el.sx || 1,
      scaleY: el.sy || 1,
      opacity: el.op || 1,
      borderWidth: el.borderWidth,
      borderColor: el.borderColor,
      layer: el.layer,
      isSvgImport: el.isSvgImport,
      svgW: el.svgW,
      svgH: el.svgH,
      svgName: el.svgName,
      fontName: el.fontName,
      customPath: el.customPath,
      selected: S.sel.has(el.id),
      // Bounding box in canvas coordinates
      bbox: bbox ? {
        x: Math.round(bbox.x),
        y: Math.round(bbox.y),
        x2: Math.round(bbox.x2),
        y2: Math.round(bbox.y2),
        w: Math.round(bbox.w),
        h: Math.round(bbox.h),
        cx: Math.round(bbox.cx),
        cy: Math.round(bbox.cy)
      } : null
    };
  });

  const canvasState = {
    letters: lettersWithBBox,
    canvasW: S.canvasW,
    canvasH: S.canvasH,
    zoom: S.zoom,
    svgs: S.svgs.map(s => ({
      name: s.name,
      width: s.width,
      height: s.height
    })),
    fonts: Object.keys(S.fonts),
    lastElement: lettersWithBBox.length > 0 ? lettersWithBBox[lettersWithBBox.length - 1] : null,
    uid: uid
  };

  window.electronAPI.mcpUpdateCanvasState(canvasState);
}

// ═══════════════════════════════════════════════════════════════════
// MCP OPERATION HANDLERS
// ═══════════════════════════════════════════════════════════════════

async function mcpHandleAddText(operation) {
  saveState();

  // Validate fontFamily if provided
  let fontFamily = operation.fontFamily || 'sans-serif';
  let fontName = '';

  if (operation.fontFamily && S.fonts[operation.fontFamily]) {
    // Use the CSS font-family from S.fonts
    fontFamily = S.fonts[operation.fontFamily];
    fontName = operation.fontFamily;
  }

  // Split text into individual characters
  const text = operation.text || '';
  const characters = text.split('');

  // If empty text, add a single space
  if (characters.length === 0) {
    characters.push(' ');
  }

  // Calculate spacing using the same method as manual addText
  const fontSize = operation.fontSize || 80;
  const ctx = document.getElementById('dc').getContext('2d');
  ctx.font = `${fontSize}px ${fontFamily}`;

  // Calculate total width using actual character measurements
  let totalWidth = 0;
  const charWidths = characters.map(ch => {
    const w = ctx.measureText(ch).width;
    totalWidth += w + fontSize * 0.05; // Add spacing like manual method
    return w;
  });

  // Starting position (center the text block)
  let startX = operation.x || (S.canvasW / 2);
  let startY = operation.y || (S.canvasH / 2);

  // Adjust startX to center the text
  startX = startX - (totalWidth / 2);

  const addedElements = [];

  // Create separate element for each character
  let currentX = startX;
  characters.forEach((char, index) => {
    const w = charWidths[index];
    const x = currentX + w / 2; // Center character at its position

    const newEl = {
      id: uid++,
      ch: char,
      x: x,
      y: startY,
      originalX: x,
      originalY: startY,
      fontSize: fontSize,
      fill: operation.fill || '#111111',
      fontFamily: fontFamily,
      fontName: fontName,
      isSvgImport: false,
      sx: 1,
      sy: 1,
      rot: operation.rotation || 0,
      skew: 0,
      op: 1,
      borderWidth: 0,
      borderColor: '#000000',
      layer: 2
    };

    S.letters.push(newEl);
    addedElements.push(newEl.id);

    // Move to next character position with spacing
    currentX += w + fontSize * 0.05;
  });

  // Select all the newly added elements
  S.sel.clear();
  addedElements.forEach(id => S.sel.add(id));

  render();
  upd();

  return { 
    success: true, 
    elementIds: addedElements, 
    message: `Added ${addedElements.length} character(s): ${text}` 
  };
}

async function mcpHandleModifyElement(operation) {
  const el = S.letters.find(e => e.id === operation.elementId);
  if (!el) {
    return { success: false, error: `Element not found: ${operation.elementId}` };
  }

  saveState();

  const props = operation.properties;
  if (props.x !== undefined) el.x = props.x;
  if (props.y !== undefined) el.y = props.y;
  if (props.fontSize !== undefined) el.fontSize = props.fontSize;
  if (props.fill !== undefined) el.fill = props.fill;
  if (props.sx !== undefined) el.sx = props.sx;
  if (props.sy !== undefined) el.sy = props.sy;
  if (props.rot !== undefined) el.rot = props.rot;
  if (props.skew !== undefined) el.skew = props.skew;
  if (props.op !== undefined) el.op = props.op;
  if (props.borderWidth !== undefined) el.borderWidth = props.borderWidth;
  if (props.borderColor !== undefined) el.borderColor = props.borderColor;
  if (props.layer !== undefined) el.layer = props.layer;
  
  // Handle fontFamily changes
  if (props.fontFamily !== undefined) {
    if (S.fonts[props.fontFamily]) {
      el.fontFamily = S.fonts[props.fontFamily];
      el.fontName = props.fontFamily;
    } else {
      // Font not found, use default
      el.fontFamily = 'sans-serif';
      el.fontName = '';
    }
  }

  render();
  upd();

  return { success: true, elementId: el.id, message: 'Element modified' };
}

async function mcpHandleMoveElement(operation) {
  const el = S.letters.find(e => e.id === operation.elementId);
  if (!el) {
    return { success: false, error: `Element not found: ${operation.elementId}` };
  }
  
  saveState();
  
  if (operation.x !== undefined) el.x = operation.x;
  if (operation.y !== undefined) el.y = operation.y;
  if (operation.dx !== undefined) el.x += operation.dx;
  if (operation.dy !== undefined) el.y += operation.dy;
  
  render();
  upd();
  
  return { success: true, elementId: el.id, message: `Moved element to (${el.x}, ${el.y})` };
}

async function mcpHandleDeleteElement(operation) {
  const idsToDelete = new Set(operation.elementIds);
  const deletedCount = S.letters.length;
  
  saveState();
  
  S.letters = S.letters.filter(el => !idsToDelete.has(el.id));
  idsToDelete.forEach(id => S.sel.delete(id));
  
  render();
  upd();
  
  return { success: true, deleted: deletedCount - S.letters.length, message: `Deleted ${deletedCount - S.letters.length} elements` };
}

async function mcpHandleDuplicateElement(operation) {
  const el = S.letters.find(e => e.id === operation.elementId);
  if (!el) {
    return { success: false, error: `Element not found: ${operation.elementId}` };
  }
  
  saveState();
  
  const newEl = {
    ...el,
    id: uid++,
    x: el.x + (operation.offsetX || 50),
    y: el.y + (operation.offsetY || 50)
  };
  
  S.letters.push(newEl);
  S.sel.clear();
  S.sel.add(newEl.id);
  
  render();
  upd();
  
  return { success: true, elementId: newEl.id, message: 'Element duplicated' };
}

async function mcpHandleRecolorElement(operation) {
  const el = S.letters.find(e => e.id === operation.elementId);
  if (!el) {
    return { success: false, error: `Element not found: ${operation.elementId}` };
  }
  
  saveState();
  
  el.fill = operation.fill;
  
  render();
  upd();
  
  return { success: true, elementId: el.id, message: `Recolored to ${operation.fill}` };
}

async function mcpHandleResizeElement(operation) {
  const el = S.letters.find(e => e.id === operation.elementId);
  if (!el) {
    return { success: false, error: `Element not found: ${operation.elementId}` };
  }

  saveState();

  if (operation.scaleX !== undefined) el.sx *= operation.scaleX;
  if (operation.scaleY !== undefined) el.sy *= operation.scaleY;
  if (operation.fontSize !== undefined) el.fontSize = operation.fontSize;

  render();
  upd();

  return { success: true, elementId: el.id, message: 'Element resized' };
}

async function mcpHandleResizeCanvas(operation) {
  saveState();

  const newWidth = operation.width || S.canvasW;
  const newHeight = operation.height || S.canvasH;

  // Update canvas dimensions
  S.canvasW = newWidth;
  S.canvasH = newHeight;

  // Update UI inputs
  document.getElementById('cvW').value = S.canvasW;
  document.getElementById('cvH').value = S.canvasH;

  render();
  upd();

  return { 
    success: true, 
    message: `Canvas resized to ${newWidth}x${newHeight}`,
    width: newWidth,
    height: newHeight
  };
}

async function mcpHandleSetElementLayer(operation) {
  const el = S.letters.find(e => e.id === operation.elementId);
  if (!el) {
    return { success: false, error: `Element not found: ${operation.elementId}` };
  }
  
  saveState();
  
  el.layer = operation.layer;
  
  render();
  upd();
  
  return { success: true, elementId: el.id, message: `Layer set to ${operation.layer}` };
}

async function mcpHandleAddSVG(operation) {
  const svgObj = S.svgs.find(s => s.name === operation.svgName);
  if (!svgObj) {
    return { success: false, error: `SVG not found: ${operation.svgName}` };
  }

  saveState();

  // Calcola scala automatica per adattare SVG al canvas
  // Target: 20% del lato più piccolo del canvas (più visibile)
  const targetSize = Math.min(S.canvasW, S.canvasH) * 0.20;
  const svgMaxDim = Math.max(svgObj.width, svgObj.height);
  const autoScale = svgMaxDim > 0 ? targetSize / svgMaxDim : 1;

  const scaleX = operation.scaleX !== undefined ? operation.scaleX : autoScale;
  const scaleY = operation.scaleY !== undefined ? operation.scaleY : autoScale;

  const newEl = {
    id: uid++,
    ch: operation.svgName,
    x: operation.x,
    y: operation.y,
    originalX: operation.x,
    originalY: operation.y,
    fontSize: 100,
    fill: '#111111',
    fontFamily: 'sans-serif',
    fontName: operation.svgName,
    sx: scaleX,
    sy: scaleY,
    rot: 0,
    skew: 0,
    op: 1,
    customPath: svgObj.pathData.replace(/<path d="([^"]+)"[^>]*>/, '$1'),
    isSvgImport: true,
    svgW: svgObj.width,
    svgH: svgObj.height,
    borderWidth: 0,
    borderColor: '#000000',
    layer: 2
  };

  S.letters.push(newEl);
  S.sel.clear();
  S.sel.add(newEl.id);

  render();
  upd();

  return { success: true, elementId: newEl.id, message: `Added SVG: ${operation.svgName}` };
}

async function mcpHandleSelectElements(operation) {
  S.sel.clear();
  operation.elementIds.forEach(id => {
    if (S.letters.find(e => e.id === id)) {
      S.sel.add(id);
    }
  });
  
  render();
  upd();
  
  return { success: true, selected: S.sel.size, message: `Selected ${S.sel.size} elements` };
}
