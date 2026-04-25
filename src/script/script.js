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

function setZoom(z){
  S.zoom = Math.min(30, Math.max(0.1, z));
  const svg = document.getElementById('svg');
  svg.setAttribute('width',  Math.round(S.canvasW * S.zoom));
  svg.setAttribute('height', Math.round(S.canvasH * S.zoom));
  document.getElementById('zoom-label').textContent = Math.round(S.zoom*100)+'%';
}
function zoomIn()   { setZoom(S.zoom * 1.1); }
function zoomOut()  { setZoom(S.zoom / 1.1); }
function zoomReset(){
  setZoom(1);
  const cw = document.getElementById('cw');
  cw.scrollLeft = (cw.scrollWidth - cw.clientWidth) / 2;
  cw.scrollTop  = (cw.scrollHeight - cw.clientHeight) / 2;
}

document.getElementById('cw').addEventListener('wheel', e => {
  e.preventDefault(); 
  const cw = document.getElementById('cw');
  if (e.ctrlKey || e.metaKey) {
    cw.scrollLeft += e.deltaX;
    cw.scrollTop  += e.deltaY;
  } else {
    const rect = cw.getBoundingClientRect();
    const mx = e.clientX - rect.left + cw.scrollLeft;
    const my = e.clientY - rect.top  + cw.scrollTop;
    const oldZoom = S.zoom;
    const zoomFactor = 1.1;
    setZoom(e.deltaY > 0 ? S.zoom / zoomFactor : S.zoom * zoomFactor);
    const ratio = S.zoom / oldZoom;
    cw.scrollLeft = mx * ratio - (e.clientX - rect.left);
    cw.scrollTop  = my * ratio - (e.clientY - rect.top);
  }
}, {passive: false});

document.addEventListener('keydown', e => {
  if(e.code === 'Space' && !e.target.matches('input,textarea')){
    e.preventDefault();
  }
});
document.addEventListener('keyup', e => {
  if(e.code === 'Space'){
    e.preventDefault();
  }
});

function toggleSnap(){
  S.snapEnabled = !S.snapEnabled;
  const btn = document.getElementById('snap-btn');
  if(S.snapEnabled){
    btn.classList.add('snap-on');
    toast('Snap attivato ✓');
  } else {
    btn.classList.remove('snap-on');
    toast('Snap disattivato ○');
  }
}

function pt(e){
  const svg = document.getElementById('svg');
  const p   = svg.createSVGPoint();
  p.x = e.clientX;
  p.y = e.clientY;
  return p.matrixTransform(svg.getScreenCTM().inverse());
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

// ── VIEW TOGGLE LOGIC ─────────────────────────────────────────────────────
function toggleViewMode(mode){
  S.viewMode = mode;
  
  const fontImportGroup = document.getElementById('font-import-group');
  const svgImportGroup = document.getElementById('svg-import-group');
  const fontListActions = document.getElementById('font-list-actions');
  
  if(mode === 'fonts'){
    fontImportGroup.style.display = 'flex';
    svgImportGroup.style.display = 'none';
    fontListActions.style.display = 'block';
  } else {
    fontImportGroup.style.display = 'none';
    svgImportGroup.style.display = 'flex';
    fontListActions.style.display = 'none';
  }
  
  handleSearch(document.getElementById('sidebar-search').value);
}

function handleSearch(query){
  const input = document.getElementById('sidebar-search');
  const list = document.getElementById('font-list');
  
  if(S.viewMode === 'fonts'){
    input.placeholder = "Cerca font…";
    renderFonts(query);
  } else {
    input.placeholder = "Cerca SVG…";
    renderSVGs(query);
  }
}

function renderFonts(filter=''){
  const el   = document.getElementById('font-list');
  const actionContainer = document.getElementById('font-list-actions');
  const keys = Object.keys(S.fonts).filter(k=>k.toLowerCase().includes(filter.toLowerCase()));
  
  // Show/hide action buttons based on font count
  if(keys.length > 1){
    actionContainer.style.display = 'block';
  } else {
    actionContainer.style.display = 'none';
  }
  
  if(!keys.length){ el.innerHTML = `<div style="padding:20px;text-align:center;color:var(--muted);font-size:11px">Nessun font trovato.</div>`; return; }
  el.innerHTML = keys.map(n=>{
    const isSel = S.selectedFonts.has(n);
    return `<div class="fi ${isSel?'act':''}" onclick="toggleFont('${n.replace(/'/g,"\\'").replace(/"/g,'&quot;')}')">
      <span class="fp" style="font-family:${S.fonts[n]}">Aa</span>
      <span class="fn" style="font-family:${S.fonts[n]};flex:1">${n}</span>
      ${isSel?'<span style="color:var(--accent);font-weight:bold">✓</span>':''}
    </div>`;
  }).join('');
}

function renderSVGs(filter=''){
  const el = document.getElementById('font-list');
  const items = S.svgs.filter(s => s.name.toLowerCase().includes(filter.toLowerCase()));
  
  if(!items.length){
    el.innerHTML = `<div style="padding:20px;text-align:center;color:var(--muted);font-size:11px">Nessun SVG trovato.</div>`;
    return;
  }
  
  el.innerHTML = `<div class="svg-grid">` + items.map(svg => {
    // IL FIX È QUI: Usiamo viewBox="0 0 svg.width svg.height" dinamicamente
    // e aggiungiamo overflow:visible e vector-effect per sicurezza
    return `<div class="svg-item" onclick="addSVGToCanvas('${svg.name}')">
      <div class="svg-thumb">
        <svg viewBox="0 0 ${svg.width} ${svg.height}" style="overflow:visible;">
          ${svg.pathData}
        </svg>
      </div>
      <div class="svg-name">${svg.name}</div>
    </div>`;
  }).join('') + `</div>`;
}

function importFonts(files){
  Array.from(files).forEach(f=>{
    const url = URL.createObjectURL(f);
    const raw = f.name.replace(/\.(ttf|otf|woff2?)$/i,'');
    const cn  = `cf-${raw.replace(/\s+/g,'_')}`;
    new FontFace(cn,`url(${url})`).load().then(face=>{
      document.fonts.add(face);
      S.fonts[raw] = `'${cn}',sans-serif`;
      S.curFont = raw;
      renderFonts();
      const reader = new FileReader();
      reader.onload = e2=>{
        try{ S.openFonts[raw]=opentype.parse(e2.target.result); toast(`"${raw}" pronto ✓`); render(); upd(); }
        catch(err){ console.log('Errore opentype:',err); }
      };
      reader.readAsArrayBuffer(f);
    }).catch(()=>toast(`Errore UI: ${f.name}`));
  });
}
// Drag & drop per font
const dz=document.getElementById('drop-zone');
dz.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('drag')});
dz.addEventListener('dragleave',()=>dz.classList.remove('drag'));
dz.addEventListener('drop',e=>{e.preventDefault();dz.classList.remove('drag');importFonts(e.dataTransfer.files)});

const fz=document.getElementById('folder-zone');
fz.addEventListener('dragover',e=>{e.preventDefault();fz.classList.add('drag')});
fz.addEventListener('dragleave',()=>fz.classList.remove('drag'));
fz.addEventListener('drop',e=>{e.preventDefault();fz.classList.remove('drag');importFontsFromFolder(e.dataTransfer.files)});

// Drag & drop per SVG
const sdz=document.getElementById('svg-drop-zone');
sdz.addEventListener('dragover',e=>{e.preventDefault();sdz.classList.add('drag')});
sdz.addEventListener('dragleave',()=>sdz.classList.remove('drag'));
sdz.addEventListener('drop',e=>{e.preventDefault();sdz.classList.remove('drag');handleSVGDropp(e.dataTransfer.files)});

const sfz=document.getElementById('svg-folder-zone');
sfz.addEventListener('dragover',e=>{e.preventDefault();sfz.classList.add('drag')});
sfz.addEventListener('dragleave',()=>sfz.classList.remove('drag'));
sfz.addEventListener('drop',e=>{e.preventDefault();sfz.classList.remove('drag');importSVGsFromFolder(e.dataTransfer.files)});

function openUserFontFolder(){
  if(window.electronAPI && window.electronAPI.openFontFolder){
    window.electronAPI.openFontFolder()
      .then(result => { if(!result.success) toast('Errore nell\'apertura della cartella font'); })
      .catch(() => toast('Errore nell\'apertura della cartella font'));
  }
}

function openUserSVGFolder(){
  if(window.electronAPI && window.electronAPI.openSVGFolder){
    window.electronAPI.openSVGFolder()
      .then(result => { if(!result.success) toast('Errore nell\'apertura della cartella SVG'); })
      .catch(() => toast('Errore nell\'apertura della cartella SVG'));
  }
}

function importFontsFromFolder(files){
  const ff=Array.from(files).filter(f=>/\.(ttf|otf|woff|woff2)$/i.test(f.name));
  if(!ff.length){toast('Nessun font trovato nella cartella');return;}
  let loaded=0;
  ff.forEach(f=>{
    const url=URL.createObjectURL(f);
    const raw=f.name.replace(/\.(ttf|otf|woff2?)$/i,'');
    const cn=`cf-${raw.replace(/\s+/g,'_')}`;
    new FontFace(cn,`url(${url})`).load().then(face=>{
      document.fonts.add(face); S.fonts[raw]=`'${cn}',sans-serif`; S.curFont=raw;
      const reader=new FileReader();
      reader.onload=e2=>{
        try{
          S.openFonts[raw]=opentype.parse(e2.target.result);
          loaded++;
          if(loaded===ff.length){renderFonts();render();upd();toast(`${loaded} font caricati ✓`);}
        }catch(err){console.error(err);}
      };
      reader.readAsArrayBuffer(f);
    }).catch(()=>console.error(`Errore font: ${f.name}`));
  });
}

// ── SVG IMPORT LOGIC E FUNZIONI CONDIVISE ───────────────────────────────────

// HELPER: Appiattisce un SVG e ne estrae il Bounding Box perfetto per l'anteprima
function processSingleSVGForLibrary(name, content) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'image/svg+xml');
    const svgRoot = doc.querySelector('svg');
    if(!svgRoot) return;

    let vbX = 0, vbY = 0;
    const vb = svgRoot.getAttribute('viewBox');
    if(vb){
      const vp = vb.trim().split(/[\s,]+/).map(Number);
      vbX = vp[0]||0; vbY = vp[1]||0;
    }

    const rootMatrix = new DOMMatrix().translate(-vbX, -vbY);
    const shapes = [];
    
    collectShapesV2(svgRoot, shapes, rootMatrix);

    let allSegs = [];
    shapes.forEach(sh => {
      const segs = pathToAbsoluteSegments(sh.rawD);
      if(!segs.length) return;
      
      const transformedSegs = applyMatrixToSegs(segs, sh.matrix);

      const hasStroke = sh.stroke && sh.stroke !== 'none' && sh.strokeWidth > 0;
      const hasFill = sh.fill && sh.fill !== 'none';

      if(hasFill || !hasStroke) {
        allSegs.push(...transformedSegs);
      }
      if(hasStroke) {
        const strokeD = strokeToFillPath(transformedSegs, sh.strokeWidth);
        if(strokeD) allSegs.push(...pathToAbsoluteSegments(strokeD));
      }
    });

    if (!allSegs.length) return;

    // --- FIX ANTEPRIMA: Calcoliamo il Bounding Box reale dei punti del disegno ---
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    allSegs.forEach(s => {
      if (s.x !== undefined) { minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); }
      if (s.y !== undefined) { minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y); }
    });

    // Se non ha trovato punti (caso raro), usiamo valori di fallback
    if (minX === Infinity) { minX = 0; minY = 0; maxX = 100; maxY = 100; }

    const realW = Math.max(maxX - minX, 1);
    const realH = Math.max(maxY - minY, 1);

    // Normalizza il path a 100px sul lato lungo, così sx=1 è sempre sensato
    const NORM_SIZE = 100;
    const normScale = NORM_SIZE / Math.max(realW, realH);
    const centeredSegs = translateSegs(allSegs, -minX, -minY);
    const normalizedSegs = scaleSegs(centeredSegs, normScale);
    const combinedD = segsToPathD(normalizedSegs);

    if(combinedD) {
      S.svgs.push({
        id: uid++,
        name: name.replace(/\.svg$/i, ''),
        pathData: `<path d="${combinedD}" fill="currentColor" vector-effect="non-scaling-stroke"/>`,
        width: realW * normScale,
        height: realH * normScale
      });
    }
  } catch(e) { console.error("Errore parsing SVG libreria:", e); }
}

function importSVGsFromFolder(files){
  const ff = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.svg'));
  if(!ff.length){toast('Nessun SVG trovato nella cartella');return;}
  let loaded = 0;
  ff.forEach(f => {
    const reader = new FileReader();
    reader.onload = ev => {
      processSingleSVGForLibrary(f.name, ev.target.result);
      loaded++;
      if(loaded === ff.length){
        renderSVGs();
        toast(`${loaded} SVG caricati ✓`);
      }
    };
    reader.readAsText(f);
  });
}

function addSVGToCanvas(name){
  const svgObj = S.svgs.find(s => s.name === name);
  if(!svgObj) return;

  // Il path in svgObj è già normalizzato a 100px sul lato lungo (da processSingleSVGForLibrary).
  // Scala a targetSize (20% del canvas) e metti sx=1 così l'utente parte sempre da 1.
  const targetSize = Math.min(S.canvasW, S.canvasH) * 0.20;
  const svgMaxDim = Math.max(svgObj.width, svgObj.height);
  const toTargetScale = svgMaxDim > 0 ? targetSize / svgMaxDim : 1;

  const rawSegs = pathToAbsoluteSegments(svgObj.pathData.replace(/<path d="([^"]+)"[^>]*>/, '$1'));
  const scaledSegs = scaleSegs(rawSegs, toTargetScale);
  const scaledD = segsToPathD(scaledSegs);
  const objW = svgObj.width * toTargetScale;
  const objH = svgObj.height * toTargetScale;

  S.letters.push({
    id: uid++,
    ch: name,
    x: S.canvasW/2,
    y: S.canvasH/2,
    originalX: S.canvasW/2,
    originalY: S.canvasH/2,
    fontSize: 100,
    fill: '#111111',
    fontFamily: 'sans-serif',
    fontName: name,
    sx: 1,
    sy: 1,
    rot: 0, skew: 0, op: 1,
    customPath: scaledD,
    isSvgImport: true,
    svgW: objW,
    svgH: objH,
    borderWidth: 0,
    borderColor: '#000000',
    layer: 2
  });
  render(); upd(); saveState();
  toast(`SVG "${name}" aggiunto ✓`);
}

// 1. TOKENIZER PATH completo
function tokenizePath(d) {
  const tokens = [];
  const re = /([MLHVCSQTAZmlhvcsqtaz])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g;
  let m;
  while ((m = re.exec(d)) !== null) {
    if (m[1]) tokens.push({ type: 'cmd', v: m[1] });
    else tokens.push({ type: 'num', v: parseFloat(m[2]) });
  }
  return tokens;
}

// Converte path in array di segmenti assoluti
function pathToAbsoluteSegments(d) {
  const tokens = tokenizePath(d);
  const segs = [];
  let i = 0, cx = 0, cy = 0, mx = 0, my = 0;

  function nums(n) {
    const a = [];
    for (let k = 0; k < n; k++) {
      if (i < tokens.length && tokens[i].type === 'num') a.push(tokens[i++].v);
      else a.push(0);
    }
    return a;
  }

  while (i < tokens.length) {
    if (tokens[i].type !== 'cmd') { i++; continue; }
    const cmd = tokens[i++].v;
    const UC = cmd.toUpperCase();
    const rel = cmd !== UC;

    const ox = () => rel ? cx : 0;
    const oy = () => rel ? cy : 0;

    const repeat = () => i < tokens.length && tokens[i].type === 'num';

    do {
      if (UC === 'Z') {
        segs.push({ cmd: 'Z' });
        cx = mx; cy = my;
        break;
      } else if (UC === 'M') {
        const [x, y] = nums(2);
        cx = x + ox(); cy = y + oy();
        mx = cx; my = cy;
        segs.push({ cmd: 'M', x: cx, y: cy });
        while (repeat()) {
          const [x2, y2] = nums(2);
          cx = x2 + (rel ? cx : 0); cy = y2 + (rel ? cy : 0);
          segs.push({ cmd: 'L', x: cx, y: cy });
        }
        break;
      } else if (UC === 'L') {
        const [x, y] = nums(2);
        cx = x + ox(); cy = y + oy();
        segs.push({ cmd: 'L', x: cx, y: cy });
      } else if (UC === 'H') {
        const [x] = nums(1);
        cx = x + ox();
        segs.push({ cmd: 'L', x: cx, y: cy });
      } else if (UC === 'V') {
        const [y] = nums(1);
        cy = y + oy();
        segs.push({ cmd: 'L', x: cx, y: cy });
      } else if (UC === 'C') {
        const [x1, y1, x2, y2, x, y] = nums(6);
        const ax1 = x1 + ox(), ay1 = y1 + oy();
        const ax2 = x2 + ox(), ay2 = y2 + oy();
        const ax = x + ox(), ay = y + oy();
        segs.push({ cmd: 'C', x1: ax1, y1: ay1, x2: ax2, y2: ay2, x: ax, y: ay });
        cx = ax; cy = ay;
      } else if (UC === 'S') {
        const prev = segs[segs.length - 1];
        const rx1 = (prev && prev.cmd === 'C') ? 2 * cx - prev.x2 : cx;
        const ry1 = (prev && prev.cmd === 'C') ? 2 * cy - prev.y2 : cy;
        const [x2, y2, x, y] = nums(4);
        const ax2 = x2 + ox(), ay2 = y2 + oy();
        const ax = x + ox(), ay = y + oy();
        segs.push({ cmd: 'C', x1: rx1, y1: ry1, x2: ax2, y2: ay2, x: ax, y: ay });
        cx = ax; cy = ay;
      } else if (UC === 'Q') {
        const [x1, y1, x, y] = nums(4);
        const ax1 = x1 + ox(), ay1 = y1 + oy();
        const ax = x + ox(), ay = y + oy();
        segs.push({ cmd: 'Q', x1: ax1, y1: ay1, x: ax, y: ay });
        cx = ax; cy = ay;
      } else if (UC === 'T') {
        const prev = segs[segs.length - 1];
        const rx1 = (prev && prev.cmd === 'Q') ? 2 * cx - prev.x1 : cx;
        const ry1 = (prev && prev.cmd === 'Q') ? 2 * cy - prev.y1 : cy;
        const [x, y] = nums(2);
        const ax = x + ox(), ay = y + oy();
        segs.push({ cmd: 'Q', x1: rx1, y1: ry1, x: ax, y: ay });
        cx = ax; cy = ay;
      } else if (UC === 'A') {
        const [rx2, ry2, xRot, laf, sf, x, y] = nums(7);
        const ax = x + ox(), ay = y + oy();
        segs.push({ cmd: 'A', rx: rx2, ry: ry2, xRot, laf, sf, x: ax, y: ay, x0: cx, y0: cy });
        cx = ax; cy = ay;
      } else {
        i++; break;
      }
    } while (UC !== 'M' && UC !== 'Z' && repeat());
  }
  return segs;
}

// 2. APPLICA MATRICE DI TRASFORMAZIONE a segmenti assoluti
function applyMatrixToSegs(segs, m) {
  const tx = (x, y) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f });
  return segs.map(s => {
    if (s.cmd === 'Z') return { cmd: 'Z' };
    if (s.cmd === 'M') { const p = tx(s.x, s.y); return { cmd: 'M', x: p.x, y: p.y }; }
    if (s.cmd === 'L') { const p = tx(s.x, s.y); return { cmd: 'L', x: p.x, y: p.y }; }
    if (s.cmd === 'C') {
      const p1 = tx(s.x1, s.y1), p2 = tx(s.x2, s.y2), p = tx(s.x, s.y);
      return { cmd: 'C', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, x: p.x, y: p.y };
    }
    if (s.cmd === 'Q') {
      const p1 = tx(s.x1, s.y1), p = tx(s.x, s.y);
      return { cmd: 'Q', x1: p1.x, y1: p1.y, x: p.x, y: p.y };
    }
    if (s.cmd === 'A') {
      const curves = arcToCubics(s.x0, s.y0, s.rx, s.ry, s.xRot, s.laf, s.sf, s.x, s.y);
      return curves.map(c => {
        const p1 = tx(c.x1, c.y1), p2 = tx(c.x2, c.y2), p = tx(c.x, c.y);
        return { cmd: 'C', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, x: p.x, y: p.y };
      });
    }
    return s;
  }).flat();
}

// 3. CONVERSIONE ARCO → CUBIC BEZIER
function arcToCubics(x1, y1, rx, ry, phi, fA, fS, x2, y2) {
  if (x1 === x2 && y1 === y2) return [];
  if (rx === 0 || ry === 0) return [{ x1: x1, y1: y1, x2: x2, y2: y2, x: x2, y: y2 }];

  const sinPhi = Math.sin(phi * Math.PI / 180);
  const cosPhi = Math.cos(phi * Math.PI / 180);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;

  rx = Math.abs(rx); ry = Math.abs(ry);
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) { rx *= Math.sqrt(lambda); ry *= Math.sqrt(lambda); }

  const rxSq = rx * rx, rySq = ry * ry;
  const x1pSq = x1p * x1p, y1pSq = y1p * y1p;
  let sq = Math.max(0, (rxSq * rySq - rxSq * y1pSq - rySq * x1pSq) / (rxSq * y1pSq + rySq * x1pSq));
  sq = Math.sqrt(sq) * (fA === fS ? -1 : 1);

  const cxp = sq * rx * y1p / ry;
  const cyp = -sq * ry * x1p / rx;
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  const ang = (ux, uy, vx, vy) => {
    const d = Math.sqrt((ux*ux+uy*uy)*(vx*vx+vy*vy));
    if (!d) return 0;
    const a = Math.acos(Math.max(-1, Math.min(1, (ux*vx+uy*vy)/d)));
    return (ux*vy - uy*vx < 0) ? -a : a;
  };
  let theta1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dTheta = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!fS && dTheta > 0) dTheta -= 2 * Math.PI;
  if (fS && dTheta < 0) dTheta += 2 * Math.PI;

  const n = Math.ceil(Math.abs(dTheta) / (Math.PI / 2));
  const curves = [];
  for (let i = 0; i < n; i++) {
    const t1 = theta1 + i * dTheta / n;
    const t2 = theta1 + (i + 1) * dTheta / n;
    const dt = t2 - t1;
    const a = 4 / 3 * Math.tan(dt / 4);
    const cos1 = Math.cos(t1), sin1 = Math.sin(t1);
    const cos2 = Math.cos(t2), sin2 = Math.sin(t2);
    const ox1 = cx + cosPhi * rx * cos1 - sinPhi * ry * sin1;
    const oy1 = cy + sinPhi * rx * cos1 + cosPhi * ry * sin1;
    const ox2 = cx + cosPhi * rx * cos2 - sinPhi * ry * sin2;
    const oy2 = cy + sinPhi * rx * cos2 + cosPhi * ry * sin2;
    curves.push({
      x1: ox1 + a * (-cosPhi * rx * sin1 - sinPhi * ry * cos1),
      y1: oy1 + a * (-sinPhi * rx * sin1 + cosPhi * ry * cos1),
      x2: ox2 - a * (-cosPhi * rx * sin2 - sinPhi * ry * cos2),
      y2: oy2 - a * (-sinPhi * rx * sin2 + cosPhi * ry * cos2),
      x: ox2, y: oy2
    });
  }
  return curves;
}

// 4. PARSE TRANSFORM STRING → DOMMatrix
function parseTransformToMatrix(transformStr) {
  let m = new DOMMatrix();
  if (!transformStr) return m;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let match;
  while ((match = re.exec(transformStr)) !== null) {
    const fn = match[1];
    const args = match[2].trim().split(/[\s,]+/).map(Number);
    const [a0=0,a1=0,a2=0,a3=0,a4=0,a5=0] = args;
    let tm;
    if (fn === 'matrix') {
      tm = new DOMMatrix([a0, a1, a2, a3, a4, a5]);
    } else if (fn === 'translate') {
      tm = new DOMMatrix().translate(a0, a1);
    } else if (fn === 'scale') {
      tm = new DOMMatrix().scale(a0, args.length > 1 ? a1 : a0);
    } else if (fn === 'rotate') {
      if (args.length > 1) {
        tm = new DOMMatrix().translate(a1, a2).rotate(a0).translate(-a1, -a2);
      } else {
        tm = new DOMMatrix().rotate(a0);
      }
    } else if (fn === 'skewX') {
      tm = new DOMMatrix([1, 0, Math.tan(a0 * Math.PI / 180), 1, 0, 0]);
    } else if (fn === 'skewY') {
      tm = new DOMMatrix([1, Math.tan(a0 * Math.PI / 180), 0, 1, 0, 0]);
    } else continue;
    m = m.multiply(tm);
  }
  return m;
}

// 5. ELEMENTO SVG → PATH DATA
function svgElToPathD(el) {
  const tag = el.tagName.toLowerCase().replace(/^svg:/,'');
  if (tag === 'path') return el.getAttribute('d') || '';
  if (tag === 'rect') {
    const x = +el.getAttribute('x')||0, y = +el.getAttribute('y')||0;
    const w = +el.getAttribute('width')||0, h = +el.getAttribute('height')||0;
    const rx = Math.min(+el.getAttribute('rx')||0, w/2);
    const ry = Math.min(+el.getAttribute('ry')||rx, h/2);
    if (!w || !h) return '';
    if (rx || ry) {
      return `M${x+rx},${y} L${x+w-rx},${y} A${rx},${ry} 0 0 1 ${x+w},${y+ry} L${x+w},${y+h-ry} A${rx},${ry} 0 0 1 ${x+w-rx},${y+h} L${x+rx},${y+h} A${rx},${ry} 0 0 1 ${x},${y+h-ry} L${x},${y+ry} A${rx},${ry} 0 0 1 ${x+rx},${y} Z`;
    }
    return `M${x},${y} L${x+w},${y} L${x+w},${y+h} L${x},${y+h} Z`;
  }
  if (tag === 'circle') {
    const cx = +el.getAttribute('cx')||0, cy = +el.getAttribute('cy')||0, r = +el.getAttribute('r')||0;
    if (!r) return '';
    return `M${cx-r},${cy} A${r},${r} 0 1 0 ${cx+r},${cy} A${r},${r} 0 1 0 ${cx-r},${cy} Z`;
  }
  if (tag === 'ellipse') {
    const cx = +el.getAttribute('cx')||0, cy = +el.getAttribute('cy')||0;
    const rx = +el.getAttribute('rx')||0, ry = +el.getAttribute('ry')||0;
    if (!rx || !ry) return '';
    return `M${cx-rx},${cy} A${rx},${ry} 0 1 0 ${cx+rx},${cy} A${rx},${ry} 0 1 0 ${cx-rx},${cy} Z`;
  }
  if (tag === 'line') {
    const x1 = +el.getAttribute('x1')||0, y1 = +el.getAttribute('y1')||0;
    const x2 = +el.getAttribute('x2')||0, y2 = +el.getAttribute('y2')||0;
    return `M${x1},${y1} L${x2},${y2}`;
  }
  if (tag === 'polyline' || tag === 'polygon') {
    const pts = (el.getAttribute('points')||'').trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (pts.length < 4) return '';
    let d = `M${pts[0]},${pts[1]}`;
    for (let k = 2; k < pts.length - 1; k += 2) d += ` L${pts[k]},${pts[k+1]}`;
    if (tag === 'polygon') d += ' Z';
    return d;
  }
  return '';
}

// 6. STROKE → FILL
/**
 * Offset a 2D polygon contour outward by `delta` units.
 *
 * Coordinate system: SVG (Y points DOWN).
 * In SVG, a CCW polygon has POSITIVE signed area.
 * Outward normal for CCW polygon in SVG: rotate edge vector +90° (i.e. right-hand side).
 *
 * pts: array of [x, y], closed polygon (last point ≠ first)
 * delta: > 0 = expand outward for a CCW contour
 */
function offsetContour2D(pts, delta) {
  const n = pts.length;
  if (n < 3) return pts.slice();
  const result = [];

  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const curr = pts[i];
    const next = pts[(i + 1) % n];

    // Edge A: prev→curr, Edge B: curr→next
    const ax = curr[0] - prev[0], ay = curr[1] - prev[1];
    const bx = next[0] - curr[0], by = next[1] - curr[1];

    const la = Math.sqrt(ax*ax + ay*ay);
    const lb = Math.sqrt(bx*bx + by*by);
    if (la < 1e-10 || lb < 1e-10) { result.push([curr[0], curr[1]]); continue; }

    // Outward unit normals (for CCW polygon in SVG, outward = rotate edge CW = (+dy, -dx)/len)
    const nax =  ay / la,  nay = -ax / la;   // right-hand normal of edge A
    const nbx =  by / lb,  nby = -bx / lb;   // right-hand normal of edge B

    // Bisector of the two outward normals
    let bix = nax + nbx, biy = nay + nby;
    const blen = Math.sqrt(bix*bix + biy*biy);

    if (blen < 1e-10) {
      // Edges are anti-parallel (180° turn): just use normal of B
      result.push([curr[0] + nbx * delta, curr[1] + nby * delta]);
      continue;
    }
    bix /= blen; biy /= blen;

    // Miter scale: distance along bisector to reach offset distance `delta`
    const dot = nax * bix + nay * biy;          // cos(half-angle)
    const miter = Math.abs(dot) > 1e-4 ? delta / dot : delta;

    // Clamp miter at 2.5× delta – tighter limit reduces self-intersections on
    // sharp concave corners of curved letters (was 4×)
    const limit = Math.abs(delta) * 2.5;
    const clamped = Math.max(-limit, Math.min(limit, miter));

    result.push([curr[0] + bix * clamped, curr[1] + biy * clamped]);
  }
  return result;
}

/**
 * Build an SVG path string for a filled border ring around a glyph path.
 *
 * Strategy (correct, simple):
 *   - Parse every subpath into a point array
 *   - Classify each subpath as outer (positive signed area in SVG coords) or hole (negative)
 *   - Border path = [outer contours expanded by borderWidth] + [original outer contours reversed
 *     as holes] + [original hole contours unchanged as holes]
 *   - fill-rule="evenodd" on the resulting path produces only the outer ring.
 *
 * This means the border never enters the interior of letters (e.g. the hole in "O"),
 * never overlaps the glyph fill, and never spills into adjacent characters.
 */
function buildBorderPathD(pathD, borderWidth) {
  if (!borderWidth || borderWidth <= 0) return null;

  const segs = pathToAbsoluteSegments(pathD);
  if (!segs.length) return null;

  // ── 1. Discretise each subpath into a flat point array ──────────────────
  const BEZIER_STEPS = 16;
  const subpaths = [];
  let current = [];
  let cx = 0, cy = 0, startX = 0, startY = 0;

  for (const s of segs) {
    if (s.cmd === 'M') {
      if (current.length >= 3) subpaths.push(current);
      current = [[s.x, s.y]];
      cx = startX = s.x; cy = startY = s.y;
    } else if (s.cmd === 'L') {
      current.push([s.x, s.y]); cx = s.x; cy = s.y;
    } else if (s.cmd === 'H') {
      current.push([s.x, cy]); cx = s.x;
    } else if (s.cmd === 'V') {
      current.push([cx, s.y]); cy = s.y;
    } else if (s.cmd === 'C') {
      for (let k = 1; k <= BEZIER_STEPS; k++) {
        const t = k / BEZIER_STEPS, mt = 1 - t;
        current.push([
          mt*mt*mt*cx + 3*mt*mt*t*s.x1 + 3*mt*t*t*s.x2 + t*t*t*s.x,
          mt*mt*mt*cy + 3*mt*mt*t*s.y1 + 3*mt*t*t*s.y2 + t*t*t*s.y
        ]);
      }
      cx = s.x; cy = s.y;
    } else if (s.cmd === 'Q') {
      for (let k = 1; k <= BEZIER_STEPS; k++) {
        const t = k / BEZIER_STEPS, mt = 1 - t;
        current.push([
          mt*mt*cx + 2*mt*t*s.x1 + t*t*s.x,
          mt*mt*cy + 2*mt*t*s.y1 + t*t*s.y
        ]);
      }
      cx = s.x; cy = s.y;
    } else if (s.cmd === 'Z') {
      // Remove last point if it duplicates the start (common in font paths)
      if (current.length > 1) {
        const last = current[current.length - 1];
        const dx = last[0] - current[0][0], dy = last[1] - current[0][1];
        if (Math.sqrt(dx*dx + dy*dy) < 0.5) current.pop();
      }
      if (current.length >= 3) subpaths.push(current);
      current = [];
      cx = startX; cy = startY;
    }
  }
  if (current.length >= 3) subpaths.push(current);
  if (!subpaths.length) return null;

  // ── 2. Signed area: positive = CCW winding (outer in SVG), negative = CW (hole) ──
  function signedArea(pts) {
    let a = 0;
    for (let i = 0, n = pts.length; i < n; i++) {
      const j = (i + 1) % n;
      a += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
    }
    return a / 2;
  }

  // ── 3. Remove duplicate / near-duplicate consecutive points ──────────────
  function dedupe(pts) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i][0] - out[out.length-1][0];
      const dy = pts[i][1] - out[out.length-1][1];
      if (Math.sqrt(dx*dx + dy*dy) > 0.1) out.push(pts[i]);
    }
    return out;
  }

  // ── 4. Convert point array back to a closed SVG subpath string ───────────
  function ptsToD(pts) {
    if (pts.length < 3) return '';
    let d = `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`;
    for (let k = 1; k < pts.length; k++) d += ` L${pts[k][0].toFixed(2)},${pts[k][1].toFixed(2)}`;
    return d + ' Z';
  }

  // ── 5. Classify subpaths ─────────────────────────────────────────────────
  const outers = [];  // positive area = CCW = outer fill
  const holes  = [];  // negative area = CW  = counter-clockwise holes

  for (const raw of subpaths) {
    const pts = dedupe(raw);
    if (pts.length < 3) continue;
    const area = signedArea(pts);
    if (area >= 0) outers.push(pts);
    else           holes.push(pts);
  }

  if (!outers.length) return null;

  // ── 6. Build the border path ─────────────────────────────────────────────
  //
  // Border path consists of, concatenated with evenodd fill:
  //   A) Each outer contour expanded outward by borderWidth  (the outer ring face)
  //   B) Each original outer contour reversed (CW = hole punched through the ring)
  //   C) Each original hole contour as-is (CW, already punches through if covered)
  //
  // With fill-rule="evenodd":
  //   - Region between expanded-outer and original-outer → filled (border ring)
  //   - Region inside original-outer → cancelled by (B) → transparent = letter shows through
  //   - Holes in the letter → (C) keeps them transparent

  let borderD = '';

  for (const pts of outers) {
    // Expand outward
    const expanded = offsetContour2D(pts, borderWidth);
    if (expanded.length < 3) continue;
    borderD += ptsToD(expanded);          // outer ring (CCW, positive area)
    borderD += ptsToD([...pts].reverse()); // hole = original reversed → CW
  }

  // Original holes: keep them as-is (CW), they cancel any fill that might bleed in
  for (const pts of holes) {
    borderD += ptsToD(pts);
  }

  return borderD || null;
}

function strokeToFillPath(segs, strokeWidth) {
  const hw = strokeWidth / 2;
  const pts = [];
  let lastX = 0, lastY = 0;
  for (const s of segs) {
    if (s.cmd === 'M' || s.cmd === 'L') { pts.push([s.x, s.y]); lastX = s.x; lastY = s.y; }
    else if (s.cmd === 'C') {
      for (let t = 0; t <= 1; t += 0.125) {
        const mt = 1 - t;
        const x = mt*mt*mt*lastX + 3*mt*mt*t*s.x1 + 3*mt*t*t*s.x2 + t*t*t*s.x;
        const y = mt*mt*mt*lastY + 3*mt*mt*t*s.y1 + 3*mt*t*t*s.y2 + t*t*t*s.y;
        pts.push([x, y]);
      }
      lastX = s.x; lastY = s.y;
    } else if (s.cmd === 'Q') {
      for (let t = 0; t <= 1; t += 0.125) {
        const mt = 1 - t;
        const x = mt*mt*lastX + 2*mt*t*s.x1 + t*t*s.x;
        const y = mt*mt*lastY + 2*mt*t*s.y1 + t*t*s.y;
        pts.push([x, y]);
      }
      lastX = s.x; lastY = s.y;
    }
  }
  if (pts.length < 2) return null;

  function norm(ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const len = Math.sqrt(dx*dx+dy*dy);
    if (!len) return [0, 0];
    return [-dy/len, dx/len];
  }

  const side1 = [], side2 = [];
  for (let k = 0; k < pts.length; k++) {
    let nx, ny;
    if (k === pts.length - 1) { [nx, ny] = norm(pts[k-1][0], pts[k-1][1], pts[k][0], pts[k][1]); }
    else { [nx, ny] = norm(pts[k][0], pts[k][1], pts[k+1][0], pts[k+1][1]); }
    side1.push([pts[k][0] + nx*hw, pts[k][1] + ny*hw]);
    side2.push([pts[k][0] - nx*hw, pts[k][1] - ny*hw]);
  }

  let d = `M${side1[0][0].toFixed(2)},${side1[0][1].toFixed(2)}`;
  for (let k = 1; k < side1.length; k++) d += ` L${side1[k][0].toFixed(2)},${side1[k][1].toFixed(2)}`;
  for (let k = side2.length - 1; k >= 0; k--) d += ` L${side2[k][0].toFixed(2)},${side2[k][1].toFixed(2)}`;
  d += ' Z';
  return d;
}

// 7. RACCOLTA RICORSIVA con matrice accumulata
function collectShapesV2(node, shapes, parentMatrix) {
  if (!node || node.nodeType !== 1) return;
  const tag = node.tagName.toLowerCase().replace(/^svg:/,'');
  const skip = ['defs','style','title','desc','metadata','symbol','clippath','mask',
                'filter','lineargradient','radialgradient','pattern','use','script'];
  if (skip.includes(tag)) return;

  const myTfStr = node.getAttribute ? (node.getAttribute('transform') || '') : '';
  const myMatrix = myTfStr ? parseTransformToMatrix(myTfStr) : new DOMMatrix();
  const accMatrix = parentMatrix.multiply(myMatrix);

  const leafTags = ['path','rect','circle','ellipse','line','polyline','polygon'];
  if (leafTags.includes(tag)) {
    const rawD = svgElToPathD(node);
    if (!rawD) return;

    const style = node.getAttribute('style') || '';
    const getAttr = (attr, cssName) => {
      const cssMatch = style.match(new RegExp(cssName + '\\s*:\\s*([^;]+)', 'i'));
      if (cssMatch) return cssMatch[1].trim();
      return node.getAttribute(attr) || null;
    };
    const fill = getAttr('fill', 'fill');
    const stroke = getAttr('stroke', 'stroke');
    const strokeWidth = parseFloat(getAttr('stroke-width', 'stroke-width') || '1');
    const display = getAttr('display', 'display');
    const visibility = getAttr('visibility', 'visibility');

    if (display === 'none' || visibility === 'hidden') return;

    shapes.push({ rawD, matrix: accMatrix, fill, stroke, strokeWidth });
    return;
  }

  Array.from(node.childNodes || []).forEach(child => {
    collectShapesV2(child, shapes, accMatrix);
  });
}

// 8. CONVERTI SEGMENTI → STRINGA PATH pulita
function segsToPathD(segs) {
  return segs.map(s => {
    if (s.cmd === 'Z') return 'Z';
    const r = n => parseFloat(n.toFixed(3));
    if (s.cmd === 'M') return `M${r(s.x)},${r(s.y)}`;
    if (s.cmd === 'L') return `L${r(s.x)},${r(s.y)}`;
    if (s.cmd === 'C') return `C${r(s.x1)},${r(s.y1)} ${r(s.x2)},${r(s.y2)} ${r(s.x)},${r(s.y)}`;
    if (s.cmd === 'Q') return `Q${r(s.x1)},${r(s.y1)} ${r(s.x)},${r(s.y)}`;
    return '';
  }).filter(Boolean).join(' ');
}

// 9. CALCOLA BOUNDING BOX tramite DOM
function calcRealBBox(pathD) {
  const tmpSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  tmpSvg.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;visibility:hidden;pointer-events:none';
  document.body.appendChild(tmpSvg);
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', pathD);
  tmpSvg.appendChild(p);
  let bbox;
  try { bbox = p.getBBox(); } catch(e) { bbox = {x:0, y:0, width:0, height:0}; }
  tmpSvg.remove();
  return bbox;
}

// 10. SCALA path
function scaleSegs(segs, scale) {
  return segs.map(s => {
    if (s.cmd === 'Z') return { cmd: 'Z' };
    const sc = v => v * scale;
    if (s.cmd === 'M') return { cmd: 'M', x: sc(s.x), y: sc(s.y) };
    if (s.cmd === 'L') return { cmd: 'L', x: sc(s.x), y: sc(s.y) };
    if (s.cmd === 'C') return { cmd: 'C', x1: sc(s.x1), y1: sc(s.y1), x2: sc(s.x2), y2: sc(s.y2), x: sc(s.x), y: sc(s.y) };
    if (s.cmd === 'Q') return { cmd: 'Q', x1: sc(s.x1), y1: sc(s.y1), x: sc(s.x), y: sc(s.y) };
    return s;
  });
}

// 11. TRASLA path
function translateSegs(segs, dx, dy) {
  return segs.map(s => {
    if (s.cmd === 'Z') return { cmd: 'Z' };
    const tr = (x, y) => ({ x: x + dx, y: y + dy });
    if (s.cmd === 'M') { const p = tr(s.x, s.y); return { cmd: 'M', x: p.x, y: p.y }; }
    if (s.cmd === 'L') { const p = tr(s.x, s.y); return { cmd: 'L', x: p.x, y: p.y }; }
    if (s.cmd === 'C') {
      const p1 = tr(s.x1, s.y1), p2 = tr(s.x2, s.y2), p = tr(s.x, s.y);
      return { cmd: 'C', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, x: p.x, y: p.y };
    }
    if (s.cmd === 'Q') {
      const p1 = tr(s.x1, s.y1), p = tr(s.x, s.y);
      return { cmd: 'Q', x1: p1.x, y1: p1.y, x: p.x, y: p.y };
    }
    return s;
  });
}

// 12. PIPELINE PRINCIPALE: importSVGs drag & drop (Singolo/multiplo su canvas)
function importSVGs(files) {
  Array.from(files).forEach(f => {
    if (!f.name.toLowerCase().endsWith('.svg')) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const content = ev.target.result;
        const parser = new DOMParser();
        const doc = parser.parseFromString(content, 'image/svg+xml');

        const parseErr = doc.querySelector('parsererror');
        if (parseErr) { toast(`SVG non valido: ${f.name}`); return; }

        const svgRoot = doc.querySelector('svg');
        if (!svgRoot) { toast(`SVG non valido: ${f.name}`); return; }

        let vbX = 0, vbY = 0;
        const vb = svgRoot.getAttribute('viewBox');
        if (vb) {
          const vp = vb.trim().split(/[\s,]+/).map(Number);
          vbX = vp[0]||0; vbY = vp[1]||0;
        }
        const rootMatrix = new DOMMatrix().translate(-vbX, -vbY);

        const shapes = [];
        collectShapesV2(svgRoot, shapes, rootMatrix);

        if (!shapes.length) { toast(`Nessuna geometria trovata in ${f.name}`); return; }

        let allSegs = [];
        let strokeShapesD = [];

        shapes.forEach(sh => {
          const segs = pathToAbsoluteSegments(sh.rawD);
          if (!segs.length) return;

          const transformedSegs = applyMatrixToSegs(segs, sh.matrix);
          const hasFill = sh.fill && sh.fill !== 'none' && sh.fill !== '';
          const hasStroke = sh.stroke && sh.stroke !== 'none' && sh.stroke !== '' && sh.strokeWidth > 0;

          if (hasFill || !hasStroke) {
            allSegs.push(...transformedSegs);
          }

          if (hasStroke) {
            const sw = sh.strokeWidth;
            const strokeD = strokeToFillPath(transformedSegs, sw);
            if (strokeD) strokeShapesD.push(strokeD);
          }
        });

        if (strokeShapesD.length) {
          strokeShapesD.forEach(d => {
            const segs = pathToAbsoluteSegments(d);
            allSegs.push(...segs);
          });
        }

        if (!allSegs.length) { toast(`Geometria vuota dopo processing: ${f.name}`); return; }

        // Calcola il bounding box REALE dal contenuto, non dagli attributi SVG
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        allSegs.forEach(s => {
          if (s.x !== undefined) { minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); }
          if (s.y !== undefined) { minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y); }
          if (s.x1 !== undefined) { minX = Math.min(minX, s.x1); maxX = Math.max(maxX, s.x1); }
          if (s.y1 !== undefined) { minY = Math.min(minY, s.y1); maxY = Math.max(maxY, s.y1); }
          if (s.x2 !== undefined) { minX = Math.min(minX, s.x2); maxX = Math.max(maxX, s.x2); }
          if (s.y2 !== undefined) { minY = Math.min(minY, s.y2); maxY = Math.max(maxY, s.y2); }
        });

        if (minX === Infinity) { minX = 0; minY = 0; maxX = 100; maxY = 100; }

        const realW = Math.max(maxX - minX, 1);
        const realH = Math.max(maxY - minY, 1);

        // Normalizza il path a una dimensione fissa (targetSize) così sx=1 all'import
        // e l'utente vede sempre valori sensati nel pannello scala
        const targetSize = Math.min(S.canvasW, S.canvasH) * 0.20;
        const normScale = targetSize / Math.max(realW, realH);

        const centeredSegs = translateSegs(allSegs, -minX, -minY);
        const normalizedSegs = scaleSegs(centeredSegs, normScale);
        const centeredD = segsToPathD(normalizedSegs);

        const objW = realW * normScale;
        const objH = realH * normScale;

        const canvasCX = S.canvasW / 2;
        const canvasCY = S.canvasH / 2;

        const baseName = f.name.replace(/\.svg$/i, '');

        S.letters.push({
          id: uid++,
          ch: baseName,
          x: canvasCX,
          y: canvasCY,
          originalX: canvasCX,
          originalY: canvasCY,
          fontSize: 100,
          fill: '#111111',
          fontFamily: 'sans-serif',
          fontName: baseName,
          sx: 1, sy: 1, rot: 0, skew: 0, op: 1,
          customPath: centeredD,
          isSvgImport: true,
          svgW: objW,
          svgH: objH,
          _bbox: { x: 0, y: 0, w: objW, h: objH },
          _shapes: shapes.length,
          layer: 2
        });

        render(); upd(); saveState();
        toast(`SVG "${baseName}" ✓ — ${shapes.length} forme → path unificato (${Math.round(objW)}×${Math.round(objH)}px)`);

      } catch(err) {
        console.error('SVG import error:', err);
        toast(`Errore importazione: ${f.name}`);
      }
    };
    reader.readAsText(f);
  });
}

document.getElementById('svgfi').addEventListener('change',function(){importSVGs(this.files);this.value='';});

function addText(){
  const txt=document.getElementById('ti').value;
  if(!txt.trim())return;
  const fs=+document.getElementById('fsize').value||80;
  const fcolDot=document.getElementById('fcol-dot');
  let fill=fcolDot?fcolDot.style.background:'#111111';
  // Normalize rgb(...) → #hex
  if(fill.startsWith('rgb')){const m=fill.match(/\d+/g);if(m&&m.length>=3)fill='#'+[+m[0],+m[1],+m[2]].map(c=>c.toString(16).padStart(2,'0')).join('');}
  const fontList=S.selectedFonts.size>0?[...S.selectedFonts]:(S.curFont?[S.curFont]:[]);
  if(!fontList.length){toast('Seleziona almeno un font dalla lista a sinistra!');return;}
  const ctx=document.getElementById('dc').getContext('2d');
  const lh=fs*1.4;
  const padding=60;
  const maxTextWidth=S.canvasW-padding*2;

  // Calcola le righe necessarie per ogni font
  const linesPerFont=[];
  fontList.forEach((fontName,fi)=>{
    const css=S.fonts[fontName]||'sans-serif';
    ctx.font=`${fs}px ${css}`;

    // Suddividi il testo in righe che entrano nella larghezza del canvas
    const lines=[];
    let currentLine='';
    let currentWidth=0;

    for(const ch of txt){
      const chWidth=ctx.measureText(ch).width;
      if(currentWidth+chWidth>maxTextWidth && currentLine.length>0){
        lines.push(currentLine);
        currentLine=ch;
        currentWidth=chWidth;
      }else{
        currentLine+=ch;
        currentWidth+=chWidth;
      }
    }
    if(currentLine.length>0) lines.push(currentLine);

    linesPerFont.push({fontName,css,lines});
  });

  // Calcola l'altezza totale necessaria
  const totalLines=linesPerFont.reduce((sum,lf)=>sum+lf.lines.length,0);
  const neededHeight=totalLines*lh+padding*2;

  // Se necessario, aumenta l'altezza del canvas
  if(neededHeight>S.canvasH){
    const newHeight=Math.ceil(neededHeight/50)*50; // Arrotonda a multipli di 50
    S.canvasH=newHeight;
    document.getElementById('cvH').value=newHeight;
    applySize();
  }

  // Posiziona il testo centrato verticalmente
  const startY=(S.canvasH/2)-(totalLines*lh/2)+(fs*0.8);

  // Aggiungi le lettere al canvas
  let currentLineIndex=0;
  linesPerFont.forEach((lf,fi)=>{
    ctx.font=`${fs}px ${lf.css}`;
    lf.lines.forEach((line,lineIndex)=>{
      const y=startY+currentLineIndex*lh;
      currentLineIndex++;
      // Calcola la larghezza della riga per centrarla
      const lineWidth=ctx.measureText(line).width;
      let x=S.canvasW/2; // Inizia dal centro

      for(const ch of line){
        const w=ctx.measureText(ch).width;
        S.letters.push({id:uid++,ch,x:x-(lineWidth/2)+w/2,y,fontSize:fs,fill,fontFamily:lf.css,fontName:lf.fontName,sx:1,sy:1,rot:0,skew:0,op:1,borderWidth:0,borderColor:'#000000',layer:2});
        x+=w+fs*0.05;
      }
    });
  });

  render();upd();saveState();
  toast(`Testo aggiunto con ${fontList.length} font su ${totalLines} righe ✓`);

  // Scroll to top to ensure toolbar is visible
  const cw=document.getElementById('cw');
  if(cw) cw.scrollTop=0;
}

function render(){
  const ll=document.getElementById('ll');
  ll.innerHTML='';
  const ctx=document.getElementById('dc').getContext('2d');

  // Ordina gli indici per layer (1=sotto, 3=sopra)
  const sortedIndices = S.letters.map((l, i) => i).sort((a, b) => (S.letters[a].layer || 2) - (S.letters[b].layer || 2));

  // PASSATA 1: tutti i bordi (layer sotto tutte le lettere)
  sortedIndices.forEach(i => {
    const l = S.letters[i];
    if (l.isSTL) return;
    if(!l.borderWidth || l.borderWidth <= 0) return;

    ctx.font=`${l.fontSize}px ${l.fontFamily}`;
    const mw = l.isGroup ? l.groupW : ctx.measureText(l.ch).width;

    let tf=`translate(${l.x},${l.y})`;
    if(l.rot)tf+=` rotate(${l.rot})`;
    if(l.sx!==1||l.sy!==1)tf+=` scale(${l.sx},${l.sy})`;
    if(l.skew)tf+=` skewX(${l.skew})`;
    tf+=` translate(${-l.x},${-l.y})`;

    const displayBorder = S.sel.has(i) ? '#88cc00' : l.borderColor;

    const bg=document.createElementNS('http://www.w3.org/2000/svg','g');
    bg.setAttribute('transform',tf);
    bg.setAttribute('opacity',l.op);
    bg.setAttribute('class','lg-border');

    let bel;
    if(l.isGroup && l.groupHTML){
      bel=document.createElementNS('http://www.w3.org/2000/svg','g');
      bel.innerHTML=l.groupHTML;
      bel.setAttribute('transform',`translate(${l.x-(l.originalX||l.x)},${l.y-(l.originalY||l.y)})`);
      bel.querySelectorAll('path').forEach(p=>{
        p.setAttribute('fill',displayBorder);
        p.setAttribute('stroke',displayBorder);
        p.setAttribute('stroke-width',l.borderWidth*2);
        p.setAttribute('stroke-linejoin','round');
        p.setAttribute('stroke-linecap','round');
        p.style.paintOrder='stroke fill';
      });
    } else if(l.customPath){
      bel=document.createElementNS('http://www.w3.org/2000/svg','path');
      bel.setAttribute('d',l.customPath);
      bel.setAttribute('fill',displayBorder);
      bel.setAttribute('stroke',displayBorder);
      bel.setAttribute('stroke-width',l.borderWidth*2);
      bel.setAttribute('stroke-linejoin','round');
      bel.setAttribute('stroke-linecap','round');
      bel.style.paintOrder='stroke fill';
      const innerX=l.isSvgImport?l.x-(l.svgW||mw)/2:l.x-mw/2;
      bel.setAttribute('transform',`translate(${innerX},${l.y})`);
    } else if(S.openFonts[l.fontName]){
      const d=S.openFonts[l.fontName].getPath(l.ch,0,0,l.fontSize).toPathData(4);
      bel=document.createElementNS('http://www.w3.org/2000/svg','path');
      bel.setAttribute('d',d);
      bel.setAttribute('fill',displayBorder);
      bel.setAttribute('stroke',displayBorder);
      bel.setAttribute('stroke-width',l.borderWidth*2);
      bel.setAttribute('stroke-linejoin','round');
      bel.setAttribute('stroke-linecap','round');
      bel.style.paintOrder='stroke fill';
      bel.setAttribute('transform',`translate(${l.x-mw/2},${l.y})`);
    } else {
      bel=document.createElementNS('http://www.w3.org/2000/svg','text');
      bel.setAttribute('x',l.x);bel.setAttribute('y',l.y);
      bel.setAttribute('font-family',l.fontFamily);bel.setAttribute('font-size',l.fontSize);
      bel.setAttribute('fill',displayBorder);bel.setAttribute('text-anchor','middle');
      bel.setAttribute('dominant-baseline','auto');bel.textContent=l.ch;
      bel.setAttribute('stroke',displayBorder);
      bel.setAttribute('stroke-width',l.borderWidth*2);
      bel.setAttribute('stroke-linejoin','round');
      bel.setAttribute('stroke-linecap','round');
      bel.style.paintOrder='stroke fill';
    }
    bg.appendChild(bel);
    ll.appendChild(bg);
  });

  // PASSATA 2: tutte le lettere (sopra tutti i bordi)
  sortedIndices.forEach(i => {
    const l = S.letters[i];

    if (l.isSTL) {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('transform', `translate(${l.x},${l.y})`);
      g.setAttribute('class', 'lg');
      g.setAttribute('data-i', i);
      g.addEventListener('mousedown', e => gmd(e, i));
      
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', -25); rect.setAttribute('y', -25);
      rect.setAttribute('width', 50); rect.setAttribute('height', 50);
      rect.setAttribute('rx', 8);
      rect.setAttribute('fill', S.sel.has(i) ? '#c8ff00' : (l.fill || '#111111'));
      rect.setAttribute('stroke', '#ffffff');
      rect.setAttribute('stroke-width', 2);
      g.appendChild(rect);
      
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'central');
      text.setAttribute('fill', '#ffffff');
      text.setAttribute('font-size', '10px');
      text.setAttribute('font-weight', 'bold');
      text.setAttribute('pointer-events', 'none');
      text.textContent = 'STL';
      g.appendChild(text);
      
      ll.appendChild(g);
      return;
    }

    ctx.font=`${l.fontSize}px ${l.fontFamily}`;
    const mw = l.isGroup ? l.groupW : ctx.measureText(l.ch).width;

    let tf=`translate(${l.x},${l.y})`;
    if(l.rot)tf+=` rotate(${l.rot})`;
    if(l.sx!==1||l.sy!==1)tf+=` scale(${l.sx},${l.sy})`;
    if(l.skew)tf+=` skewX(${l.skew})`;
    tf+=` translate(${-l.x},${-l.y})`;

    const displayFill = S.sel.has(i) ? '#c8ff00' : l.fill;

    const g=document.createElementNS('http://www.w3.org/2000/svg','g');
    g.setAttribute('transform',tf);g.setAttribute('opacity',l.op);
    g.setAttribute('class','lg');g.setAttribute('data-i',i);
    g.addEventListener('mousedown',e=>gmd(e,i));

    let el;
    if(l.isGroup){
      el=document.createElementNS('http://www.w3.org/2000/svg','g');
      el.innerHTML=l.groupHTML;
      el.style.color=displayFill;
      el.setAttribute('transform',`translate(${l.x-(l.originalX||l.x)},${l.y-(l.originalY||l.y)})`);
    } else if(l.customPath){
      el=document.createElementNS('http://www.w3.org/2000/svg','path');
      el.setAttribute('d',l.customPath);el.setAttribute('fill',displayFill);
      const innerX=l.isSvgImport?l.x-(l.svgW||mw)/2:l.x-mw/2;
      el.setAttribute('transform',`translate(${innerX},${l.y})`);
    } else if(S.openFonts[l.fontName]){
      const d=S.openFonts[l.fontName].getPath(l.ch,0,0,l.fontSize).toPathData(4);
      el=document.createElementNS('http://www.w3.org/2000/svg','path');
      el.setAttribute('d',d);el.setAttribute('fill',displayFill);
      el.setAttribute('transform',`translate(${l.x-mw/2},${l.y})`);
    } else {
      el=document.createElementNS('http://www.w3.org/2000/svg','text');
      el.setAttribute('x',l.x);el.setAttribute('y',l.y);
      el.setAttribute('font-family',l.fontFamily);el.setAttribute('font-size',l.fontSize);
      el.setAttribute('fill',displayFill);el.setAttribute('text-anchor','middle');
      el.setAttribute('dominant-baseline','auto');el.textContent=l.ch;
    }
    g.appendChild(el);
    ll.appendChild(g);
  });
  renderHandles();
}

function getLetterBBoxTransformed(i){
  const node = document.querySelector(`g.lg[data-i="${i}"]`);
  if(!node) return null;
  try {
    const svgEl = document.getElementById('svg');
    const ctm = svgEl.getScreenCTM().inverse();
    const rect = node.getBoundingClientRect();
    const corners = [
      {x: rect.left,  y: rect.top},
      {x: rect.right, y: rect.top},
      {x: rect.right, y: rect.bottom},
      {x: rect.left,  y: rect.bottom},
    ].map(c => {
      const pt = svgEl.createSVGPoint();
      pt.x = c.x; pt.y = c.y;
      return pt.matrixTransform(ctm);
    });
    const xs = corners.map(p=>p.x), ys = corners.map(p=>p.y);
    return {
      x: Math.min(...xs), y: Math.min(...ys),
      x2: Math.max(...xs), y2: Math.max(...ys),
      w: Math.max(...xs)-Math.min(...xs),
      h: Math.max(...ys)-Math.min(...ys),
      cx: (Math.min(...xs)+Math.max(...xs))/2,
      cy: (Math.min(...ys)+Math.max(...ys))/2,
    };
  } catch(e){ return null; }
}

// Calcola il bounding box combinato di tutti gli elementi selezionati
// Se un elemento fa parte di un gruppo, include tutto il gruppo
function getGroupBBox(){
  const sel = [...S.sel];
  if(sel.length === 0) return null;
  
  // Espandi la selezione per includere interi gruppi
  const expandedSel = new Set();
  sel.forEach(i => {
    const indices = getGroupIndices(i);
    indices.forEach(idx => expandedSel.add(idx));
  });
  
  const expandedArr = [...expandedSel];
  if(expandedArr.length === 1) return getLetterBBoxTransformed(expandedArr[0]);

  const bboxes = expandedArr.map(i => getLetterBBoxTransformed(i)).filter(b => b !== null);
  if(bboxes.length === 0) return null;

  const x = Math.min(...bboxes.map(b => b.x));
  const y = Math.min(...bboxes.map(b => b.y));
  const x2 = Math.max(...bboxes.map(b => b.x2));
  const y2 = Math.max(...bboxes.map(b => b.y2));

  return {
    x, y, x2, y2,
    w: x2 - x,
    h: y2 - y,
    cx: (x + x2) / 2,
    cy: (y + y2) / 2
  };
}

// Applica una trasformazione a tutti gli elementi selezionati come un gruppo
function renderHandles(){
  const layer=document.getElementById('handles-layer');
  layer.innerHTML='';
  if(S.sel.size === 0) return;

  // Usa il bounding box del gruppo per selezioni multiple
  const bb = getGroupBBox();
  if(!bb) return;

  const PAD = 10;
  const bx = bb.x - PAD;
  const by = bb.y - PAD;
  const bx2 = bb.x2 + PAD;
  const by2 = bb.y2 + PAD;
  const bcx = (bx+bx2)/2;
  const bcy = (by+by2)/2;

  // Durante la rotazione, non disegnare il bounding box border
  if(!S.rotating){
    const border = document.createElementNS('http://www.w3.org/2000/svg','rect');
    border.setAttribute('x', bx); border.setAttribute('y', by);
    border.setAttribute('width', bx2-bx); border.setAttribute('height', by2-by);
    border.setAttribute('fill','none');
    border.setAttribute('stroke','rgba(200,255,0,0.45)');
    border.setAttribute('stroke-width','1');
    border.setAttribute('rx','3');border.setAttribute('ry','3');
    border.setAttribute('pointer-events','none');
    layer.appendChild(border);
  }

  // Crea handle per selezione singola O multipla
  // Per multi-selezione, usiamo un elemento fittizio per gli eventi
  const firstIdx = [...S.sel][0];
  const mk=(tx,ty,d,axis,dir,cursor='pointer', rotTransform=null)=>{
    const g=document.createElementNS('http://www.w3.org/2000/svg','g');
    let transform = `translate(${tx},${ty})`;
    if(rotTransform) transform += ` ${rotTransform}`;
    g.setAttribute('transform', transform);
    g.setAttribute('class','lg-handle');
    g.setAttribute('style',`cursor:${cursor}`);
    g.addEventListener('mousedown',e=>handleMd(e,firstIdx,axis,dir));
    g.innerHTML=`
      <circle cx="0" cy="0" r="10" fill="#1e1e2e" stroke="#c8ff00" stroke-width="1.5"/>
      <path d="${d}" stroke="#c8ff00" stroke-width="2" fill="none"
            stroke-linecap="round" stroke-linejoin="round"/>
    `;
    layer.appendChild(g);
  };

  // Durante la rotazione, mostra SOLO il controllo di rotazione che ruota con l'oggetto
  if(S.rotating && S.rotHandleDistance !== null && S.ds){
    // Usa il centro di rotazione salvato (fisso durante la rotazione)
    const rotCenterX = S.ds.centerX;
    const rotCenterY = S.ds.centerY;
    
    // Ottieni la rotazione corrente del primo elemento selezionato
    const currentRot = S.letters[firstIdx]?.rot || 0;
    
    // Calcola l'angolo corrente: angolo iniziale + rotazione attuale
    const currentAngle = (S.rotHandleAngle + currentRot) * Math.PI / 180;
    
    // Calcola la posizione sulla circonferenza
    const rotatedX = rotCenterX + Math.cos(currentAngle) * S.rotHandleDistance;
    const rotatedY = rotCenterY + Math.sin(currentAngle) * S.rotHandleDistance;
    
    // Crea il controllo con rotazione opposta per mantenere l'icona orientata correttamente
    mk(rotatedX, rotatedY, `M0,5 A5,5 0 1 1 5,-1 M5,-1 L3.3,-2.0 M5,-1 L5.5,-3.2`, 'rot', -1, 'crosshair', `rotate(${-currentRot})`);
    return; // Esci dopo aver creato solo il controllo di rotazione
  }

  const OFFSET = 18;
  mk(bx - OFFSET, bcy, `M-3,-1.8 L-6.9,0 L-3,1.8 M-6.9,0 L7,0`, 'x', -1, 'ew-resize');
  mk(bx2 + OFFSET, bcy, `M3,-1.8 L6.9,0 L3,1.8 M6.9,0 L-7,0`, 'x', 1, 'ew-resize');
  mk(bcx, by - OFFSET, `M-1.8,-3 L0,-6.9 L1.8,-3 M0,-6.9 L0,7`, 'y', -1, 'ns-resize');
  mk(bcx, by2 + OFFSET, `M-1.8,3 L0,6.9 L1.8,3 M0,6.9 L0,-7`, 'y', 1, 'ns-resize');
  mk(bx2 + OFFSET*0.8, by - OFFSET*0.8, `M-5,5 L5,-5 M1,-5 L5,-5 L5,-1`, 'diag', 1, 'nesw-resize');
  // Handle rotazione — in alto a sinistra, icona ad arco con freccia
  mk(bx - OFFSET*0.8, by - OFFSET*0.8, `M0,5 A5,5 0 1 1 5,-1 M5,-1 L3.3,-2.0 M5,-1 L5.5,-3.2`, 'rot', -1, 'crosshair');
}

function updateBottomOffsets() {
  S.bottomOffsets = S.letters.map((l, i) => {
    const bbox = getLetterBBoxTransformed(i);
    return bbox ? (bbox.y2 - l.y) : 0;
  });
}

function handleMd(e,i,axis,dir){
  e.stopPropagation();
  // NON modificare la selezione - preservare quella corrente
  // La selezione è già stata fatta quando si è cliccato sull'elemento

  const p=pt(e);
  S.dragging=true;
  updateBottomOffsets();

  // Calcola il centro di rotazione corretto
  // Per singolo elemento: usa la posizione dell'elemento (x, y)
  // Per multi-selezione: usa il centro del bounding box del gruppo
  let centerX, centerY;
  if(S.sel.size === 1){
    const l = S.letters[i];
    centerX = l.x;
    centerY = l.y;
  } else {
    const groupBBox = getGroupBBox();
    centerX = groupBBox ? groupBBox.cx : S.letters[i].x;
    centerY = groupBBox ? groupBBox.cy : S.letters[i].y;
  }

  if(axis === 'rot'){
    S.rotating = true; // Inizia rotazione
    S.dragType = 'handle-rot';
    const l = S.letters[i];

    // Calcola la distanza effettiva dal centro al mouse
    // Questo assicura che il controllo rimanga esattamente dove l'utente ha cliccato
    const dx = p.x - centerX;
    const dy = p.y - centerY;
    S.rotHandleDistance = Math.sqrt(dx * dx + dy * dy);

    const startAngle = Math.atan2(dy, dx) * 180 / Math.PI;
    S.rotHandleAngle = startAngle;

    S.ds = {
      centerX,
      centerY,
      startAngle,
      startRot: l.rot,
      // Per multi-select, salva le posizioni originali di tutti gli elementi
      origPositions: Array.from(S.sel).map(idx => ({ idx, x: S.letters[idx].x, y: S.letters[idx].y, rot: S.letters[idx].rot }))
    };
  } else if(axis === 'diag'){
    S.dragType = 'handle-diag';
    const l = S.letters[i];
    const startDist = Math.sqrt(Math.pow(p.x - centerX, 2) + Math.pow(p.y - centerY, 2));
    // Per multi-select, salva il centro del gruppo e le posizioni originali
    S.ds = {
      x: p.x, y: p.y,
      sx: l.sx, sy: l.sy,
      centerX, centerY,
      startDist: Math.max(startDist, 1),
      groupCx: centerX,
      groupCy: centerY,
      // Salva le posizioni originali per tutti gli elementi selezionati
      origPositions: Array.from(S.sel).map(idx => ({ idx, x: S.letters[idx].x, y: S.letters[idx].y, sx: S.letters[idx].sx, sy: S.letters[idx].sy }))
    };
  } else if(axis === 'x' || axis === 'y'){
    S.dragType = `handle-${axis}`;
    // Per multi-select, salva le posizioni originali
    S.ds = {
      x: p.x,
      y: p.y,
      origPositions: Array.from(S.sel).map(idx => ({ idx, x: S.letters[idx].x, y: S.letters[idx].y }))
    };
  } else {
    S.dragType = `handle-${axis}`;
    S.ds = { x: p.x, y: p.y };
  }

  S.dl=S.letters.map(l=>({x:l.x,y:l.y}));
  render();renderHandles();upd();saveState();
}

function gmd(e,i){
  if(e.target.closest('.lg-handle'))return;
  e.stopPropagation();

  // Se l'elemento fa parte di un gruppo, seleziona tutto il gruppo
  const elem = S.letters[i];
  if (elem && elem.groupId) {
    const groupIndices = getGroupIndices(i);
    if (e.shiftKey) {
      // Shift+Click: toggle selezione dell'intero gruppo
      const allSelected = groupIndices.every(idx => S.sel.has(idx));
      if (allSelected) {
        groupIndices.forEach(idx => S.sel.delete(idx));
      } else {
        groupIndices.forEach(idx => S.sel.add(idx));
      }
    } else {
      // Click normale: seleziona tutto il gruppo
      S.sel.clear();
      groupIndices.forEach(idx => S.sel.add(idx));
    }
  } else {
    // Elemento non raggruppato: comportamento normale
    if(e.shiftKey){
      S.sel.has(i)?S.sel.delete(i):S.sel.add(i);
    } else {
      if(!S.sel.has(i)){S.sel.clear();S.sel.add(i);}
    }
  }

  const p=pt(e);
  S.dragging=true;S.dragType='letter';S.ds={x:p.x,y:p.y};
  updateBottomOffsets();

  S.dl=S.letters.map(l=>({x:l.x,y:l.y}));
  render();renderHandles();upd();
  document.getElementById('svg').classList.add('dragging-letter');
  saveState();
}
function smd(e){
  // Non interrompere se l'utente sta digitando in un input
  const active = document.activeElement;
  if(active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
    // Non fare nulla se il click è avvenuto su un input
    return;
  }
  if(e.button === 2 || e.button === 1){
    e.preventDefault(); e.stopPropagation(); startPan(e); return;
  }
  if(e.target.closest('.lg') || e.target.closest('.svgobj') || e.target.closest('.lg-handle')) return;
  if(!e.shiftKey){ S.sel.clear(); }
  const p = pt(e);
  S.box = {on: true, x0: p.x, y0: p.y, additive: e.shiftKey};
  const sb = document.getElementById('sb');
  sb.setAttribute('x', p.x); sb.setAttribute('y', p.y);
  sb.setAttribute('width', 0); sb.setAttribute('height', 0);
  sb.style.display = 'block';
  render(); renderHandles(); upd();
}

function startPan(e){
  S.panning=true;
  const cw=document.getElementById('cw');
  S.panStart={x:e.clientX,y:e.clientY,scrollLeft:cw.scrollLeft,scrollTop:cw.scrollTop};
  cw.classList.add('panning');
}
function stopPan(){
  S.panning=false;
  const cw=document.getElementById('cw');
  cw.classList.remove('panning');
}

document.addEventListener('mousemove', e=>{
  if(S.panning){
    const cw=document.getElementById('cw');
    cw.scrollLeft = S.panStart.scrollLeft - (e.clientX - S.panStart.x);
    cw.scrollTop  = S.panStart.scrollTop  - (e.clientY - S.panStart.y);
    return;
  }

  if(S.box.on){
    const svg2=document.getElementById('svg');
    const svgPt2=svg2.createSVGPoint();
    svgPt2.x=e.clientX; svgPt2.y=e.clientY;
    const bp=svgPt2.matrixTransform(svg2.getScreenCTM().inverse());
    const x=Math.min(bp.x,S.box.x0), y=Math.min(bp.y,S.box.y0);
    const w=Math.abs(bp.x-S.box.x0), h=Math.abs(bp.y-S.box.y0);
    const sb=document.getElementById('sb');
    sb.setAttribute('x',x); sb.setAttribute('y',y); sb.setAttribute('width',w); sb.setAttribute('height',h);
    if(!S.box.additive) S.sel.clear();
    S.letters.forEach((l,i)=>{if(l.x>=x&&l.x<=x+w&&l.y>=y&&l.y<=y+h)S.sel.add(i);});
    render(); renderHandles();
    return;
  }

  if(!S.dragging) return;

  const svg=document.getElementById('svg');
  const svgPt=svg.createSVGPoint();
  svgPt.x=e.clientX; svgPt.y=e.clientY;
  const p=svgPt.matrixTransform(svg.getScreenCTM().inverse());

  const snapLine=document.getElementById('snap-line');
  snapLine.style.display='none';

  if(S.dragType==='letter' && S.sel.size>0){
    const dx=p.x-S.ds.x, dy=p.y-S.ds.y;
    
    // Espandi la selezione per includere interi gruppi
    const expandedSel = new Set();
    S.sel.forEach(idx => {
      getGroupIndices(idx).forEach(gIdx => expandedSel.add(gIdx));
    });
    const expandedArr = [...expandedSel];

    if(expandedArr.length === 1){
      // Singola selezione: logica esistente con snap
      const lIdx = expandedArr[0];
      let nx=S.dl[lIdx].x+dx, ny=S.dl[lIdx].y+dy;
      const lBottomOffset = S.bottomOffsets[lIdx] || 0;

      if(S.snapEnabled){
        for(let oIdx=0; oIdx<S.letters.length; oIdx++){
          if(expandedSel.has(oIdx)) continue;
          const o = S.letters[oIdx];
          const oBottomOffset = S.bottomOffsets[oIdx] || 0;
          const oBottom = o.y + oBottomOffset;
          
          if(Math.abs(oBottom - (ny + lBottomOffset)) < S.snapThreshold){
            ny = oBottom - lBottomOffset;
            break;
          }
        }
      }
      S.letters[lIdx].x=nx; S.letters[lIdx].y=ny;

      if(S.snapEnabled){
        const sel0=S.letters[lIdx];
        const cw=document.getElementById('cw');
        const ctm=svg.getScreenCTM();
        const selBottom = sel0.y + lBottomOffset;
        const screenY=ctm.f + selBottom * ctm.d;
        const cwRect=cw.getBoundingClientRect();
        const relY=screenY - cwRect.top + cw.scrollTop;
        let snapped=false;
        for(let oIdx=0; oIdx<S.letters.length; oIdx++){
          if(expandedSel.has(oIdx)) continue;
          const o = S.letters[oIdx];
          const oBottom = o.y + (S.bottomOffsets[oIdx] || 0);
          if(Math.abs(oBottom - selBottom) < S.snapThreshold){ snapped=true; break; }
        }
        if(snapped){ snapLine.style.top=relY+'px'; snapLine.style.display='block'; }
      }
    } else {
      // Selezione multipla/gruppo: muovi tutti gli elementi come un gruppo con snap
      const selArr = expandedArr;
      
      // Calcola il centro del gruppo dalle posizioni originali
      let groupCx = 0, groupCy = 0;
      selArr.forEach(i => {
        groupCx += S.dl[i].x;
        groupCy += S.dl[i].y;
      });
      groupCx /= selArr.length;
      groupCy /= selArr.length;

      // Calcola l'offset del fondo del gruppo rispetto al centro
      let groupBottomOffset = -Infinity;
      selArr.forEach(i => {
        const origOffsetY = S.dl[i].y - groupCy;
        const b = origOffsetY + (S.bottomOffsets[i] || 0);
        if(b > groupBottomOffset) groupBottomOffset = b;
      });

      // Calcola il nuovo centro dopo il drag
      let newGroupCx = groupCx + dx;
      let newGroupCy = groupCy + dy;

      // Snap del centro del gruppo
      let snappedY = null;
      let snappedX = null;
      
      if(S.snapEnabled){
        // Snap verticale: controlla se il fondo del gruppo è vicino al fondo di altri elementi
        for(let oIdx=0; oIdx<S.letters.length; oIdx++){
          if(expandedSel.has(oIdx)) continue;
          const o = S.letters[oIdx];
          const oBottom = o.y + (S.bottomOffsets[oIdx] || 0);
          
          if(Math.abs(oBottom - (newGroupCy + groupBottomOffset)) < S.snapThreshold){
            snappedY = oBottom - groupBottomOffset;
            break;
          }
        }

        if(snappedY === null){
          // Fallback allo snap del centro se richiesto, o restare solo sul fondo
          // La richiesta dice "principale", potremmo mantenere il centro come secondario
          for(let oIdx=0; oIdx<S.letters.length; oIdx++){
            if(expandedSel.has(oIdx)) continue;
            const o = S.letters[oIdx];
            if(Math.abs(o.y - newGroupCy) < S.snapThreshold){
              snappedY = o.y;
              break;
            }
          }
        }

        // Snap orizzontale
        for(let oIdx=0; oIdx<S.letters.length; oIdx++){
          if(expandedSel.has(oIdx)) continue;
          const o = S.letters[oIdx];
          if(Math.abs(o.x - newGroupCx) < S.snapThreshold){
            snappedX = o.x;
            break;
          }
        }
      }
      
      if(snappedY !== null) newGroupCy = snappedY;
      if(snappedX !== null) newGroupCx = snappedX;

      // Muovi ogni elemento mantenendo il suo offset relativo al centro
      selArr.forEach(i => {
        const origOffsetX = S.dl[i].x - groupCx;
        const origOffsetY = S.dl[i].y - groupCy;
        S.letters[i].x = newGroupCx + origOffsetX;
        S.letters[i].y = newGroupCy + origOffsetY;
      });
      
      // Mostra linea di snap se attivo
      if(S.snapEnabled && snappedY !== null){
        const cw=document.getElementById('cw');
        const ctm=svg.getScreenCTM();
        // Se abbiamo snappato sul fondo, mostra la linea sul fondo
        let lineY = newGroupCy;
        if (Math.abs(snappedY - (groupCy + dy)) > 0.1) { // Abbiamo snappato
           // Verifica se abbiamo snappato sul fondo
           for(let oIdx=0; oIdx<S.letters.length; oIdx++){
              if(expandedSel.has(oIdx)) continue;
              const oBottom = S.letters[oIdx].y + (S.bottomOffsets[oIdx] || 0);
              if(Math.abs(oBottom - (newGroupCy + groupBottomOffset)) < 0.1){
                lineY = newGroupCy + groupBottomOffset;
                break;
              }
           }
        }

        const screenY=ctm.f + lineY * ctm.d;
        const cwRect=cw.getBoundingClientRect();
        const relY=screenY - cwRect.top + cw.scrollTop;
        snapLine.style.top=relY+'px';
        snapLine.style.display='block';
      }
    }
    render(); renderHandles(); upd();
  }
  if(S.dragType==='handle-x'){
    const dx=p.x-S.ds.x;
    if(S.sel.size === 1){
      Array.from(S.sel).forEach(i=>S.letters[i].x=S.dl[i].x+dx);
    } else if(S.ds.origPositions){
      // Multi-select: muovi come gruppo orizzontalmente con snap
      let snapOffset = 0;
      if(S.snapEnabled && S.ds.origPositions.length > 0){
        // Calcola la nuova posizione del primo elemento per controllare lo snap
        const firstPos = S.ds.origPositions[0];
        const newX = firstPos.x + dx;
        // Controlla snap con altri elementi
        for(const o of S.letters.filter((_,idx)=>!S.sel.has(idx))){
          if(Math.abs(o.x - newX) < S.snapThreshold){
            snapOffset = o.x - firstPos.x;
            break;
          }
        }
      }
      
      S.ds.origPositions.forEach(origPos => {
        S.letters[origPos.idx].x = origPos.x + dx + snapOffset;
        S.letters[origPos.idx].y = origPos.y;
      });
    }
    render(); renderHandles(); upd();
  }
  if(S.dragType==='handle-y'){
    const dy=p.y-S.ds.y;
    if(S.sel.size === 1){
      const lIdx = Array.from(S.sel)[0];
      let ny = S.dl[lIdx].y + dy;
      const lBottomOffset = S.bottomOffsets[lIdx] || 0;
      let snapped = false;
      if(S.snapEnabled){
        for(let oIdx=0; oIdx<S.letters.length; oIdx++){
          if(S.sel.has(oIdx)) continue;
          const oBottom = S.letters[oIdx].y + (S.bottomOffsets[oIdx] || 0);
          if(Math.abs(oBottom - (ny + lBottomOffset)) < S.snapThreshold){
            ny = oBottom - lBottomOffset;
            snapped = true;
            break;
          }
        }
      }
      S.letters[lIdx].y = ny;

      if(S.snapEnabled && snapped){
        const cw=document.getElementById('cw');
        const ctm=svg.getScreenCTM();
        const screenY=ctm.f + (ny + lBottomOffset) * ctm.d;
        const cwRect=cw.getBoundingClientRect();
        const relY=screenY - cwRect.top + cw.scrollTop;
        snapLine.style.top=relY+'px';
        snapLine.style.display='block';
      }
    } else if(S.ds.origPositions){
      // Multi-select: muovi come gruppo verticalmente con snap
      let snapOffset = 0;
      let groupBottomOffset = -Infinity;
      let groupCy = 0;
      const selArr = S.ds.origPositions.map(p=>p.idx);
      selArr.forEach(idx => groupCy += S.dl[idx].y);
      groupCy /= selArr.length;

      selArr.forEach(idx => {
        const offY = S.dl[idx].y - groupCy;
        const b = offY + (S.bottomOffsets[idx] || 0);
        if(b > groupBottomOffset) groupBottomOffset = b;
      });

      let snapped = false;
      let snappedY = null;

      if(S.snapEnabled && S.ds.origPositions.length > 0){
        const currentGroupBottom = groupCy + dy + groupBottomOffset;
        for(let oIdx=0; oIdx<S.letters.length; oIdx++){
          if(S.sel.has(oIdx)) continue;
          const oBottom = S.letters[oIdx].y + (S.bottomOffsets[oIdx] || 0);
          if(Math.abs(oBottom - currentGroupBottom) < S.snapThreshold){
            snapOffset = oBottom - currentGroupBottom;
            snapped = true;
            snappedY = oBottom;
            break;
          }
        }
      }
      
      S.ds.origPositions.forEach(origPos => {
        S.letters[origPos.idx].y = origPos.y + dy + snapOffset;
        S.letters[origPos.idx].x = origPos.x;
      });

      if(S.snapEnabled && snapped){
        const cw=document.getElementById('cw');
        const ctm=svg.getScreenCTM();
        const screenY=ctm.f + snappedY * ctm.d;
        const cwRect=cw.getBoundingClientRect();
        const relY=screenY - cwRect.top + cw.scrollTop;
        snapLine.style.top=relY+'px';
        snapLine.style.display='block';
      }
    }
    render(); renderHandles(); upd();
  }
  if(S.dragType === 'handle-rot'){
    const dx = p.x - S.ds.centerX;
    const dy = p.y - S.ds.centerY;
    const currentAngle = Math.atan2(dy, dx) * 180 / Math.PI;
    let delta = currentAngle - S.ds.startAngle;
    // Normalizza il delta per evitare salti a ±180
    while(delta > 180) delta -= 360;
    while(delta < -180) delta += 360;

    const cos = Math.cos(delta * Math.PI / 180);
    const sin = Math.sin(delta * Math.PI / 180);

    if(S.sel.size === 1){
      S.letters[Array.from(S.sel)[0]].rot = S.ds.startRot + delta;
    } else if(S.ds.origPositions){
      // Multi-select: ruota ogni elemento attorno al centro del gruppo
      const groupCx = S.ds.centerX;
      const groupCy = S.ds.centerY;

      S.ds.origPositions.forEach(origPos => {
        // Offset dal centro del gruppo
        const offsetX = origPos.x - groupCx;
        const offsetY = origPos.y - groupCy;

        // Ruota l'offset
        const newOffsetX = offsetX * cos - offsetY * sin;
        const newOffsetY = offsetX * sin + offsetY * cos;

        const i = origPos.idx;
        const l = S.letters[i];

        // Aggiorna posizione
        l.x = groupCx + newOffsetX;
        l.y = groupCy + newOffsetY;

        // Aggiorna rotazione
        l.rot = (origPos.rot + delta) % 360;
      });
    }
    render(); renderHandles(); upd();
  }
  if(S.dragType === 'handle-diag'){
    // Distanza corrente del mouse dal centro del gruppo
    const centerX = S.ds.centerX;
    const centerY = S.ds.centerY;

    const dx = p.x - centerX;
    const dy = p.y - centerY;
    const currentDist = Math.sqrt(dx*dx + dy*dy);

    // Ratio = distanza attuale / distanza al momento del click
    const ratio = currentDist / S.ds.startDist;
    const newScale = Math.max(0.05, Math.min(20, S.ds.sx * ratio));

    if(S.sel.size === 1){
      const i = Array.from(S.sel)[0];
      S.letters[i].sx = newScale;
      S.letters[i].sy = newScale;
    } else if(S.ds.origPositions){
      // Multi-select: scala ogni elemento rispetto al centro del gruppo
      const groupCx = S.ds.groupCx;
      const groupCy = S.ds.groupCy;

      S.ds.origPositions.forEach(origPos => {
        const i = origPos.idx;
        const l = S.letters[i];

        // Offset originale dal centro del gruppo
        const origOffsetX = origPos.x - groupCx;
        const origOffsetY = origPos.y - groupCy;

        // Scala la posizione
        l.x = groupCx + origOffsetX * ratio;
        l.y = groupCy + origOffsetY * ratio;

        // Scala l'elemento stesso
        l.sx = origPos.sx * ratio;
        l.sy = origPos.sy * ratio;
      });
    }
    render(); renderHandles(); upd();
  }
});

document.addEventListener('mouseup', e=>{
  if(S.panning){ stopPan(); return; }
  if(S.dragging){
    // Se era in corso una rotazione, resettala al rilascio
    if(S.rotating && S.dragType === 'handle-rot'){
      S.rotating = false;
      S.rotHandleAngle = null; // Reset angolo controllo rotazione
      S.rotHandleDistance = null; // Reset distanza controllo rotazione
      // Render finale per mostrare il bounding box raddrizzato con tutti i controlli
      render();
      renderHandles();
    }
    S.dragging=false; S.dragType=null;
    document.getElementById('svg').classList.remove('dragging-letter');
    document.getElementById('snap-line').style.display='none';
    saveState();
  }
  if(S.box.on){
    document.getElementById('sb').style.display='none';
    S.box.on=false; upd();
  }
});

function upd(){
  S._gapBase = null; // resetta la base gap ogni volta che la selezione cambia
  const sel=[...S.sel];
  const gg=document.getElementById('gg'),ns=document.getElementById('nsel'),info=document.getElementById('info');
  if(!sel.length){
    gg.innerHTML='';ns.style.display='block';
    info.innerHTML='<b>Tasto destro + Trascina</b> = Pan<br><b>Rotella</b> = Zoom | <b>Ctrl+Rotella</b> = Scorri<br>Shift+Click = selezione multipla';
    // Resetta tutti i campi di input quando non c'è selezione
    resetPropertyFields();
    return;
  }
  ns.style.display='none';
  gg.innerHTML=sel.map(i=>{
    const l=S.letters[i];
    const label=l.isSvgImport?'⬡':l.ch;
    return `<div class="gc sel" style="font-family:${l.fontFamily};font-size:${Math.min(l.fontSize,18)}px;cursor:pointer" onclick="toggleSelFromPanel(${i})">${label}</div>`;
  }).join('');
  
  // Per multi-selezione, calcola valori medi o usa il primo elemento
  const first = S.letters[sel[0]];
  
  // Calcola valori medi per multi-selezione
  const avgX = sel.reduce((sum, i) => sum + S.letters[i].x, 0) / sel.length;
  const avgY = sel.reduce((sum, i) => sum + S.letters[i].y, 0) / sel.length;
  const avgRot = sel.reduce((sum, i) => sum + S.letters[i].rot, 0) / sel.length;
  const avgSx = sel.reduce((sum, i) => sum + S.letters[i].sx, 0) / sel.length;
  const avgSy = sel.reduce((sum, i) => sum + S.letters[i].sy, 0) / sel.length;
  const avgSkew = sel.reduce((sum, i) => sum + S.letters[i].skew, 0) / sel.length;
  const avgOp = sel.reduce((sum, i) => sum + S.letters[i].op, 0) / sel.length;
  const avgFs = sel.reduce((sum, i) => sum + S.letters[i].fontSize, 0) / sel.length;
  const avgBorder = sel.reduce((sum, i) => sum + (S.letters[i].borderWidth || 0), 0) / sel.length;

  // Controlla se tutti i valori sono uguali
  const allSameFill = sel.every(i => S.letters[i].fill === first.fill);
  const allSameFs = sel.every(i => S.letters[i].fontSize === first.fontSize);
  const allSameBorder = sel.every(i => S.letters[i].borderWidth === first.borderWidth);
  const allSameBorderCol = sel.every(i => S.letters[i].borderColor === first.borderColor);
  
  v('px', Math.round(avgX));
  v('py', Math.round(avgY));
  v('prot', Math.round(avgRot));
  v('vrot', Math.round(avgRot));
  v('psx', avgSx);
  v('vsx', avgSx.toFixed(2));
  v('psy', avgSy);
  v('vsy', avgSy.toFixed(2));
  v('psk', Math.round(avgSkew));
  t('vsk', Math.round(avgSkew) + '°');
  
  if(allSameFill) {
    v('pfill', first.fill);
    v('fcol', first.fill);
  } else {
    v('pfill', '#ffffff'); // Indica valori misti
    v('fcol', '#ffffff');
  }

  if(allSameFs) { v('pfs', Math.round(first.fontSize)); v('fsize', Math.round(first.fontSize)); }
  else { v('pfs', Math.round(avgFs)); v('fsize', Math.round(avgFs)); }
  
  v('pop', avgOp);
  t('vop', Math.round(avgOp * 100) + '%');

  if(allSameBorder) {
    v('pborder', first.borderWidth || 0);
    t('vborder', (first.borderWidth || 0).toFixed(1) + 'px');
  } else {
    v('pborder', avgBorder);
    t('vborder', avgBorder.toFixed(1) + 'px');
  }

  if(allSameBorderCol) {
    v('pbordercol', first.borderColor);
  } else {
    v('pbordercol', '#000000');
  }

  const layerLabels = {1: 'Sotto', 2: 'Centro', 3: 'Sopra'};
  const allSameLayer = sel.every(i => (S.letters[i].layer || 2) === (S.letters[sel[0]].layer || 2));
  const layerInfo = allSameLayer ? `<br>Layer: ${layerLabels[S.letters[sel[0]].layer || 2] || 'Centro'}` : '';
  
  // Aggiorna lo stato dei pulsanti layer
  const layerBtn1 = document.getElementById('layer-btn-1');
  const layerBtn2 = document.getElementById('layer-btn-2');
  const layerBtn3 = document.getElementById('layer-btn-3');
  
  // Resetta tutti i pulsanti
  if(layerBtn1) layerBtn1.classList.remove('active');
  if(layerBtn2) layerBtn2.classList.remove('active');
  if(layerBtn3) layerBtn3.classList.remove('active');
  
  // Se tutti gli oggetti selezionati sono nello stesso layer, illumina il pulsante corrispondente
  if(allSameLayer) {
    const activeLayer = S.letters[sel[0]].layer || 2;
    if(activeLayer === 1 && layerBtn1) layerBtn1.classList.add('active');
    else if(activeLayer === 2 && layerBtn2) layerBtn2.classList.add('active');
    else if(activeLayer === 3 && layerBtn3) layerBtn3.classList.add('active');
  }
  
  const badge = first.isSvgImport ? `<span class="svg-badge">SVG path</span>` : `<span class="badge">${sel.length} lettera${sel.length>1?'e':''}</span>`;
  const infoText = sel.length > 1
    ? `${badge}<br><br><b>${sel.length} elementi selezionati</b>${layerInfo}<br>BBox: ${Math.round(getGroupBBox()?.w || 0)} × ${Math.round(getGroupBBox()?.h || 0)}px`
    : `${badge}<br><br>Nome: ${first.fontName}<br>Pos: (${Math.round(first.x)}, ${Math.round(first.y)})<br>Rot: ${Math.round(first.rot)}°<br>Layer: ${layerLabels[first.layer || 2] || 'Centro'}`;
  info.innerHTML = infoText;
}
function resetPropertyFields(){
  // Resetta i campi posizione
  v('px', 0); v('py', 0);
  // Resetta i campi rotazione
  v('prot', 0); v('vrot', 0); t('vrot', '0°');
  // Resetta i campi scala
  v('psx', 1); v('vsx', '1.00'); v('psy', 1); v('vsy', '1.00');
  // Resetta i campi inclinazione
  v('psk', 0); t('vsk', '0°');
  // Resetta opacità
  v('pop', 1); t('vop', '100%');
  // Resetta bordo
  v('pborder', 0); t('vborder', '0px');
  v('pbordercol', '#000000');
  // Resetta spaziatura
  v('pgap', 4); t('vgap', '4px');
  // Resetta pt
  v('fsize', 80);
  
  // Resetta i pulsanti layer
  const layerBtn1 = document.getElementById('layer-btn-1');
  const layerBtn2 = document.getElementById('layer-btn-2');
  const layerBtn3 = document.getElementById('layer-btn-3');
  if(layerBtn1) layerBtn1.classList.remove('active');
  if(layerBtn2) layerBtn2.classList.remove('active');
  if(layerBtn3) layerBtn3.classList.remove('active');
}
function v(id,val){
  // Custom color picker dots
  const dotMap={'fcol':'fcol-dot','pbordercol':'pbordercol-dot','canvas-bg-picker':'canvas-bg-picker-dot','bg-color-picker':'bg-color-picker-dot'};
  if(dotMap[id]){
    const dot=document.getElementById(dotMap[id]);
    if(dot)dot.style.background=val;
    return;
  }
  const el=document.getElementById(id);if(el&&document.activeElement!==el){el.value=val;}
}
function t(id,val){const el=document.getElementById(id);if(el)el.textContent=val;}

// Applica una trasformazione a tutti gli elementi selezionati
function aps(fn){[...S.sel].forEach(i=>fn(S.letters[i]));render();renderHandles();upd();saveState();}

// Per X e Y, preserviamo gli offset relativi tra elementi in caso di multi-selezione
function apX(val){
  const sel = [...S.sel];
  if(sel.length === 1){
    S.letters[sel[0]].x = val;
  } else if(sel.length > 1){
    // Calcola il centro attuale e applica lo spostamento a tutti mantenendo gli offset
    const avgX = sel.reduce((sum, i) => sum + S.letters[i].x, 0) / sel.length;
    const delta = val - avgX;
    sel.forEach(i => S.letters[i].x += delta);
  }
  render(); renderHandles(); upd(); saveState();
}

function apY(val){
  const sel = [...S.sel];
  if(sel.length === 1){
    S.letters[sel[0]].y = val;
  } else if(sel.length > 1){
    const avgY = sel.reduce((sum, i) => sum + S.letters[i].y, 0) / sel.length;
    const delta = val - avgY;
    sel.forEach(i => S.letters[i].y += delta);
  }
  render(); renderHandles(); upd(); saveState();
}

function apRot(val){
  v('prot', val);
  v('vrot', val);
  
  // Espandi selezione per includere interi gruppi
  const expandedSel = new Set();
  [...S.sel].forEach(idx => {
    getGroupIndices(idx).forEach(gIdx => expandedSel.add(gIdx));
  });
  const sel = [...expandedSel];
  
  if(sel.length === 1){
    S.letters[sel[0]].rot = val;
  } else if(sel.length > 1){
    // Per rotazione multipla, applica la differenza di rotazione
    const avgRot = sel.reduce((sum, i) => sum + S.letters[i].rot, 0) / sel.length;
    const delta = val - avgRot;
    sel.forEach(i => S.letters[i].rot = (S.letters[i].rot + delta) % 360);
  }
  render(); renderHandles(); upd(); saveState();
}

function apScale(ax,val){
  const lock = document.getElementById('lock-scale').checked;

  // Espandi selezione per includere interi gruppi
  const expandedSel = new Set();
  [...S.sel].forEach(idx => {
    getGroupIndices(idx).forEach(gIdx => expandedSel.add(gIdx));
  });
  const sel = [...expandedSel];

  if(ax==='x'){
    v('vsx',val.toFixed(2));
    if(sel.length === 1){
      // SINGLE: Direct assignment
      S.letters[sel[0]].sx = val;
      if(lock) S.letters[sel[0]].sy = val;
    } else if(sel.length > 1){
      // MULTI: Treat all selected objects as a SINGLE object
      // Calculate the AVERAGE scale of all selected elements
      const avgSx = sel.reduce((sum, i) => sum + S.letters[i].sx, 0) / sel.length;
      const avgSy = lock ? sel.reduce((sum, i) => sum + S.letters[i].sy, 0) / sel.length : avgSx;
      
      // Calculate ratio: new value / current average
      const ratioX = avgSx > 0 ? val / avgSx : 1;
      const ratioY = lock ? ratioX : 1;

      // Get group center for positioning
      const bbox = getGroupBBox();
      const groupCx = bbox.x + bbox.w / 2;
      const groupCy = bbox.y + bbox.h / 2;

      // Apply the ratio to all elements
      sel.forEach(i => {
        const l = S.letters[i];
        
        if(lock) {
          // LOCKED: Scale BOTH X and Y together
          l.sx *= ratioX;
          l.sy *= ratioY;
          // Scale BOTH positions
          const offsetX = l.x - groupCx;
          const offsetY = l.y - groupCy;
          l.x = groupCx + offsetX * ratioX;
          l.y = groupCy + offsetY * ratioY;
        } else {
          // UNLOCKED: Scale ONLY X
          l.sx *= ratioX;
          // Y scale stays unchanged
          // Scale ONLY X position
          const offsetX = l.x - groupCx;
          l.x = groupCx + offsetX * ratioX;
          // Y position stays unchanged
          l.y = l.y;
        }
      });
    }
    if(lock){
      v('psy',val);
      v('vsy',val.toFixed(2));
    }
  } else {
    v('vsy',val.toFixed(2));
    if(sel.length === 1){
      // SINGLE: Direct assignment
      S.letters[sel[0]].sy = val;
      if(lock) S.letters[sel[0]].sx = val;
    } else if(sel.length > 1){
      // MULTI: Treat all selected objects as a SINGLE object
      // Calculate the AVERAGE scale of all selected elements
      const avgSy = sel.reduce((sum, i) => sum + S.letters[i].sy, 0) / sel.length;
      const avgSx = lock ? sel.reduce((sum, i) => sum + S.letters[i].sx, 0) / sel.length : avgSy;
      
      // Calculate ratio: new value / current average
      const ratioY = avgSy > 0 ? val / avgSy : 1;
      const ratioX = lock ? ratioY : 1;

      // Get group center for positioning
      const bbox = getGroupBBox();
      const groupCx = bbox.x + bbox.w / 2;
      const groupCy = bbox.y + bbox.h / 2;

      // Apply the ratio to all elements
      sel.forEach(i => {
        const l = S.letters[i];
        
        if(lock) {
          // LOCKED: Scale BOTH X and Y together
          l.sx *= ratioX;
          l.sy *= ratioY;
          // Scale BOTH positions
          const offsetX = l.x - groupCx;
          const offsetY = l.y - groupCy;
          l.x = groupCx + offsetX * ratioX;
          l.y = groupCy + offsetY * ratioY;
        } else {
          // UNLOCKED: Scale ONLY Y
          l.sy *= ratioY;
          // X scale stays unchanged
          // Scale ONLY Y position
          const offsetY = l.y - groupCy;
          l.y = groupCy + offsetY * ratioY;
          // X position stays unchanged
          l.x = l.x;
        }
      });
    }
    if(lock){
      v('psx',val);
      v('vsx',val.toFixed(2));
    }
  }
  render(); renderHandles(); upd(); saveState();
}

function syncScaleInput(axis, value) {
  const inputId = axis === 'x' ? 'vsx' : 'vsy';
  const input = document.getElementById(inputId);
  if (input) {
    input.value = parseFloat(value).toFixed(2);
  }
}

function apScaleFromInput(ax, val) {
  // Sync the slider value with the number input
  const sliderId = ax === 'x' ? 'psx' : 'psy';
  const slider = document.getElementById(sliderId);
  if (slider) {
    slider.value = val;
  }
  apScale(ax, val);
}

function apSkew(val){
  t('vsk',val+'°');
  // Espandi selezione per includere interi gruppi
  const expandedSel = new Set();
  [...S.sel].forEach(idx => {
    getGroupIndices(idx).forEach(gIdx => expandedSel.add(gIdx));
  });
  [...expandedSel].forEach(i => S.letters[i].skew=val);
  render(); renderHandles(); upd(); saveState();
}
function apFill(val){
  // Espandi selezione per includere interi gruppi
  const expandedSel = new Set();
  [...S.sel].forEach(idx => {
    getGroupIndices(idx).forEach(gIdx => expandedSel.add(gIdx));
  });
  
  // Se stiamo cambiando il colore, gli elementi escono dal gruppo
  // perché il gruppo si basa sullo stesso colore
  [...expandedSel].forEach(i => {
    if (S.letters[i].groupId) {
      delete S.letters[i].groupId;
    }
    S.letters[i].fill = val;
  });
  
  v('pfill', val);
  v('fcol', val);
  render(); renderHandles(); upd(); saveState();
}
function apFS(val){
  // Espandi selezione per includere interi gruppi
  const expandedSel = new Set();
  [...S.sel].forEach(idx => {
    getGroupIndices(idx).forEach(gIdx => expandedSel.add(gIdx));
  });
  [...expandedSel].forEach(i => S.letters[i].fontSize=val);
  render(); renderHandles(); upd(); saveState();
}
function toggleFontSizeDropdown(){
  const dd=document.getElementById('fsize-dropdown');
  dd.style.display=dd.style.display==='block'?'none':'block';
}
function setFontSize(val){
  document.getElementById('fsize').value=val;
  if(S.sel.size>0) apFS(val);
  document.getElementById('fsize-dropdown').style.display='none';
}
// Chiudi dropdown font size quando si clicca fuori
document.addEventListener('click',function(e){
  const dd=document.getElementById('fsize-dropdown');
  if(dd && dd.style.display==='block' && !e.target.closest('#fsize') && !e.target.closest('[onclick*="toggleFontSizeDropdown"]') && !e.target.closest('#fsize-dropdown')){
    dd.style.display='none';
  }
  
  // Chiudi palette colori 3D quando si clicca fuori
  const colorPresets = document.getElementById('color-presets');
  if (colorPresets && (colorPresets.style.display === 'grid' || colorPresets.style.display === 'block')) {
    const colorPicker = document.getElementById('color3d-picker');
    const colorControls = document.getElementById('color-3d-controls');
    if (colorControls && !colorControls.contains(e.target)) {
      colorPresets.style.display = 'none';
    }
  }
});
function apOp(val){t('vop',Math.round(val*100)+'%');aps(l=>l.op=val);}
function apBorder(val){t('vborder',val.toFixed(1)+'px');aps(l=>l.borderWidth=val);}
function apBorderCol(val){aps(l=>l.borderColor=val);}
// ─── Larghezza visiva effettiva di una lettera (tiene conto della scala sx) ───
function _getLetterW(l, ctx) {
  ctx.font = `${l.fontSize}px ${l.fontFamily}`;
  const mw = l.isGroup ? l.groupW
           : l.isSvgImport ? (l.svgW || ctx.measureText(l.ch).width)
           : ctx.measureText(l.ch).width;
  return mw * Math.abs(l.sx || 1);
}

// ─── Salva ordine e anchor quando inizia il drag dello slider Gap ───
function startGapDrag() {
  const ctx = document.getElementById('dc').getContext('2d');
  const sel = [...S.sel].sort((a,b) => S.letters[a].x - S.letters[b].x);
  if (sel.length < 2) return;
  const items = sel.map(i => ({ id: i, w: _getLetterW(S.letters[i], ctx) }));
  const firstL = S.letters[items[0].id];
  S._gapBase = {
    items,
    anchorX: firstL.x - items[0].w / 2   // bordo sinistro della prima lettera (ancora fissa)
  };
}

// ─── Applica gap: ricalcola sempre dallo stato base → ordine sempre stabile ───
function apGap(val) {
  t('vgap', val + 'px');
  // Prima volta senza mousedown: inizializza la base al volo
  if (!S._gapBase || S._gapBase.items.length < 2) startGapDrag();
  if (!S._gapBase || S._gapBase.items.length < 2) return;
  let cursor = S._gapBase.anchorX;
  S._gapBase.items.forEach(item => {
    S.letters[item.id].x = cursor + item.w / 2;
    cursor += item.w + val;
  });
  render(); saveState();
}

// ─── Distribuisci: bordi che si toccano come in una parola (gap = 0) ───
function distrib(ax) {
  const ctx = document.getElementById('dc').getContext('2d');
  const sel = [...S.sel].sort((a,b) =>
    ax === 'h' ? S.letters[a].x - S.letters[b].x : S.letters[a].y - S.letters[b].y
  );
  if (sel.length < 2) return;

  if (ax === 'h') {
    // Costruisce la lista con le larghezze reali
    const items = sel.map(i => ({ id: i, w: _getLetterW(S.letters[i], ctx) }));
    // Ancora = bordo sinistro della lettera più a sinistra
    const anchorX = S.letters[items[0].id].x - items[0].w / 2;
    // Impacchetta con gap = 0: i bordi si toccano
    let cursor = anchorX;
    items.forEach(item => {
      S.letters[item.id].x = cursor + item.w / 2;
      cursor += item.w;   // nessun gap → bordi a contatto
    });
    // Resetta lo slider a 0 e aggiorna lo stato base
    const slider = document.getElementById('pgap');
    if (slider) { slider.value = 0; t('vgap', '0px'); }
    S._gapBase = { items: items.map(it => ({...it})), anchorX };
  } else {
    // Verticale: distribuzione uniforme (comportamento originale)
    const first = S.letters[sel[0]].y;
    const last  = S.letters[sel[sel.length-1]].y;
    if (sel.length < 3) return;
    const step  = (last - first) / (sel.length - 1);
    sel.forEach((i,j) => { if (!j || j === sel.length-1) return; S.letters[i].y = first + step*j; });
  }
  render(); renderHandles(); upd(); saveState();
}

function flip(ax){aps(l=>{if(ax==='h')l.sx*=-1;else l.sy*=-1;});}
function duplicateSel(){
  const copies=[];
  [...S.sel].forEach(i=>copies.push({...S.letters[i],id:uid++,x:S.letters[i].x+20,y:S.letters[i].y+20}));
  const newSel=new Set();
  copies.forEach(c=>{newSel.add(S.letters.length);S.letters.push(c);});
  S.sel=newSel;render();renderHandles();upd();saveState();
}
function resetSel(){aps(l=>{l.sx=1;l.sy=1;l.rot=0;l.skew=0;l.op=1;l.borderWidth=0;l.borderColor='#000000';});}
function deleteSelected(){
  [...S.sel].sort((a,b)=>b-a).forEach(i=>S.letters.splice(i,1));
  S.sel.clear();render();renderHandles();upd();saveState();
}
function deleteUnselected(){
  for(let i=S.letters.length-1;i>=0;i--){if(!S.sel.has(i))S.letters.splice(i,1);}
  S.sel.clear();render();renderHandles();upd();saveState();
  toast('Elementi non selezionati eliminati ✓');
}
function selectAll(){S.letters.forEach((_,i)=>S.sel.add(i));render();renderHandles();upd();}
// ── CUSTOM CONFIRM (evita dialog nativo che causa perdita focus in Electron) ──
function customConfirm(msg, onOk) {
  const overlay = document.getElementById('custom-confirm');
  document.getElementById('custom-confirm-msg').textContent = msg;
  overlay.classList.add('show');

  const btnOk     = document.getElementById('custom-confirm-ok');
  const btnCancel = document.getElementById('custom-confirm-cancel');

  function close(confirmed) {
    overlay.classList.remove('show');
    btnOk.removeEventListener('click', handleOk);
    btnCancel.removeEventListener('click', handleCancel);
    // Ripristina immediatamente il focus sul documento
    requestAnimationFrame(() => {
      const ti = document.getElementById('ti');
      if (ti) ti.focus();
    });
    if (confirmed) onOk();
  }

  function handleOk()     { close(true);  }
  function handleCancel() { close(false); }

  btnOk.addEventListener('click', handleOk);
  btnCancel.addEventListener('click', handleCancel);
}

function clearCanvas(){
  customConfirm('Svuotare il canvas?', () => {
    S.letters=[];
    S.sel.clear();
    uid = 0; // Reset unique IDs for elements
    S.currentProjectName = null;
    
    // Reset 3D state to avoid sync errors and stale data
    threeMeshes = [];
    threeExtrusionLevels = {};
    threeVisibilityState = {};
    threeSelectionOrder = [];
    threeSelectedMesh = null;
    if (S.history3D) S.history3D = [];
    S.historyIndex3D = -1;

    render(); renderHandles(); upd(); saveState();
    toast('Canvas svuotato correttamente ✓');
  });
}

function applySize(){
  const w=+document.getElementById('cvW').value||800;
  const h=+document.getElementById('cvH').value||500;
  S.canvasW=w;S.canvasH=h;
  const svg=document.getElementById('svg');
  svg.setAttribute('viewBox',`0 0 ${w} ${h}`);
  svg.setAttribute('width',Math.round(w*S.zoom));
  svg.setAttribute('height',Math.round(h*S.zoom));
  ['bg','gr'].forEach(id=>{const el=document.getElementById(id);el.setAttribute('width',w);el.setAttribute('height',h);});
  
  // Assicura che il canvas sia scrollabile dopo il ridimensionamento
  const cw=document.getElementById('cw');
  if(cw) cw.scrollTop=0;
}

function setCanvasBg(color) {
  S.canvasBg = color;
  document.getElementById('bg').setAttribute('fill', color);
  const r=parseInt(color.slice(1,3),16), g=parseInt(color.slice(3,5),16), b=parseInt(color.slice(5,7),16);
  const lum = (r*299 + g*587 + b*114) / 1000;
  const gridStroke = lum > 128 ? '#cccccc' : '#ffffff33';
  document.querySelector('#grid path').setAttribute('stroke', gridStroke);
  const dot = document.getElementById('canvas-bg-picker-dot');
  if (dot) dot.style.background = color;
  saveState();
}

function toggleGrid() {
  S.gridOn = !S.gridOn;
  document.getElementById('gr').style.display = S.gridOn ? 'block' : 'none';
  const btn = document.getElementById('grid-btn');
  if (btn) btn.style.color = S.gridOn ? 'var(--accent)' : 'var(--muted)';
  saveState();
}

function setSelectedLayer(layer){
  if(S.sel.size === 0){ toast('Seleziona almeno un oggetto!'); return; }
  if(layer < 1 || layer > 3){ return; }
  S.sel.forEach(i => { S.letters[i].layer = layer; });
  const layerNames = {1: 'Layer 1 (sotto)', 2: 'Layer 2 (centro)', 3: 'Layer 3 (sopra)'};
  render(); upd(); saveState();
  toast(`${S.sel.size} oggetto/i → ${layerNames[layer]} ✓`);
}

// ── CUSTOM PROMPT (per inserimento testo con stile custom) ───────────────────
function customPrompt(msg, onOk) {
  const overlay = document.getElementById('custom-prompt');
  const input = document.getElementById('custom-prompt-input');
  document.getElementById('custom-prompt-msg').textContent = msg;
  overlay.classList.add('show');
  input.value = '';
  input.focus();

  const btnOk     = document.getElementById('custom-prompt-ok');
  const btnCancel = document.getElementById('custom-prompt-cancel');

  function close(confirmed) {
    overlay.classList.remove('show');
    btnOk.removeEventListener('click', handleOk);
    btnCancel.removeEventListener('click', handleCancel);
    input.removeEventListener('keydown', handleKey);
    requestAnimationFrame(() => {
      const ti = document.getElementById('ti');
      if (ti) ti.focus();
    });
    if (confirmed) onOk(input.value.trim());
  }

  function handleOk() { close(true); }
  function handleCancel() { close(false); }
  function handleKey(e) { if (e.key === 'Enter') handleOk(); if (e.key === 'Escape') handleCancel(); }

  btnOk.addEventListener('click', handleOk);
  btnCancel.addEventListener('click', handleCancel);
  input.addEventListener('keydown', handleKey);
}

// Helper per catturare la preview dell'SVG come dataURL PNG
async function capturePreview() {
  return new Promise((resolve) => {
    const svg = document.getElementById('svg');
    if (!svg) return resolve(null);

    // Calcola il bounding box di tutti gli elementi presenti
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let hasElements = false;

    S.letters.forEach((_, idx) => {
      const bbox = getLetterBBoxTransformed(idx);
      if (bbox) {
        minX = Math.min(minX, bbox.x);
        minY = Math.min(minY, bbox.y);
        maxX = Math.max(maxX, bbox.x2);
        maxY = Math.max(maxY, bbox.y2);
        hasElements = true;
      }
    });

    let viewBox;
    if (hasElements) {
      // Aggiungi un po' di padding (10%)
      const w = maxX - minX;
      const h = maxY - minY;
      const padding = Math.max(w, h) * 0.1;
      viewBox = `${minX - padding} ${minY - padding} ${w + padding * 2} ${h + padding * 2}`;
    } else {
      // Fallback al viewBox originale se non ci sono elementi
      viewBox = `0 0 ${S.canvasW} ${S.canvasH}`;
    }

    // Crea un clone dell'SVG per non sporcare l'originale
    const svgClone = svg.cloneNode(true);
    svgClone.setAttribute('viewBox', viewBox);
    svgClone.setAttribute('width', '400');
    svgClone.setAttribute('height', '400');
    
    // Rimuovi elementi di servizio dal clone (snap lines, handles, etc.)
    const snapLine = svgClone.querySelector('#snap-line');
    if (snapLine) snapLine.remove();
    const handles = svgClone.querySelector('#gg');
    if (handles) handles.innerHTML = '';
    const selBox = svgClone.querySelector('#sb');
    if (selBox) selBox.style.display = 'none';

    const svgData = new XMLSerializer().serializeToString(svgClone);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    canvas.width = 400; 
    canvas.height = 400;

    img.onload = () => {
      ctx.fillStyle = S.canvasBg || '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png'));
    };

    img.onerror = () => resolve(null);
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  });
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
}// ── CARICA PROGETTO ────────────────────────────────────────────────────────
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
  
  toast(`Progetto caricato: ${S.letters.length} elementi ✓`);
}

// ── EXPORT SVG ──────────────────────────────────────────────────────────────
//
// Strategia:
// 1. Calcola la matrice di trasformazione completa di ogni elemento
//    direttamente dai dati S.letters (senza leggere dal DOM screen).
//    La struttura è identica a render():
//      outer g:  translate(l.x,l.y) [rotate] [scale] [skewX] translate(-l.x,-l.y)
//      inner el: translate(innerX, innerY)   (dove innerX/Y dipende dal tipo)
// 2. Applica la matrice combinata al path data → path assoluto nel viewport SVG.
// 3. Calcola bbox reale tramite DOM temporaneo (stesso viewport SVG, niente zoom).
// 4. Union-Find su bbox: elementi che si toccano appartengono allo stesso oggetto.
// 5. L'ordine Z (layer) è SEMPRE rispettato: non si fonde mai tra colori diversi
//    che si sovrappongono; si fondono solo path dello stesso colore E stesso gruppo
//    Union-Find. Il render finale emette ogni item nell'ordine originale di render,
//    wrappando in <g> solo il primo e l'ultimo item di ogni gruppo toccante.

// Costruisce DOMMatrix da parametri lettera (uguale a render)
function _buildLetterMatrix(l, mw) {
  // outer: translate(l.x,l.y) rotate scale skewX translate(-l.x,-l.y)
  let m = new DOMMatrix();
  m = m.translate(l.x, l.y);
  if (l.rot) m = m.rotate(l.rot);
  if (l.sx !== 1 || l.sy !== 1) m = m.scale(l.sx, l.sy);
  if (l.skew) m = m.skewX(l.skew);
  m = m.translate(-l.x, -l.y);
  return m;
}

// bbox reale di un path trasformato (usa DOM temporaneo offscreen, NO zoom)
function _realBBox(pathD) {
  const bb = calcRealBBox(pathD);
  if (!bb) return null;
  return { x: bb.x, y: bb.y, x2: bb.x + bb.width, y2: bb.y + bb.height,
           w: bb.width, h: bb.height };
}

// Due bbox si toccano o sovrappongono (tolleranza 1px)
function _touch(a, b) {
  return a.x2 + 1 >= b.x && b.x2 + 1 >= a.x &&
         a.y2 + 1 >= b.y && b.y2 + 1 >= a.y;
}

async function exportSVG() {
  try {
    if (S.letters.length === 0) { toast('Canvas vuoto!'); return; }

    const ctx = document.getElementById('dc').getContext('2d');

    // Ordine di render (identico a render())
    const sortedIndices = S.letters.map((_, i) => i)
      .sort((a, b) => (S.letters[a].layer || 2) - (S.letters[b].layer || 2));

    // ── Passo 1: costruisce ogni item con pathD trasformato e bbox ──
    // item = { pathD, bbox, color, opacity, borderWidth, borderColor, isText, textMarkup, renderOrder }
    const items = [];

    sortedIndices.forEach((i, renderOrder) => {
      const l = S.letters[i];
      const color = l.fill || '#000000';
      const opacity = (l.op != null) ? l.op : 1;
      const bw = l.borderWidth || 0;
      const bc = l.borderColor || '#000000';

      ctx.font = `${l.fontSize}px ${l.fontFamily}`;
      const mw = l.isGroup ? l.groupW : (l.isSvgImport ? (l.svgW || 100) : ctx.measureText(l.ch).width);

      // Matrice outer (pivot di rot/scale)
      const outerM = _buildLetterMatrix(l, mw);

      if (l.isGroup && l.groupHTML) {
        // Gruppo: ogni path ha transform outer + translate(dx, dy) + proprio transform
        const dx = l.x - (l.originalX || l.x);
        const dy = l.y - (l.originalY || l.y);
        const innerM = outerM.translate(dx, dy);

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = l.groupHTML;
        const allSegs = [];
        tempDiv.querySelectorAll('path').forEach(p => {
          const d = p.getAttribute('d');
          if (!d) return;
          const pTfStr = p.getAttribute('transform') || '';
          const pM = pTfStr ? parseTransformToMatrix(pTfStr) : new DOMMatrix();
          const combined = innerM.multiply(pM);
          const segs = pathToAbsoluteSegments(d);
          allSegs.push(...applyMatrixToSegs(segs, combined));
        });
        if (!allSegs.length) return;
        const pathD = segsToPathD(allSegs);
        const bbox = _realBBox(pathD);
        if (!bbox) return;
        items.push({ pathD, bbox, color, opacity, bw: 0, bc, renderOrder });

      } else if (l.customPath) {
        // SVG import o customPath: inner transform = translate(innerX, innerY)
        const innerX = l.isSvgImport ? l.x - (l.svgW || mw) / 2 : l.x - mw / 2;
        const innerY = l.y;
        const combined = outerM.translate(innerX, innerY);
        const segs = pathToAbsoluteSegments(l.customPath);
        const transformed = applyMatrixToSegs(segs, combined);
        const pathD = segsToPathD(transformed);
        const bbox = _realBBox(pathD);
        if (!bbox) return;
        items.push({ pathD, bbox, color, opacity, bw, bc, renderOrder });

      } else if (S.openFonts[l.fontName]) {
        // Font opentype: inner transform = translate(l.x - mw/2, l.y)
        const innerX = l.x - mw / 2;
        const innerY = l.y;
        const combined = outerM.translate(innerX, innerY);
        // Use higher precision for better export quality
        const d = S.openFonts[l.fontName].getPath(l.ch, 0, 0, l.fontSize).toPathData(4);
        const segs = pathToAbsoluteSegments(d);
        const transformed = applyMatrixToSegs(segs, combined);
        const pathD = segsToPathD(transformed);
        const bbox = _realBBox(pathD);
        if (!bbox) return;
        items.push({ pathD, bbox, color, opacity, bw, bc, renderOrder });

      } else {
        // Testo sistema: posizione diretta, nessun path
        const opAttr = opacity !== 1 ? ` opacity="${opacity}"` : '';
        const bwAttr = bw > 0 ? ` stroke="${bc}" stroke-width="${bw}" stroke-linejoin="round" stroke-linecap="round" style="paint-order:stroke fill"` : '';
        const markup = `<text x="${l.x}" y="${l.y}" font-family="${escHtml(l.fontFamily)}" font-size="${l.fontSize}" fill="${color}" text-anchor="middle"${opAttr}${bwAttr}>${escHtml(l.ch)}</text>`;
        const fs = l.fontSize || 80;
        const estW = fs * 0.65;
        const bbox = { x: l.x - estW / 2, y: l.y - fs, x2: l.x + estW / 2, y2: l.y };
        items.push({ isText: true, textMarkup: markup, bbox, color, opacity, bw, bc, renderOrder });
      }
    });

    if (!items.length) { toast('Nessun elemento esportabile!'); return; }

    // ── Passo 2: Union-Find per raggruppare elementi che si toccano ──
    const n = items.length;
    const ufP = items.map((_, i) => i);
    function ufF(i) { while (ufP[i] !== i) { ufP[i] = ufP[ufP[i]]; i = ufP[i]; } return i; }
    function ufU(a, b) { ufP[ufF(a)] = ufF(b); }
    for (let a = 0; a < n; a++)
      for (let b = a + 1; b < n; b++)
        if (_touch(items[a].bbox, items[b].bbox)) ufU(a, b);

    // Assegna groupId (= root del Union-Find) ad ogni item
    items.forEach((it, i) => { it.groupId = ufF(i); });

    // ── Passo 3: genera SVG rispettando l'ordine Z ──
    // Strategia: scorre items nell'ordine di render.
    // Elementi dello stesso gruppo E dello stesso colore CONSECUTIVI si fondono
    // in un unico <path>. Se il gruppo ha più colori/elementi, li wrappa in <g>.
    // Gli elementi di colori diversi NON si fondono mai (Z-order preservato).

    // Prima: per ogni gruppo calcola se ha più di 1 item
    const groupSizes = new Map();
    items.forEach(it => {
      groupSizes.set(it.groupId, (groupSizes.get(it.groupId) || 0) + 1);
    });

    // Per raggruppare i <g> apriamo/chiudiamo: tracciamo quale groupId è "aperto"
    let svgContent = '';
    const openedGroups = new Set(); // groupId già aperti con <g>
    const closedGroups = new Set(); // groupId già chiusi

    // Raggruppa items per groupId e trova min/max renderOrder
    const groupBounds = new Map();
    items.forEach((it, idx) => {
      const g = it.groupId;
      if (!groupBounds.has(g)) groupBounds.set(g, { min: idx, max: idx });
      else {
        const b = groupBounds.get(g);
        if (idx < b.min) b.min = idx;
        if (idx > b.max) b.max = idx;
      }
    });

    // Fonde path consecutivi dello stesso colore+gruppo in un unico <path>
    // Emette in ordine renderOrder
    let pendingPath = null; // { color, pathD, bw, bc, opacity, groupId }

    function flushPending() {
      if (!pendingPath) return;
      const { color, pathD, bw, bc, opacity } = pendingPath;
      const opAttr = opacity !== 1 ? ` opacity="${opacity}"` : '';
      if (bw > 0) {
        // Border: same path, stroke-width*2 with fill=border color, rendered before the fill path
        svgContent += `<path d="${pathD}" fill="${bc}"${opAttr} stroke="${bc}" stroke-width="${bw*2}" stroke-linejoin="round" stroke-linecap="round" style="paint-order:stroke fill"/>\n`;
      }
      svgContent += `<path d="${pathD}" fill="${color}"${opAttr}/>\n`;
      pendingPath = null;
    }

    items.forEach((it, idx) => {
      const gId = it.groupId;
      const isMulti = groupSizes.get(gId) > 1;

      // Apri <g> se questo gruppo ha più di 1 item e non è ancora aperto
      if (isMulti && !openedGroups.has(gId)) {
        flushPending();
        svgContent += `<g>\n`;
        openedGroups.add(gId);
      }

      if (it.isText) {
        flushPending();
        svgContent += it.textMarkup + '\n';
      } else {
        // Prova a fondere con il pending se stesso colore+gruppo
        if (pendingPath && pendingPath.color === it.color && pendingPath.groupId === gId &&
            pendingPath.opacity === it.opacity) {
          pendingPath.pathD += ' ' + it.pathD;
          // Prendi il borderWidth maggiore
          if (it.bw > pendingPath.bw) { pendingPath.bw = it.bw; pendingPath.bc = it.bc; }
        } else {
          flushPending();
          pendingPath = { color: it.color, pathD: it.pathD, bw: it.bw, bc: it.bc,
                          opacity: it.opacity, groupId: gId };
        }
      }

      // Chiudi <g> se questo è l'ultimo item del gruppo
      if (isMulti && idx === groupBounds.get(gId).max) {
        flushPending();
        svgContent += `</g>\n`;
        closedGroups.add(gId);
      }
    });

    flushPending();

    const usedFonts = [...new Set(S.letters.map(l => l.fontName))].join(', ');
    const svgString = `<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${S.canvasW}" height="${S.canvasH}" viewBox="0 0 ${S.canvasW} ${S.canvasH}">
  <defs><!-- LetterForge export — Fonts: ${usedFonts} --></defs>
${svgContent}</svg>`;

    if (window.electronAPI && window.electronAPI.saveSVG) {
      const success = await window.electronAPI.saveSVG(svgString);
      if (success) { toast('SVG esportato ✓'); }
    } else {
      const blob = new Blob([svgString], { type: 'image/svg+xml' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'letterforge_export.svg';
      a.click();
      toast('SVG scaricato ✓');
    }
  } catch (error) {
    console.error('Errore esportazione SVG:', error);
    toast('Errore esportazione!');
  }
}

// ── Path parsing & transform utilities ──

function escHtml(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function r(v){ return v !== undefined ? (Math.round(v*100)/100) : 0; }

function splitSelectedLetter(){
  const sel=[...S.sel];if(sel.length!==1){toast('Seleziona esattamente una lettera da dividere.');return;}
  const lIndex=sel[0],L=S.letters[lIndex],openFont=S.openFonts[L.fontName];
  if(!openFont){alert('Devi usare un font caricato da te (.ttf/.otf) per poter dividere la geometria.');return;}
  const cmds=openFont.getPath(L.ch,0,0,L.fontSize).commands;
  let contours=[],cur=null;
  cmds.forEach(cmd=>{if(cmd.type==='M'){if(cur)contours.push(cur);cur=[cmd];}else if(cur)cur.push(cmd);});
  if(cur)contours.push(cur);
  if(contours.length<=1){toast('Questa lettera e un pezzo unico.');return;}
  let cdata=contours.map(c=>{
    let xMin=Infinity,xMax=-Infinity,yMin=Infinity,yMax=-Infinity;
    c.forEach(cmd=>{
      ['x','y','x1','y1','x2','y2'].forEach(k=>{if(cmd[k]!==undefined){if(k.startsWith('x')){xMin=Math.min(xMin,cmd[k]);xMax=Math.max(xMax,cmd[k]);}else{yMin=Math.min(yMin,cmd[k]);yMax=Math.max(yMax,cmd[k]);}}});
    });
    return{cmds:c,box:{xMin,xMax,yMin,yMax},area:(xMax-xMin)*(yMax-yMin)};
  });
  cdata.sort((a,b)=>b.area-a.area);
  let pieces=[];
  cdata.forEach(contour=>{
    let isHole=false;
    for(let piece of pieces){
      const pb=piece.box,cb=contour.box;
      if(cb.xMin>=pb.xMin-1&&cb.xMax<=pb.xMax+1&&cb.yMin>=pb.yMin-1&&cb.yMax<=pb.yMax+1){piece.contours.push(contour);isHole=true;break;}
    }
    if(!isHole)pieces.push({box:contour.box,contours:[contour]});
  });
  if(pieces.length<=1){toast('Questa lettera e un unico pezzo con un buco.');return;}
  const newIds=[];
  pieces.forEach(piece=>{
    const d=piece.contours.map(c=>c.cmds.map(cmd=>{
      if(cmd.type==='M')return`M ${cmd.x} ${cmd.y}`;
      if(cmd.type==='L')return`L ${cmd.x} ${cmd.y}`;
      if(cmd.type==='C')return`C ${cmd.x1} ${cmd.y1}, ${cmd.x2} ${cmd.y2}, ${cmd.x} ${cmd.y}`;
      if(cmd.type==='Q')return`Q ${cmd.x1} ${cmd.y1}, ${cmd.x} ${cmd.y}`;
      if(cmd.type==='Z')return'Z';return'';
    }).join(' ')).join(' ');
    S.letters.push({...L,id:uid++,customPath:d});
    newIds.push(S.letters.length-1);
  });
  S.letters.splice(lIndex,1);S.sel.clear();newIds.forEach(id=>S.sel.add(id));
  render();upd();toast(`Separato in ${pieces.length} pezzi 3D pronti ✓`);
}

function toggleFont(n){S.selectedFonts.has(n)?S.selectedFonts.delete(n):S.selectedFonts.add(n);renderFonts();upd();}
function selectAllFonts(){Object.keys(S.fonts).forEach(n=>S.selectedFonts.add(n));renderFonts();toast(`${S.selectedFonts.size} font selezionati ✓`);}
function clearFontSelection(){S.selectedFonts.clear();renderFonts();upd();}
function toggleSelFromPanel(i){if(S.sel.has(i))S.sel.delete(i);render();renderHandles();upd();}

document.addEventListener('keydown', e => {
  // Ignora se l'utente sta scrivendo in un campo di testo
  if(e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  const is3D = document.getElementById('preview-3d-overlay').style.display === 'block';

  // 1. Gestione corretta Eliminazione (Canc / Backspace)
  if(e.key === 'Delete' || e.key === 'Backspace') {
    if(is3D) delete3DSelection();
    else deleteSelected();
    return;
  }

  // 2. Undo / Redo Robusto (Supporta Maiuscole, Layout diversi e Ctrl+Shift+Z)
  const keyZ = (e.key && e.key.toLowerCase() === 'z') || e.code === 'KeyZ';
  const keyY = (e.key && e.key.toLowerCase() === 'y') || e.code === 'KeyY';
  
  const isUndo = (e.ctrlKey || e.metaKey) && keyZ && !e.shiftKey;
  const isRedo = ((e.ctrlKey || e.metaKey) && keyY) || ((e.ctrlKey || e.metaKey) && e.shiftKey && keyZ);

  if(isUndo) {
    e.preventDefault();
    if(is3D) undo3D(); else undo();
    return;
  }
  
  if(isRedo) {
    e.preventDefault();
    if(is3D) redo3D(); else redo();
    return;
  }

  // 3. Altre scorciatoie globali
  if((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A' || e.code === 'KeyA')) { e.preventDefault(); selectAll(); }
  if((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D' || e.code === 'KeyD')) { e.preventDefault(); duplicateSel(); }
  if((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomIn(); }
  if((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); zoomOut(); }
  if((e.ctrlKey || e.metaKey) && e.key === '0') { e.preventDefault(); zoomReset(); }

  // 4. Frecce Direzionali della Tastiera
  // Nel 2D muovono le lettere. Nel 3D NON devono fare nulla (si usa il gizmo/mouse).
  if(!is3D) {
    const step = e.shiftKey ? 10 : 1;
    if(e.key === 'ArrowLeft') { e.preventDefault(); aps(l => l.x -= step); }
    if(e.key === 'ArrowRight') { e.preventDefault(); aps(l => l.x += step); }
    if(e.key === 'ArrowUp') { e.preventDefault(); aps(l => l.y -= step); }
    if(e.key === 'ArrowDown') { e.preventDefault(); aps(l => l.y += step); }
  }

  // 5. Livelli
  if(e.ctrlKey && e.key === '1') { e.preventDefault(); setSelectedLayer(1); }
  if(e.ctrlKey && e.key === '2') { e.preventDefault(); setSelectedLayer(2); }
  if(e.ctrlKey && e.key === '3') { e.preventDefault(); setSelectedLayer(3); }
});

function toast(msg){
  const el=document.createElement('div');
  el.textContent=msg;
  Object.assign(el.style,{position:'fixed',bottom:'22px',right:'22px',background:'#c8ff00',color:'#000',padding:'7px 14px',borderRadius:'3px',fontFamily:'DM Mono,monospace',fontSize:'12px',zIndex:9999,boxShadow:'0 4px 20px rgba(0,0,0,.5)',transition:'opacity .3s'});
  document.body.appendChild(el);
  setTimeout(()=>{el.style.opacity='0';setTimeout(()=>el.remove(),300);},2200);
}

const svgEl = document.getElementById('svg');
svgEl.addEventListener('mousedown', e => {
  if(e.button === 1) { 
    e.preventDefault(); 
    e.stopPropagation(); 
    startPan(e); // Middle mouse button - start panning
    return; 
  }
  if(e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' ||
     e.target.closest('input') || e.target.closest('textarea')) return;
  smd(e);
}, {passive: false});
svgEl.addEventListener('auxclick', e => {
  if(e.button === 1) { e.preventDefault(); e.stopPropagation(); }
}, {passive: false});
svgEl.addEventListener('contextmenu', e => {
  e.preventDefault();
});
document.getElementById('cw').addEventListener('contextmenu', e => {
  e.preventDefault();
});
saveState();

// ── Unisci selezionati: assegna stesso groupId e统一 colore ─────────────
requestAnimationFrame(() => {
  const cw = document.getElementById('cw');
  cw.scrollLeft = (cw.scrollWidth - cw.clientWidth) / 2;
  cw.scrollTop  = (cw.scrollHeight - cw.clientHeight) / 2;
});

// Fix: dopo un confirm() il browser può "perdere" il focus sul documento.
// Quando l'utente clicca sul canvas wrapper, se non sta cliccando su un input,
// forziamo il blur dell'elemento attivo così i keydown tornano al documento.
document.getElementById('cw').addEventListener('mousedown', function(e) {
  if(e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA'){
    if(document.activeElement &&
       document.activeElement !== document.body &&
       document.activeElement.tagName !== 'INPUT' &&
       document.activeElement.tagName !== 'TEXTAREA'){
      document.activeElement.blur();
    }
  }
}, true);

// ── AUTO-UPDATE NOTIFICATION FUNCTIONS ───────────────────────────────────
let updateState = { available: false, version: '', downloading: false, downloaded: false };

function showUpdateNotify(info) {
  const panel = document.getElementById('update-notify');
  const overlay = document.getElementById('update-overlay');
  const verEl = document.getElementById('un-version');
  const fillEl = document.getElementById('un-fill');
  const pctEl = document.getElementById('un-pct');
  const downloadBtn = document.getElementById('un-download-btn');
  const restartBtn = document.getElementById('un-restart-btn');
  const infoEl = document.getElementById('un-info');

  updateState.available = true;
  if (info && info.version) updateState.version = info.version;

  verEl.textContent = 'Versione ' + updateState.version;
  fillEl.style.width = updateState.downloaded ? '100%' : '0%';
  pctEl.textContent = updateState.downloaded ? '100%' : '0%';
  downloadBtn.style.display = (updateState.downloaded || updateState.downloading) ? 'none' : 'block';
  restartBtn.style.display = updateState.downloaded ? 'block' : 'none';
  infoEl.style.display = updateState.downloaded ? 'block' : 'none';
  if (updateState.downloaded) infoEl.innerHTML = "L'aggiornamento verrà installato al riavvio.";

  if (overlay) overlay.classList.add('show');
  panel.classList.add('show');
}

function hideUpdateNotify() {
  const panel = document.getElementById('update-notify');
  const overlay = document.getElementById('update-overlay');
  if (panel) panel.classList.remove('show');
  if (overlay) overlay.classList.remove('show');
}

function downloadUpdate() {
  if (updateState.downloading) return;
  updateState.downloading = true;

  const downloadBtn = document.getElementById('un-download-btn');
  const fillEl = document.getElementById('un-fill');
  const pctEl = document.getElementById('un-pct');

  if (downloadBtn) downloadBtn.style.display = 'none';
  if (fillEl) fillEl.style.width = '10%';
  if (pctEl) pctEl.textContent = 'Inizio download...';

  window.electronAPI.downloadUpdate().then(result => {
    if (!result.success) {
      toast('Errore download: ' + (result.error || 'sconosciuto'));
      updateState.downloading = false;
      if (downloadBtn) downloadBtn.style.display = 'block';
      if (fillEl) fillEl.style.width = '0%';
      if (pctEl) pctEl.textContent = '0%';
    }
  }).catch(err => {
    toast('Errore download: ' + err.message);
    updateState.downloading = false;
    if (downloadBtn) downloadBtn.style.display = 'block';
    if (fillEl) fillEl.style.width = '0%';
    if (pctEl) pctEl.textContent = '0%';
  });
}

function quitAndInstall() {
  window.electronAPI.quitAndInstall();
}

function handleUpdateStatus(data) {
  const panel = document.getElementById('update-notify');
  const verEl = document.getElementById('un-version');
  const fillEl = document.getElementById('un-fill');
  const pctEl = document.getElementById('un-pct');
  const downloadBtn = document.getElementById('un-download-btn');
  const restartBtn = document.getElementById('un-restart-btn');
  const infoEl = document.getElementById('un-info');

  // Home screen elements
  const homeVer = document.getElementById('home-version-display');
  const homeStatus = document.getElementById('home-update-status');
  const homeSpinner = document.getElementById('home-update-spinner');
  const homeIcon = document.getElementById('home-update-icon');

  switch(data.status) {
    case 'checking':
      if (homeStatus) homeStatus.style.display = 'flex';
      if (homeSpinner) homeSpinner.style.display = 'block';
      if (homeIcon) homeIcon.style.display = 'none';
      break;

    case 'available':
      updateState.version = data.version;
      updateState.available = true;
      if (homeVer) homeVer.style.display = 'block'; 
      if (homeStatus) homeStatus.style.display = 'flex';
      if (homeSpinner) homeSpinner.style.display = 'none';
      if (homeIcon) {
        homeIcon.style.display = 'flex';
        homeIcon.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="color:var(--accent2);"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          <span style="color:var(--accent2); font-size:13px; font-weight:700; white-space:nowrap;">Download</span>
        `;
        homeIcon.onclick = () => showUpdateNotify({ version: data.version });
      }
      break;

    case 'not-available':
      if (homeVer) homeVer.style.display = 'block';
      if (homeStatus) homeStatus.style.display = 'flex';
      if (homeSpinner) homeSpinner.style.display = 'none';
      if (homeIcon) {
        homeIcon.style.display = 'flex';
        homeIcon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4caf50" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" title="Software aggiornato"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        homeIcon.onclick = null;
      }
      break;

    case 'downloading':
      updateState.downloading = true;
      const pct = Math.round(data.percent);
      if (fillEl) fillEl.style.width = pct + '%';
      if (pctEl) pctEl.textContent = pct + '% - Download in corso...';
      if (homeVer) homeVer.style.display = 'block';
      if (homeStatus) homeStatus.style.display = 'flex';
      if (homeSpinner) homeSpinner.style.display = 'none';
      if (homeIcon) {
        homeIcon.style.display = 'flex';
        homeIcon.innerHTML = `
          <div class="spinner" style="width:12px; height:12px; border-width:2px; margin-right:5px"></div>
          <span style="font-size:13px; font-weight:700; color:var(--accent2)">Download ${pct}%</span>
        `;
      }
      break;

    case 'downloaded':
      updateState.downloading = false;
      updateState.downloaded = true;
      updateState.version = data.version;

      if (verEl) verEl.textContent = 'Versione ' + data.version + ' pronta!';
      if (fillEl) fillEl.style.width = '100%';
      if (pctEl) pctEl.textContent = '100%';
      if (downloadBtn) downloadBtn.style.display = 'none';
      if (restartBtn) restartBtn.style.display = 'block';
      if (infoEl) {
        infoEl.style.display = 'block';
        infoEl.innerHTML = "L'aggiornamento verrà installato al riavvio.";
      }

      if (homeVer) homeVer.style.display = 'block';
      if (homeStatus) homeStatus.style.display = 'flex';
      if (homeSpinner) homeSpinner.style.display = 'none';
      if (homeIcon) {
        homeIcon.style.display = 'flex';
        homeIcon.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4caf50" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
          <span style="color:#4caf50; font-size:13px; font-weight:700; white-space:nowrap;">Riavvia per installare</span>
        `;
        homeIcon.onclick = () => showUpdateNotify();
      }

      // Se il pannello è già aperto, lo aggiorniamo, altrimenti lo mostriamo
      if (panel && panel.classList.contains('show')) {
        // Già mostrato
      } else {
        toast('Download completato! Riavvia per installare.');
      }
      break;

    case 'error':
      updateState.downloading = false;
      console.error('[RENDERER] Update error:', data.error);
      if (homeSpinner) homeSpinner.style.display = 'none';
      if (homeIcon) {
        homeIcon.style.display = 'flex';
        homeIcon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="color:#ff4444" title="Errore aggiornamento."><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
      }
      break;
  }
}
// ── 3D PREVIEW MODULE ──────────────────────────────────────────────────────
let threeScene = null;
let threeCamera = null;
let threeRenderer = null;
let threeControls = null;
let threeMeshes = [];
let threeExtrusionLevels = {};
let threeVisibilityState = {}; // Track visibility per color
let threeAnimationId = null;
let threeGridHelper = null;
let threeAmbientLight = null;
let threeDirectionalLight1 = null;
let threeDirectionalLight2 = null;
let threeGraphicsSettings = {
  gridVisible: true,
  bgColor: '#1a1a22',
  ambientIntensity: 0.6,
  specular: 0x444444,
  shininess: 30,
  smoothShading: true
};

// 3D History
S.history3D = [];
S.historyIndex3D = -1;

function saveState3D() {
  if (S.historyIndex3D < S.history3D.length - 1) {
    S.history3D = S.history3D.slice(0, S.historyIndex3D + 1);
  }

  // Save snapshot of all meshes — store actual material color as source of truth
  const meshSnapshots = threeMeshes.map(mesh => {
    const matColor = (mesh.material && mesh.material.color)
      ? '#' + mesh.material.color.getHexString()
      : (mesh.userData.colorHex || '#ffffff');
    return {
      position: mesh.position.clone(),
      quaternion: mesh.quaternion.clone(),
      scale: mesh.scale.clone(),
      visible: mesh.visible,
      colorHex: matColor,
      isBooleanResult: mesh.userData.isBooleanResult || false,
      isSubtractResult: mesh.userData.isSubtractResult || false,
      hiddenByBoolean: mesh.userData.hiddenByBoolean || false,
    };
  });

  const extrusionLevelsData = {};
  for (const col in threeExtrusionLevels) {
    extrusionLevelsData[col] = threeExtrusionLevels[col].extrusion;
  }

  const state = {
    meshSnapshots: meshSnapshots,
    meshCount: threeMeshes.length,
    extrusionLevels: extrusionLevelsData,
    visibilityState: JSON.parse(JSON.stringify(threeVisibilityState || {})),
    graphics: JSON.parse(JSON.stringify(threeGraphicsSettings)),
  };

  S.history3D.push(state);
  if (S.history3D.length > 50) S.history3D.shift();
  else S.historyIndex3D++;
}

function undo3D() {
  if (S.historyIndex3D > 0) {
    S.historyIndex3D--;
    restoreState3D(S.history3D[S.historyIndex3D]);
    toast('Annullato (3D)');
  }
}

function redo3D() {
  if (S.historyIndex3D < S.history3D.length - 1) {
    S.historyIndex3D++;
    restoreState3D(S.history3D[S.historyIndex3D]);
    toast('Ripristinato (3D)');
  }
}

function restoreState3D(state) {
  // ── Step 1: Hide result meshes that were added AFTER this state was saved ──
  // IMPORTANT: We NEVER dispose geometry here. Disposing prevents redo from restoring
  // the result mesh. Instead we simply hide these meshes; Step 2 will set definitive
  // visibility via the snapshot, while meshes beyond the snapshot range stay hidden.
  for (let i = state.meshCount; i < threeMeshes.length; i++) {
    const mesh = threeMeshes[i];
    if (!mesh) continue;
    mesh.visible = false;
    mesh.userData.hiddenByBoolean = true;
  }

  // ── Step 2: Restore per-mesh transform, color, and visibility from snapshot ──
  // The snapshot is the single source of truth for visible/hiddenByBoolean.
  // This correctly handles both undo (result hidden, originals shown) and
  // redo (result shown, originals hidden) without any extra logic.
  if (state.meshSnapshots) {
    state.meshSnapshots.forEach((snap, i) => {
      const mesh = threeMeshes[i];
      if (!mesh) return;
      mesh.position.copy(snap.position);
      mesh.quaternion.copy(snap.quaternion);
      mesh.scale.copy(snap.scale);
      if (mesh.material && snap.colorHex) {
        mesh.material.color.set(snap.colorHex);
      }
      mesh.userData.colorHex = snap.colorHex;
      mesh.userData.oldColorHex = null;
      mesh.visible = snap.visible;
      mesh.userData.hiddenByBoolean = snap.hiddenByBoolean || false;
    });
  }

  // ── Step 3: Rebuild threeExtrusionLevels from currently visible meshes ──
  const oldExtrusion = {};
  for (const col in threeExtrusionLevels) {
    oldExtrusion[col] = threeExtrusionLevels[col].extrusion;
  }
  for (const col in state.extrusionLevels) {
    oldExtrusion[col] = state.extrusionLevels[col];
  }

  threeExtrusionLevels = {};
  threeMeshes.forEach(mesh => {
    if (!mesh || mesh.userData.hiddenByBoolean) return;
    const color = mesh.userData.colorHex || '#ffffff';
    if (!threeExtrusionLevels[color]) {
      threeExtrusionLevels[color] = {
        extrusion: oldExtrusion[color] !== undefined ? oldExtrusion[color] : 20,
        meshes: []
      };
    }
    if (!threeExtrusionLevels[color].meshes.includes(mesh)) {
      threeExtrusionLevels[color].meshes.push(mesh);
    }
  });

  // ── Step 4: Restore visibility state (skip meshes hidden by boolean ops) ──
  threeVisibilityState = JSON.parse(JSON.stringify(state.visibilityState));
  threeMeshes.forEach(mesh => {
    if (mesh.userData.hiddenByBoolean) return; // Preserve snapshot-driven visibility
    const color = mesh.userData.colorHex || '#ffffff';
    if (threeVisibilityState[color] !== undefined) {
      mesh.visible = threeVisibilityState[color];
    }
  });

  // ── Step 5: Restore graphics settings ──
  threeGraphicsSettings = JSON.parse(JSON.stringify(state.graphics));
  const gridToggleBtn = document.getElementById('grid-toggle-btn');
  if (gridToggleBtn) gridToggleBtn.style.color = threeGraphicsSettings.gridVisible ? 'var(--accent)' : 'var(--muted)';
  const bgColorDot = document.getElementById('bg-color-picker-dot');
  if (bgColorDot) bgColorDot.style.background = threeGraphicsSettings.bgColor;
  if (threeGridHelper) threeGridHelper.visible = threeGraphicsSettings.gridVisible;
  if (threeScene) threeScene.background = new THREE.Color(threeGraphicsSettings.bgColor);
  if (threeAmbientLight) threeAmbientLight.intensity = threeGraphicsSettings.ambientIntensity;

  // ── Step 6: Clear selection (avoids stale references after undo/redo) ──
  threeSelectionOrder = [];
  threeSelectedMesh = null;
  threeSelectionIndicator.forEach(ind => { if (threeScene) threeScene.remove(ind); });
  threeSelectionIndicator = [];
  if (threeTransformControls) {
    threeTransformControls.detach();
    if (threeTransformControls._pivot) {
      threeScene.remove(threeTransformControls._pivot);
      threeTransformControls._pivot = null;
    }
  }

  // ── Step 7: Rebuild UI ──
  buildExtrusionControlsFromState();
  refresh3DControlsUI();
  update3DSelectionHUD();
  if (threeControls) threeControls.update();
}

function refresh3DControlsUI() {
  const container = document.getElementById('extrusion-controls');
  if (!container) return;

  const rows = container.querySelectorAll('[data-color]');
  rows.forEach(row => {
    const color = row.dataset.color;
    if (threeExtrusionLevels[color]) {
      const slider = row.querySelector('input[type="range"]');
      const numberInput = row.querySelector('input[type="number"]');
      const eyeBtn = row.querySelector('button');
      
      if (slider) slider.value = threeExtrusionLevels[color].extrusion;
      if (numberInput) numberInput.value = threeExtrusionLevels[color].extrusion;
      
      const isVisible = threeVisibilityState[color] !== false;
      if (eyeBtn) {
        eyeBtn.innerHTML = isVisible ? '👁' : '👁‍🗨';
        eyeBtn.style.opacity = isVisible ? '1' : '0.5';
      }
    }
  });
}

// 3D Object Selection
let threeSelectedMesh = null;
let threeSelectionOrder = []; // Track selection order for boolean ops
let threeRaycaster = new THREE.Raycaster();
let threeMouse = new THREE.Vector2();
let threeSelectionIndicator = []; // Visual indicators for selected objects
let threeTransformControls = null; // Transform gizmo for moving objects

function open3DPreview() {
  try {
    // Show overlay
    const overlay = document.getElementById('preview-3d-overlay');
    overlay.style.display = 'block';

    // Initialize Three.js scene
    init3DScene();

    // Setup keyboard handlers for 3D canvas
    setup3DCanvasKeyboard();

    // Build 3D objects from canvas elements
    build3DObjects();

    // Start animation loop
    start3DAnimation();

    // Initialize selection HUD
    setTimeout(() => {
      // Sync UI button state
      const btn = document.getElementById('toggle-transform-btn');
      if (btn) btn.style.color = threeTransformEnabled ? '#00ff88' : '#5a5a7a';
      
      update3DSelectionHUD();
      initColorPresets();
    }, 150);

    // Initialize 3D history
    S.history3D = [];
    S.historyIndex3D = -1;
    saveState3D();
  } catch (e) {
    console.error('Crash in open3DPreview:', e);
    toast('Errore nell\'apertura dell\'anteprima 3D: ' + e.message);
    // Hide overlay if it failed
    const overlay = document.getElementById('preview-3d-overlay');
    if (overlay) overlay.style.display = 'none';
  }
}

function close3DPreview() {
  customConfirm('Chiudere l\'anteprima 3D?', () => {
    // Stop animation loop
    if (threeAnimationId) {
      cancelAnimationFrame(threeAnimationId);
      threeAnimationId = null;
    }

    // Remove event listeners
    if (threeRenderer && threeRenderer.domElement) {
      threeRenderer.domElement.removeEventListener('click', on3DObjectClick);
      threeRenderer.domElement.removeEventListener('dblclick', on3DObjectDblClick);
    }

    // Dispose scene
    if (threeScene) {
      threeScene.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach(m => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
      threeScene.clear();
    }

    // Dispose renderer
    if (threeRenderer) {
      threeRenderer.dispose();
      const container = document.getElementById('preview-3d-canvas');
      if (container && threeRenderer.domElement.parentNode === container) {
        container.removeChild(threeRenderer.domElement);
      }
      threeRenderer = null;
    }

    threeMeshes = [];
    threeExtrusionLevels = {};
    threeSelectionOrder = [];
    threeSelectedMesh = null;
    
    // Clear selection indicators
    threeSelectionIndicator.forEach(ind => {
      if (threeScene) threeScene.remove(ind);
    });
    threeSelectionIndicator = [];

    // Dispose transform controls
    if (threeTransformControls) {
      threeTransformControls.detach();
      if (threeTransformControls._pivot) {
        threeScene.remove(threeTransformControls._pivot);
        threeTransformControls._pivot = null;
      }
      threeScene.remove(threeTransformControls);
      threeTransformControls.dispose();
      threeTransformControls = null;
    }

    // Remove selection HUD
    const hudEl = document.getElementById('sel3d-hud');
    if (hudEl) hudEl.remove();

    // Hide overlay
    const overlay = document.getElementById('preview-3d-overlay');
    overlay.style.display = 'none';
  });
}

// Keyboard shortcuts for 3D preview (Escape + Home only — Ctrl+Z/Y handled by main listener)
document.addEventListener('keydown', (e) => {
  const overlay = document.getElementById('preview-3d-overlay');
  if (overlay.style.display === 'block') {
    if (e.key === 'Escape') {
      close3DPreview();
    } else if (e.key === 'Home') {
      // Reset camera view
      if (threeControls && threeMeshes.length > 0) {
        const globalBBox = new THREE.Box3();
        threeMeshes.forEach(mesh => {
          const bbox = new THREE.Box3().setFromObject(mesh);
          globalBBox.union(bbox);
        });
        const size = new THREE.Vector3();
        globalBBox.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = threeCamera.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.3;
        threeCamera.position.set(0, 0, cameraZ);
        threeControls.target.set(0, 0, 0);
        threeControls.update();
      }
    }
  }
});

// Also add keydown handler directly to the 3D canvas to ensure it captures events
function setup3DCanvasKeyboard() {
  const canvas = document.getElementById('preview-3d-canvas');
  if (!canvas) return;
  
  // Make canvas focusable
  canvas.setAttribute('tabindex', '0');
  
  canvas.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      close3DPreview();
    } else if (e.key === 'Home') {
      // Reset camera view
      if (threeControls && threeMeshes.length > 0) {
        const globalBBox = new THREE.Box3();
        threeMeshes.forEach(mesh => {
          const bbox = new THREE.Box3().setFromObject(mesh);
          globalBBox.union(bbox);
        });
        const size = new THREE.Vector3();
        globalBBox.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = threeCamera.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.3;
        threeCamera.position.set(0, 0, cameraZ);
        threeControls.target.set(0, 0, 0);
        threeControls.update();
      }
    }
    // Ctrl+Z / Ctrl+Y propagate to document listener — no duplicate handling here
  });
  
  // Auto-focus canvas when 3D preview opens
  canvas.focus();
}

function init3DScene() {
  const container = document.getElementById('preview-3d-canvas');
  
  // Clear previous renderer if any
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
  
  // Create scene
  threeScene = new THREE.Scene();
  threeScene.background = new THREE.Color(0x1a1a22);
  
  // Create camera
  const aspect = container.clientWidth / container.clientHeight;
  threeCamera = new THREE.PerspectiveCamera(60, aspect, 0.1, 10000);
  threeCamera.position.set(0, 0, 800);
  
  // Create renderer
  threeRenderer = new THREE.WebGLRenderer({ antialias: true });
  threeRenderer.setSize(container.clientWidth, container.clientHeight);
  threeRenderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(threeRenderer.domElement);
  
  // Add OrbitControls for interactive camera
  threeControls = new THREE.OrbitControls(threeCamera, threeRenderer.domElement);
  threeControls.enableDamping = true;
  threeControls.dampingFactor = 0.08;
  threeControls.rotateSpeed = 0.6;
  threeControls.zoomSpeed = 1.2;
  threeControls.panSpeed = 0.8;
  // Configure mouse buttons: Middle = PAN, Right = ZOOM
  threeControls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.PAN,
    RIGHT: THREE.MOUSE.DOLLY
  };
  toast('3D Preview: Rotella=Pan, Destro=Zoom');

  // Add click handler for 3D object selection
  threeRenderer.domElement.addEventListener('click', on3DObjectClick);
  threeRenderer.domElement.addEventListener('dblclick', on3DObjectDblClick);
  
  // Add lighting
  threeAmbientLight = new THREE.AmbientLight(0xffffff, 0.6);
  threeScene.add(threeAmbientLight);
  
  threeDirectionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
  threeDirectionalLight1.position.set(200, 300, 400);
  threeScene.add(threeDirectionalLight1);
  
  threeDirectionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
  threeDirectionalLight2.position.set(-200, -100, 200);
  threeScene.add(threeDirectionalLight2);
  
  // Add grid helper for reference
  threeGridHelper = new THREE.GridHelper(1000, 50, 0x333344, 0x222233);
  threeGridHelper.rotation.x = Math.PI / 2;
  threeScene.add(threeGridHelper);

  // Initialize TransformControls (3D gizmo for moving objects)
  threeTransformControls = new THREE.TransformControls(threeCamera, threeRenderer.domElement);
  threeTransformControls.setSize(0.8);
  threeTransformControls.setSpace('world');
  threeTransformControls.setMode('translate');
  threeTransformControls.visible = false;
  threeScene.add(threeTransformControls);

  // When dragging with gizmo, disable orbit controls and sync mesh with pivot
  threeTransformControls.addEventListener('dragging-changed', function (event) {
    threeControls.enabled = !event.value;
  });

  // objectChange: fires every frame while dragging — sync mesh to pivot position
  threeTransformControls.addEventListener('objectChange', function () {
    const pivot = threeTransformControls._pivot;
    if (!pivot) return;
    const mesh = pivot.userData.targetMesh;
    if (!mesh) return;

    // Save start positions on first drag frame
    if (!threeTransformControls._dragging) {
      threeTransformControls._pivotStartPos = pivot.position.clone();
      threeTransformControls._meshStartPos = mesh.position.clone();
      threeTransformControls._dragging = true;
    }

    // Apply delta: mesh moves same amount as pivot moved from start
    const delta = new THREE.Vector3().subVectors(pivot.position, threeTransformControls._pivotStartPos);
    mesh.position.copy(threeTransformControls._meshStartPos).add(delta);
  });

  // Drag ended — clean up
  threeTransformControls.addEventListener('mouseUp', function () {
    if (threeTransformControls._pivot) {
      const mesh = threeTransformControls._pivot.userData.targetMesh;
      if (mesh && mesh.userData.letterId !== undefined) {
        const l = S.letters.find(x => x.id === mesh.userData.letterId);
        if (l && l.isSTL) {
          l.pos3d = { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z };
          l.rot3d = { x: mesh.rotation.x, y: mesh.rotation.y, z: mesh.rotation.z };
          l.sca3d = { x: mesh.scale.x, y: mesh.scale.y, z: mesh.scale.z };
          // Aggiorna posizione 2D (approssimativa per icona)
          l.x = (S.canvasW / 2) + mesh.position.x;
          l.y = (S.canvasH / 2) + mesh.position.z;
        }
      }
      saveState3D();
      // Update position inputs after drag ends
      update3DPositionInputs();
    }
    threeTransformControls._dragging = false;
    threeTransformControls._pivotStartPos = null;
    threeTransformControls._meshStartPos = null;
  });

  // Pivot object for transform gizmo (positioned at bbox center of selected mesh)
  threeTransformControls._pivot = null;

  // Handle resize
  const resizeObserver = new ResizeObserver(() => {
    if (!threeCamera || !threeRenderer) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    threeCamera.aspect = width / height;
    threeCamera.updateProjectionMatrix();
    threeRenderer.setSize(width, height);
  });
  resizeObserver.observe(container);
}

/**
 * Build a geom2 representing ONLY the border ring of a glyph path, for 3D extrusion.
 *
 * Unlike buildBorderPathD (which relies on SVG even-odd fill), this function works
 * purely with JSCAD boolean operations:
 *   border = union( inflated_outer_i MINUS original_outer_i )  for each outer contour i
 *
 * Holes in the glyph are NOT subtracted — the border ring sits only around the outside
 * of each outer contour, never inside a hole.
 *
 * @param {string} pathD   - The original glyph SVG path string
 * @param {number} delta   - Border width in SVG-space units
 * @returns {geom2|null}   - OpenJSCAD geom2, or null on failure
 */
function buildBorderGeom2(pathD, delta) {
  if (!delta || delta <= 0) return null;
  if (!window.OpenJSCADBridge || !window.OpenJSCADBridge.initialized) return null;

  const jscad = window.OpenJSCADBridge.jscad;

  // ── 1. Discretise path into flat point arrays (SVG space, Y-down) ─────────
  const segs = pathToAbsoluteSegments(pathD);
  if (!segs || !segs.length) return null;

  const BSTEPS = 24;   // was 16 – more steps → smoother curves → fewer self-intersections in offset
  const subpaths = [];
  let cur = [], cx = 0, cy = 0, sx = 0, sy = 0;

  for (const s of segs) {
    if (s.cmd === 'M') {
      if (cur.length >= 3) subpaths.push(cur);
      cur = [[s.x, s.y]]; cx = sx = s.x; cy = sy = s.y;
    } else if (s.cmd === 'L') {
      cur.push([s.x, s.y]); cx = s.x; cy = s.y;
    } else if (s.cmd === 'H') {
      cur.push([s.x, cy]); cx = s.x;
    } else if (s.cmd === 'V') {
      cur.push([cx, s.y]); cy = s.y;
    } else if (s.cmd === 'C') {
      for (let k = 1; k <= BSTEPS; k++) {
        const t = k/BSTEPS, mt = 1-t;
        cur.push([mt*mt*mt*cx+3*mt*mt*t*s.x1+3*mt*t*t*s.x2+t*t*t*s.x,
                  mt*mt*mt*cy+3*mt*mt*t*s.y1+3*mt*t*t*s.y2+t*t*t*s.y]);
      }
      cx = s.x; cy = s.y;
    } else if (s.cmd === 'Q') {
      for (let k = 1; k <= BSTEPS; k++) {
        const t = k/BSTEPS, mt = 1-t;
        cur.push([mt*mt*cx+2*mt*t*s.x1+t*t*s.x, mt*mt*cy+2*mt*t*s.y1+t*t*s.y]);
      }
      cx = s.x; cy = s.y;
    } else if (s.cmd === 'Z') {
      if (cur.length > 1) {
        const last = cur[cur.length-1];
        if (Math.hypot(last[0]-cur[0][0], last[1]-cur[0][1]) < 0.5) cur.pop();
      }
      if (cur.length >= 3) subpaths.push(cur);
      cur = []; cx = sx; cy = sy;
    }
  }
  if (cur.length >= 3) subpaths.push(cur);
  if (!subpaths.length) return null;

  // ── 2. Remove near-duplicate consecutive points ────────────────────────────
  function dedupe(pts) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      if (Math.hypot(pts[i][0]-out[out.length-1][0], pts[i][1]-out[out.length-1][1]) > 0.1)
        out.push(pts[i]);
    }
    return out;
  }

  // ── 3. Signed area in SVG space (positive = CCW = outer in SVG coords) ─────
  function signedAreaSVG(pts) {
    let a = 0, n = pts.length;
    for (let i = 0; i < n; i++) { const j=(i+1)%n; a += pts[i][0]*pts[j][1]-pts[j][0]*pts[i][1]; }
    return a / 2;
  }

  // ── 4. Convert SVG-space point array → JSCAD geom2 (flip Y) ───────────────
  // After normalization above, pts passed here are always CCW in SVG (positive area).
  // Flipping Y reverses winding → CW in JSCAD. fromPoints needs CCW → must reverse.
  // Also ensure polygon is closed (first == last) for fromPoints requirement.
  function toGeom2(svgPts) {
    // Flip Y and reverse to get CCW in JSCAD space
    let jpts = svgPts.map(p => [p[0], -p[1]]).reverse();
    // Close the polygon: if last != first, append first at end
    const n = jpts.length;
    if (n > 0) {
      const first = jpts[0];
      const last = jpts[n - 1];
      if (Math.hypot(first[0] - last[0], first[1] - last[1]) > 0.01) {
        jpts = [...jpts, [...first]];
      }
    }
    return jscad.geometries.geom2.fromPoints(jpts);
  }

  // ── 5. Classify subpaths ───────────────────────────────────────────────────
  // Many OpenType fonts produce CW outer contours (negative area in SVG coords).
  // Detect dominant winding from the LARGEST contour, same as parseSVGPathToGeom2.
  const allContours = [];
  for (const raw of subpaths) {
    const pts = dedupe(raw);
    if (pts.length < 3) continue;
    allContours.push({ pts, area: signedAreaSVG(pts) });
  }
  if (!allContours.length) return null;

  allContours.sort((a, b) => Math.abs(b.area) - Math.abs(a.area));
  const isReversed = allContours[0].area < 0;

  // outers: store both the ORIGINAL pts (for offsetContour2D) and normalized pts (for toGeom2)
  const outers = [];
  for (const { pts, area } of allContours) {
    const normArea = isReversed ? -area : area;
    if (normArea > 0) {
      // normPts: CCW in SVG space (for toGeom2 / JSCAD)
      const normPts = isReversed ? [...pts].reverse() : pts;
      // origPts: the original pts as they came from the font
      // offsetContour2D uses right-hand normal of edge direction.
      // For a true CCW contour in SVG, right-hand normal = outward → correct with +delta.
      // For a CW contour (isReversed font), right-hand normal = inward → need -delta.
      // So we always pass the normPts (CCW) and +delta to offsetContour2D.
      outers.push(normPts);
    }
    // Holes ignored
  }
  if (!outers.length) {
    console.warn(`buildBorderGeom2: no outers found. allContours.length=${allContours.length}, isReversed=${isReversed}, pathD="${pathD.substring(0, 120)}"`);
    return null;
  }

  // ── 6. For each outer: build inflated MINUS original, then union all rings ──
  // Helper: test whether a geom2 has valid closed outlines
  function isValidGeom2(g) {
    if (!g) return false;
    try { const ol = jscad.geometries.geom2.toOutlines(g); return ol && ol.length > 0; }
    catch(_) { return false; }
  }

  let borderGeom2 = null;

  for (const pts of outers) {
    // pts are CCW in SVG space (normalized). offsetContour2D expands CCW contours outward.
    const expandedSVG = offsetContour2D(pts, delta);
    if (!expandedSVG || expandedSVG.length < 3) {
      console.warn(`buildBorderGeom2: expandedSVG too few points for one outer (${expandedSVG?.length || 0})`);
      continue;
    }

    try {
      const inflatedG2 = toGeom2(expandedSVG);
      const originalG2 = toGeom2(pts);

      if (!inflatedG2 || !originalG2) {
        console.warn('buildBorderGeom2: toGeom2 returned null');
        continue;
      }

      // Ring = inflated shell MINUS the original glyph area.
      // For complex/curved letters the boolean subtract can produce a non-closed
      // geom2 (self-intersecting offset). Validate and fall back to inflated alone.
      let ring = null;
      try {
        const candidate = jscad.booleans.subtract(inflatedG2, originalG2);
        if (isValidGeom2(candidate)) {
          ring = candidate;
        } else {
          console.warn('buildBorderGeom2: subtract produced invalid geom2 – using inflated shape as fallback');
          ring = isValidGeom2(inflatedG2) ? inflatedG2 : null;
        }
      } catch(subErr) {
        console.warn('buildBorderGeom2: subtract threw – using inflated shape as fallback:', subErr.message);
        ring = isValidGeom2(inflatedG2) ? inflatedG2 : null;
      }

      if (!ring) {
        console.warn('buildBorderGeom2: no valid ring for this outer contour, skipping');
        continue;
      }

      if (!borderGeom2) {
        borderGeom2 = ring;
      } else {
        try {
          const united = jscad.booleans.union(borderGeom2, ring);
          borderGeom2 = isValidGeom2(united) ? united : borderGeom2;
        } catch(uErr) {
          console.warn('buildBorderGeom2: union threw, keeping previous geom2:', uErr.message);
        }
      }
    } catch(e) {
      console.warn('buildBorderGeom2: ring failed for one outer contour:', e.message);
    }
  }

  return borderGeom2 || null;
}

function build3DObjects() {
  // Clear previous meshes
  threeMeshes = [];
  threeExtrusionLevels = {};
  // DO NOT reset threeVisibilityState here to preserve user toggles during rebuilds
  // but ensure it's initialized
  if (!threeVisibilityState) threeVisibilityState = {};

  // STEP 1: Use EXACT same logic as exportSVG() to build items
  const ctx = document.getElementById('dc').getContext('2d');
  const sortedIndices = S.letters.map((_, i) => i)
    .sort((a, b) => (S.letters[a].layer || 2) - (S.letters[b].layer || 2));

  let items = [];

  sortedIndices.forEach((i, renderOrder) => {
    const l = S.letters[i];

    if (l.isSTL) {
      try {
        const binaryString = atob(l.stlData);
        const bytes = new Uint8Array(binaryString.length);
        for (let j = 0; j < binaryString.length; j++) bytes[j] = binaryString.charCodeAt(j);
        const geometry = _parseSTLBinary(bytes.buffer);
        const material = new THREE.MeshPhongMaterial({
          color: new THREE.Color(l.fill || '#111111'),
          specular: 0x444444,
          shininess: 30,
          side: THREE.DoubleSide,
          transparent: (l.op != null ? l.op : 1) < 1,
          opacity: l.op != null ? l.op : 1
        });
        const mesh = new THREE.Mesh(geometry, material);
        if (l.pos3d) {
          mesh.position.set(l.pos3d.x, l.pos3d.y, l.pos3d.z);
          mesh.rotation.set(l.rot3d.x, l.rot3d.y, l.rot3d.z);
          mesh.scale.set(l.sca3d.x, l.sca3d.y, l.sca3d.z);
        }
        mesh.userData.letterId = l.id;
        mesh.userData.isSTL = true;
        mesh.userData.colorHex = l.fill || '#111111';

        threeScene.add(mesh);
        threeMeshes.push(mesh);

        const cHex = mesh.userData.colorHex;
        if (!threeExtrusionLevels[cHex]) {
          threeExtrusionLevels[cHex] = { extrusion: 20, meshes: [] };
          if (threeVisibilityState[cHex] === undefined) threeVisibilityState[cHex] = true;
        }
        mesh.visible = threeVisibilityState[cHex];
        threeExtrusionLevels[cHex].meshes.push(mesh);
      } catch (e) {
        console.error("Error building STL in 3D rebuild:", e);
      }
      return;
    }

    const color = l.fill || '#000000';
    const opacity = (l.op != null) ? l.op : 1;
    const bw = l.borderWidth || 0;
    const bc = l.borderColor || '#000000';
    const groupId = l.groupId || null;

    ctx.font = `${l.fontSize}px ${l.fontFamily}`;
    const mw = l.isGroup ? l.groupW : (l.isSvgImport ? (l.svgW || 100) : ctx.measureText(l.ch).width);

    const outerM = _buildLetterMatrix(l, mw);
    let pathD = '';
    let bbox = null;

    if (l.isGroup && l.groupHTML) {
      const dx = l.x - (l.originalX || l.x);
      const dy = l.y - (l.originalY || l.y);
      const innerM = outerM.translate(dx, dy);

      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = l.groupHTML;
      const allSegs = [];
      tempDiv.querySelectorAll('path').forEach(p => {
        const d = p.getAttribute('d');
        if (!d) return;
        const pTfStr = p.getAttribute('transform') || '';
        const pM = pTfStr ? parseTransformToMatrix(pTfStr) : new DOMMatrix();
        const combined = innerM.multiply(pM);
        const segs = pathToAbsoluteSegments(d);
        allSegs.push(...applyMatrixToSegs(segs, combined));
      });
      if (allSegs.length) {
        pathD = segsToPathD(allSegs);
        bbox = _realBBox(pathD);
      }
    } else if (l.customPath) {
      const innerX = l.isSvgImport ? l.x - (l.svgW || mw) / 2 : l.x - mw / 2;
      const innerY = l.y;
      const combined = outerM.translate(innerX, innerY);
      const segs = pathToAbsoluteSegments(l.customPath);
      const transformed = applyMatrixToSegs(segs, combined);
      pathD = segsToPathD(transformed);
      bbox = _realBBox(pathD);
    } else if (S.openFonts[l.fontName]) {
      const innerX = l.x - mw / 2;
      const innerY = l.y;
      const combined = outerM.translate(innerX, innerY);
      try {
        const d = S.openFonts[l.fontName].getPath(l.ch, 0, 0, l.fontSize).toPathData(4);
        const segs = pathToAbsoluteSegments(d);
        const transformed = applyMatrixToSegs(segs, combined);
        pathD = segsToPathD(transformed);
        bbox = _realBBox(pathD);
      } catch(e) {
        console.warn('3D Path creation failed for font, using fallback:', e);
        const fs = l.fontSize || 80;
        const estW = fs * 0.65;
        const estH = fs;
        const x = l.x - estW / 2;
        const y = l.y - estH;
        pathD = `M${x},${y} L${x+estW},${y} L${x+estW},${y+estH} L${x},${y+estH} Z`;
        bbox = { x, y, x2: x+estW, y2: y+estH };
      }
    } else {
      // System font fallback
      const fs = l.fontSize || 80;
      const estW = fs * 0.65;
      const estH = fs;
      const x = l.x - estW / 2;
      const y = l.y - estH;
      pathD = `M${x},${y} L${x+estW},${y} L${x+estW},${y+estH} L${x},${y+estH} Z`;
      bbox = { x, y, x2: x+estW, y2: y+estH };
    }

    if (pathD && bbox) {
      // Add the main shape
      items.push({ pathD, bbox, color, opacity, renderOrder, groupId, isBorder: false, borderWidth: 0 });

      // Add border as a SEPARATE 3D object
      // Use buildBorderGeom2 directly (same logic used by build3DObjects) which
      // creates a proper ring via CSG subtract: inflated - original
      if (bw > 0) {
        const borderGeom2 = buildBorderGeom2(pathD, bw);
        if (borderGeom2) {
          items.push({
            geom2: borderGeom2,   // pass geom2 directly, skip parseSVGPathToGeom2
            pathD,
            bbox,
            color: bc,
            opacity,
            renderOrder: renderOrder + 0.1,
            groupId,
            isBorder: true,
            borderWidth: bw
          });
        } else {
          console.warn(`buildBorderGeom2 returned null for letter "${l.ch}" (id=${l.id}, font=${l.fontName}, pathD="${pathD.substring(0, 80)}...")`);
        }
      }
    }
  });

  if (!items.length) {
    toast('Nessun elemento valido per il 3D!');
    close3DPreview();
    return;
  }

  // STEP 2: Convert paths to 3D meshes using OpenJSCAD ONLY
  const extrusionDepth = 20;
  const colorGroups = {};

  items.forEach((item) => {
    try {
      if (!window.OpenJSCADBridge || !window.OpenJSCADBridge.initialized) return;

      const jscad = window.OpenJSCADBridge.jscad;
      // Use pre-computed geom2 for borders (from buildBorderGeom2 via CSG subtract),
      // otherwise parse the path normally
      let geom2 = item.geom2
        || window.OpenJSCADBridge.parseSVGPathToGeom2(item.pathD);
      if (!geom2) return;

      // Both border and normal shapes are now handled the same way
      // Border paths come from buildBorderPathD (same as 2D), so they're already complete rings

      const geom3 = window.OpenJSCADBridge.extrudeGeom2ToGeom3(geom2, extrusionDepth);
      if (!geom3) return;

      const geometry = window.OpenJSCADBridge.geom3ToThreeGeometry(geom3);
      geometry.userData.isJSCAD = true;
      geometry.userData.csgDepth = extrusionDepth;
      geometry.userData.originalGeom2 = geom2;
      geometry.userData.originalPathD = item.pathD;


      const material = new THREE.MeshPhongMaterial({
        color: new THREE.Color(item.color),
        specular: 0x444444,
        shininess: 30,
        side: THREE.DoubleSide,
        transparent: item.opacity < 1,
        opacity: item.opacity
      });

      const mesh = new THREE.Mesh(geometry, material);

      // Position: keep everything at 0,0,0 initially,
      // but offset borders slightly in front to avoid Z-fighting with their parent letters
      mesh.position.set(0, 0, item.isBorder ? 0.05 : 0);

      // Tag mesh
      mesh.userData.bbox2D = item.bbox;
      mesh.userData.colorHex = item.color;
      mesh.userData.groupId = item.groupId;
      mesh.userData.isJSCAD = true;
      mesh.userData.isBorder = item.isBorder;

      threeScene.add(mesh);
      threeMeshes.push(mesh);

      // Visibility and extrusion levels
      if (!threeExtrusionLevels[item.color]) {
        threeExtrusionLevels[item.color] = { extrusion: extrusionDepth, meshes: [] };
        if (threeVisibilityState[item.color] === undefined) threeVisibilityState[item.color] = true;
      }
      mesh.visible = threeVisibilityState[item.color];
      threeExtrusionLevels[item.color].meshes.push(mesh);

      if (!colorGroups[item.color]) colorGroups[item.color] = [];
      colorGroups[item.color].push(item);


    } catch (e) {
      console.error('Errore nel creare mesh 3D:', e);
    }
  });

  // Build extrusion controls
  buildExtrusionControls(colorGroups);

  // STEP 3: Position objects so front face is at z=0 (not center)
  if (threeCamera && threeControls && threeMeshes.length > 0) {
    const globalBBox = new THREE.Box3();
    threeMeshes.forEach(mesh => {
      const bbox = new THREE.Box3().setFromObject(mesh);
      globalBBox.union(bbox);
    });

    const center = new THREE.Vector3();
    globalBBox.getCenter(center);

    const size = new THREE.Vector3();
    globalBBox.getSize(size);

    // Center X and Y, but keep front face at z=0
    threeMeshes.forEach(mesh => {
      mesh.position.x -= center.x;
      mesh.position.y -= center.y;
      // Move mesh so front face (min Z) is at z=0 instead of centered
      mesh.position.z -= globalBBox.min.z;
    });

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = threeCamera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.3;

    threeCamera.position.set(0, 0, cameraZ);
    threeControls.target.set(0, 0, size.z / 2); // Look at center of extruded depth
    threeControls.update();
  }
}

function pathD_to_ThreeShapes(pathD) {
  const shapes = [];

  try {
    const commands = parseSVGPath(pathD);
    if (!commands.length) return shapes;

    // Group commands by M (move to) to separate subpaths
    const subpaths = [];
    let currentSubpath = [];

    commands.forEach(cmd => {
      if (cmd.type === 'M') {
        if (currentSubpath.length > 0) {
          subpaths.push(currentSubpath);
        }
        currentSubpath = [cmd];
      } else {
        currentSubpath.push(cmd);
      }
    });

    if (currentSubpath.length > 0) {
      subpaths.push(currentSubpath);
    }

    if (subpaths.length === 0) return shapes;

    // Helper: convert subpath to THREE.Shape or THREE.Path
    // NOTE: We flip Y (-cmd.y) because Three.js Y-axis points up, SVG Y-axis points down
    function subpathToShape(subpath, isHole = false) {
      const shape = isHole ? new THREE.Path() : new THREE.Shape();
      let started = false;
      let currentX = 0;
      let currentY = 0;

      for (const cmd of subpath) {
        if (cmd.type === 'M') {
          currentX = cmd.x;
          currentY = cmd.y;
          shape.moveTo(cmd.x, -cmd.y);
          started = true;
        } else if (cmd.type === 'L' && started) {
          currentX = cmd.x;
          currentY = cmd.y;
          shape.lineTo(cmd.x, -cmd.y);
        } else if (cmd.type === 'H' && started) {
          currentX = cmd.x;
          shape.lineTo(cmd.x, -currentY);
        } else if (cmd.type === 'V' && started) {
          currentY = cmd.y;
          shape.lineTo(currentX, -cmd.y);
        } else if (cmd.type === 'C' && started) {
          currentX = cmd.x;
          currentY = cmd.y;
          shape.bezierCurveTo(cmd.x1, -cmd.y1, cmd.x2, -cmd.y2, cmd.x, -cmd.y);
        } else if (cmd.type === 'Q' && started) {
          currentX = cmd.x;
          currentY = cmd.y;
          shape.quadraticCurveTo(cmd.x1, -cmd.y1, cmd.x, -cmd.y);
        } else if (cmd.type === 'Z' && started) {
          shape.closePath();
        }
      }

      return started ? shape : null;
    }

    // Helper: calculate signed area AFTER Y-flip to determine winding
    // This is critical: we must calculate area on the FLIPPED coordinates
    // because that's what Three.js will see
    function getSignedAreaFlipped(subpath) {
      let area = 0;
      let prevX = 0, prevY = 0;
      let firstX = 0, firstY = 0;
      let started = false;

      for (const cmd of subpath) {
        // Apply Y-flip immediately
        const cmdX = cmd.x !== undefined ? cmd.x : prevX;
        const cmdY = cmd.y !== undefined ? -cmd.y : -prevY;
        
        if (cmd.type === 'M') {
          if (started) {
            area += prevX * firstY - firstX * prevY;
          }
          firstX = cmdX;
          firstY = cmdY;
          prevX = cmdX;
          prevY = cmdY;
          started = true;
        } else if (cmd.type === 'L' || cmd.type === 'H' || cmd.type === 'V') {
          area += prevX * cmdY - cmdX * prevY;
          prevX = cmdX;
          prevY = cmdY;
        } else if (cmd.type === 'C') {
          // Approximate bezier with line segments
          const steps = 20;
          for (let t = 1; t <= steps; t++) {
            const frac = t / steps;
            const mt = 1 - frac;
            const x = mt*mt*mt*prevX + 3*mt*mt*frac*cmd.x1 + 3*mt*frac*frac*cmd.x2 + frac*frac*frac*cmd.x;
            const y = mt*mt*mt*(-prevY) + 3*mt*mt*frac*(-cmd.y1) + 3*mt*frac*frac*(-cmd.y2) + frac*frac*frac*(-cmd.y);
            // Wait, this is wrong - we need to track prevY properly
            // Let me redo this
          }
          // Actually, let's use a simpler approach: just sample the points
          let py = prevY;
          for (let t = 1; t <= steps; t++) {
            const frac = t / steps;
            const mt = 1 - frac;
            const x = mt*mt*mt*prevX + 3*mt*mt*frac*cmd.x1 + 3*mt*frac*frac*cmd.x2 + frac*frac*frac*cmd.x;
            const y_unflipped = mt*mt*mt*py + 3*mt*mt*frac*cmd.y1 + 3*mt*frac*frac*cmd.y2 + frac*frac*frac*cmd.y;
            const y = -y_unflipped; // Flip Y
            area += prevX * y - x * prevY;
            prevX = x;
            py = y_unflipped;
          }
          prevY = -cmd.y; // Update prevY to flipped value
        } else if (cmd.type === 'Q') {
          const steps = 20;
          let py = prevY;
          for (let t = 1; t <= steps; t++) {
            const frac = t / steps;
            const mt = 1 - frac;
            const x = mt*mt*prevX + 2*mt*frac*cmd.x1 + frac*frac*cmd.x;
            const y_unflipped = mt*mt*py + 2*mt*frac*cmd.y1 + frac*frac*cmd.y;
            const y = -y_unflipped; // Flip Y
            area += prevX * y - x * prevY;
            prevX = x;
            py = y_unflipped;
          }
          prevY = -cmd.y;
        } else if (cmd.type === 'Z') {
          area += prevX * firstY - firstX * prevY;
          prevX = firstX;
          prevY = firstY;
        }
      }

      return area / 2;
    }

    // Simpler approach: calculate bounding box area and use containment
    // This is more robust across different font winding directions
    
    // Calculate bounding box for each subpath
    const subpathsWithBBox = subpaths.map((subpath, idx) => {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let totalX = 0, totalY = 0, pointCount = 0;
      
      for (const cmd of subpath) {
        if (cmd.x !== undefined) {
          minX = Math.min(minX, cmd.x);
          maxX = Math.max(maxX, cmd.x);
          totalX += cmd.x;
          pointCount++;
        }
        if (cmd.y !== undefined) {
          minY = Math.min(minY, cmd.y);
          maxY = Math.max(maxY, cmd.y);
          totalY += cmd.y;
          if (pointCount === 0) pointCount++;
        }
      }
      
      const width = maxX - minX;
      const height = maxY - minY;
      const area = width * height;
      
      return {
        idx,
        subpath,
        bbox: { minX, minY, maxX, maxY, width, height, area },
        center: { x: totalX / (pointCount || 1), y: totalY / (pointCount || 1) }
      };
    });

    // Sort by bounding box area (largest first)
    subpathsWithBBox.sort((a, b) => b.bbox.area - a.bbox.area);

    // Group subpaths by containment
    // The largest subpath is the outer, smaller ones inside it are holes
    const used = new Set();
    const groups = [];

    for (let i = 0; i < subpathsWithBBox.length; i++) {
      if (used.has(i)) continue;
      
      const outer = subpathsWithBBox[i];
      used.add(i);
      
      const group = {
        outer: outer.subpath,
        holes: []
      };

      // Find all subpaths contained within this outer
      for (let j = i + 1; j < subpathsWithBBox.length; j++) {
        if (used.has(j)) continue;
        
        const candidate = subpathsWithBBox[j];
        
        // Check if candidate's center is inside outer's bbox
        if (candidate.center.x >= outer.bbox.minX && 
            candidate.center.x <= outer.bbox.maxX &&
            candidate.center.y >= outer.bbox.minY && 
            candidate.center.y <= outer.bbox.maxY) {
          
          group.holes.push(candidate.subpath);
          used.add(j);
        }
      }

      groups.push(group);
    }

    // Create shapes from groups
    groups.forEach(group => {
      const outerShape = subpathToShape(group.outer, false);
      if (!outerShape) return;

      // Add holes
      group.holes.forEach(holeSubpath => {
        const holePath = subpathToShape(holeSubpath, true);
        if (holePath) {
          outerShape.holes.push(holePath);
        }
      });

      shapes.push(outerShape);
    });

  } catch (e) {
    console.error('Errore nel convertire pathD a Three.js shapes:', e);
    console.error('PathD che ha causato l\'errore:', pathD.substring(0, 200) + '...');
  }

  return shapes;
}

function getLetterPathData(letter, ctx) {
  ctx.font = `${letter.fontSize}px ${letter.fontFamily}`;
  const mw = letter.isGroup ? letter.groupW : 
             letter.isSvgImport ? (letter.svgW || 100) : 
             ctx.measureText(letter.ch).width;
  
  // Build transformation matrix
  const outerM = _buildLetterMatrix(letter, mw);
  
  if (letter.isGroup && letter.groupHTML) {
    const dx = letter.x - (letter.originalX || letter.x);
    const dy = letter.y - (letter.originalY || letter.y);
    const innerM = outerM.translate(dx, dy);
    
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = letter.groupHTML;
    const allSegs = [];
    
    tempDiv.querySelectorAll('path').forEach(p => {
      const d = p.getAttribute('d');
      if (!d) return;
      const pTfStr = p.getAttribute('transform') || '';
      const pM = pTfStr ? parseTransformToMatrix(pTfStr) : new DOMMatrix();
      const combined = innerM.multiply(pM);
      const segs = pathToAbsoluteSegments(d);
      allSegs.push(...applyMatrixToSegs(segs, combined));
    });
    
    return allSegs.length ? segsToPathD(allSegs) : null;
    
  } else if (letter.customPath) {
    const innerX = letter.isSvgImport ? letter.x - (letter.svgW || mw) / 2 : letter.x - mw / 2;
    const innerY = letter.y;
    const combined = outerM.translate(innerX, innerY);
    const segs = pathToAbsoluteSegments(letter.customPath);
    const transformed = applyMatrixToSegs(segs, combined);
    return segsToPathD(transformed);
    
  } else if (S.openFonts[letter.fontName]) {
    const innerX = letter.x - mw / 2;
    const innerY = letter.y;
    const combined = outerM.translate(innerX, innerY);
    // Use higher precision for better quality
    const d = S.openFonts[letter.fontName].getPath(letter.ch, 0, 0, letter.fontSize).toPathData(4);
    const segs = pathToAbsoluteSegments(d);
    const transformed = applyMatrixToSegs(segs, combined);
    return segsToPathD(transformed);
    
  } else {
    // Text element - approximate with rectangle
    const fs = letter.fontSize || 80;
    const estW = fs * 0.65;
    const estH = fs;
    const x = letter.x - estW / 2;
    const y = letter.y - estH;
    return `M${x},${y} L${x+estW},${y} L${x+estW},${y+estH} L${x},${y+estH} Z`;
  }
}

function parseSVGPath(pathString) {
  if (!pathString) return [];
  const commands = [];
  const regex = /([MLHVCSQTAZmlhvcsqtaz])|(-?\d*\.?\d+(?:e[-+]?\d+)?)/g;
  let match;
  let currentCmd = null;
  let args = [];
  
  while ((match = regex.exec(pathString)) !== null) {
    if (match[1]) {
      if (currentCmd) {
        commands.push({ type: currentCmd, args });
      }
      currentCmd = match[1];
      args = [];
    } else if (match[2]) {
      args.push(parseFloat(match[2]));
    }
  }
  if (currentCmd) commands.push({ type: currentCmd, args });

  const result = [];
  let cx = 0, cy = 0;
  let subpathX = 0, subpathY = 0;
  
  commands.forEach(cmd => {
    const type = cmd.type;
    const UC = type.toUpperCase();
    const rel = type !== UC;
    const a = cmd.args;
    let k = 0;

    if (UC === 'M') {
      if (a.length >= 2) {
        cx = a[0] + (rel ? cx : 0);
        cy = a[1] + (rel ? cy : 0);
        result.push({ type: 'M', x: cx, y: cy });
        subpathX = cx; subpathY = cy;
        k = 2;
        while (k + 1 < a.length) {
          cx = a[k] + (rel ? cx : 0);
          cy = a[k+1] + (rel ? cy : 0);
          result.push({ type: 'L', x: cx, y: cy });
          k += 2;
        }
      }
    } else if (UC === 'L') {
      while (k + 1 < a.length) {
        cx = a[k] + (rel ? cx : 0);
        cy = a[k+1] + (rel ? cy : 0);
        result.push({ type: 'L', x: cx, y: cy });
        k += 2;
      }
    } else if (UC === 'H') {
      while (k < a.length) {
        cx = a[k] + (rel ? cx : 0);
        result.push({ type: 'L', x: cx, y: cy });
        k++;
      }
    } else if (UC === 'V') {
      while (k < a.length) {
        cy = a[k] + (rel ? cy : 0);
        result.push({ type: 'L', x: cx, y: cy });
        k++;
      }
    } else if (UC === 'C') {
      while (k + 5 < a.length) {
        const x1 = a[k] + (rel ? cx : 0);
        const y1 = a[k+1] + (rel ? cy : 0);
        const x2 = a[k+2] + (rel ? cx : 0);
        const y2 = a[k+3] + (rel ? cy : 0);
        const x = a[k+4] + (rel ? cx : 0);
        const y = a[k+5] + (rel ? cy : 0);
        result.push({ type: 'C', x1, y1, x2, y2, x, y });
        cx = x; cy = y;
        k += 6;
      }
    } else if (UC === 'Q') {
      while (k + 3 < a.length) {
        const x1 = a[k] + (rel ? cx : 0);
        const y1 = a[k+1] + (rel ? cy : 0);
        const x = a[k+2] + (rel ? cx : 0);
        const y = a[k+3] + (rel ? cy : 0);
        result.push({ type: 'Q', x1, y1, x, y });
        cx = x; cy = y;
        k += 4;
      }
    } else if (UC === 'Z') {
      result.push({ type: 'Z' });
      cx = subpathX; cy = subpathY;
    }
  });
  return result;
}

function buildExtrusionControls(colorGroups) {
  const container = document.getElementById('extrusion-controls');
  container.innerHTML = '';

  const colors = Object.keys(colorGroups);

  if (colors.length === 0) {
    container.innerHTML = '<div style="color:var(--muted);font-size:10px;text-align:center;padding:12px">Nessun colore</div>';
    return;
  }

  colors.forEach((color, idx) => {
    const controlDiv = document.createElement('div');
    controlDiv.style.cssText = 'margin-bottom:6px;padding:6px 8px;background:var(--panel2);border-radius:5px;border:1px solid var(--border);';
    controlDiv.dataset.color = color;

    // Header: Colore N + visibility toggle
    const label = document.createElement('div');
    label.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:6px;';

    const colorBox = document.createElement('div');
    colorBox.style.cssText = `width:14px;height:14px;border-radius:3px;background:${color};border:1px solid var(--border);flex-shrink:0;`;

    const colorText = document.createElement('span');
    colorText.style.cssText = 'flex:1;font-size:10px;font-weight:600;color:var(--text);';
    // Show color name instead of "Colore N"
    const colorName = getColorName(color);
    colorText.textContent = colorName;

    // Eye button for visibility toggle
    const eyeBtn = document.createElement('button');
    eyeBtn.style.cssText = 'width:24px;height:24px;display:flex;align-items:center;justify-content:center;background:transparent;border:1px solid var(--border);border-radius:4px;cursor:pointer;color:var(--text);font-size:14px;padding:0;flex-shrink:0;';
    const isVisible = threeVisibilityState[color] !== false; // default to true
    eyeBtn.innerHTML = isVisible ? '👁' : '👁‍🗨';
    eyeBtn.style.opacity = isVisible ? '1' : '0.5';
    eyeBtn.title = 'Mostra/Nascondi oggetto';
    eyeBtn.dataset.color = color;
    eyeBtn.addEventListener('click', () => {
      toggleColorVisibility(color);
    });

    label.appendChild(colorBox);
    label.appendChild(colorText);
    label.appendChild(eyeBtn);
    controlDiv.appendChild(label);
    
    // Slider + input sulla stessa riga
    const rowDiv = document.createElement('div');
    rowDiv.style.cssText = 'display:flex;align-items:center;gap:6px;';
    
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.value = threeExtrusionLevels[color]?.extrusion || 20;
    slider.style.cssText = 'flex:1;accent-color:var(--accent);';

    const numberInput = document.createElement('input');
    numberInput.type = 'number';
    numberInput.min = '0';
    numberInput.max = '200';
    numberInput.value = slider.value;
    numberInput.style.cssText = 'width:52px;padding:4px 6px;background:var(--panel2);border:1px solid var(--border);color:var(--text);font-family:\'DM Mono\',monospace;font-size:10px;border-radius:4px;outline:none;text-align:center;flex-shrink:0;';
    
    const unitLabel = document.createElement('span');
    unitLabel.style.cssText = 'color:var(--muted);font-size:10px;min-width:16px;';
    unitLabel.textContent = 'px';
    
    rowDiv.appendChild(slider);
    rowDiv.appendChild(numberInput);
    rowDiv.appendChild(unitLabel);
    controlDiv.appendChild(rowDiv);
    
    // Event listeners sincronizzati
    slider.addEventListener('input', () => {
      const val = parseFloat(slider.value) || 0;
      numberInput.value = val;
      updateExtrusion(color, val, true); // Don't save state while sliding
    });
    
    slider.addEventListener('change', () => {
      const val = parseFloat(slider.value) || 0;
      updateExtrusion(color, val); // Save state when slider is released
    });
    
    numberInput.addEventListener('input', () => {
      const val = parseFloat(numberInput.value) || 0;
      slider.value = Math.min(100, Math.max(0, val));
      updateExtrusion(color, val, true); // Don't save state while typing
    });

    numberInput.addEventListener('change', () => {
      const val = parseFloat(numberInput.value) || 0;
      updateExtrusion(color, val); // Save state when input loses focus
    });
    
    container.appendChild(controlDiv);
  });
}

function updateExtrusion(color, newDepth, noSave = false) {
  if (!threeExtrusionLevels[color]) return;

  threeExtrusionLevels[color].extrusion = newDepth;

  // Update meshes for this color using OpenJSCAD ONLY
  threeExtrusionLevels[color].meshes.forEach(mesh => {
    // Skip boolean operation results - their geometry is fixed
    if (mesh.userData && mesh.userData.isBooleanResult) {
      return;
    }

    // OpenJSCAD-based extrusion rebuild
    if (mesh.geometry && mesh.geometry.userData && mesh.geometry.userData.originalGeom2) {
      // Re-extrude the stored geom2 with new depth
      try {
        const geom2 = mesh.geometry.userData.originalGeom2;
        const newGeom3 = window.OpenJSCADBridge.extrudeGeom2ToGeom3(geom2, newDepth);
        if (newGeom3) {
          const newGeometry = window.OpenJSCADBridge.geom3ToThreeGeometry(newGeom3);
          // Preserve userData for rebuild operations
          newGeometry.userData.isJSCAD = true;
          newGeometry.userData.csgDepth = newDepth;
          newGeometry.userData.originalPathD = mesh.geometry.userData.originalPathD;
          newGeometry.userData.originalGeom2 = geom2;

          mesh.geometry.dispose();
          mesh.geometry = newGeometry;
        }
      } catch (err) {
        console.error('⚠ Failed to re-extrude with OpenJSCAD:', err.message);
      }
    } else if (mesh.geometry && mesh.geometry.parameters && mesh.geometry.parameters.shapes) {
      // Legacy Three.js ExtrudeGeometry fallback (for backwards compatibility)
      const shapes = mesh.geometry.parameters.shapes;
      const shapeArray = Array.isArray(shapes) ? shapes : [shapes];

      const newGeometry = new THREE.ExtrudeGeometry(shapeArray, {
        depth: newDepth,
        bevelEnabled: false,
        curveSegments: threeGraphicsSettings.smoothShading ? 16 : 6
      });

      mesh.geometry.dispose();
      mesh.geometry = newGeometry;
    }
  });

  if (!noSave) saveState3D();
}

function toggleColorVisibility(color) {
  if (!threeExtrusionLevels[color]) return;
  
  // Toggle visibility state
  if (threeVisibilityState[color] === undefined) {
    threeVisibilityState[color] = true; // visible by default
  }
  threeVisibilityState[color] = !threeVisibilityState[color];
  
  const isVisible = threeVisibilityState[color];
  
  // Update all meshes for this color
  threeExtrusionLevels[color].meshes.forEach(mesh => {
    mesh.visible = isVisible;
    
    // If hiding, remove from selection
    if (!isVisible) {
      const idx = threeSelectionOrder.indexOf(mesh);
      if (idx !== -1) {
        threeSelectionOrder.splice(idx, 1);
      }
    }
  });
  
  // Update selection indicators
  if (!isVisible) {
    clear3DSelection();
    updateSelectionIndicators();
  }
  
  // Update eye button icon
  const eyeBtn = document.querySelector(`#extrusion-controls button[data-color="${color}"]`);
  if (eyeBtn) {
    eyeBtn.innerHTML = isVisible ? '👁' : '👁‍🗨';
    eyeBtn.style.opacity = isVisible ? '1' : '0.5';
  }
  
  toast(`Colore ${isVisible ? 'visibile' : 'nascosto'}`);
  saveState3D();
}

// Update 3D object position from input fields
function update3DObjectPosition(axis, value) {
  if (threeSelectionOrder.length === 0) return;

  // Update the first selected object's position
  const mesh = threeSelectionOrder[0];
  if (!mesh) return;

  switch(axis) {
    case 'x': mesh.position.x = value; break;
    case 'y': mesh.position.y = value; break;
    case 'z': mesh.position.z = value; break;
  }

  // Update transform controls pivot if visible
  if (threeTransformControls && threeTransformControls._pivot) {
    threeTransformControls._pivot.position[axis] = value;
    threeTransformControls._pivotStartPos[axis] = value;
    threeTransformControls._meshStartPos[axis] = value;
  }

  // Update selection indicators
  updateSelectionIndicators();
  saveState3D();
}

// Update position input fields to reflect selected object's position
function update3DPositionInputs() {
  const xInput = document.getElementById('pos3d-x');
  const yInput = document.getElementById('pos3d-y');
  const zInput = document.getElementById('pos3d-z');

  if (threeSelectionOrder.length > 0) {
    const mesh = threeSelectionOrder[0];
    if (mesh) {
      if (xInput) xInput.value = Math.round(mesh.position.x);
      if (yInput) yInput.value = Math.round(mesh.position.y);
      if (zInput) zInput.value = Math.round(mesh.position.z);
    }
  } else {
    if (xInput) xInput.value = 0;
    if (yInput) yInput.value = 0;
    if (zInput) zInput.value = 0;
  }
}

// Update color input fields to reflect selected object's color
function update3DColorInputs() {
  const colorBtn = document.getElementById('color-palette-btn');
  const textInput = document.getElementById('color3d-text');

  if (threeSelectionOrder.length > 0) {
    // Use the first selected mesh to show current color
    const mesh = threeSelectionOrder[0];
    if (mesh && mesh.material && mesh.material.color) {
      const color = '#' + mesh.material.color.getHexString();
      if (colorBtn) colorBtn.style.background = color;
      if (textInput) textInput.value = getColorName(color);
    }
  } else {
    if (colorBtn) colorBtn.style.background = '#ffffff';
    if (textInput) textInput.value = 'Bianco';
  }
}

// ── 3D OBJECT COLOR ─────────────────────────────────────────────────────

// Toggle color palette visibility
function toggleColorPalette() {
  const presetsContainer = document.getElementById('color-presets');
  if (presetsContainer) {
    const isVisible = presetsContainer.style.display === 'grid' || presetsContainer.style.display === 'block';
    presetsContainer.style.display = isVisible ? 'none' : 'grid';
  }
}

// Update selected object's color - applies to ALL selected objects
function update3DObjectColor(color) {
  if (threeSelectionOrder.length === 0) return;

  // Apply to ALL selected objects
  threeSelectionOrder.forEach(mesh => {
    if (!mesh || !mesh.material) return;

    // Store old color if not already stored
    if (!mesh.userData.oldColorHex) {
      mesh.userData.oldColorHex = mesh.userData.colorHex || '#' + mesh.material.color.getHexString();
    }

    // Update mesh material color
    mesh.material.color.set(color);
  });

  // Update color picker button background
  const colorBtn = document.getElementById('color-palette-btn');
  if (colorBtn) {
    colorBtn.style.background = color;
  }

  // Update color picker text input with color name
  const textInput = document.getElementById('color3d-text');
  if (textInput) {
    textInput.value = getColorName(color);
  }
}

// Color name to hex mapping
const COLOR_NAME_TO_HEX = {
  'bianco': '#ffffff',
  'nero': '#111111',
  'rosso': '#ff0000',
  'verde': '#00cc00',
  'blu': '#0066ff',
  'giallo': '#ffcc00',
  'arancione': '#ff6b35',
  'viola': '#8800ff',
  'rosa': '#ff66b2',
  'ciano': '#00cccc',
  'grigio': '#808080',
  'marrone': '#996633',
};

// Common color presets for quick selection
const COLOR_PRESETS = [
  { name: 'Bianco', hex: '#ffffff' },
  { name: 'Nero', hex: '#111111' },
  { name: 'Rosso', hex: '#ff0000' },
  { name: 'Verde', hex: '#00cc00' },
  { name: 'Blu', hex: '#0066ff' },
  { name: 'Giallo', hex: '#ffcc00' },
  { name: 'Arancione', hex: '#ff6b35' },
  { name: 'Viola', hex: '#8800ff' },
  { name: 'Rosa', hex: '#ff66b2' },
  { name: 'Ciano', hex: '#00cccc' },
];

// Get color name from hex value
function getColorName(hex) {
  if (!hex) return 'Bianco';
  const normalized = hex.toLowerCase();
  for (const preset of COLOR_PRESETS) {
    if (preset.hex.toLowerCase() === normalized) {
      return preset.name;
    }
  }
  // Return hex if no match found
  return hex;
}

// Get hex value from color name
function getColorHex(name) {
  if (!name) return null;
  const normalized = name.toLowerCase().trim();
  return COLOR_NAME_TO_HEX[normalized] || null;
}

// Initialize color preset buttons
function initColorPresets() {
  const container = document.getElementById('color-presets');
  if (!container) return;
  
  container.innerHTML = '';
  
  COLOR_PRESETS.forEach(preset => {
    const btn = document.createElement('button');
    btn.title = preset.name;
    btn.setAttribute('data-color', preset.hex);
    btn.style.cssText = `
      width:100%;aspect-ratio:1;border-radius:4px;border:2px solid var(--border);
      cursor:pointer;transition:all 0.2s;position:relative;
      background:${preset.hex};
    `;
    
    // Add border for light colors
    if (preset.hex.toLowerCase() === '#ffffff' || preset.hex.toLowerCase() === '#ffcc00') {
      btn.style.borderColor = '#444';
    }
    
    btn.onmouseover = () => {
      btn.style.transform = 'scale(1.1)';
      btn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
    };
    btn.onmouseout = () => {
      btn.style.transform = 'scale(1)';
      btn.style.boxShadow = 'none';
    };
    btn.onclick = (e) => {
      e.stopPropagation();
      // Update 3D preview AND extrusion color
      update3DObjectColor(preset.hex);
      // Finalize: update extrusion and canvas letter color
      finalize3DObjectColor();
    };
    
    container.appendChild(btn);
  });
}

// Update selected object's color - applies to ALL selected objects
function update3DObjectColor(color) {
  if (threeSelectionOrder.length === 0) return;

  // Apply to ALL selected objects
  threeSelectionOrder.forEach(mesh => {
    if (!mesh || !mesh.material) return;
    
    // Store old color if not already stored
    if (!mesh.userData.oldColorHex) {
      mesh.userData.oldColorHex = mesh.userData.colorHex || '#' + mesh.material.color.getHexString();
    }

    // Update mesh material color
    mesh.material.color.set(color);
  });

  // Update color picker text input with color name
  const textInput = document.getElementById('color3d-text');
  if (textInput) {
    textInput.value = getColorName(color);
  }
}

// Update color from text input
function update3DObjectColorFromText(value) {
  // Try to match color name first
  const namedColor = getColorHex(value);
  if (namedColor) {
    const colorBtn = document.getElementById('color-palette-btn');
    if (colorBtn) {
      colorBtn.style.background = namedColor;
    }
    update3DObjectColor(namedColor);
    return;
  }

  // Validate hex color
  if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
    const colorBtn = document.getElementById('color-palette-btn');
    if (colorBtn) {
      colorBtn.style.background = value;
    }
    update3DObjectColor(value);
  }
}

// Finalize color change (called on change event completion)
function finalize3DObjectColor() {
  if (threeSelectionOrder.length === 0) return;

  const newColor = '#' + threeSelectionOrder[0].material.color.getHexString();

  // Apply to ALL selected meshes
  threeSelectionOrder.forEach(mesh => {
    if (!mesh || !mesh.material) return;

    const oldColor = mesh.userData.oldColorHex || mesh.userData.colorHex;

    // Update all meshes with the same old color to new color
    if (oldColor && oldColor !== newColor) {
      // Update extrusion controls to show new color (this will also update mesh colors)
      updateExtrusionColor(oldColor, newColor);

      // Update canvas letter color
      updateCanvasLetterColorFrom3D(newColor, oldColor);
    } else {
      // Just update the mesh's userData
      mesh.userData.colorHex = newColor;
    }
    mesh.userData.oldColorHex = null;
  });

  // Update selection indicators
  updateSelectionIndicators();

  // Hide color palette
  const presetsContainer = document.getElementById('color-presets');
  if (presetsContainer) {
    presetsContainer.style.display = 'none';
  }

  saveState3D();
  toast(`Colore applicato a ${threeSelectionOrder.length} oggetti`);
}

// Update canvas letter color when 3D color changes
function updateCanvasLetterColorFrom3D(newColor, oldColor) {
  if (threeSelectionOrder.length === 0) return;

  const mesh = threeSelectionOrder[0];
  if (!mesh) return;

  // Find the corresponding canvas element by groupId or bbox
  const groupId = mesh.userData.groupId;
  
  if (groupId) {
    // Find all canvas elements with matching groupId
    S.letters.forEach(letter => {
      if (letter.groupId === groupId && letter.fill === oldColor) {
        letter.fill = newColor;
        // Update the DOM element
        const el = document.getElementById('l' + letter.id);
        if (el) {
          el.style.color = newColor;
          el.style.fill = newColor;
        }
      }
    });
  } else {
    // Fallback: try to match by bbox (for elements without groupId)
    const meshBbox = mesh.userData.bbox2D;
    if (meshBbox) {
      S.letters.forEach(letter => {
        if (letter.fill === oldColor && letter.bbox) {
          // Compare bbox centers
          const letterCenterX = letter.x + (letter.bbox.w || 0) / 2;
          const letterCenterY = letter.y + (letter.bbox.h || 0) / 2;
          const meshCenterX = meshBbox.x + (meshBbox.w || 0) / 2;
          const meshCenterY = meshBbox.y + (meshBbox.h || 0) / 2;
          
          // If centers are close enough (within 5 pixels), it's a match
          if (Math.abs(letterCenterX - meshCenterX) < 5 && Math.abs(letterCenterY - meshCenterY) < 5) {
            letter.fill = newColor;
            const el = document.getElementById('l' + letter.id);
            if (el) {
              el.style.color = newColor;
              el.style.fill = newColor;
            }
          }
        }
      });
    }
  }
}

// Update extrusion controls when color changes
function updateExtrusionColor(oldColor, newColor) {
  if (!threeExtrusionLevels[oldColor]) return;

  // Find the selected mesh(es) that changed color
  const changedMeshes = threeSelectionOrder.filter(m => 
    m.userData.oldColorHex === oldColor || m.userData.colorHex === oldColor
  );

  if (changedMeshes.length === 0) {
    // Fallback: update all meshes with old color (legacy behavior)
    if (!threeExtrusionLevels[newColor]) {
      threeExtrusionLevels[newColor] = { 
        extrusion: threeExtrusionLevels[oldColor].extrusion, 
        meshes: [] 
      };
      threeVisibilityState[newColor] = threeVisibilityState[oldColor] !== undefined ? 
        threeVisibilityState[oldColor] : true;
    }

    // Update all mesh references
    const meshesToMove = [...threeExtrusionLevels[oldColor].meshes];
    meshesToMove.forEach(mesh => {
      if (mesh.material) {
        mesh.material.color.set(newColor);
      }
      mesh.userData.colorHex = newColor;
      mesh.visible = threeVisibilityState[newColor];
      
      // Remove from old color meshes
      const idx = threeExtrusionLevels[oldColor].meshes.indexOf(mesh);
      if (idx !== -1) threeExtrusionLevels[oldColor].meshes.splice(idx, 1);
      
      // Add to new color meshes
      threeExtrusionLevels[newColor].meshes.push(mesh);
    });

    // Remove old color entry if no meshes left
    if (threeExtrusionLevels[oldColor].meshes.length === 0) {
      delete threeExtrusionLevels[oldColor];
      delete threeVisibilityState[oldColor];
    }
  } else {
    // Update only the changed meshes - keep extrusion controls unchanged
    changedMeshes.forEach(mesh => {
      mesh.userData.colorHex = newColor;
      mesh.userData.oldColorHex = null;
      mesh.visible = threeVisibilityState[newColor] !== false;
      
      // Remove from old color group in extrusion levels
      if (threeExtrusionLevels[oldColor]) {
        const idx = threeExtrusionLevels[oldColor].meshes.indexOf(mesh);
        if (idx !== -1) threeExtrusionLevels[oldColor].meshes.splice(idx, 1);
      }
      
      // Add to new color group
      if (!threeExtrusionLevels[newColor]) {
        threeExtrusionLevels[newColor] = { 
          extrusion: 20, // Default extrusion
          meshes: [] 
        };
        threeVisibilityState[newColor] = true;
      }
      threeExtrusionLevels[newColor].meshes.push(mesh);
    });

    // Remove old color entry if no meshes left
    if (threeExtrusionLevels[oldColor] && threeExtrusionLevels[oldColor].meshes.length === 0) {
      delete threeExtrusionLevels[oldColor];
      delete threeVisibilityState[oldColor];
    }
  }

  // Rebuild extrusion controls to show new colors (keeps same structure)
  buildExtrusionControlsFromState();
}

// Rebuild extrusion controls from current state
function buildExtrusionControlsFromState() {
  const container = document.getElementById('extrusion-controls');
  if (!container) return;

  container.innerHTML = '';

  const colors = Object.keys(threeExtrusionLevels);

  if (colors.length === 0) {
    container.innerHTML = '<div style="color:var(--muted);font-size:10px;text-align:center;padding:12px">Nessun colore</div>';
    return;
  }

  colors.forEach((color, idx) => {
    if (threeExtrusionLevels[color].meshes.length === 0) return;

    const extrusion = threeExtrusionLevels[color].extrusion;
    const isVisible = threeVisibilityState[color] !== false;

    const controlDiv = document.createElement('div');
    controlDiv.style.cssText = 'margin-bottom:6px;padding:6px 8px;background:var(--panel2);border-radius:5px;border:1px solid var(--border);';
    controlDiv.dataset.color = color;

    // Header: Colore N + visibility toggle
    const label = document.createElement('div');
    label.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:6px;';

    const colorBox = document.createElement('div');
    colorBox.style.cssText = `width:14px;height:14px;border-radius:3px;background:${color};border:1px solid var(--border);flex-shrink:0;`;

    const colorText = document.createElement('span');
    colorText.style.cssText = 'flex:1;font-size:10px;font-weight:600;color:var(--text);';
    // Show color name instead of "Colore N"
    const colorName = getColorName(color);
    colorText.textContent = colorName;

    // Eye button for visibility toggle
    const eyeBtn = document.createElement('button');
    eyeBtn.style.cssText = 'width:24px;height:24px;display:flex;align-items:center;justify-content:center;background:transparent;border:1px solid var(--border);border-radius:4px;cursor:pointer;color:var(--text);font-size:14px;padding:0;flex-shrink:0;';
    eyeBtn.innerHTML = isVisible ? '👁' : '👁‍🗨';
    eyeBtn.style.opacity = isVisible ? '1' : '0.5';
    eyeBtn.title = 'Mostra/Nascondi oggetto';
    eyeBtn.dataset.color = color;
    eyeBtn.addEventListener('click', () => {
      toggleColorVisibility(color);
    });

    label.appendChild(colorBox);
    label.appendChild(colorText);
    label.appendChild(eyeBtn);
    controlDiv.appendChild(label);

    // Slider + input sulla stessa riga
    const rowDiv = document.createElement('div');
    rowDiv.style.cssText = 'display:flex;align-items:center;gap:6px;';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.value = extrusion;
    slider.style.cssText = 'flex:1;accent-color:var(--accent);';

    const numberInput = document.createElement('input');
    numberInput.type = 'number';
    numberInput.min = '0';
    numberInput.max = '200';
    numberInput.value = slider.value;
    numberInput.style.cssText = 'width:52px;padding:4px 6px;background:var(--panel2);border:1px solid var(--border);color:var(--text);font-family:\'DM Mono\',monospace;font-size:10px;border-radius:4px;outline:none;text-align:center;flex-shrink:0;';

    const unitLabel = document.createElement('span');
    unitLabel.style.cssText = 'color:var(--muted);font-size:10px;min-width:16px;';
    unitLabel.textContent = 'px';

    rowDiv.appendChild(slider);
    rowDiv.appendChild(numberInput);
    rowDiv.appendChild(unitLabel);
    controlDiv.appendChild(rowDiv);

    // Event listeners sincronizzati
    slider.addEventListener('input', () => {
      const val = parseFloat(slider.value) || 0;
      numberInput.value = val;
      updateExtrusion(color, val, true); // Don't save state while sliding
    });

    slider.addEventListener('change', () => {
      const val = parseFloat(slider.value) || 0;
      updateExtrusion(color, val); // Save state when slider is released
    });

    numberInput.addEventListener('input', () => {
      const val = parseFloat(numberInput.value) || 0;
      slider.value = Math.min(100, Math.max(0, val));
      updateExtrusion(color, val, true); // Don't save state while typing
    });

    numberInput.addEventListener('change', () => {
      const val = parseFloat(numberInput.value) || 0;
      updateExtrusion(color, val); // Save state when input loses focus
    });

    container.appendChild(controlDiv);
  });
}

// Toggle transform controls visibility (show/hide gizmo arrows)
let threeTransformEnabled = true;

function toggleTransformControls() {
  threeTransformEnabled = !threeTransformEnabled;
  
  const btn = document.getElementById('toggle-transform-btn');
  
  if (threeTransformEnabled) {
    // Enable: show gizmo if object selected
    btn.style.color = '#00ff88';
    if (threeTransformControls && threeSelectionOrder.length > 0) {
      threeTransformControls.visible = true;
      updateSelectionIndicators();
    }
    toast('Frecce di trascinamento abilitate');
  } else {
    // Disable: hide gizmo
    btn.style.color = '#5a5a7a';
    if (threeTransformControls) {
      threeTransformControls.visible = false;
    }
    toast('Frecce di trascinamento disabilitate');
  }
}

// ── 3D OBJECT SELECTION ───────────────────────────────────────────────────

function on3DObjectClick(event) {
  if (!threeScene || !threeCamera || !threeRenderer) return;

  const rect = threeRenderer.domElement.getBoundingClientRect();
  threeMouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  threeMouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  threeRaycaster.setFromCamera(threeMouse, threeCamera);
  // Filter only visible meshes for raycasting
  const visibleMeshes = threeMeshes.filter(m => m.visible);
  const intersects = threeRaycaster.intersectObjects(visibleMeshes, false);

  if (intersects.length > 0) {
    const clickedMesh = intersects[0].object;

    // Se la mesh ha un groupId, seleziona tutte le mesh dello stesso gruppo
    if (clickedMesh.userData.groupId) {
      clear3DSelection();
      
      // Trova e seleziona tutte le mesh con lo stesso groupId
      const groupId = clickedMesh.userData.groupId;
      const groupMeshes = threeMeshes.filter(m => m.userData.groupId === groupId && m.visible);
      
      groupMeshes.forEach(mesh => {
        threeSelectionOrder.push(mesh);
      });
      
      // Mostra un unico bounding box per tutto il gruppo
      addSelectionIndicatorForGroup(groupMeshes);
      
      if (groupMeshes.length > 1) {
        toast(`Gruppo ${groupId} selezionato: ${groupMeshes.length} oggetti`);
      } else {
        toast('Oggetto selezionato');
      }
      update3DSelectionHUD();
    } else {
      // Mesh senza groupId: selezione singola normale
      const existingIndex = threeSelectionOrder.indexOf(clickedMesh);

      if (event.shiftKey) {
        // Shift+click: Add to selection
        if (existingIndex === -1) {
          threeSelectionOrder.push(clickedMesh);
          addSelectionIndicator(clickedMesh);
          toast(`${threeSelectionOrder.length} oggetti selezionati`);
          update3DSelectionHUD();
        } else {
          // Click su già selezionato: deseleziona
          threeSelectionOrder.splice(existingIndex, 1);
          clear3DSelection();
          threeSelectionOrder.forEach(m => addSelectionIndicator(m));
          update3DSelectionHUD();
        }
      } else {
        // Regular click: Select only this object
        clear3DSelection();
        threeSelectionOrder.push(clickedMesh);
        addSelectionIndicator(clickedMesh);
        toast('1 oggetto selezionato — Shift+click per aggiungerne altri');
        update3DSelectionHUD();
      }
    }
  } else {
    // Clicked on empty space - clear selection
    clear3DSelection();
  }
}

function on3DObjectDblClick(event) {
  // Double click: clear selection
  clear3DSelection();
  toast('Selezione annullata');
}

function addSelectionIndicator(mesh) {
  // Create a wireframe box around the selected mesh
  const bbox = new THREE.Box3().setFromObject(mesh);
  const size = bbox.getSize(new THREE.Vector3());
  const center = bbox.getCenter(new THREE.Vector3());

  const isFirst = threeSelectionOrder.indexOf(mesh) === 0;
  const color = isFirst ? 0x00ff88 : 0xff6b35;

  const geometry = new THREE.BoxGeometry(size.x * 1.02, size.y * 1.02, size.z * 1.02);
  const edges = new THREE.EdgesGeometry(geometry);
  const material = new THREE.LineBasicMaterial({
    color: color,
    linewidth: 2
  });
  const wireframe = new THREE.LineSegments(edges, material);
  wireframe.position.copy(center);
  wireframe.userData.targetMesh = mesh;
  wireframe.userData.selectionRole = isFirst ? 'cutter' : 'target';

  threeScene.add(wireframe);
  threeSelectionIndicator.push(wireframe);

  // Show/update transform gizmo centered on the first selected object's bounding box
  // Keep gizmo visible as long as there's a first object, even with multiple selections
  if (isFirst && threeTransformControls && threeTransformEnabled) {
    // Remove old pivot
    if (threeTransformControls._pivot) {
      threeScene.remove(threeTransformControls._pivot);
    }

    // Create pivot at bbox center
    const pivot = new THREE.Object3D();
    pivot.position.copy(center);
    pivot.userData.targetMesh = mesh;
    threeScene.add(pivot);
    threeTransformControls._pivot = pivot;

    // Save start position for delta calculation
    threeTransformControls._pivotStartPos = pivot.position.clone();
    threeTransformControls._meshStartPos = mesh.position.clone();

    // Attach gizmo to pivot
    threeTransformControls.attach(pivot);
    threeTransformControls.visible = true;
  } else if (threeSelectionOrder.length > 1 && threeTransformControls && threeTransformControls._pivot) {
    // When selecting second object, update first object's indicator position but keep gizmo
    // Find the first object's indicator and update its position
    const firstMesh = threeSelectionOrder[0];
    if (firstMesh && firstMesh.visible) {
      const firstBbox = new THREE.Box3().setFromObject(firstMesh);
      const firstCenter = firstBbox.getCenter(new THREE.Vector3());
      if (threeTransformControls._pivot) {
        threeTransformControls._pivot.position.copy(firstCenter);
      }
    }
  }
}

function addSelectionIndicatorForGroup(meshes) {
  // Calcola il bounding box combinato di tutte le mesh del gruppo
  const combinedBBox = new THREE.Box3();
  meshes.forEach(mesh => {
    const bbox = new THREE.Box3().setFromObject(mesh);
    combinedBBox.union(bbox);
  });

  const size = combinedBBox.getSize(new THREE.Vector3());
  const center = combinedBBox.getCenter(new THREE.Vector3());

  const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
  const edges = new THREE.EdgesGeometry(geometry);
  const material = new THREE.LineBasicMaterial({
    color: 0x00ff88, // Verde per il gruppo
    linewidth: 2
  });
  const wireframe = new THREE.LineSegments(edges, material);
  wireframe.position.copy(center);
  wireframe.userData.targetMeshes = meshes; // Riferimento a tutte le mesh del gruppo

  threeScene.add(wireframe);
  threeSelectionIndicator.push(wireframe);
}

function selectAll3D() {
  if (!threeMeshes || threeMeshes.length === 0) return;
  // Clear current selection first
  threeSelectionIndicator.forEach(ind => {
    if (threeScene) threeScene.remove(ind);
    if (ind.geometry) ind.geometry.dispose();
    if (ind.material) ind.material.dispose();
  });
  threeSelectionIndicator = [];
  threeSelectionOrder = [];
  if (threeTransformControls) {
    threeTransformControls.detach();
    threeTransformControls.visible = false;
    if (threeTransformControls._pivot) {
      threeScene.remove(threeTransformControls._pivot);
      threeTransformControls._pivot = null;
    }
  }
  // Add all visible meshes to selection
  threeMeshes.filter(m => m.visible).forEach(mesh => {
    threeSelectionOrder.push(mesh);
  });
  updateSelectionIndicators();
  const n = threeSelectionOrder.length;
  toast(`${n} oggett${n === 1 ? 'o' : 'i'} selezionat${n === 1 ? 'o' : 'i'} ✓`);
}

function clear3DSelection() {
  // Remove all indicators
  threeSelectionIndicator.forEach(ind => {
    if (threeScene) threeScene.remove(ind);
    if (ind.geometry) ind.geometry.dispose();
    if (ind.material) ind.material.dispose();
  });
  threeSelectionIndicator = [];
  threeSelectionOrder = [];

  // Detach and hide transform gizmo, remove pivot
  if (threeTransformControls) {
    threeTransformControls.detach();
    threeTransformControls.visible = false;
    if (threeTransformControls._pivot) {
      threeScene.remove(threeTransformControls._pivot);
      threeTransformControls._pivot = null;
    }
    threeTransformControls._pivotStartPos = null;
    threeTransformControls._meshStartPos = null;
  }

  update3DSelectionHUD();
}

// ── 3D SELECTION HUD ─────────────────────────────────────────────────────
function update3DSelectionHUD() {
  let hud = document.getElementById('sel3d-hud');
  if (!hud) {
    hud = document.createElement('div');
    hud.id = 'sel3d-hud';
    hud.style.cssText = 'position:absolute;bottom:16px;left:50%;transform:translateX(-50%);display:flex;gap:10px;align-items:center;z-index:200;pointer-events:none;';
    const canvas3d = document.getElementById('preview-3d-canvas');
    if (canvas3d) canvas3d.appendChild(hud);
  }

  if (threeSelectionOrder.length === 0) {
    hud.innerHTML = '<div style="background:rgba(0,0,0,.6);color:#5a5a7a;padding:6px 14px;border-radius:20px;font-size:11px;font-family:DM Mono,monospace;border:1px solid #2a2a3a;">Click oggetto per selezionare · Trascina le frecce per muovere</div>';
    update3DPositionInputs();
    return;
  }

  let html = '';
  const count = threeSelectionOrder.length;
  html += `<div style="background:rgba(200,255,0,.1);color:#c8ff00;padding:6px 14px;border-radius:20px;font-size:11px;font-family:DM Mono,monospace;border:1px solid #c8ff00;">${count} oggetti selezionati</div>`;
  
  if (count === 2) {
    html += '<div style="background:rgba(0,255,136,.12);color:#00ff88;padding:6px 14px;border-radius:20px;font-size:11px;font-family:DM Mono,monospace;border:1px solid #00ff88;">Unisci/Sottrai disponibile</div>';
  }
  if (count > 1) {
    html += '<div style="background:rgba(0,0,0,.5);color:#8a8a9a;padding:6px 14px;border-radius:20px;font-size:11px;font-family:DM Mono,monospace;border:1px dashed #3a3a4a;">Cambia colore per tutti</div>';
  }
  hud.innerHTML = html;

  // Update position inputs when selection changes
  update3DPositionInputs();

  // Update color inputs when selection changes
  update3DColorInputs();
}

function updateSelectionIndicators() {
  // Remove old indicators
  threeSelectionIndicator.forEach(ind => {
    if (threeScene) threeScene.remove(ind);
    if (ind.geometry) ind.geometry.dispose();
    if (ind.material) ind.material.dispose();
  });
  threeSelectionIndicator = [];

  // Color palette for multi-selection
  const selectionColors = [0x00ff88, 0xff6b35, 0xc8ff00, 0x00ccff, 0xff66b2, 0x9933ff, 0xffcc00, 0x00ffcc, 0xff4444, 0x44ff44];

  // Add new indicators with color based on selection index
  threeSelectionOrder.forEach((mesh, idx) => {
    const bbox = new THREE.Box3().setFromObject(mesh);
    const size = bbox.getSize(new THREE.Vector3());
    const center = bbox.getCenter(new THREE.Vector3());

    const color = selectionColors[idx % selectionColors.length];
    const geometry = new THREE.BoxGeometry(size.x * 1.02, size.y * 1.02, size.z * 1.02);
    const edges = new THREE.EdgesGeometry(geometry);
    const material = new THREE.LineBasicMaterial({
      color: color,
      linewidth: 2
    });
    const wireframe = new THREE.LineSegments(edges, material);
    wireframe.position.copy(center);
    wireframe.userData.targetMesh = mesh;
    wireframe.userData.selectionIndex = idx;

    threeScene.add(wireframe);
    threeSelectionIndicator.push(wireframe);

    // Setup transform gizmo for first object
    if (idx === 0 && threeTransformControls && threeTransformEnabled) {
      // Remove old pivot
      if (threeTransformControls._pivot) {
        threeScene.remove(threeTransformControls._pivot);
      }

      // Create pivot at bbox center
      const pivot = new THREE.Object3D();
      pivot.position.copy(center);
      pivot.userData.targetMesh = mesh;
      threeScene.add(pivot);
      threeTransformControls._pivot = pivot;

      // Save start position for delta calculation
      threeTransformControls._pivotStartPos = pivot.position.clone();
      threeTransformControls._meshStartPos = mesh.position.clone();

      // Attach gizmo to pivot
      threeTransformControls.attach(pivot);
      threeTransformControls.visible = true;
    }
  });

  // If no objects selected, hide gizmo
  if (threeSelectionOrder.length === 0 && threeTransformControls) {
    threeTransformControls.detach();
    threeTransformControls.visible = false;
    if (threeTransformControls._pivot) {
      threeScene.remove(threeTransformControls._pivot);
      threeTransformControls._pivot = null;
    }
  }

  update3DSelectionHUD();
}

// ── SPLIT MESH INTO CONNECTED COMPONENTS ──────────────────────────────────
function _splitGeometryComponents(geometry) {
  const positions = geometry.attributes.position.array;
  const normals = geometry.attributes.normal ? geometry.attributes.normal.array : null;
  const nTris = positions.length / 9;

  if (nTris === 0) return [];

  const faceToVertices = [];
  const vertexToFaces = new Map();

  function getVertexKey(vIdx) {
    const x = Math.round(positions[vIdx * 3] * 10000);
    const y = Math.round(positions[vIdx * 3 + 1] * 10000);
    const z = Math.round(positions[vIdx * 3 + 2] * 10000);
    return `${x},${y},${z}`;
  }

  for (let i = 0; i < nTris; i++) {
    const facesVertices = [];
    for (let j = 0; j < 3; j++) {
      const vIdx = i * 3 + j;
      const key = getVertexKey(vIdx);
      facesVertices.push(key);
      if (!vertexToFaces.has(key)) vertexToFaces.set(key, []);
      vertexToFaces.get(key).push(i);
    }
    faceToVertices.push(facesVertices);
  }

  const visited = new Uint8Array(nTris);
  const groups = [];

  for (let i = 0; i < nTris; i++) {
    if (visited[i]) continue;

    const group = [];
    const stack = [i];
    visited[i] = 1;

    while (stack.length > 0) {
      const faceIdx = stack.pop();
      group.push(faceIdx);

      for (const vertexKey of faceToVertices[faceIdx]) {
        const neighbors = vertexToFaces.get(vertexKey);
        for (let k = 0; k < neighbors.length; k++) {
          const neighborFaceIdx = neighbors[k];
          if (!visited[neighborFaceIdx]) {
            visited[neighborFaceIdx] = 1;
            stack.push(neighborFaceIdx);
          }
        }
      }
    }
    groups.push(group);
  }

  return groups.map(group => {
    const groupPos = new Float32Array(group.length * 9);
    const groupNorm = normals ? new Float32Array(group.length * 9) : null;
    for (let i = 0; i < group.length; i++) {
      const faceIdx = group[i];
      for (let j = 0; j < 9; j++) {
        groupPos[i * 9 + j] = positions[faceIdx * 9 + j];
        if (groupNorm) groupNorm[i * 9 + j] = normals[faceIdx * 9 + j];
      }
    }
    const newGeom = new THREE.BufferGeometry();
    newGeom.setAttribute('position', new THREE.BufferAttribute(groupPos, 3));
    if (groupNorm) {
      newGeom.setAttribute('normal', new THREE.BufferAttribute(groupNorm, 3));
    } else {
      newGeom.computeVertexNormals();
    }
    
    // Center the component geometry and return the offset
    newGeom.computeBoundingBox();
    const center = new THREE.Vector3();
    newGeom.boundingBox.getCenter(center);
    newGeom.translate(-center.x, -center.y, -center.z);
    
    return { geometry: newGeom, center: center };
  });
}

function _exportGeometryToSTLData(geometry) {
  // Always export the geometry as it is (local coordinates)
  const pos = geometry.attributes.position.array;
  const n = pos.length / 9;
  const buf = new ArrayBuffer(84 + n * 50);
  const view = new DataView(buf);

  const header = `LetterForge component`.padEnd(80, ' ');
  for (let i = 0; i < 80; i++) view.setUint8(i, header.charCodeAt(i) & 0xff);
  view.setUint32(80, n, true);

  let offset = 84;
  for (let i = 0; i < n; i++) {
    const i9 = i * 9;
    const a = [pos[i9], pos[i9+1], pos[i9+2]];
    const b = [pos[i9+3], pos[i9+4], pos[i9+5]];
    const c = [pos[i9+6], pos[i9+7], pos[i9+8]];
    const [nx, ny, nz] = _triNormal(a, b, c);

    view.setFloat32(offset, nx, true); offset += 4;
    view.setFloat32(offset, ny, true); offset += 4;
    view.setFloat32(offset, nz, true); offset += 4;

    for (let j = 0; j < 9; j++) {
      view.setFloat32(offset, pos[i9 + j], true);
      offset += 4;
    }
    view.setUint16(offset, 0, true); offset += 2;
  }

  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

const IMPORT_PALETTE = ['#3498db', '#e74c3c', '#2ecc71', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#27ae60', '#2980b9', '#8e44ad'];

/**
 * Shared logic to process imported STL geometry.
 * Splits into components, centers them, and saves as STL data.
 */
function _processImportedGeometry(name, geometryInput) {
  const geometries = Array.isArray(geometryInput) ? geometryInput : [geometryInput];
  
  // 1. Initial cleanup and collective bounding box
  const collectiveBox = new THREE.Box3();
  geometries.forEach(g => {
    _fixWinding(g);
    g.computeBoundingBox();
    collectiveBox.union(g.boundingBox);
  });
  
  // 2. Calculate global center for initial placement
  const globalCenter = new THREE.Vector3();
  collectiveBox.getCenter(globalCenter);
  const targetPos = (threeControls && threeControls.target) ? threeControls.target.clone() : new THREE.Vector3(0,0,0);
  const globalOffset = new THREE.Vector3().subVectors(targetPos, globalCenter);

  let componentIdx = 0;
  let allComponents = [];
  
  geometries.forEach(geometry => {
    const components = _splitGeometryComponents(geometry);
    allComponents = allComponents.concat(components);
  });

  if (allComponents.length > 1) {
    toast(`Identificati ${allComponents.length} oggetti separati`);
  }

  allComponents.forEach((comp, idx) => {
    const compGeom = comp.geometry;
    const compCenter = comp.center; // Local offset from original file center
    
    // Ensure component winding is correct after splitting
    _fixWinding(compGeom);
    
    // 4. Convert to standardized STL data (centered)
    const compData = _exportGeometryToSTLData(compGeom);
    
    const baseName = name.replace(/\.(stl|obj)$/i, '');
    const compName = allComponents.length > 1 ? `${baseName}_${idx+1}` : name;
    
    const colorHex = allComponents.length > 1 ? 
      IMPORT_PALETTE[idx % IMPORT_PALETTE.length] : '#111111';

    const material = new THREE.MeshPhongMaterial({
      color: new THREE.Color(colorHex),
      specular: 0x333333,
      shininess: 30,
      side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(compGeom, material);
    
    // 5. Position: Global file offset + local component offset
    mesh.position.copy(globalOffset).add(compCenter);
    mesh.updateMatrixWorld(true);

    mesh.userData.colorHex = colorHex;
    mesh.userData.isSTL = true;
    mesh.userData.stlName = compName;
    mesh.userData.stlData = compData;

    threeScene.add(mesh);
    threeMeshes.push(mesh);

    if (!threeExtrusionLevels[colorHex]) {
      threeExtrusionLevels[colorHex] = { extrusion: 20, meshes: [] };
      if (threeVisibilityState[colorHex] === undefined) threeVisibilityState[colorHex] = true;
    }
    mesh.visible = threeVisibilityState[colorHex];
    threeExtrusionLevels[colorHex].meshes.push(mesh);

    const newEl = {
      id: uid++,
      type: 'stl',
      isSTL: true,
      stlData: compData,
      stlName: compName,
      x: S.canvasW / 2,
      y: S.canvasH / 2,
      fill: colorHex,
      op: 1,
      layer: 2,
      pos3d: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
      rot3d: { x: mesh.rotation.x, y: mesh.rotation.y, z: mesh.rotation.z },
      sca3d: { x: mesh.scale.x, y: mesh.scale.y, z: mesh.scale.z }
    };
    S.letters.push(newEl);
    mesh.userData.letterId = newEl.id;
  });

  initColorPresets();
  buildExtrusionControlsFromState();
  update3DSelectionHUD();
  saveState3D();
  saveState();
  
  toast(`Importati ${allComponents.length} oggetti da "${name}" ✓`);
}

function _fixWinding(geometry) {
  if (!geometry.attributes.position) return false;
  const pos = geometry.attributes.position.array;
  if (pos.length < 9) return false;

  let volume = 0;
  for (let i = 0; i < pos.length; i += 9) {
    const x1 = pos[i], y1 = pos[i+1], z1 = pos[i+2];
    const x2 = pos[i+3], y2 = pos[i+4], z2 = pos[i+5];
    const x3 = pos[i+6], y3 = pos[i+7], z3 = pos[i+8];
    volume += (x1*y2*z3 - x1*y3*z2 - x2*y1*z3 + x2*y3*z1 + x3*y1*z2 - x3*y2*z1);
  }
  
  if (volume < -1e-7) {
    console.log(`Flipping winding for geometry (vol: ${volume})`);
    for (let i = 0; i < pos.length; i += 9) {
      const x2 = pos[i+3], y2 = pos[i+4], z2 = pos[i+5];
      const x3 = pos[i+6], y3 = pos[i+7], z3 = pos[i+8];
      pos[i+3] = x3; pos[i+4] = y3; pos[i+5] = z3;
      pos[i+6] = x2; pos[i+7] = y2; pos[i+8] = z2;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    return true;
  }
  return false;
}

function _parseOBJ(text) {
  const lines = text.split('\n');
  const allVertices = [];
  const objects = [];
  let currentObject = { name: 'default', faces: [] };
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (line.startsWith('v ')) {
      const parts = line.split(/\s+/);
      allVertices.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]));
    } else if (line.startsWith('o ') || line.startsWith('g ')) {
      if (currentObject.faces.length > 0) {
        objects.push(currentObject);
      }
      currentObject = { name: line.substring(2).trim(), faces: [] };
    } else if (line.startsWith('f ')) {
      const parts = line.split(/\s+/);
      const vIndices = [];
      for (let j = 1; j < parts.length; j++) {
        if (!parts[j]) continue;
        let vIndex = parseInt(parts[j].split('/')[0]);
        if (vIndex < 0) {
           vIndex = (allVertices.length / 3) + vIndex;
        } else {
           vIndex = vIndex - 1;
        }
        vIndices.push(vIndex);
      }
      // Triangolazione semplice (fan)
      for (let j = 1; j < vIndices.length - 1; j++) {
        currentObject.faces.push(vIndices[0], vIndices[j], vIndices[j+1]);
      }
    }
  }
  if (currentObject.faces.length > 0) {
    objects.push(currentObject);
  }

  return objects.map(obj => {
    // Vertex merging to ensure watertightness for CSG
    const uniqueVertices = [];
    const vertexMap = new Map();
    const indices = [];

    for (let i = 0; i < obj.faces.length; i++) {
      const vIdx = obj.faces[i];
      // 3ds Max (Z-up, Left-handed/Mixed) to Three.js (Y-up, Right-handed)
      // Per evitare l'effetto specchio e mantenere il sopra corretto:
      const vx = allVertices[vIdx * 3];     // Invertiamo X per correggere il mirroring
      const vy = -allVertices[vIdx * 3 + 2];  // Max Z -> Three Y (Sopra)
      const vz = allVertices[vIdx * 3 + 1];  // Max Y -> Three Z (Profondità)
      const key = `${vx.toFixed(6)},${vy.toFixed(6)},${vz.toFixed(6)}`;

      if (vertexMap.has(key)) {
        indices.push(vertexMap.get(key));
      } else {
        const newIdx = uniqueVertices.length / 3;
        uniqueVertices.push(vx, vy, vz);
        vertexMap.set(key, newIdx);
        indices.push(newIdx);
      }
    }

    const positions = new Float32Array(indices.length * 3);
    for (let i = 0; i < indices.length; i++) {
      const idx = indices[i];
      positions[i * 3] = uniqueVertices[idx * 3];
      positions[i * 3 + 1] = uniqueVertices[idx * 3 + 1];
      positions[i * 3 + 2] = uniqueVertices[idx * 3 + 2];
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    // Ensure correct orientation (CCW) for CSG
    _fixWinding(geometry);
    
    geometry.computeVertexNormals();
    return geometry;
  });
}

function _parseSTLBinary(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  // STL binary has 80 bytes header, then 4 bytes for triangle count
  if (arrayBuffer.byteLength < 84) throw new Error('File STL troppo corto');
  const nTris = view.getUint32(80, true);
  
  // Check if file size matches triangle count (84 + nTris * 50)
  if (arrayBuffer.byteLength < 84 + nTris * 50) {
     console.warn('File STL troncato o non valido, provo a leggere comunque');
  }

  const positions = new Float32Array(nTris * 9);
  const normals = new Float32Array(nTris * 9);

  for (let i = 0; i < nTris; i++) {
    const start = 84 + i * 50;
    if (start + 50 > arrayBuffer.byteLength) break;

    const nx = view.getFloat32(start, true);
    const ny = view.getFloat32(start + 4, true);
    const nz = view.getFloat32(start + 8, true);

    for (let j = 0; j < 3; j++) {
      const vStart = start + 12 + j * 12;
      const x = view.getFloat32(vStart, true);
      const y = view.getFloat32(vStart + 4, true);
      const z = view.getFloat32(vStart + 8, true);

      positions[i * 9 + j * 3] = x;
      positions[i * 9 + j * 3 + 1] = y;
      positions[i * 9 + j * 3 + 2] = z;

      normals[i * 9 + j * 3] = nx;
      normals[i * 9 + j * 3 + 1] = ny;
      normals[i * 9 + j * 3 + 2] = nz;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  return geometry;
}

async function importSTL3D() {
  try {
    const result = await window.electronAPI.importSTLFile();
    if (!result) return;
    const { name, data } = result;
    const isOBJ = name.toLowerCase().endsWith('.obj');

    const binaryString = atob(data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

    toast(`Importazione ${isOBJ ? 'OBJ' : 'STL'} in corso...`);
    
    let geometry;
    if (isOBJ) {
      const text = new TextDecoder().decode(bytes);
      geometry = _parseOBJ(text);
    } else {
      geometry = _parseSTLBinary(bytes.buffer);
    }
    
    _processImportedGeometry(name, geometry);
  } catch (e) {
    console.error('Errore importazione:', e);
    toast('Errore: ' + e.message);
  }
}

function union3DObjects() {
  if (threeSelectionOrder.length !== 2) {
    toast('Seleziona esattamente 2 oggetti per l\'unione (Shift+click)');
    return;
  }

  const meshA = threeSelectionOrder[0];
  const meshB = threeSelectionOrder[1];

  try {
    toast('Esecuzione unione in corso...');

    const colorA = meshA.material.color.getHex();

    // Try OpenJSCAD first, fallback to legacy CSG
    if (window.OpenJSCADBridge && window.OpenJSCADBridge.initialized) {

      const resultMesh = window.OpenJSCADBridge.booleanOperation('union', meshA, meshB, colorA);

      if (!resultMesh) {
        toast('Errore: unione non ha prodotto geometria');
        return;
      }

      // Hide originals instead of removing them (so undo can restore them)
      meshA.visible = false;
      meshA.userData.hiddenByBoolean = true;
      meshB.visible = false;
      meshB.userData.hiddenByBoolean = true;

      // Store references to both hidden originals for undo
      resultMesh.userData.isBooleanResult = true;
      resultMesh.userData.isUnionResult = true;
      resultMesh.userData._hiddenTargetA = meshA;
      resultMesh.userData._hiddenTargetB = meshB;
      resultMesh.userData.originalColor = colorA;

      // Remove originals from threeExtrusionLevels so they're excluded from visibility toggles
      const colorAHex = '#' + colorA.toString(16).padStart(6, '0');
      if (threeExtrusionLevels[colorAHex]) {
        const idxA = threeExtrusionLevels[colorAHex].meshes.indexOf(meshA);
        if (idxA !== -1) threeExtrusionLevels[colorAHex].meshes.splice(idxA, 1);
        const idxB = threeExtrusionLevels[colorAHex].meshes.indexOf(meshB);
        if (idxB !== -1) threeExtrusionLevels[colorAHex].meshes.splice(idxB, 1);
      }

      threeScene.add(resultMesh);
      threeMeshes.push(resultMesh);

      // Add result mesh to threeExtrusionLevels so it responds to visibility toggles
      if (!threeExtrusionLevels[colorAHex]) {
        threeExtrusionLevels[colorAHex] = { extrusion: 10, meshes: [] };
        if (threeVisibilityState[colorAHex] === undefined) threeVisibilityState[colorAHex] = true;
      }
      resultMesh.visible = threeVisibilityState[colorAHex];
      resultMesh.userData.colorHex = colorAHex; // For visibility tracking
      threeExtrusionLevels[colorAHex].meshes.push(resultMesh);

      clear3DSelection();

      const triCount = resultMesh.geometry.attributes.position.count / 3;
      toast(`✓ Unione completata! (${triCount} triangoli, OpenJSCAD)`);
      saveState3D();
      return;
    }

    // Fallback to legacy CSG (BSP-based boolean union)
    toast('⚠ OpenJSCAD non disponibile, uso CSG legacy');

    const csgA = CSG.fromMesh(meshA, colorA);
    const csgB = CSG.fromMesh(meshB, colorA);

    if (csgA.polygons.length === 0 || csgB.polygons.length === 0) {
      toast('Errore: geometria non valida per CSG');
      return;
    }

    console.log(`MeshA: ${csgA.polygons.length} poly, MeshB: ${csgB.polygons.length} poly`);

    const csgResult = csgA.union(csgB);
    console.log(`Union result: ${csgResult.polygons.length} poly`);

    if (csgResult.polygons.length === 0) {
      toast('Errore: unione non ha prodotto geometria');
      return;
    }

    const resultMesh = csgResult.toMesh(colorA);
    if (!resultMesh) {
      toast('Errore: mesh risultante vuota');
      return;
    }

    // Hide originals instead of removing them (so undo can restore them)
    meshA.visible = false;
    meshA.userData.hiddenByBoolean = true;
    meshB.visible = false;
    meshB.userData.hiddenByBoolean = true;

    // Store references to both hidden originals for undo
    resultMesh.userData.isBooleanResult = true;
    resultMesh.userData.isUnionResult = true;
    resultMesh.userData._hiddenTargetA = meshA;
    resultMesh.userData._hiddenTargetB = meshB;
    resultMesh.userData.originalColor = colorA;

    // Remove originals from threeExtrusionLevels so they're excluded from visibility toggles
    const colorAHexLegacy = '#' + colorA.toString(16).padStart(6, '0');
    if (threeExtrusionLevels[colorAHexLegacy]) {
      const idxA = threeExtrusionLevels[colorAHexLegacy].meshes.indexOf(meshA);
      if (idxA !== -1) threeExtrusionLevels[colorAHexLegacy].meshes.splice(idxA, 1);
      const idxB = threeExtrusionLevels[colorAHexLegacy].meshes.indexOf(meshB);
      if (idxB !== -1) threeExtrusionLevels[colorAHexLegacy].meshes.splice(idxB, 1);
    }

    threeScene.add(resultMesh);
    threeMeshes.push(resultMesh);

    // Add result mesh to threeExtrusionLevels so it responds to visibility toggles
    if (!threeExtrusionLevels[colorAHexLegacy]) {
      threeExtrusionLevels[colorAHexLegacy] = { extrusion: 10, meshes: [] };
      if (threeVisibilityState[colorAHexLegacy] === undefined) threeVisibilityState[colorAHexLegacy] = true;
    }
    resultMesh.visible = threeVisibilityState[colorAHexLegacy];
    resultMesh.userData.colorHex = colorAHexLegacy; // For visibility tracking
    threeExtrusionLevels[colorAHexLegacy].meshes.push(resultMesh);

    clear3DSelection();
    const triCountLeg = resultMesh.geometry.attributes.position ? resultMesh.geometry.attributes.position.count / 3 : '?';
    toast(`✓ Unione completata! (${triCountLeg} triangoli, CSG legacy)`);
    saveState3D();
  } catch (e) {
    console.error('Errore unione 3D:', e);
    toast('Errore durante l\'unione: ' + e.message);
  }
}

function subtract3DObjects() {
  if (threeSelectionOrder.length !== 2) {
    toast('Seleziona esattamente 2 oggetti per la sottrazione (Shift+click)');
    return;
  }

  const cutter = threeSelectionOrder[0];
  const target = threeSelectionOrder[1];

  try {
    toast('Sottrazione in corso...');
    const colorTarget = target.material.color.getHex();

    if (window.OpenJSCADBridge && window.OpenJSCADBridge.initialized) {
      // =====================================================================
      // FIX DEFINITIVO CSG (Manifold & Z-Fighting)
      // =====================================================================
      const origScale = cutter.scale.clone();
      const origPos = cutter.position.clone();
      
      // 1. Z-Overkill: Scaliamo il cutter sull'asse Z in modo che sia 
      // esageratamente più alto, assicurandoci che buchi da parte a parte.
      cutter.scale.z = origScale.z * 1.5; 
      
      // 2. Centratura Z: Abbassiamo il cutter per distribuire l'extra altezza
      cutter.geometry.computeBoundingBox();
      const cutterZHeight = (cutter.geometry.boundingBox.max.z - cutter.geometry.boundingBox.min.z) * cutter.scale.z;
      cutter.position.z -= (cutterZHeight * 0.15); // Lo abbassiamo del 15%

      // 3. Micro-Jitter X/Y: Sfalsamento infinitesimale per rompere la coplanarità
      // dei bordi laterali. Previene "Self-intersections" e "CSG Artifacts".
      cutter.position.x += 0.001;
      cutter.position.y += 0.001;

      cutter.updateMatrixWorld(true);
      // =====================================================================

      // Perform boolean subtraction using OpenJSCAD
      const resultMesh = window.OpenJSCADBridge.booleanOperation('subtract', target, cutter, colorTarget);

      // Ripristino immediato del cutter originale per non rovinare la scena
      cutter.scale.copy(origScale);
      cutter.position.copy(origPos);
      cutter.updateMatrixWorld(true);

      if (!resultMesh) {
        toast('Errore: sottrazione ha rimosso tutto o generato geometria invalida');
        return;
      }

      console.log(`Result mesh: ${resultMesh.geometry.attributes.position.count} vertices`);

      const targetMaterialClone = new THREE.MeshPhongMaterial({
        color: target.material.color.clone(),
        specular: target.material.specular ? target.material.specular.clone() : new THREE.Color(0x444444),
        shininess: target.material.shininess || 30,
        side: THREE.DoubleSide,
        transparent: target.material.transparent,
        opacity: target.material.opacity
      });
      resultMesh.material.dispose();
      resultMesh.material = targetMaterialClone;

      target.visible = false;
      target.userData.hiddenByBoolean = true;

      const colorTargetHex = '#' + colorTarget.toString(16).padStart(6, '0');
      if (threeExtrusionLevels[colorTargetHex]) {
        const targetIdx = threeExtrusionLevels[colorTargetHex].meshes.indexOf(target);
        if (targetIdx !== -1) {
          threeExtrusionLevels[colorTargetHex].meshes.splice(targetIdx, 1);
        }
      }

      resultMesh.position.set(0, 0, 0);
      resultMesh.userData.isBooleanResult = true;
      resultMesh.userData.isSubtractResult = true;
      resultMesh.userData._hiddenTarget = target; 
      resultMesh.userData.colorHex = colorTargetHex;

      threeScene.add(resultMesh);
      threeMeshes.push(resultMesh);

      if (!threeExtrusionLevels[colorTargetHex]) {
        threeExtrusionLevels[colorTargetHex] = { extrusion: 10, meshes: [] };
        if (threeVisibilityState[colorTargetHex] === undefined) threeVisibilityState[colorTargetHex] = true;
      }
      resultMesh.visible = threeVisibilityState[colorTargetHex];
      threeExtrusionLevels[colorTargetHex].meshes.push(resultMesh);

      if (threeControls) threeControls.update();
      if (threeRenderer && threeScene && threeCamera) {
        threeRenderer.render(threeScene, threeCamera);
      }

      clear3DSelection();
      saveState3D();

      const triCount = resultMesh.geometry.attributes.position.count / 3;
      toast(`✓ Sottrazione completata! ${triCount} triangoli (OpenJSCAD)`);
      return;
    }

    // Fallback to legacy CSG
    toast('⚠ OpenJSCAD non disponibile, uso CSG legacy');

    const csgCutter = CSG.fromMesh(cutter);
    const csgTarget = CSG.fromMesh(target);

    const csgResult = csgTarget.subtract(csgCutter);

    if (csgResult.polygons.length === 0) {
      toast('Errore: la sottrazione ha rimosso tutto');
      return;
    }

    const resultMesh = csgResult.toMesh(colorTarget);
    if (!resultMesh) {
      toast('Errore: mesh risultante vuota');
      return;
    }

    target.visible = false;
    target.userData.hiddenByBoolean = true;

    const colorTargetHexLegacy = '#' + colorTarget.toString(16).padStart(6, '0');
    if (threeExtrusionLevels[colorTargetHexLegacy]) {
      const targetIdx = threeExtrusionLevels[colorTargetHexLegacy].meshes.indexOf(target);
      if (targetIdx !== -1) threeExtrusionLevels[colorTargetHexLegacy].meshes.splice(targetIdx, 1);
    }

    resultMesh.userData.isBooleanResult = true;
    resultMesh.userData.isSubtractResult = true;
    resultMesh.userData._hiddenTarget = target;
    resultMesh.userData.colorHex = colorTargetHexLegacy;

    threeScene.add(resultMesh);
    threeMeshes.push(resultMesh);

    if (!threeExtrusionLevels[colorTargetHexLegacy]) {
      threeExtrusionLevels[colorTargetHexLegacy] = { extrusion: 10, meshes: [] };
      if (threeVisibilityState[colorTargetHexLegacy] === undefined) threeVisibilityState[colorTargetHexLegacy] = true;
    }
    resultMesh.visible = threeVisibilityState[colorTargetHexLegacy];
    threeExtrusionLevels[colorTargetHexLegacy].meshes.push(resultMesh);

    clear3DSelection();
    saveState3D();
    const triCountLeg = resultMesh.geometry.attributes.position ? resultMesh.geometry.attributes.position.count / 3 : '?';
    toast(`✓ Sottrazione completata! (${triCountLeg} triangoli, CSG legacy)`);

  } catch (e) {
    console.error('❌ Errore sottrazione:', e);
    toast('Errore CSG: ' + e.message);
  }
}

// Create pocket: duplicate first object, reduce to 5px height, offset 5px, subtract from second object
/**
 * Crea un offset 2D robusto combinando la geometria originale con il suo "bordo spesso".
 * Previene i crash di OpenJSCAD su font complessi o spigoli acuti.
 */
function robust2DOffset(pathD, delta) {
  const jscad = window.OpenJSCADBridge.jscad;
  
  // 1. Geometria di base (il "cuore" della lettera)
  let finalGeom2 = window.OpenJSCADBridge.parseSVGPathToGeom2(pathD);
  if (!finalGeom2) return null;

  // 2. Dividiamo il path originale nei suoi sub-path (es. l'esterno e il buco della "O")
  const segs = pathToAbsoluteSegments(pathD);
  const subpaths = [];
  let cur = [];
  
  for (const s of segs) {
    if (s.cmd === 'M') {
      if (cur.length > 0) subpaths.push(cur);
      cur = [s];
    } else {
      cur.push(s);
    }
  }
  if (cur.length > 0) subpaths.push(cur);

  // 3. Per ogni sub-path, generiamo un contorno spesso spesso (2 * delta)
  // e lo "saldiamo" (Union) alla geometria di base.
  for (const sub of subpaths) {
    const strokeD = strokeToFillPath(sub, delta * 2);
    if (strokeD) {
      const strokeGeom2 = window.OpenJSCADBridge.parseSVGPathToGeom2(strokeD);
      if (strokeGeom2) {
        try {
          // L'unione booleana risolve automaticamente i self-intersections e le sbavature
          finalGeom2 = jscad.booleans.union(finalGeom2, strokeGeom2);
        } catch (e) {
          console.warn("Union con il bordo fallita per un subpath, skippato.", e);
        }
      }
    }
  }
  
  return finalGeom2;
}

function createPocket3D() {

  if (threeSelectionOrder.length !== 2) {
    toast('Seleziona esattamente 2 oggetti: primo = da duplicare, secondo = da bucare');
    return;
  }

  const sourceMesh = threeSelectionOrder[0];
  const targetMesh = threeSelectionOrder[1];

  try {
    toast('Creazione tasca in corso...');

    // HELPER: Trova il path SVG originale anche se l'oggetto è il risultato di sottrazioni/unioni precedenti
    function getRootOriginalPathD(mesh) {
      if (mesh.geometry && mesh.geometry.userData && mesh.geometry.userData.originalPathD) {
        return mesh.geometry.userData.originalPathD;
      }
      if (mesh.userData && mesh.userData._hiddenTarget) {
        return getRootOriginalPathD(mesh.userData._hiddenTarget);
      }
      if (mesh.userData && mesh.userData._hiddenTargetA) {
        return getRootOriginalPathD(mesh.userData._hiddenTargetA); // Se è un'unione, prendi il corpo base
      }
      return null;
    }

    const originalPathD = getRootOriginalPathD(sourceMesh);
    
    if (!originalPathD) {
      toast('Errore: impossibile trovare il path SVG originale dell\'utensile');
      return;
    }

    const sourceColorHex = sourceMesh.userData.colorHex || '#' + sourceMesh.material.color.getHexString();
    const sourceExtrusion = threeExtrusionLevels[sourceColorHex]?.extrusion || 20;

    if (sourceExtrusion <= 5) {
      toast('Errore: l\'oggetto originale deve essere più alto di 5px');
      return;
    }

    if (!window.OpenJSCADBridge || !window.OpenJSCADBridge.initialized) {
      toast('Errore: OpenJSCAD non disponibile');
      return;
    }

    const jscad = window.OpenJSCADBridge.jscad;
    const geom2 = window.OpenJSCADBridge.parseSVGPathToGeom2(originalPathD);
    
    if (!geom2) {
      toast('Errore: geometria non valida');
      return;
    }

    // Offset aumentato in qualità (segments: 32) per prevenire loop e self-intersection in 2D
    try {
      // Read offset value from the input field
      const offsetValue = parseFloat(document.getElementById('pocket-offset-input').value.replace(/[^0-9.]/g, '')) || 2;
      const expandedGeom2 = jscad.expansions.expand({ delta: offsetValue, corners: 'round', segments: 32 }, geom2);
      
      if (expandedGeom2) {
        const cutterGeom2 = expandedGeom2;
        
        // Read depth value from the input field
        const pocketDepth = parseFloat(document.getElementById('pocket-depth-input').value.replace(/[^0-9.]/g, '')) || 5;
        const zOverkill = 15; // Spropositato margine superiore
        
        // Estrudiamo il cutter per la profondità della tasca + un enorme margine per il tetto
        const cutterGeom3 = window.OpenJSCADBridge.extrudeGeom2ToGeom3(cutterGeom2, pocketDepth + zOverkill);
        
        if (!cutterGeom3) {
          toast('Errore: impossibile estrudere il cutter');
          return;
        }

        // Recuperiamo l'SVG originale del target tramite l'helper
        const targetPathD = getRootOriginalPathD(targetMesh);
        if (!targetPathD) {
          toast('Errore: impossibile trovare l\'SVG originale del destinatario');
          return;
        }

        const targetGeom2 = window.OpenJSCADBridge.parseSVGPathToGeom2(targetPathD);
        if (!targetGeom2) return;

        // Recuperiamo in modo sicuro l'estrusione del target
        const targetColorHex = targetMesh.userData.colorHex || '#' + targetMesh.material.color.getHexString();
        const targetExtrusion = threeExtrusionLevels[targetColorHex]?.extrusion || 20;

        const targetGeom3 = window.OpenJSCADBridge.extrudeGeom2ToGeom3(targetGeom2, targetExtrusion);
        if (!targetGeom3) return;

        // -- FIX SPOSTAMENTO 3D VIRTUALIZZATO SULL'SVG --
        // Calcoliamo la differenza di posizione tra l'utensile e il bersaglio 
        const deltaX = sourceMesh.position.x - targetMesh.position.x;
        const deltaY = sourceMesh.position.y - targetMesh.position.y;

        // La base del cutter è posizionata calcolando l'altezza del target - la profondità
        const zPosition = targetExtrusion - pocketDepth;
        
        // Applichiamo Traslazione X/Y (virtual move dell'SVG) + Traslazione Z
        // Manteniamo anche il MICRO-JITTER (0.001) per evitare errori di facce complanari in CSG.
        const cutterGeom3Positioned = jscad.transforms.translate(
          [deltaX + 0.001, deltaY + 0.001, zPosition], 
          cutterGeom3
        );

        // Sottrazione booleana (usando le forme base rigenerate dall'SVG):
        const resultGeom3 = jscad.booleans.subtract(targetGeom3, cutterGeom3Positioned);
        const resultPolygons = jscad.geometries.geom3.toPolygons(resultGeom3);
        
        if (resultPolygons.length === 0) {
          toast('Errore: la sottrazione ha rimosso tutto (geometria fallita)');
          return;
        }

        const resultGeometry = window.OpenJSCADBridge.geom3ToThreeGeometry(resultGeom3);
        
        const targetColor = targetMesh.material.color.getHex();
        const resultMaterial = new THREE.MeshPhongMaterial({
          color: new THREE.Color(targetColor),
          specular: targetMesh.material.specular ? targetMesh.material.specular.clone() : new THREE.Color(0x444444),
          shininess: targetMesh.material.shininess || 30,
          side: THREE.DoubleSide,
          transparent: targetMesh.material.transparent,
          opacity: targetMesh.material.opacity
        });

        const resultMesh = new THREE.Mesh(resultGeometry, resultMaterial);
        
        // Posizioniamo il risultato esattamente dove si trovava il target originale
        resultMesh.position.copy(targetMesh.position);
        resultMesh.rotation.copy(targetMesh.rotation);
        resultMesh.scale.copy(targetMesh.scale);
        
        resultMesh.userData.isBooleanResult = true;
        resultMesh.userData.isPocketResult = true;
        resultMesh.userData.colorHex = targetColorHex;
        resultMesh.userData._hiddenTarget = targetMesh;

        targetMesh.visible = false;
        targetMesh.userData.hiddenByBoolean = true;

        if (threeExtrusionLevels[targetColorHex]) {
          const targetIdx = threeExtrusionLevels[targetColorHex].meshes.indexOf(targetMesh);
          if (targetIdx !== -1) {
            threeExtrusionLevels[targetColorHex].meshes.splice(targetIdx, 1);
          }
        }

        resultMesh.updateMatrixWorld(true);
        threeScene.add(resultMesh);
        threeMeshes.push(resultMesh);

        if (!threeExtrusionLevels[targetColorHex]) {
          threeExtrusionLevels[targetColorHex] = { extrusion: targetExtrusion, meshes: [] };
          threeVisibilityState[targetColorHex] = true;
        }
        resultMesh.visible = threeVisibilityState[targetColorHex];
        threeExtrusionLevels[targetColorHex].meshes.push(resultMesh);

        if (threeControls) threeControls.update();
        if (threeRenderer && threeScene && threeCamera) {
          threeRenderer.render(threeScene, threeCamera);
        }

        clear3DSelection();
        saveState3D();

        const triCount = resultMesh.geometry.attributes.position.count / 3;
        toast(`✓ Tasca creata! ${triCount} triangoli chiusi.`);

      }
    } catch (expandError) {
      console.error('Error expanding geometry:', expandError);
      toast('Errore nell\'applicazione dell\'offset (forme troppo complesse).');
    }

  } catch (e) {
    console.error('❌ Errore creazione tasca:', e);
    toast('Errore CSG: ' + e.message);
  }
}

// Duplicate selected 3D object(s)
function duplicate3DSelection() {
  if (threeSelectionOrder.length === 0) {
    toast('Seleziona almeno un oggetto da duplicare');
    return;
  }

  const newSelections = [];

  threeSelectionOrder.forEach((mesh, idx) => {
    try {
      // Clone the mesh geometry and material
      const clonedGeometry = mesh.geometry.clone();
      const clonedMaterial = mesh.material.clone();
      const clonedMesh = new THREE.Mesh(clonedGeometry, clonedMaterial);

      // Copy all userData
      Object.keys(mesh.userData).forEach(key => {
        if (key !== 'bbox2D' && key !== 'groupId') {
          clonedMesh.userData[key] = mesh.userData[key];
        }
      });

      // Offset the clone slightly to make it visible (shift by 10 units on X axis)
      const bbox = new THREE.Box3().setFromObject(mesh);
      const size = bbox.getSize(new THREE.Vector3());
      const offset = Math.max(size.x, 10);
      
      clonedMesh.position.copy(mesh.position);
      clonedMesh.position.x += offset;
      clonedMesh.rotation.copy(mesh.rotation);
      clonedMesh.scale.copy(mesh.scale);

      // Apply the same transform
      clonedMesh.updateMatrix();
      clonedMesh.updateMatrixWorld(true);

      // Add to scene
      threeScene.add(clonedMesh);
      threeMeshes.push(clonedMesh);

      // Add to extrusion levels for visibility tracking
      const colorHex = mesh.userData.colorHex || '#' + mesh.material.color.getHexString();
      if (!threeExtrusionLevels[colorHex]) {
        threeExtrusionLevels[colorHex] = { extrusion: 20, meshes: [] };
        threeVisibilityState[colorHex] = true;
      }
      clonedMesh.visible = threeVisibilityState[colorHex];
      threeExtrusionLevels[colorHex].meshes.push(clonedMesh);

      newSelections.push(clonedMesh);

    } catch (err) {
      console.error('Error duplicating mesh:', err);
      toast('Errore nella duplicazione: ' + err.message);
    }
  });

  // Update selection to the new cloned meshes
  threeSelectionOrder = newSelections;
  
  // Update selection indicators
  updateSelectionIndicators();
  
  // Update position controls to reflect new selection
  if (threeSelectionOrder.length > 0) {
    update3DPositionInputs();
  }

  saveState3D();
  toast(`✓ Duplicato ${newSelections.length} oggetto/i`);
}

// Delete selected 3D object(s)
function delete3DSelection() {
  if (threeSelectionOrder.length === 0) {
    toast('Seleziona almeno un oggetto da eliminare');
    return;
  }

  const count = threeSelectionOrder.length;

  threeSelectionOrder.forEach((mesh, idx) => {
    try {
      // Hide instead of removing (for undo support)
      mesh.visible = false;
      mesh.userData.hiddenByDelete = true;

      // Remove from extrusion levels
      const colorHex = mesh.userData.colorHex || '#' + mesh.material.color.getHexString();
      if (threeExtrusionLevels[colorHex]) {
        const meshIdx = threeExtrusionLevels[colorHex].meshes.indexOf(mesh);
        if (meshIdx !== -1) {
          threeExtrusionLevels[colorHex].meshes.splice(meshIdx, 1);
        }
      }

    } catch (err) {
      console.error('Error deleting mesh:', err);
      toast('Errore nell\'eliminazione: ' + err.message);
    }
  });

  // Clear selection
  clear3DSelection();

  // Hide transform controls if visible
  if (threeTransformControls) {
    threeTransformControls.detach();
  }

  saveState3D();
  toast(`✓ Eliminato ${count} oggetto/i`);
}

function start3DAnimation() {
  function animate() {
    if (!threeControls || !threeRenderer || !threeScene || !threeCamera) return;

    threeControls.update();

    // Must update TransformControls every frame so gizmo arrows stay correctly oriented
    // relative to the camera (fixes inverted arrow tips when rotating the view)
    if (threeTransformControls && threeTransformControls.visible) {
      threeTransformControls.update();
    }

    // Update selection indicators to follow their target meshes
    threeSelectionIndicator.forEach(ind => {
      if (ind.userData.targetMesh && ind.userData.targetMesh.visible) {
        const bbox = new THREE.Box3().setFromObject(ind.userData.targetMesh);
        const center = bbox.getCenter(new THREE.Vector3());
        ind.position.copy(center);
      }
    });

    // Update position inputs in real-time while dragging
    if (threeTransformControls && threeTransformControls._dragging) {
      update3DPositionInputs();
    }

    threeRenderer.render(threeScene, threeCamera);
    threeAnimationId = requestAnimationFrame(animate);
  }

  animate();
}

// ── 3D GRAPHICS CONTROLS ──────────────────────────────────────────────────

function toggle3DGrid(visible) {
  if (typeof visible === 'boolean') {
    threeGraphicsSettings.gridVisible = visible;
  } else {
    threeGraphicsSettings.gridVisible = !threeGraphicsSettings.gridVisible;
  }
  if (threeGridHelper) {
    threeGridHelper.visible = threeGraphicsSettings.gridVisible;
  }
  const btn = document.getElementById('grid-toggle-btn');
  if (btn) btn.style.color = threeGraphicsSettings.gridVisible ? 'var(--accent)' : 'var(--muted)';
  saveState3D();
}

function change3DBgColor(color) {
  threeGraphicsSettings.bgColor = color;
  if (threeScene) {
    threeScene.background = new THREE.Color(color);
  }
  const dot = document.getElementById('bg-color-picker-dot');
  if (dot) dot.style.background = color;
  saveState3D();
}

function change3DAmbientLight(value) {
  const intensity = value / 100;
  threeGraphicsSettings.ambientIntensity = intensity;
  document.getElementById('ambient-light-value').textContent = value + '%';
  if (threeAmbientLight) {
    threeAmbientLight.intensity = intensity;
  }
  saveState3D();
}

function change3DSpecular(value) {
  const specular = new THREE.Color(`hsl(0, 0%, ${value}%)`);
  threeGraphicsSettings.specular = specular.getHex();
  document.getElementById('specular-value').textContent = value + '%';

  // Update all mesh materials
  threeMeshes.forEach(mesh => {
    if (mesh.material) {
      mesh.material.specular = specular;
    }
  });
  saveState3D();
}

function change3DShininess(value) {
  const shininess = parseFloat(value);
  threeGraphicsSettings.shininess = shininess;
  document.getElementById('shininess-value').textContent = value + '%';

  // Update all mesh materials
  threeMeshes.forEach(mesh => {
    if (mesh.material) {
      mesh.material.shininess = shininess;
    }
  });
  saveState3D();
}

// ── ELECTRON AUTO-UPDATE INTEGRATION ─────────────────────────────────────
if (window.electronAPI && window.electronAPI.onUpdateStatus) {
  window.electronAPI.onUpdateStatus(handleUpdateStatus);
}

// Auto-update version display from package.json
if (window.electronAPI && window.electronAPI.onAppVersion) {
  window.electronAPI.onAppVersion((version) => {
    const verEl = document.getElementById('app-version');
    const unVerEl = document.getElementById('un-version');
    const homeVerEl = document.getElementById('home-version-display');
    if (verEl) verEl.textContent = 'v' + version;
    if (unVerEl) unVerEl.textContent = 'Versione ' + version;
    if (homeVerEl) homeVerEl.textContent = 'v' + version;
  });
}

// ═══════════════════════════════════════════════════════════════════
// EXPORT FUNCTIONS  (STL + 3MF)
// ═══════════════════════════════════════════════════════════════════
// Regola di raggruppamento:
//   • Stesso colore + oggetti che si toccano → UNICO oggetto esportato
//   • Stesso colore + oggetti NON a contatto → oggetti separati
//   • Colori diversi → sempre oggetti separati
//
// Il rilevamento di contatto usa bounding box world-space con tolleranza
// adattiva (0.5% della diagonale media) per gestire correttamente il kerning

// ── Utility comune: raccoglie triangoli world-space da una mesh ──────────────
function _collectTrisFromMesh(mesh) {
  mesh.updateMatrixWorld(true);
  const geo = mesh.geometry.index
    ? mesh.geometry.toNonIndexed()
    : mesh.geometry.clone();
  geo.applyMatrix4(mesh.matrixWorld);
  const pos = geo.attributes.position.array;
  const tris = [];
  for (let i = 0; i < pos.length; i += 9) {
    const a = [pos[i],   pos[i+1], pos[i+2]];
    const b = [pos[i+3], pos[i+4], pos[i+5]];
    const c = [pos[i+6], pos[i+7], pos[i+8]];
    // salta triangoli degeneri
    if (a[0]===b[0]&&a[1]===b[1]&&a[2]===b[2]) continue;
    if (b[0]===c[0]&&b[1]===c[1]&&b[2]===c[2]) continue;
    if (a[0]===c[0]&&a[1]===c[1]&&a[2]===c[2]) continue;
    tris.push([a, b, c]);
  }
  geo.dispose();
  return tris;
}

// ── Raggruppa mesh per colore + connettività (Union-Find su bbox world-space) ──
// Regola:
//   • stesso colore + bboxes che si toccano/sovrappongono → stesso gruppo
//   • stesso colore ma separati nello spazio → gruppi distinti
//   • colori diversi → sempre gruppi distinti
//
// La tolleranza di contatto è calcolata come percentuale della dimensione media
// dei glifi per adattarsi sia a testi grandi che piccoli, ma rimane piccola
// (≤ 1% della dimensione) così parole separate non si fondono.
function _groupMeshesConnected() {
  if (!threeScene || threeMeshes.length === 0) return null;
  // Exclude hidden objects AND subtracted cutters from export
  const active = threeMeshes.filter(m => 
    threeScene.children.includes(m) && 
    m.visible && 
    !m.userData.isSubtracted
  );
  if (!active.length) return null;
  const n = active.length;

  // Calcola bounding box world-space reale per ogni mesh
  const bboxes = active.map(mesh => {
    mesh.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(mesh);
    return { minX: bb.min.x, minY: bb.min.y, maxX: bb.max.x, maxY: bb.max.y };
  });

  // Tolleranza adattiva: 0.5% della diagonale media delle mesh
  // — abbastanza grande da catturare lettere a kerning zero,
  //   abbastanza piccola da non unire parole separate da spazio bianco
  const avgDiag = bboxes.reduce((s, b) => {
    const w = b.maxX - b.minX, h = b.maxY - b.minY;
    return s + Math.sqrt(w * w + h * h);
  }, 0) / n;
  const TOL = avgDiag * 0.005; // 0.5%

  // Union-Find
  const parent = Array.from({ length: n }, (_, i) => i);
  function find(x) {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  }
  function unite(a, b) { parent[find(a)] = find(b); }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // Colori diversi → mai unire
      if (active[i].material.color.getHex() !== active[j].material.color.getHex()) continue;
      const a = bboxes[i], b = bboxes[j];
      // Le bboxes si toccano o sovrappongono (con tolleranza TOL)?
      if (a.maxX + TOL >= b.minX && b.maxX + TOL >= a.minX &&
          a.maxY + TOL >= b.minY && b.maxY + TOL >= a.minY) {
        unite(i, j);
      }
    }
  }

  // Costruisce array di gruppi: ogni gruppo è lista di mesh
  const rootMap = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!rootMap.has(r)) rootMap.set(r, []);
    rootMap.get(r).push(active[i]);
  }
  return Array.from(rootMap.values()); // Array<mesh[]>
}

// ── Calcola normale di un triangolo ──────────────────────────────────────────
function _triNormal(a, b, c) {
  const ex=b[0]-a[0], ey=b[1]-a[1], ez=b[2]-a[2];
  const fx=c[0]-a[0], fy=c[1]-a[1], fz=c[2]-a[2];
  let nx=ey*fz-ez*fy, ny=ez*fx-ex*fz, nz=ex*fy-ey*fx;
  const ln=Math.sqrt(nx*nx+ny*ny+nz*nz);
  if(ln>1e-10){nx/=ln;ny/=ln;nz/=ln;}else{nx=0;ny=0;nz=1;}
  return [nx, ny, nz];
}

// ────────────────────────────────────────────────────────────────────────────
// EXPORT STL  — un file STL per ogni gruppo (colore + connettività)
// Il formato binario non supporta multi-solido, quindi ogni gruppo viene
// scaricato come file separato con il colore nell'header
// ────────────────────────────────────────────────────────────────────────────
function exportToSTL() {
  const groupsList = _groupMeshesConnected();
  if (!groupsList) { toast('Nessun elemento 3D visibile!'); return; }

  let totalFiles = 0;
  let totalTris  = 0;

  groupsList.forEach((meshes, gi) => {
    const colorHex = meshes[0].material.color.getHexString();
    // Raccoglie tutti i triangoli del gruppo
    const tris = [];
    meshes.forEach(m => tris.push(..._collectTrisFromMesh(m)));
    if (!tris.length) return;

    // Scrive STL binario (più compatto e compatibile di ASCII)
    // Header: 80 byte  |  uint32: numero triangoli  |  triangoli 50 byte ciascuno
    const n = tris.length;
    const buf = new ArrayBuffer(84 + n * 50);
    const view = new DataView(buf);

    // Header ASCII (80 byte) — contiene il colore come info
    const header = `LetterForge color #${colorHex}`.padEnd(80, ' ');
    for (let i = 0; i < 80; i++) view.setUint8(i, header.charCodeAt(i) & 0xff);

    // Numero triangoli
    view.setUint32(80, n, true);

    // Triangoli
    let offset = 84;
    tris.forEach(([a, b, c]) => {
      const [nx, ny, nz] = _triNormal(a, b, c);
      view.setFloat32(offset,    nx, true); offset += 4;
      view.setFloat32(offset,    ny, true); offset += 4;
      view.setFloat32(offset,    nz, true); offset += 4;
      [a, b, c].forEach(v => {
        view.setFloat32(offset, v[0], true); offset += 4;
        view.setFloat32(offset, v[1], true); offset += 4;
        view.setFloat32(offset, v[2], true); offset += 4;
      });
      view.setUint16(offset, 0, true); offset += 2; // attribute byte count
    });

    // Download
    const blob = new Blob([buf], { type: 'application/octet-stream' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `letterforge_obj${gi+1}_${colorHex}.stl`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    totalFiles++;
    totalTris += n;
  });

  toast(`STL esportato! ✓  ${totalFiles} file (gruppi connessi per colore), ${totalTris} triangoli totali`);
}

// ────────────────────────────────────────────────────────────────────────────
// EXPORT 3MF  — un unico file .3mf con oggetti separati per ogni gruppo
// Ogni <object> nel file 3MF rappresenta un insieme di elementi dello stesso
// colore che si toccano. PrusaSlicer e Bambu Studio importano ogni <object>
// come oggetto indipendente nella scena
// ────────────────────────────────────────────────────────────────────────────
function exportTo3MF() {
  const groupsList = _groupMeshesConnected();
  if (!groupsList) { toast('Nessun elemento 3D visibile!'); return; }

  // ── Costruisce XML 3MF ────────────────────────────────────────────────────
  // Spec: https://3mf.io/specification/
  // Struttura minima riconosciuta da PrusaSlicer e Bambu Studio:
  //   3D/3dmodel.model  (XML)
  //   [Content_Types].xml
  //   _rels/.rels

  let objectsXml = '';
  let buildItemsXml = '';
  let objId = 1;

  groupsList.forEach((meshes) => {
    const colorHex = meshes[0].material.color.getHexString();
    const tris = [];
    meshes.forEach(m => tris.push(..._collectTrisFromMesh(m)));
    if (!tris.length) return;

    // Costruisce lista vertici unica (welding)
    const WELD = 1e-4, INV = 1.0 / 1e-4;
    const vertMap = new Map();
    const verts = [];
    let vi = 0;
    function weld(v) {
      const ix=Math.round(v[0]*INV), iy=Math.round(v[1]*INV), iz=Math.round(v[2]*INV);
      const k=ix+','+iy+','+iz;
      if (vertMap.has(k)) return vertMap.get(k);
      verts.push([ix*WELD, iy*WELD, iz*WELD]);
      vertMap.set(k, vi); return vi++;
    }

    const faces = [];
    tris.forEach(([a,b,c]) => {
      const ia=weld(a), ib=weld(b), ic=weld(c);
      if (ia===ib||ib===ic||ia===ic) return;
      faces.push([ia, ib, ic]);
    });

    if (!faces.length) return;

    // XML vertici
    const vertsXml = verts.map(([x,y,z]) =>
      `          <vertex x="${x.toFixed(6)}" y="${y.toFixed(6)}" z="${z.toFixed(6)}"/>`
    ).join('\n');

    // XML triangoli
    const facesXml = faces.map(([v1,v2,v3]) =>
      `          <triangle v1="${v1}" v2="${v2}" v3="${v3}"/>`
    ).join('\n');

    // Colore come sRGB per metadati
    const r = parseInt(colorHex.substring(0,2),16);
    const g = parseInt(colorHex.substring(2,4),16);
    const b = parseInt(colorHex.substring(4,6),16);

    objectsXml += `
    <object id="${objId}" type="model" name="color_${colorHex}">
      <mesh>
        <vertices>
${vertsXml}
        </vertices>
        <triangles>
${facesXml}
        </triangles>
      </mesh>
    </object>`;

    buildItemsXml += `\n      <item objectid="${objId}"/>`;
    objId++;
  });

  if (!objectsXml) { toast('Nessuna geometria da esportare!'); return; }

  // ── Compone i tre file del pacchetto 3MF ─────────────────────────────────
  const modelXml =
`<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US"
  xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"
  xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06">
  <metadata name="Application">LetterForge</metadata>
  <resources>${objectsXml}
  </resources>
  <build>${buildItemsXml}
  </build>
</model>`;

  const contentTypesXml =
`<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`;

  const relsXml =
`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0"
    Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;

  // ── Costruisce ZIP manualmente (formato ZIP senza compressione) ───────────
  // 3MF è uno ZIP rinominato. Usiamo stored (no compression) per semplicità.
  function strToBytes(str) {
    return new TextEncoder().encode(str);
  }

  function makeLocalFileHeader(name, data) {
    const nameBytes = strToBytes(name);
    const crc = crc32(data);
    const buf = new ArrayBuffer(30 + nameBytes.length + data.length);
    const dv  = new DataView(buf);
    let o = 0;
    dv.setUint32(o, 0x04034b50, true); o+=4; // signature
    dv.setUint16(o, 20, true); o+=2;          // version needed
    dv.setUint16(o, 0, true);  o+=2;          // flags
    dv.setUint16(o, 0, true);  o+=2;          // compression: stored
    dv.setUint16(o, 0, true);  o+=2;          // mod time
    dv.setUint16(o, 0, true);  o+=2;          // mod date
    dv.setUint32(o, crc, true); o+=4;         // crc32
    dv.setUint32(o, data.length, true); o+=4; // compressed size
    dv.setUint32(o, data.length, true); o+=4; // uncompressed size
    dv.setUint16(o, nameBytes.length, true); o+=2;
    dv.setUint16(o, 0, true); o+=2;           // extra field length
    nameBytes.forEach(b => { dv.setUint8(o++, b); });
    data.forEach(b => { dv.setUint8(o++, b); });
    return { buf: new Uint8Array(buf), crc, size: data.length, nameBytes };
  }

  function makeCentralDir(name, nameBytes, crc, size, offset) {
    const buf = new ArrayBuffer(46 + nameBytes.length);
    const dv  = new DataView(buf);
    let o = 0;
    dv.setUint32(o, 0x02014b50, true); o+=4;
    dv.setUint16(o, 20, true); o+=2;
    dv.setUint16(o, 20, true); o+=2;
    dv.setUint16(o, 0, true);  o+=2;
    dv.setUint16(o, 0, true);  o+=2;
    dv.setUint16(o, 0, true);  o+=2;
    dv.setUint16(o, 0, true);  o+=2;
    dv.setUint32(o, crc, true); o+=4;
    dv.setUint32(o, size, true); o+=4;
    dv.setUint32(o, size, true); o+=4;
    dv.setUint16(o, nameBytes.length, true); o+=2;
    dv.setUint16(o, 0, true); o+=2;
    dv.setUint16(o, 0, true); o+=2;
    dv.setUint16(o, 0, true); o+=2;
    dv.setUint16(o, 0, true); o+=2;
    dv.setUint32(o, 0, true); o+=4;
    dv.setUint32(o, offset, true); o+=4;
    nameBytes.forEach(b => { dv.setUint8(o++, b); });
    return new Uint8Array(buf);
  }

  function makeEndOfCentralDir(numEntries, centralDirSize, centralDirOffset) {
    const buf = new ArrayBuffer(22);
    const dv  = new DataView(buf);
    dv.setUint32(0, 0x06054b50, true);
    dv.setUint16(4, 0, true);
    dv.setUint16(6, 0, true);
    dv.setUint16(8, numEntries, true);
    dv.setUint16(10, numEntries, true);
    dv.setUint32(12, centralDirSize, true);
    dv.setUint32(16, centralDirOffset, true);
    dv.setUint16(20, 0, true);
    return new Uint8Array(buf);
  }

  // CRC-32 lookup table
  function crc32(data) {
    let crc = 0xFFFFFFFF;
    const table = crc32.table || (crc32.table = (() => {
      const t = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[i] = c;
      }
      return t;
    })());
    for (let i = 0; i < data.length; i++)
      crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  // Entries: [Content_Types].xml, _rels/.rels, 3D/3dmodel.model
  const files = [
    { name: '[Content_Types].xml', data: strToBytes(contentTypesXml) },
    { name: '_rels/.rels',         data: strToBytes(relsXml) },
    { name: '3D/3dmodel.model',    data: strToBytes(modelXml) },
  ];

  const localHeaders = [];
  const centralDirs  = [];
  let offset = 0;

  files.forEach(({ name, data }) => {
    const entry = makeLocalFileHeader(name, data);
    const cd    = makeCentralDir(name, entry.nameBytes, entry.crc, entry.size, offset);
    localHeaders.push(entry.buf);
    centralDirs.push(cd);
    offset += entry.buf.length;
  });

  const centralDirOffset = offset;
  const centralDirBytes  = centralDirs.reduce((a,b) => { const r=new Uint8Array(a.length+b.length); r.set(a); r.set(b,a.length); return r; }, new Uint8Array(0));
  const eocd = makeEndOfCentralDir(files.length, centralDirBytes.length, centralDirOffset);

  // Concatena tutto
  const allParts = [...localHeaders, centralDirBytes, eocd];
  const total = allParts.reduce((s,p) => s + p.length, 0);
  const zipBytes = new Uint8Array(total);
  let pos = 0;
  allParts.forEach(p => { zipBytes.set(p, pos); pos += p.length; });

  // Download
  const blob = new Blob([zipBytes], { type: 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'letterforge-design.3mf';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  const nObj = objId - 1;
  toast(`3MF esportato! ✓  ${nObj} oggett${nObj===1?'o':'i'} (gruppi connessi per colore)`);
}

// ────────────────────────────────────────────────────────────────────────────
// EXPORT 3MF E APERTURA IN BAMBUSTUDIO
// Salva il file e lo apre direttamente in Bambu Studio
// ────────────────────────────────────────────────────────────────────────────
async function exportTo3MFAndOpenInBambu() {
  const groupsList = _groupMeshesConnected();
  if (!groupsList) { toast('Nessun elemento 3D visibile!'); return; }

  // Costruisce XML 3MF (stesso codice di exportTo3MF)
  let objectsXml = '';
  let buildItemsXml = '';
  let objId = 1;

  groupsList.forEach((meshes) => {
    const colorHex = meshes[0].material.color.getHexString();
    const tris = [];
    meshes.forEach(m => tris.push(..._collectTrisFromMesh(m)));
    if (!tris.length) return;

    const WELD = 1e-4, INV = 1.0 / 1e-4;
    const vertMap = new Map();
    const verts = [];
    let vi = 0;
    function weld(v) {
      const ix=Math.round(v[0]*INV), iy=Math.round(v[1]*INV), iz=Math.round(v[2]*INV);
      const k=ix+','+iy+','+iz;
      if (vertMap.has(k)) return vertMap.get(k);
      verts.push([ix*WELD, iy*WELD, iz*WELD]);
      vertMap.set(k, vi); return vi++;
    }

    const faces = [];
    tris.forEach(([a,b,c]) => {
      const ia=weld(a), ib=weld(b), ic=weld(c);
      if (ia===ib||ib===ic||ia===ic) return;
      faces.push([ia, ib, ic]);
    });

    if (!faces.length) return;

    const vertsXml = verts.map(([x,y,z]) =>
      `          <vertex x="${x.toFixed(6)}" y="${y.toFixed(6)}" z="${z.toFixed(6)}"/>`
    ).join('\n');

    const facesXml = faces.map(([v1,v2,v3]) =>
      `          <triangle v1="${v1}" v2="${v2}" v3="${v3}"/>`
    ).join('\n');

    objectsXml += `
    <object id="${objId}" type="model" name="color_${colorHex}">
      <mesh>
        <vertices>
${vertsXml}
        </vertices>
        <triangles>
${facesXml}
        </triangles>
      </mesh>
    </object>`;

    buildItemsXml += `\n      <item objectid="${objId}"/>`;
    objId++;
  });

  if (!objectsXml) { toast('Nessuna geometria da esportare!'); return; }

  const modelXml =
`<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US"
  xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"
  xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06">
  <metadata name="Application">LetterForge</metadata>
  <resources>${objectsXml}
  </resources>
  <build>${buildItemsXml}
  </build>
</model>`;

  const contentTypesXml =
`<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`;

  const relsXml =
`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" Target="/3D/3dmodel.model" Id="model"/>
</Relationships>`;

  // Funzioni ZIP helper
  function crc32(data) {
    let crc = 0xFFFFFFFF;
    const table = [];
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[i] = c;
    }
    for (let i = 0; i < data.length; i++) crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function makeLocalFileHeader(name, data) {
    const nameBytes = new TextEncoder().encode(name);
    const buf = new Uint8Array(30 + nameBytes.length + data.length);
    let o = 0;
    buf[o++] = 0x50; buf[o++] = 0x4B; buf[o++] = 3; buf[o++] = 4;
    buf[o++] = 20; buf[o++] = 0; buf[o++] = 0; buf[o++] = 0;
    buf[o++] = 0; buf[o++] = 0;
    const crc = crc32(data);
    new DataView(buf.buffer).setUint32(o, crc, true); o += 4;
    new DataView(buf.buffer).setUint32(o, data.length, true); o += 4;
    new DataView(buf.buffer).setUint32(o, data.length, true); o += 4;
    new DataView(buf.buffer).setUint16(o, nameBytes.length, true); o += 2;
    new DataView(buf.buffer).setUint16(o, 0, true); o += 2;
    buf.set(nameBytes, o); o += nameBytes.length;
    buf.set(data, o);
    return { buf, nameBytes, crc, size: data.length };
  }

  function makeCentralDir(name, nameBytes, crc, size, offset) {
    const buf = new Uint8Array(46 + nameBytes.length);
    let o = 0;
    buf[o++] = 0x50; buf[o++] = 0x4B; buf[o++] = 1; buf[o++] = 2;
    buf[o++] = 20; buf[o++] = 3; buf[o++] = 20; buf[o++] = 0;
    buf[o++] = 0; buf[o++] = 0; buf[o++] = 0; buf[o++] = 0;
    new DataView(buf.buffer).setUint32(o, crc, true); o += 4;
    new DataView(buf.buffer).setUint32(o, size, true); o += 4;
    new DataView(buf.buffer).setUint32(o, size, true); o += 4;
    new DataView(buf.buffer).setUint16(o, nameBytes.length, true); o += 2;
    new DataView(buf.buffer).setUint16(o, 0, true); o += 2;
    new DataView(buf.buffer).setUint16(o, 0, true); o += 2;
    new DataView(buf.buffer).setUint16(o, 0, true); o += 2;
    new DataView(buf.buffer).setUint16(o, 0, true); o += 2;
    new DataView(buf.buffer).setUint32(o, 0, true); o += 4;
    new DataView(buf.buffer).setUint32(o, offset, true); o += 4;
    buf.set(nameBytes, o);
    return buf;
  }

  function makeEndOfCentralDir(entries, centralDirSize, centralDirOffset) {
    const buf = new Uint8Array(22);
    let o = 0;
    buf[o++] = 0x50; buf[o++] = 0x4B; buf[o++] = 5; buf[o++] = 6;
    new DataView(buf.buffer).setUint16(o, 0, true); o += 2;
    new DataView(buf.buffer).setUint16(o, 0, true); o += 2;
    new DataView(buf.buffer).setUint16(o, entries, true); o += 2;
    new DataView(buf.buffer).setUint16(o, entries, true); o += 2;
    new DataView(buf.buffer).setUint32(o, centralDirSize, true); o += 4;
    new DataView(buf.buffer).setUint32(o, centralDirOffset, true); o += 4;
    new DataView(buf.buffer).setUint16(o, 0, true);
    return buf;
  }

  const files = [
    { name: '[Content_Types].xml', data: new TextEncoder().encode(contentTypesXml) },
    { name: '_rels/.rels', data: new TextEncoder().encode(relsXml) },
    { name: '3D/3dmodel.model', data: new TextEncoder().encode(modelXml) }
  ];

  const localHeaders = [];
  const centralDirs = [];
  let offset = 0;

  files.forEach(({ name, data }) => {
    const entry = makeLocalFileHeader(name, data);
    const cd    = makeCentralDir(name, entry.nameBytes, entry.crc, entry.size, offset);
    localHeaders.push(entry.buf);
    centralDirs.push(cd);
    offset += entry.buf.length;
  });

  const centralDirOffset2 = offset;
  const centralDirBytes  = centralDirs.reduce((a,b) => { const r=new Uint8Array(a.length+b.length); r.set(a); r.set(b,a.length); return r; }, new Uint8Array(0));
  const eocd = makeEndOfCentralDir(files.length, centralDirBytes.length, centralDirOffset2);

  const allParts = [...localHeaders, centralDirBytes, eocd];
  const total = allParts.reduce((s,p) => s + p.length, 0);
  const zipBytes = new Uint8Array(total);
  let pos = 0;
  allParts.forEach(p => { zipBytes.set(p, pos); pos += p.length; });

  // Chiama l'IPC handler per salvare e aprire in Bambu Studio
  try {
    toast('Salvataggio 3MF e apertura in Bambu Studio...');
    const result = await window.electronAPI.saveAndOpen3MFInBambu(zipBytes);
    
    if (result.success) {
      const nObj = objId - 1;
      if (result.method === 'bambu') {
        toast(`3MF aperto in Bambu Studio! ✓  ${nObj} oggett${nObj===1?'o':'i'}`);
      } else {
        toast(`3MF salvato! ✓  ${nObj} oggett${nObj===1?'o':'i'} (aperto con app predefinita)`);
      }
    } else {
      toast('Errore durante il salvataggio/apertura 3MF');
    }
  } catch (error) {
    console.error('Errore:', error);
    toast('Errore durante il salvataggio/apertura 3MF');
  }
}

// Hook into render to update 3D preview when canvas changes
const originalRender = window.render;
window.render = function() {
  if (originalRender) originalRender();
  if (document.getElementById('preview-3d-panel').style.display !== 'none') {
    setTimeout(update3DPreview, 100);
  }
};

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
      updateMCPStatus('running', `Server attivo su http://localhost:${port}`);
      
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
        <div style="margin-bottom:4px">
          <span style="color:var(--accent)">✓ Server MCP attivo</span>
        </div>
        <div>🔗 URL: <code style="background:var(--panel2);padding:2px 4px;border-radius:3px">http://localhost:${port}</code></div>
        <div style="margin-top:4px">📋 Tools disponibili: get_canvas_state, add_text, modify_element, move_element, delete_element, duplicate_element, recolor_element, resize_element, add_svg, select_elements, get_available_fonts, get_available_svgs</div>
        <div style="margin-top:4px">🤖 Collega la tua IA esterna a questo URL per modificare il canvas!</div>
      `;
      
      toast(`MCP Server avviato sulla porta ${port}! ✨`);
      addAIMessage('system', `✅ MCP Server attivo su http://localhost:${port} - La tua IA può connettersi!`);
      
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
  info.innerHTML = 'ℹ️ LetterForge ospita un server MCP - Collega la tua IA esterna per modificare il canvas';
  
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

function clearAIHistory() {
  document.getElementById('ai-messages').innerHTML = '';
  addAIMessage('system', '🗑️ Cronologia cancellata');
  toast('Cronologia AI cancellata ✓');
}

// Auto-expand textarea input
function autoExpandAIInput() {
  const textarea = document.getElementById('ai-input');
  if (!textarea) return;
  
  textarea.style.height = 'auto';
  const newHeight = Math.min(textarea.scrollHeight, 120);
  textarea.style.height = newHeight + 'px';
}

function handleAIInputKeydown(event) {
  event.stopPropagation();
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendAIPrompt();
  }
}

function addAIMessage(role, content) {
  const messagesDiv = document.getElementById('ai-messages');
  
  const msgDiv = document.createElement('div');
  msgDiv.style.cssText = `
    margin-bottom: 8px;
    padding: 8px 10px;
    border-radius: 6px;
    font-size: 11px;
    line-height: 1.5;
    word-wrap: break-word;
  `;
  
  if (role === 'user') {
    msgDiv.style.background = 'rgba(200,255,0,0.08)';
    msgDiv.style.border = '1px solid rgba(200,255,0,0.2)';
    msgDiv.style.color = 'var(--text)';
    msgDiv.innerHTML = `<div style="font-weight:700;color:var(--accent);margin-bottom:4px;font-size:9px;text-transform:uppercase">You</div>${escapeHtml(content)}`;
  } else if (role === 'ai') {
    msgDiv.style.background = 'rgba(255,107,53,0.08)';
    msgDiv.style.border = '1px solid rgba(255,107,53,0.2)';
    msgDiv.style.color = 'var(--text)';
    msgDiv.innerHTML = `<div style="font-weight:700;color:var(--accent2);margin-bottom:4px;font-size:9px;text-transform:uppercase">AI</div>${content}`;
  } else if (role === 'system') {
    msgDiv.style.background = 'rgba(255,255,255,0.03)';
    msgDiv.style.border = '1px solid var(--border)';
    msgDiv.style.color = 'var(--muted)';
    msgDiv.style.fontStyle = 'italic';
    msgDiv.textContent = content;
  } else if (role === 'error') {
    msgDiv.style.background = 'rgba(255,68,85,0.08)';
    msgDiv.style.border = '1px solid rgba(255,68,85,0.3)';
    msgDiv.style.color = '#ff6677';
    msgDiv.textContent = content;
  }
  
  messagesDiv.appendChild(msgDiv);
  
  // Auto-scroll to bottom
  const container = document.getElementById('ai-chat-container');
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function sendAIPrompt() {
  if (!mcpConnected) {
    toast('Devi prima connetterti a un MCP Server');
    return;
  }

  const input = document.getElementById('ai-input');
  const prompt = input.value.trim();

  if (!prompt) return;
  if (aiProcessing) {
    toast('AI sta ancora processando...');
    return;
  }

  // Add user message
  addAIMessage('user', prompt);
  input.value = '';

  // Show processing indicator
  aiProcessing = true;
  addAIMessage('system', '⏳ Elaborazione in corso...');

  try {
    // Build canvas state for AI
    const canvasState = {
      letters: S.letters.map(el => ({
        id: el.id,
        ch: el.ch,
        x: el.x,
        y: el.y,
        fontSize: el.fontSize,
        fill: el.fill,
        sx: el.sx,
        sy: el.sy,
        rot: el.rot,
        skew: el.skew,
        op: el.op,
        borderWidth: el.borderWidth,
        borderColor: el.borderColor,
        layer: el.layer,
        isSvgImport: el.isSvgImport,
        svgW: el.svgW,
        svgH: el.svgH,
        fontName: el.fontName,
        customPath: el.customPath,
        selected: S.sel.has(el.id)
      })),
      canvasW: S.canvasW,
      canvasH: S.canvasH,
      svgs: S.svgs,
      fonts: S.fonts,
      uid: uid
    };

    // Get MCP server URL
    const serverUrl = document.getElementById('mcp-server-url').value;

    // Send to MCP Server
    const response = await window.electronAPI.mcpProcessPrompt(prompt, canvasState, serverUrl);

    // Remove processing indicator
    const messagesDiv = document.getElementById('ai-messages');
    messagesDiv.removeChild(messagesDiv.lastChild);

    if (!response.success) {
      throw new Error(response.error);
    }

    const result = response.result;

    // Show needs clarification if present
    if (result.needs_clarification) {
      addAIMessage('ai', `❓ ${result.needs_clarification}`);
      aiProcessing = false;
      return;
    }

    // Show explanation
    if (result.explanation) {
      addAIMessage('ai', result.explanation);
    }

    // Show warnings if any
    if (result.warnings && result.warnings.length > 0) {
      result.warnings.forEach(w => {
        addAIMessage('system', `⚠️ ${w}`);
      });
    }

    // Execute operations
    if (result.operations && result.operations.length > 0) {
      // Save state for undo
      saveState();

      // Execute operations
      const execResult = aiExecuteOperationsLocally(result.operations);

      // Update canvas
      render();
      upd();

      // Show summary
      const summary = `✓ ${result.operations.length} operazion${result.operations.length === 1 ? 'e' : 'i'} eseguit${result.operations.length === 1 ? 'a' : 'e'}`;
      addAIMessage('system', summary);
      
      toast(summary);
    }
    
  } catch (error) {
    console.error('AI Error:', error);
    // Remove processing indicator
    const messagesDiv = document.getElementById('ai-messages');
    if (messagesDiv.lastChild) {
      messagesDiv.removeChild(messagesDiv.lastChild);
    }
    addAIMessage('error', `❌ Errore: ${error.message}`);
    toast('Errore AI: ' + error.message);
  } finally {
    aiProcessing = false;
  }
}

function aiExecuteOperationsLocally(operations) {
  const changes = [];
  
  operations.forEach(op => {
    switch (op.type) {
      case 'modify':
        changes.push(...aiExecuteModify(op));
        break;
      case 'add':
        changes.push(...aiExecuteAdd(op));
        break;
      case 'duplicate':
        changes.push(...aiExecuteDuplicate(op));
        break;
      case 'move':
        changes.push(...aiExecuteMove(op));
        break;
      case 'resize':
        changes.push(...aiExecuteResize(op));
        break;
      case 'delete':
        changes.push(...aiExecuteDelete(op));
        break;
      case 'recolor':
        changes.push(...aiExecuteRecolor(op));
        break;
    }
  });
  
  return changes;
}

function aiFindTargets(target, letters) {
  if (!target || target === 'all') {
    return letters;
  }
  
  if (target === 'selected') {
    return letters.filter(el => S.sel.has(el.id));
  }
  
  // Try to find by ID
  const byId = letters.find(el => el.id == target);
  if (byId) return [byId];
  
  // Try to find by name/content
  const byName = letters.filter(el => 
    el.ch === target || el.fontName === target
  );
  if (byName.length > 0) return byName;
  
  // Try positional description
  if (target === 'first' && letters.length > 0) return [letters[0]];
  if (target === 'last' && letters.length > 0) return [letters[letters.length - 1]];
  if (target === 'center') {
    const centerX = S.canvasW / 2;
    const centerY = S.canvasH / 2;
    let closest = letters[0];
    let minDist = Infinity;
    
    letters.forEach(el => {
      const dist = Math.sqrt(Math.pow(el.x - centerX, 2) + Math.pow(el.y - centerY, 2));
      if (dist < minDist) {
        minDist = dist;
        closest = el;
      }
    });
    
    return closest ? [closest] : [];
  }
  
  return [];
}

function aiExecuteModify(op) {
  const targets = aiFindTargets(op.target, S.letters);
  const changes = [];
  
  targets.forEach(el => {
    const before = { ...el };
    
    if (op.properties.x !== undefined) el.x = op.properties.x;
    if (op.properties.y !== undefined) el.y = op.properties.y;
    if (op.properties.fontSize !== undefined) el.fontSize = op.properties.fontSize;
    if (op.properties.fill !== undefined) el.fill = op.properties.fill;
    if (op.properties.sx !== undefined) el.sx = op.properties.sx;
    if (op.properties.sy !== undefined) el.sy = op.properties.sy;
    if (op.properties.rot !== undefined) el.rot = op.properties.rot;
    if (op.properties.skew !== undefined) el.skew = op.properties.skew;
    if (op.properties.op !== undefined) el.op = op.properties.op;
    if (op.properties.borderWidth !== undefined) el.borderWidth = op.properties.borderWidth;
    if (op.properties.borderColor !== undefined) el.borderColor = op.properties.borderColor;
    if (op.properties.layer !== undefined) el.layer = op.properties.layer;
    
    changes.push({ type: 'modify', before, after: { ...el } });
  });
  
  return changes;
}

function aiExecuteAdd(op) {
  const changes = [];
  const props = op.properties || {};
  
  if (op.svgName) {
    // Add SVG
    const svgObj = S.svgs.find(s => s.name === op.svgName);
    if (svgObj) {
      const newEl = {
        id: uid++,
        ch: op.svgName,
        x: props.x || S.canvasW / 2,
        y: props.y || S.canvasH / 2,
        originalX: props.x || S.canvasW / 2,
        originalY: props.y || S.canvasH / 2,
        fontSize: 100,
        fill: props.fill || '#111111',
        fontFamily: 'sans-serif',
        fontName: op.svgName,
        sx: props.sx || 1,
        sy: props.sy || 1,
        rot: props.rot || 0,
        skew: props.skew || 0,
        op: props.op || 1,
        customPath: svgObj.pathData.replace(/<path d="([^"]+)"[^>]*>/, '$1'),
        isSvgImport: true,
        svgW: svgObj.width,
        svgH: svgObj.height,
        borderWidth: 0,
        borderColor: '#000000',
        layer: props.layer || 2
      };
      S.letters.push(newEl);
      changes.push({ type: 'add', element: { ...newEl } });
    }
  } else {
    // Add text
    const newEl = {
      id: uid++,
      ch: op.text || 'Text',
      x: props.x || S.canvasW / 2,
      y: props.y || S.canvasH / 2,
      originalX: props.x || S.canvasW / 2,
      originalY: props.y || S.canvasH / 2,
      fontSize: props.fontSize || 80,
      fill: props.fill || '#111111',
      fontFamily: props.fontFamily || 'sans-serif',
      fontName: props.fontName || '',
      sx: props.sx || 1,
      sy: props.sy || 1,
      rot: props.rot || 0,
      skew: props.skew || 0,
      op: props.op || 1,
      borderWidth: props.borderWidth || 0,
      borderColor: props.borderColor || '#000000',
      layer: props.layer || 2
    };
    S.letters.push(newEl);
    changes.push({ type: 'add', element: { ...newEl } });
  }
  
  return changes;
}

function aiExecuteDuplicate(op) {
  const targets = aiFindTargets(op.target, S.letters);
  const changes = [];
  
  targets.forEach(el => {
    const newEl = {
      ...el,
      id: uid++,
      x: el.x + (op.offsetX || 50),
      y: el.y + (op.offsetY || 50)
    };
    S.letters.push(newEl);
    changes.push({ type: 'duplicate', original: { ...el }, duplicate: { ...newEl } });
  });
  
  return changes;
}

function aiExecuteMove(op) {
  const targets = aiFindTargets(op.target, S.letters);
  const changes = [];
  
  targets.forEach(el => {
    const before = { x: el.x, y: el.y };
    
    if (op.properties.x !== undefined) {
      el.x = op.properties.x;
    } else if (op.properties.dx !== undefined) {
      el.x += op.properties.dx;
    }
    
    if (op.properties.y !== undefined) {
      el.y = op.properties.y;
    } else if (op.properties.dy !== undefined) {
      el.y += op.properties.dy;
    }
    
    changes.push({ type: 'move', elementId: el.id, before, after: { x: el.x, y: el.y } });
  });
  
  return changes;
}

function aiExecuteResize(op) {
  const targets = aiFindTargets(op.target, S.letters);
  const changes = [];
  
  targets.forEach(el => {
    const before = { sx: el.sx, sy: el.sy, fontSize: el.fontSize };
    
    if (op.properties.sx !== undefined) el.sx = op.properties.sx;
    if (op.properties.sy !== undefined) el.sy = op.properties.sy;
    if (op.properties.scale !== undefined) {
      el.sx *= op.properties.scale;
      el.sy *= op.properties.scale;
    }
    if (op.properties.fontSize !== undefined) el.fontSize = op.properties.fontSize;
    
    changes.push({ type: 'resize', elementId: el.id, before, after: { sx: el.sx, sy: el.sy, fontSize: el.fontSize } });
  });
  
  return changes;
}

function aiExecuteDelete(op) {
  const targets = aiFindTargets(op.target, S.letters);
  const changes = [];
  
  targets.forEach(el => {
    changes.push({ type: 'delete', element: { ...el } });
    S.sel.delete(el.id);
  });
  
  // Remove from array
  const targetIds = new Set(targets.map(t => t.id));
  S.letters = S.letters.filter(el => !targetIds.has(el.id));
  
  return changes;
}

function aiExecuteRecolor(op) {
  const targets = aiFindTargets(op.target, S.letters);
  const changes = [];
  
  targets.forEach(el => {
    const before = { fill: el.fill };
    
    if (op.properties.fill !== undefined) {
      el.fill = op.properties.fill;
      changes.push({ type: 'recolor', elementId: el.id, before, after: { fill: el.fill } });
    }
  });
  
  return changes;
}




























(function(){
  const PRESETS = [
    '#ffffff','#e8e8f0','#c8c8d8','#888899','#5a5a7a','#2a2a3a','#1a1a25','#0d0d0f',
    '#c8ff00','#b8ef00','#ff6b35','#ff4444','#00ff88','#00ccff','#9933ff','#ff66b2',
    '#ff0000','#ff8800','#ffff00','#00ff00','#00ffff','#0088ff','#8800ff','#ff0088',
  ];

  let cpId = null;       // which picker id is open
  let cpCallback = null; // function(hex) to call on change
  let cpDotId = null;    // dot element id to update
  let cpHue = 0;         // 0-360
  let cpSat = 1;         // 0-1
  let cpVal = 1;         // 0-1 (value/brightness)
  let cpDraggingGrad = false;
  let cpDraggingHue = false;

  // ── Colour math ──────────────────────────────────────────────────
  function hsvToRgb(h,s,v){
    let r,g,b;
    const i=Math.floor(h/60)%6, f=h/60-Math.floor(h/60);
    const p=v*(1-s),q=v*(1-f*s),t=v*(1-(1-f)*s);
    [[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]][i].forEach((c,idx)=>{[r,g,b]=[r,g,b];if(idx===0)r=c;else if(idx===1)g=c;else b=c;});
    // simpler:
    const rgb=[[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]][i];
    return rgb.map(c=>Math.round(c*255));
  }
  function rgbToHex(r,g,b){return '#'+[r,g,b].map(c=>c.toString(16).padStart(2,'0')).join('');}
  function hexToRgb(hex){
    const m=hex.replace('#','').match(/.{2}/g);
    return m?m.map(c=>parseInt(c,16)):[0,0,0];
  }
  function rgbToHsv(r,g,b){
    r/=255;g/=255;b/=255;
    const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
    let h=0,s=max===0?0:d/max,v=max;
    if(d!==0){
      if(max===r) h=((g-b)/d)%6;
      else if(max===g) h=(b-r)/d+2;
      else h=(r-g)/d+4;
      h=((h*60)+360)%360;
    }
    return[h,s,v];
  }
  function currentHex(){const[r,g,b]=hsvToRgb(cpHue,cpSat,cpVal);return rgbToHex(r,g,b);}

  // ── Draw gradient ────────────────────────────────────────────────
  function drawGradient(){
    const canvas=document.getElementById('cp-canvas');
    if(!canvas)return;
    const ctx=canvas.getContext('2d');
    const W=canvas.width,H=canvas.height;
    // White → Hue
    const gH=ctx.createLinearGradient(0,0,W,0);
    const[r,g,b]=hsvToRgb(cpHue,1,1);
    gH.addColorStop(0,'#fff');
    gH.addColorStop(1,`rgb(${r},${g},${b})`);
    ctx.fillStyle=gH; ctx.fillRect(0,0,W,H);
    // Transparent → Black
    const gV=ctx.createLinearGradient(0,0,0,H);
    gV.addColorStop(0,'rgba(0,0,0,0)');
    gV.addColorStop(1,'#000');
    ctx.fillStyle=gV; ctx.fillRect(0,0,W,H);
  }

  // ── Update cursors & preview ─────────────────────────────────────
  function updateUI(){
    drawGradient();
    const canvas=document.getElementById('cp-canvas');
    const W=canvas?canvas.offsetWidth:196,H=canvas?canvas.offsetHeight:130;
    const gc=document.getElementById('cp-gcursor');
    if(gc){gc.style.left=(cpSat*W)+'px';gc.style.top=((1-cpVal)*H)+'px';}
    const hc=document.getElementById('cp-hcursor');
    const hbar=document.getElementById('cp-hue');
    if(hc&&hbar){hc.style.left=(cpHue/360*hbar.offsetWidth)+'px';}
    const hex=currentHex();
    const prev=document.getElementById('cp-preview');
    if(prev)prev.style.background=hex;
    const inp=document.getElementById('cp-hex');
    if(inp&&document.activeElement!==inp)inp.value=hex.toUpperCase();
  }

  // ── Gradient mouse ───────────────────────────────────────────────
  function gradPos(e,canvas){
    const r=canvas.getBoundingClientRect();
    const x=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));
    const y=Math.max(0,Math.min(1,(e.clientY-r.top)/r.height));
    cpSat=x; cpVal=1-y;
  }
  function huePos(e,bar){
    const r=bar.getBoundingClientRect();
    cpHue=Math.max(0,Math.min(360,(e.clientX-r.left)/r.width*360));
  }

  // ── Dispatch colour to callback ──────────────────────────────────
  function dispatchColor(){
    const hex=currentHex();
    // Update dot
    const dot=document.getElementById(cpDotId);
    if(dot)dot.style.background=hex;
    if(cpCallback)cpCallback(hex);
  }

  // ── Position popup near anchor ───────────────────────────────────
  function positionPopup(anchor){
    const popup=document.getElementById('cp-popup');
    const r=anchor.getBoundingClientRect();
    let top=r.bottom+6, left=r.left;
    if(left+224>window.innerWidth)left=window.innerWidth-228;
    if(top+320>window.innerHeight)top=r.top-326;
    popup.style.top=top+'px';
    popup.style.left=left+'px';
  }

  // ── Build swatches ───────────────────────────────────────────────
  function buildSwatches(){
    const cont=document.getElementById('cp-swatches');
    if(!cont||cont.children.length)return;
    PRESETS.forEach(hex=>{
      const d=document.createElement('div');
      d.className='cp-sw';
      d.style.background=hex;
      d.title=hex;
      d.onclick=()=>{
        const[r,g,b]=hexToRgb(hex);
        [cpHue,cpSat,cpVal]=rgbToHsv(r,g,b);
        updateUI(); dispatchColor();
      };
      cont.appendChild(d);
    });
  }

  // ── Public API ───────────────────────────────────────────────────
  window.openCP=function(id, anchorEl){
    cpId=id;
    // Map id → callback and dotId
    const map={
      'canvas-bg-picker':{ cb: v=>{ if(typeof setCanvasBg==='function')setCanvasBg(v); }, dot:'canvas-bg-picker-dot' },
      'fcol':            { cb: v=>{ if(typeof apFill==='function')apFill(v); const el=document.getElementById('pfill'); if(el)el.value=v; }, dot:'fcol-dot' },
      'pbordercol':      { cb: v=>{ if(typeof apBorderCol==='function')apBorderCol(v); }, dot:'pbordercol-dot' },
      'bg-color-picker': { cb: v=>{ if(typeof change3DBgColor==='function')change3DBgColor(v); }, dot:'bg-color-picker-dot' },
    };
    const entry=map[id]||{cb:()=>{},dot:null};
    cpCallback=entry.cb;
    cpDotId=entry.dot;

    // Read current colour from dot
    const dot=document.getElementById(cpDotId);
    const currentColor=dot?dot.style.background:'#ffffff';
    // Parse it
    let hex=currentColor;
    if(hex.startsWith('rgb')){
      const m=hex.match(/\d+/g);
      if(m)hex=rgbToHex(+m[0],+m[1],+m[2]);
    }
    const[r,g,b]=hexToRgb(hex);
    [cpHue,cpSat,cpVal]=rgbToHsv(r,g,b);

    buildSwatches();
    const popup=document.getElementById('cp-popup');
    popup.classList.add('open');
    // Wait for layout then position & draw
    requestAnimationFrame(()=>{
      positionPopup(anchorEl||dot||document.body);
      updateUI();
    });
  };

  window.closeCP=function(){
    const popup=document.getElementById('cp-popup');
    if(popup)popup.classList.remove('open');
  };

  // ── Mouse events ─────────────────────────────────────────────────
  document.addEventListener('mousedown',function(e){
    const popup=document.getElementById('cp-popup');
    if(!popup||!popup.classList.contains('open'))return;
    const canvas=document.getElementById('cp-canvas');
    const hbar=document.getElementById('cp-hue');
    if(canvas&&canvas.contains(e.target)){
      cpDraggingGrad=true;
      gradPos(e,canvas); updateUI(); dispatchColor(); e.preventDefault();
    } else if(hbar&&hbar.contains(e.target)){
      cpDraggingHue=true;
      huePos(e,hbar); updateUI(); dispatchColor(); e.preventDefault();
    } else if(!popup.contains(e.target)){
      closeCP();
    }
  },true);

  document.addEventListener('mousemove',function(e){
    if(cpDraggingGrad){
      const canvas=document.getElementById('cp-canvas');
      if(canvas){gradPos(e,canvas);updateUI();dispatchColor();}
    } else if(cpDraggingHue){
      const hbar=document.getElementById('cp-hue');
      if(hbar){huePos(e,hbar);updateUI();dispatchColor();}
    }
  });

  document.addEventListener('mouseup',function(){
    cpDraggingGrad=false; cpDraggingHue=false;
  });

  // ── Hex input ────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded',function(){
    const inp=document.getElementById('cp-hex');
    if(inp){
      inp.addEventListener('input',function(){
        let v=this.value.trim();
        if(!v.startsWith('#'))v='#'+v;
        if(/^#[0-9a-fA-F]{6}$/.test(v)){
          const[r,g,b]=hexToRgb(v);
          [cpHue,cpSat,cpVal]=rgbToHsv(r,g,b);
          updateUI(); dispatchColor();
        }
      });
      inp.addEventListener('keydown',function(e){
        if(e.key==='Enter'||e.key==='Escape')closeCP();
        e.stopPropagation();
      });
      inp.addEventListener('mousedown',function(e){e.stopPropagation();this.focus();});
    }
  });
})();

/* ── Home Screen Logic ─────────────────────────────────────────── */
async function initHome() {
  console.log('Home initialization...');
  
  // Request version and check for updates
  if (window.electronAPI && window.electronAPI.checkForUpdates) {
     window.electronAPI.checkForUpdates();
  }

  // Handle Recent Projects
  renderRecentProjects();
}

async function renderRecentProjects() {
  const grid = document.getElementById('recent-grid');
  if (!grid) return;

  if (window.electronAPI && window.electronAPI.listSavedProjects) {
    try {
      // List projects from the "saved" folder
      const projects = await window.electronAPI.listSavedProjects();
      if (!projects || projects.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; padding: 40px; text-align: center; color: var(--muted); background: var(--panel); border-radius: 12px; border: 1px dashed var(--border); font-size: 13px;">Nessun progetto salvato nella cartella /saved</div>`;
        return;
      }

      // Show ALL projects, not just 4
      grid.innerHTML = projects.map(p => {
        const date = new Date(p.mtime).toLocaleDateString();
        // Aggiungo timestamp ?t= per forzare il refresh dell'anteprima se il file è stato sovrascritto
        const previewImg = p.preview 
          ? `<img src="file://${p.preview.replace(/\\/g, '/')}?t=${Date.now()}" style="width:100%;height:100%;object-fit:contain;border-radius:4px">`
          : `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;
        
        return `
          <div class="recent-item" onclick="loadRecentProject('${p.path.replace(/\\/g, '/')}')">
            <div class="recent-preview">
               ${previewImg}
            </div>
            <div class="recent-info">
              <div class="recent-name" title="${p.name}">${p.name.replace('.json', '')}</div>
              <div class="recent-date">${date}</div>
            </div>
          </div>
        `;
      }).join('');
    } catch (e) {
      console.error('Error listing projects:', e);
      grid.innerHTML = `<div style="grid-column: 1/-1; padding: 20px; color: #ff4444; font-size: 11px;">Errore nel recupero dei file</div>`;
    }
  }
}

// Ensure the version is also updated on the home screen when received
if (window.electronAPI && window.electronAPI.onAppVersion) {
  window.electronAPI.onAppVersion((version) => {
    const homeVer = document.getElementById('home-version-display');
    if (homeVer) homeVer.textContent = 'v' + version;
  });
}

function newProject() {
  const home = document.getElementById('home-screen');
  if (home) {
    home.classList.add('hidden');
    setTimeout(() => home.style.display = 'none', 400);
  }
  // Clear canvas without confirmation since we're starting a new file
  if (typeof S !== 'undefined') {
    S.letters = [];
    S.sel.clear();
    S.currentProjectName = null;
    if (typeof render === 'function') render();
    if (typeof renderHandles === 'function') renderHandles();
    if (typeof upd === 'function') upd();
    
    // Forza la modalità font all'inizio di un nuovo progetto
    toggleViewMode('fonts');

    if (typeof saveState === 'function') saveState();
    toast('Nuovo progetto creato ✓');
  }
}

async function openProjectFromFile() {
  if (window.electronAPI && window.electronAPI.loadProjectFile) {
    const response = await window.electronAPI.loadProjectFile();
    if (response) {
      applyProjectData(response.content);
      S.currentProjectName = response.name;
      const home = document.getElementById('home-screen');
      if (home) {
        home.classList.add('hidden');
        setTimeout(() => home.style.display = 'none', 400);
      }
    }
  }
}

async function loadRecentProject(path) {
  if (window.electronAPI && window.electronAPI.loadSavedProjectByPath) {
    try {
      const response = await window.electronAPI.loadSavedProjectByPath(path);
      if (response) {
        applyProjectData(response.content);
        S.currentProjectName = response.name;
        const home = document.getElementById('home-screen');
        if (home) {
          home.classList.add('hidden');
          setTimeout(() => home.style.display = 'none', 400);
        }
      }
    } catch (e) {
      toast('Errore nel caricamento del progetto');
    }
  }
}

function goHome() {
  customConfirm('Tornare alla home? I progressi non salvati andranno persi.', () => {
    const home = document.getElementById('home-screen');
    if (home) {
      renderRecentProjects();
      home.style.display = 'flex';
      setTimeout(() => home.classList.remove('hidden'), 10);
    }
  });
}

// Inizializza la lista sidebar (font o svg) al caricamento
setTimeout(() => {
  if (typeof handleSearch === 'function') handleSearch('');
}, 100);