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
    // Per rotazione multipla, ruota attorno al centro del gruppo
    const bbox = getGroupBBox();
    if(!bbox) return;
    const groupCx = bbox.cx, groupCy = bbox.cy;
    
    const avgRot = sel.reduce((sum, i) => sum + S.letters[i].rot, 0) / sel.length;
    const delta = val - avgRot;
    const rad = delta * Math.PI / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);

    sel.forEach(i => {
      const l = S.letters[i];
      // Ruota la posizione attorno al centro del gruppo
      const dx = l.x - groupCx;
      const dy = l.y - groupCy;
      l.x = groupCx + (dx * cos - dy * sin);
      l.y = groupCy + (dx * sin + dy * cos);
      // Aggiorna la rotazione individuale
      l.rot = (l.rot + delta) % 360;
    });
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
  v('vsk', val);
  v('psk', val);
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

function apOp(val){t('vop',Math.round(val*100)+'%');aps(l=>l.op=val);}
function apBorder(val){
  v('pborder', val);
  v('vborder', val);
  aps(l=>l.borderWidth=val);
}
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

function setSelectedLayer(layer){
  if(S.sel.size === 0){ toast('Seleziona almeno un oggetto!'); return; }
  if(layer < 1 || layer > 3){ return; }
  S.sel.forEach(i => { S.letters[i].layer = layer; });
  const layerNames = {1: 'Layer 1 (sotto)', 2: 'Layer 2 (centro)', 3: 'Layer 3 (sopra)'};
  render(); upd(); saveState();
  toast(`${S.sel.size} oggetto/i → ${layerNames[layer]} ✓`);
}
