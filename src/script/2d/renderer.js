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

function getGroupBBox(){
  const sel = [...S.sel];
  if(sel.length === 0) return null;
  const expandedSel = new Set();
  sel.forEach(i => { getGroupIndices(i).forEach(idx => expandedSel.add(idx)); });
  const expandedArr = [...expandedSel];
  if(expandedArr.length === 1) return getLetterBBoxTransformed(expandedArr[0]);
  const bboxes = expandedArr.map(i => getLetterBBoxTransformed(i)).filter(b => b !== null);
  if(bboxes.length === 0) return null;
  const x = Math.min(...bboxes.map(b => b.x)), y = Math.min(...bboxes.map(b => b.y));
  const x2 = Math.max(...bboxes.map(b => b.x2)), y2 = Math.max(...bboxes.map(b => b.y2));
  return { x, y, x2, y2, w: x2-x, h: y2-y, cx: (x+x2)/2, cy: (y+y2)/2 };
}

function renderHandles(){
  const layer=document.getElementById('handles-layer');
  layer.innerHTML='';
  if(S.sel.size === 0) return;
  const bb = getGroupBBox();
  if(!bb) return;
  const PAD = 10, bx = bb.x - PAD, by = bb.y - PAD, bx2 = bb.x2 + PAD, by2 = bb.y2 + PAD, bcx = (bx+bx2)/2, bcy = (by+by2)/2;

  if(!S.rotating){
    const border = document.createElementNS('http://www.w3.org/2000/svg','rect');
    border.setAttribute('x', bx); border.setAttribute('y', by);
    border.setAttribute('width', bx2-bx); border.setAttribute('height', by2-by);
    border.setAttribute('fill','none'); border.setAttribute('stroke','rgba(200,255,0,0.45)');
    border.setAttribute('stroke-width','1'); border.setAttribute('rx','3');border.setAttribute('ry','3');
    border.setAttribute('pointer-events','none');
    layer.appendChild(border);
  }

  const firstIdx = [...S.sel][0];
  const mk=(tx,ty,d,axis,dir,cursor='pointer', rotTransform=null)=>{
    const g=document.createElementNS('http://www.w3.org/2000/svg','g');
    let transform = `translate(${tx},${ty})`;
    if(rotTransform) transform += ` ${rotTransform}`;
    g.setAttribute('transform', transform); g.setAttribute('class','lg-handle'); g.setAttribute('style',`cursor:${cursor}`);
    g.addEventListener('mousedown',e=>handleMd(e,firstIdx,axis,dir));
    g.innerHTML=`<circle cx="0" cy="0" r="10" fill="#1e1e2e" stroke="#c8ff00" stroke-width="1.5"/><path d="${d}" stroke="#c8ff00" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    layer.appendChild(g);
  };

  if(S.rotating && S.rotHandleDistance !== null && S.ds){
    const rotCenterX = S.ds.centerX, rotCenterY = S.ds.centerY;
    const currentRot = S.letters[firstIdx]?.rot || 0;
    const currentAngle = (S.rotHandleAngle + currentRot) * Math.PI / 180;
    const rotatedX = rotCenterX + Math.cos(currentAngle) * S.rotHandleDistance;
    const rotatedY = rotCenterY + Math.sin(currentAngle) * S.rotHandleDistance;
    mk(rotatedX, rotatedY, `M0,5 A5,5 0 1 1 5,-1 M5,-1 L3.3,-2.0 M5,-1 L5.5,-3.2`, 'rot', -1, 'crosshair', `rotate(${-currentRot})`);
    return;
  }

  const OFFSET = 18;
  mk(bx - OFFSET, bcy, `M-3,-1.8 L-6.9,0 L-3,1.8 M-6.9,0 L7,0`, 'x', -1, 'ew-resize');
  mk(bx2 + OFFSET, bcy, `M3,-1.8 L6.9,0 L3,1.8 M6.9,0 L-7,0`, 'x', 1, 'ew-resize');
  mk(bcx, by - OFFSET, `M-1.8,-3 L0,-6.9 L1.8,-3 M0,-6.9 L0,7`, 'y', -1, 'ns-resize');
  mk(bcx, by2 + OFFSET, `M-1.8,3 L0,6.9 L1.8,3 M0,6.9 L0,-7`, 'y', 1, 'ns-resize');
  mk(bx2 + OFFSET*0.8, by - OFFSET*0.8, `M-5,5 L5,-5 M1,-5 L5,-5 L5,-1`, 'diag', 1, 'nesw-resize');
  mk(bx - OFFSET*0.8, by - OFFSET*0.8, `M0,5 A5,5 0 1 1 5,-1 M5,-1 L3.3,-2.0 M5,-1 L5.5,-3.2`, 'rot', -1, 'crosshair');
}

function updateBottomOffsets() {
  S.bottomOffsets = S.letters.map((l, i) => {
    const bbox = getLetterBBoxTransformed(i);
    return bbox ? (bbox.y2 - l.y) : 0;
  });
}

function upd(){
  S._gapBase = null;
  const sel=[...S.sel];
  const gg=document.getElementById('gg'),ns=document.getElementById('nsel'),info=document.getElementById('info');
  if(!sel.length){
    gg.innerHTML='';ns.style.display='block';
    info.innerHTML='<b>Tasto destro + Trascina</b> = Pan<br><b>Rotella</b> = Zoom | <b>Ctrl+Rotella</b> = Scorri<br>Shift+Click = selezione multipla';
    resetPropertyFields(); return;
  }
  ns.style.display='none';
  gg.innerHTML=sel.map(i=>{
    const l=S.letters[i];
    const label=l.isSvgImport?'⬡':l.ch;
    return `<div class="gc sel" style="font-family:${l.fontFamily};font-size:${Math.min(l.fontSize,18)}px;cursor:pointer" onclick="toggleSelFromPanel(${i})">${label}</div>`;
  }).join('');
  
  const first = S.letters[sel[0]];
  const avgX = sel.reduce((sum, i) => sum + S.letters[i].x, 0) / sel.length;
  const avgY = sel.reduce((sum, i) => sum + S.letters[i].y, 0) / sel.length;
  const avgRot = sel.reduce((sum, i) => sum + S.letters[i].rot, 0) / sel.length;
  const avgSx = sel.reduce((sum, i) => sum + S.letters[i].sx, 0) / sel.length;
  const avgSy = sel.reduce((sum, i) => sum + S.letters[i].sy, 0) / sel.length;
  const avgSkew = sel.reduce((sum, i) => sum + S.letters[i].skew, 0) / sel.length;
  const avgOp = sel.reduce((sum, i) => sum + S.letters[i].op, 0) / sel.length;
  const avgFs = sel.reduce((sum, i) => sum + S.letters[i].fontSize, 0) / sel.length;
  const avgBorder = sel.reduce((sum, i) => sum + (S.letters[i].borderWidth || 0), 0) / sel.length;

  const allSameFill = sel.every(i => S.letters[i].fill === first.fill);
  const allSameFs = sel.every(i => S.letters[i].fontSize === first.fontSize);
  const allSameBorder = sel.every(i => S.letters[i].borderWidth === first.borderWidth);
  const allSameBorderCol = sel.every(i => S.letters[i].borderColor === first.borderColor);
  
  v('px', Math.round(avgX)); v('py', Math.round(avgY));
  v('prot', Math.round(avgRot)); v('vrot', Math.round(avgRot));
  v('psx', avgSx); v('vsx', avgSx.toFixed(2));
  v('psy', avgSy); v('vsy', avgSy.toFixed(2));
  v('psk', Math.round(avgSkew)); v('vsk', Math.round(avgSkew));
  
  if(allSameFill) { v('pfill', first.fill); v('fcol', first.fill); }
  else { v('pfill', '#ffffff'); v('fcol', '#ffffff'); }

  if(allSameFs) { v('pfs', Math.round(first.fontSize)); v('fsize', Math.round(first.fontSize)); }
  else { v('pfs', Math.round(avgFs)); v('fsize', Math.round(avgFs)); }
  
  v('pop', avgOp); t('vop', Math.round(avgOp * 100) + '%');

  if(allSameBorder) { v('pborder', first.borderWidth || 0); v('vborder', (first.borderWidth || 0).toFixed(1)); }
  else { v('pborder', avgBorder); v('vborder', avgBorder.toFixed(1)); }

  if(allSameBorderCol) { v('pbordercol', first.borderColor); }
  else { v('pbordercol', '#000000'); }

  const layerLabels = {1: 'Sotto', 2: 'Centro', 3: 'Sopra'};
  const allSameLayer = sel.every(i => (S.letters[i].layer || 2) === (S.letters[sel[0]].layer || 2));
  const layerInfo = allSameLayer ? `<br>Layer: ${layerLabels[S.letters[sel[0]].layer || 2] || 'Centro'}` : '';
  
  const layerBtn1 = document.getElementById('layer-btn-1'), layerBtn2 = document.getElementById('layer-btn-2'), layerBtn3 = document.getElementById('layer-btn-3');
  if(layerBtn1) layerBtn1.classList.remove('active'); if(layerBtn2) layerBtn2.classList.remove('active'); if(layerBtn3) layerBtn3.classList.remove('active');
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
  v('px', 0); v('py', 0); v('prot', 0); v('vrot', 0);
  v('psx', 1); v('vsx', '1.00'); v('psy', 1); v('vsy', '1.00');
  v('psk', 0); v('vsk', 0); v('pop', 1); t('vop', '100%');
  v('pborder', 0); v('vborder', 0); v('pbordercol', '#000000');
  v('pgap', 4); t('vgap', '4px'); v('fsize', 80);
  const layerBtn1 = document.getElementById('layer-btn-1'), layerBtn2 = document.getElementById('layer-btn-2'), layerBtn3 = document.getElementById('layer-btn-3');
  if(layerBtn1) layerBtn1.classList.remove('active'); if(layerBtn2) layerBtn2.classList.remove('active'); if(layerBtn3) layerBtn3.classList.remove('active');
}

function selectAll(){S.letters.forEach((_,i)=>S.sel.add(i));render();renderHandles();upd();}
