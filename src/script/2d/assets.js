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
    S.lastImportedName = f.name;
    if (typeof updateTitleBar === 'function') updateTitleBar();
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
if(dz){
dz.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('drag')});
dz.addEventListener('dragleave',()=>dz.classList.remove('drag'));
dz.addEventListener('drop',e=>{e.preventDefault();dz.classList.remove('drag');importFonts(e.dataTransfer.files)});
}

const fz=document.getElementById('folder-zone');
if(fz){
fz.addEventListener('dragover',e=>{e.preventDefault();fz.classList.add('drag')});
fz.addEventListener('dragleave',()=>fz.classList.remove('drag'));
fz.addEventListener('drop',e=>{e.preventDefault();fz.classList.remove('drag');importFontsFromFolder(e.dataTransfer.files)});
}

// Drag & drop per SVG
const sdz=document.getElementById('svg-drop-zone');
if(sdz){
sdz.addEventListener('dragover',e=>{e.preventDefault();sdz.classList.add('drag')});
sdz.addEventListener('dragleave',()=>sdz.classList.remove('drag'));
sdz.addEventListener('drop',e=>{e.preventDefault();sdz.classList.remove('drag');importSVGs(e.dataTransfer.files)});
}

const sfz=document.getElementById('svg-folder-zone');
if(sfz){
sfz.addEventListener('dragover',e=>{e.preventDefault();sfz.classList.add('drag')});
sfz.addEventListener('dragleave',()=>sfz.classList.remove('drag'));
sfz.addEventListener('drop',e=>{e.preventDefault();sfz.classList.remove('drag');importSVGsFromFolder(e.dataTransfer.files)});
}

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

function importSVGs(files) {
  Array.from(files).forEach(f => {
    if (!f.name.toLowerCase().endsWith('.svg')) return;
    S.lastImportedName = f.name;
    if (typeof updateTitleBar === 'function') updateTitleBar();
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

const svgfi = document.getElementById('svgfi');
if(svgfi){
svgfi.addEventListener('change',function(){importSVGs(this.files);this.value='';});
}
