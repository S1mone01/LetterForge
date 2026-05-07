// ── STATE ──────────────────────────────────────────────────────────────
const S = {
  letters:[],
  bottomOffsets:[],
  snapEnabled: true,
  sel:new Set(),
  dragging:false, dragType:null,
  ds:null, dl:[],
  box:{on:false,x0:0,y0:0},
  selectedFonts:new Set(),
  fonts:{}, openFonts:{},
  svgs:[], // Array of {id, name, pathData, width, height}
  viewMode:'fonts', // 'fonts' or 'svgs'
  gridOn:true,
  canvasBg:'#ffffff',
  zoom:1, canvasW:800, canvasH:500,
  lockScale:true,
  history:[], historyIndex:-1,
  snapThreshold:10,
  panning:false, panStart:null,
  rotating:false, // true quando l'utente sta ruotando attivamente
  rotHandleAngle: null, // angolo corrente del controllo di rotazione (in gradi)
  rotHandleDistance: null, // distanza fissa dal centro durante la rotazione
  groupCounter: 0, // contatore per generare ID gruppo univoci
  _gapBase: null,  // stato base per lo slider Gap (salvato su mousedown)
  currentProjectName: null, // nome del file progetto attualmente aperto
  lastImportedName: null, // nome dell'ultimo file importato (STL/SVG)
};
let uid=0;

// ── Helper: ottieni tutti gli indici degli elementi con lo stesso groupId ──
function getGroupIndices(idx) {
  const elem = S.letters[idx];
  if (!elem || !elem.groupId) return [idx];
  return S.letters
    .map((el, i) => (el.groupId === elem.groupId) ? i : -1)
    .filter(i => i !== -1);
}

function saveState(){
  if(S.historyIndex < S.history.length - 1) S.history = S.history.slice(0, S.historyIndex + 1);
  const state = {
    letters: JSON.parse(JSON.stringify(S.letters)),
    sel:[...S.sel]
  };
  S.history.push(state);
  if(S.history.length > 50) S.history.shift(); else S.historyIndex++;
}

function undo(){
  if(S.historyIndex > 0){ S.historyIndex--; restoreState(S.history[S.historyIndex]); toast('Annullato'); }
}

function redo(){
  if(S.historyIndex < S.history.length-1){ S.historyIndex++; restoreState(S.history[S.historyIndex]); toast('Ripristinato'); }
}

function restoreState(state){
  S.letters = JSON.parse(JSON.stringify(state.letters));
  S.sel     = new Set(state.sel);
  render(); renderHandles(); upd();
}

// ── SALVA PROGETTO ─────────────────────────────────────────────────────────
function showSaveDialog() {
  const dlg = document.getElementById('save-options-dialog');
  const saveBtn = document.getElementById('save-opt-save');
  const asBtn = document.getElementById('save-opt-as');
  const cancelBtn = document.getElementById('save-opt-cancel');

  if (S.currentProjectName) {
    saveBtn.disabled = false;
    saveBtn.style.borderColor = 'var(--accent)';
    saveBtn.style.color = 'var(--accent)';
    saveBtn.style.opacity = '1';
    saveBtn.style.cursor = 'pointer';
  } else {
    saveBtn.disabled = true;
    saveBtn.style.borderColor = 'var(--muted)';
    saveBtn.style.color = 'var(--muted)';
    saveBtn.style.opacity = '0.5';
    saveBtn.style.cursor = 'not-allowed';
  }

  dlg.classList.add('show');

  asBtn.onclick = () => {
    dlg.classList.remove('show');
    saveProjectAs();
  };

  saveBtn.onclick = () => {
    if (!saveBtn.disabled) {
      dlg.classList.remove('show');
      saveProjectDirectly();
    }
  };

  cancelBtn.onclick = () => {
    dlg.classList.remove('show');
  };
}

async function saveProjectAs() {
  customPrompt('Nome del progetto:', async (name) => {
    if (!name) return;
    if (!name.endsWith('.json')) name += '.json';
    S.currentProjectName = name;
    updateTitleBar();
    await saveProjectDirectly();
  });
}

async function saveProjectDirectly() {
  if (!S.currentProjectName) return;
  const name = S.currentProjectName;

  // Cattura la preview prima di salvare
  const previewData = await capturePreview();

  // Prepara i dati del progetto
  const projectData = {
    version: '1.0',
    canvas: {
      width: S.canvasW,
      height: S.canvasH,
      zoom: S.zoom,
      gridOn: S.gridOn,
      canvasBg: S.canvasBg
    },
    letters: S.letters,
    svgs: S.svgs,
    fontNames: Object.keys(S.fonts),
    savedAt: new Date().toISOString()
  };

  try {
    const content = JSON.stringify(projectData, null, 2);

    if (window.electronAPI && window.electronAPI.saveProjectInternal) {
      const success = await window.electronAPI.saveProjectInternal(name, content);
      if (success) {
        // Se abbiamo la preview, salviamola pure (stesso nome ma .png)
        if (previewData) {
          const previewName = name.replace('.json', '.png');
          await window.electronAPI.saveProjectInternal(previewName, previewData);
        }
        renderRecentProjects();
        updateTitleBar();
        toast('Progetto salvato ✓');
      }
    } else {
      // Fallback per browser
      const blob = new Blob([content], {type: 'application/json'});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      renderRecentProjects();
      toast('Progetto scaricato ✓');
    }
  } catch (error) {
    console.error('Errore salvataggio progetto:', error);
    toast('Errore salvataggio progetto!');
  }
}

// ── CARICA PROGETTO ────────────────────────────────────────────────────────
async function loadProject() {
  try {
    let projectData;
    
    if (window.electronAPI && window.electronAPI.loadProjectFile) {
      const response = await window.electronAPI.loadProjectFile();
      if (!response) {
        return; // Annullato dall'utente
      }
      projectData = response.content;
      S.currentProjectName = response.name;
      updateTitleBar();
    } else {
      // Fallback per browser: input file
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            projectData = JSON.parse(ev.target.result);
            applyProjectData(projectData);
          } catch (err) {
            toast('File progetto non valido!');
          }
        };
        reader.readAsText(file);
      };
      input.click();
      return;
    }
    
    applyProjectData(projectData);
  } catch (error) {
    console.error('Errore caricamento progetto:', error);
    toast('Errore caricamento progetto!');
  }
}

function applyProjectData(data) {
  if (!data || !data.canvas || !data.letters) {
    toast('File progetto non valido!');
    return;
  }
  
  // Ripristina canvas
  S.canvasW = data.canvas.width || 800;
  S.canvasH = data.canvas.height || 500;
  S.zoom = data.canvas.zoom || 1;
  S.gridOn = data.canvas.gridOn !== false;
  S.canvasBg = data.canvas.canvasBg || '#ffffff';
  
  // Aggiorna UI canvas
  document.getElementById('cvW').value = S.canvasW;
  document.getElementById('cvH').value = S.canvasH;
  applySize();
  
  // Ripristina griglia
  document.getElementById('gr').style.display = S.gridOn ? 'block' : 'none';
  const gridBtn2 = document.getElementById('grid-btn');
  if(gridBtn2) gridBtn2.style.color = S.gridOn ? 'var(--accent)' : 'var(--muted)';

  // Ripristina colore sfondo
  setCanvasBg(S.canvasBg);
  const bgDot2d = document.getElementById('canvas-bg-picker-dot');
  if (bgDot2d) bgDot2d.style.background = S.canvasBg;
  // Ripristina lettere
  S.letters = data.letters || [];
  
  // Ripristina libreria SVG
  S.svgs = data.svgs || [];
  
  // Reset selezione
  S.sel.clear();
  
  // Aggiorna vista
  render();
  renderHandles();
  if (S.viewMode === 'fonts') renderFonts();
  else renderSVGs();
  upd();
  saveState();
  updateTitleBar();
  
  toast(`Progetto caricato: ${S.letters.length} elementi ✓`);
}
