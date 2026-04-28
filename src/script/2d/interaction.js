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

function handleMd(e,i,axis,dir){
  e.stopPropagation();
  const p=pt(e);
  S.dragging=true;
  updateBottomOffsets();

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
    S.rotating = true;
    S.dragType = 'handle-rot';
    const l = S.letters[i];
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
      origPositions: Array.from(S.sel).map(idx => ({ idx, x: S.letters[idx].x, y: S.letters[idx].y, rot: S.letters[idx].rot }))
    };
  } else if(axis === 'diag'){
    S.dragType = 'handle-diag';
    const l = S.letters[i];
    const startDist = Math.sqrt(Math.pow(p.x - centerX, 2) + Math.pow(p.y - centerY, 2));
    S.ds = {
      x: p.x, y: p.y,
      sx: l.sx, sy: l.sy,
      centerX, centerY,
      startDist: Math.max(startDist, 1),
      groupCx: centerX,
      groupCy: centerY,
      origPositions: Array.from(S.sel).map(idx => ({ idx, x: S.letters[idx].x, y: S.letters[idx].y, sx: S.letters[idx].sx, sy: S.letters[idx].sy }))
    };
  } else if(axis === 'x' || axis === 'y'){
    S.dragType = `handle-${axis}`;
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

  const elem = S.letters[i];
  if (elem && elem.groupId) {
    const groupIndices = getGroupIndices(i);
    if (e.shiftKey) {
      const allSelected = groupIndices.every(idx => S.sel.has(idx));
      if (allSelected) { groupIndices.forEach(idx => S.sel.delete(idx)); }
      else { groupIndices.forEach(idx => S.sel.add(idx)); }
    } else {
      S.sel.clear();
      groupIndices.forEach(idx => S.sel.add(idx));
    }
  } else {
    if(e.shiftKey){ S.sel.has(i)?S.sel.delete(i):S.sel.add(i); }
    else { if(!S.sel.has(i)){S.sel.clear();S.sel.add(i);} }
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
  const active = document.activeElement;
  if(active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
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
    const expandedSel = new Set();
    S.sel.forEach(idx => { getGroupIndices(idx).forEach(gIdx => expandedSel.add(gIdx)); });
    const expandedArr = [...expandedSel];

    if(expandedArr.length === 1){
      const lIdx = expandedArr[0];
      let nx=S.dl[lIdx].x+dx, ny=S.dl[lIdx].y+dy;
      const lBottomOffset = S.bottomOffsets[lIdx] || 0;

      if(S.snapEnabled){
        for(let oIdx=0; oIdx<S.letters.length; oIdx++){
          if(expandedSel.has(oIdx)) continue;
          const oBottom = S.letters[oIdx].y + (S.bottomOffsets[oIdx] || 0);
          if(Math.abs(oBottom - (ny + lBottomOffset)) < S.snapThreshold){
            ny = oBottom - lBottomOffset;
            break;
          }
        }
      }
      S.letters[lIdx].x=nx; S.letters[lIdx].y=ny;

      if(S.snapEnabled){
        const cw=document.getElementById('cw');
        const ctm=svg.getScreenCTM();
        const selBottom = ny + lBottomOffset;
        const screenY=ctm.f + selBottom * ctm.d;
        const cwRect=cw.getBoundingClientRect();
        const relY=screenY - cwRect.top + cw.scrollTop;
        let snapped=false;
        for(let oIdx=0; oIdx<S.letters.length; oIdx++){
          if(expandedSel.has(oIdx)) continue;
          const oBottom = S.letters[oIdx].y + (S.bottomOffsets[oIdx] || 0);
          if(Math.abs(oBottom - selBottom) < S.snapThreshold){ snapped=true; break; }
        }
        if(snapped){ snapLine.style.top=relY+'px'; snapLine.style.display='block'; }
      }
    } else {
      const selArr = expandedArr;
      let groupCx = 0, groupCy = 0;
      selArr.forEach(i => { groupCx += S.dl[i].x; groupCy += S.dl[i].y; });
      groupCx /= selArr.length; groupCy /= selArr.length;

      let groupBottomOffset = -Infinity;
      selArr.forEach(i => {
        const origOffsetY = S.dl[i].y - groupCy;
        const b = origOffsetY + (S.bottomOffsets[i] || 0);
        if(b > groupBottomOffset) groupBottomOffset = b;
      });

      let newGroupCx = groupCx + dx, newGroupCy = groupCy + dy;
      let snappedY = null, snappedX = null;
      
      if(S.snapEnabled){
        for(let oIdx=0; oIdx<S.letters.length; oIdx++){
          if(expandedSel.has(oIdx)) continue;
          const oBottom = S.letters[oIdx].y + (S.bottomOffsets[oIdx] || 0);
          if(Math.abs(oBottom - (newGroupCy + groupBottomOffset)) < S.snapThreshold){
            snappedY = oBottom - groupBottomOffset; break;
          }
        }
        if(snappedY === null){
          for(let oIdx=0; oIdx<S.letters.length; oIdx++){
            if(expandedSel.has(oIdx)) continue;
            if(Math.abs(S.letters[oIdx].y - newGroupCy) < S.snapThreshold){ snappedY = S.letters[oIdx].y; break; }
          }
        }
        for(let oIdx=0; oIdx<S.letters.length; oIdx++){
          if(expandedSel.has(oIdx)) continue;
          if(Math.abs(S.letters[oIdx].x - newGroupCx) < S.snapThreshold){ snappedX = S.letters[oIdx].x; break; }
        }
      }
      
      if(snappedY !== null) newGroupCy = snappedY;
      if(snappedX !== null) newGroupCx = snappedX;

      selArr.forEach(i => {
        const origOffsetX = S.dl[i].x - groupCx;
        const origOffsetY = S.dl[i].y - groupCy;
        S.letters[i].x = newGroupCx + origOffsetX;
        S.letters[i].y = newGroupCy + origOffsetY;
      });
      
      if(S.snapEnabled && snappedY !== null){
        const cw=document.getElementById('cw');
        const ctm=svg.getScreenCTM();
        let lineY = newGroupCy;
        if (Math.abs(snappedY - (groupCy + dy)) > 0.1) {
           for(let oIdx=0; oIdx<S.letters.length; oIdx++){
              if(expandedSel.has(oIdx)) continue;
              const oBottom = S.letters[oIdx].y + (S.bottomOffsets[oIdx] || 0);
              if(Math.abs(oBottom - (newGroupCy + groupBottomOffset)) < 0.1){
                lineY = newGroupCy + groupBottomOffset; break;
              }
           }
        }
        const screenY=ctm.f + lineY * ctm.d;
        const cwRect=cw.getBoundingClientRect();
        const relY=screenY - cwRect.top + cw.scrollTop;
        snapLine.style.top=relY+'px'; snapLine.style.display='block';
      }
    }
    render(); renderHandles(); upd();
  }
  if(S.dragType==='handle-x'){
    const dx=p.x-S.ds.x;
    if(S.sel.size === 1){
      Array.from(S.sel).forEach(i=>S.letters[i].x=S.dl[i].x+dx);
    } else if(S.ds.origPositions){
      let snapOffset = 0;
      if(S.snapEnabled && S.ds.origPositions.length > 0){
        const firstPos = S.ds.origPositions[0];
        const newX = firstPos.x + dx;
        for(const o of S.letters.filter((_,idx)=>!S.sel.has(idx))){
          if(Math.abs(o.x - newX) < S.snapThreshold){ snapOffset = o.x - firstPos.x; break; }
        }
      }
      S.ds.origPositions.forEach(origPos => {
        S.letters[origPos.idx].x = origPos.x + dx + snapOffset;
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
            ny = oBottom - lBottomOffset; snapped = true; break;
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
        snapLine.style.top=relY+'px'; snapLine.style.display='block';
      }
    } else if(S.ds.origPositions){
      let snapOffset = 0;
      let groupBottomOffset = -Infinity, groupCy = 0;
      const selArr = S.ds.origPositions.map(p=>p.idx);
      selArr.forEach(idx => groupCy += S.dl[idx].y);
      groupCy /= selArr.length;
      selArr.forEach(idx => {
        const b = (S.dl[idx].y - groupCy) + (S.bottomOffsets[idx] || 0);
        if(b > groupBottomOffset) groupBottomOffset = b;
      });
      let snapped = false, snappedY = null;
      if(S.snapEnabled && S.ds.origPositions.length > 0){
        const currentGroupBottom = groupCy + dy + groupBottomOffset;
        for(let oIdx=0; oIdx<S.letters.length; oIdx++){
          if(S.sel.has(oIdx)) continue;
          const oBottom = S.letters[oIdx].y + (S.bottomOffsets[oIdx] || 0);
          if(Math.abs(oBottom - currentGroupBottom) < S.snapThreshold){
            snapOffset = oBottom - currentGroupBottom; snapped = true; snappedY = oBottom; break;
          }
        }
      }
      S.ds.origPositions.forEach(origPos => { S.letters[origPos.idx].y = origPos.y + dy + snapOffset; });
      if(S.snapEnabled && snapped){
        const cw=document.getElementById('cw');
        const ctm=svg.getScreenCTM();
        const screenY=ctm.f + snappedY * ctm.d;
        const cwRect=cw.getBoundingClientRect();
        const relY=screenY - cwRect.top + cw.scrollTop;
        snapLine.style.top=relY+'px'; snapLine.style.display='block';
      }
    }
    render(); renderHandles(); upd();
  }
  if(S.dragType === 'handle-rot'){
    const dx = p.x - S.ds.centerX, dy = p.y - S.ds.centerY;
    const currentAngle = Math.atan2(dy, dx) * 180 / Math.PI;
    let delta = currentAngle - S.ds.startAngle;
    while(delta > 180) delta -= 360;
    while(delta < -180) delta += 360;
    const cos = Math.cos(delta * Math.PI / 180), sin = Math.sin(delta * Math.PI / 180);
    if(S.sel.size === 1){ S.letters[Array.from(S.sel)[0]].rot = S.ds.startRot + delta; }
    else if(S.ds.origPositions){
      const groupCx = S.ds.centerX, groupCy = S.ds.centerY;
      S.ds.origPositions.forEach(origPos => {
        const offsetX = origPos.x - groupCx, offsetY = origPos.y - groupCy;
        const newOffsetX = offsetX * cos - offsetY * sin;
        const newOffsetY = offsetX * sin + offsetY * cos;
        S.letters[origPos.idx].x = groupCx + newOffsetX;
        S.letters[origPos.idx].y = groupCy + newOffsetY;
        S.letters[origPos.idx].rot = (origPos.rot + delta) % 360;
      });
    }
    render(); renderHandles(); upd();
  }
  if(S.dragType === 'handle-diag'){
    const centerX = S.ds.centerX, centerY = S.ds.centerY;
    const dx = p.x - centerX, dy = p.y - centerY;
    const currentDist = Math.sqrt(dx*dx + dy*dy);
    const ratio = currentDist / S.ds.startDist;
    const newScale = Math.max(0.05, Math.min(20, S.ds.sx * ratio));
    if(S.sel.size === 1){
      const i = Array.from(S.sel)[0];
      S.letters[i].sx = newScale; S.letters[i].sy = newScale;
    } else if(S.ds.origPositions){
      const groupCx = S.ds.groupCx, groupCy = S.ds.groupCy;
      S.ds.origPositions.forEach(origPos => {
        const i = origPos.idx, l = S.letters[i];
        l.x = groupCx + (origPos.x - groupCx) * ratio;
        l.y = groupCy + (origPos.y - groupCy) * ratio;
        l.sx = origPos.sx * ratio; l.sy = origPos.sy * ratio;
      });
    }
    render(); renderHandles(); upd();
  }
});

document.addEventListener('mouseup', e=>{
  if(S.panning){ stopPan(); return; }
  if(S.dragging){
    if(S.rotating && S.dragType === 'handle-rot'){
      S.rotating = false; S.rotHandleAngle = null; S.rotHandleDistance = null;
      render(); renderHandles();
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

function toggleFont(n){S.selectedFonts.has(n)?S.selectedFonts.delete(n):S.selectedFonts.add(n);renderFonts();upd();}
function selectAllFonts(){Object.keys(S.fonts).forEach(n=>S.selectedFonts.add(n));renderFonts();toast(`${S.selectedFonts.size} font selezionati ✓`);}
function clearFontSelection(){S.selectedFonts.clear();renderFonts();upd();}
function toggleSelFromPanel(i){if(S.sel.has(i))S.sel.delete(i);render();renderHandles();upd();}

document.addEventListener('keydown', e => {
  if(e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  const is3D = document.getElementById('preview-3d-overlay').style.display === 'block';

  if(e.key === 'Delete' || e.key === 'Backspace') {
    if(is3D) delete3DSelection(); else deleteSelected();
    return;
  }

  const keyZ = (e.key && e.key.toLowerCase() === 'z') || e.code === 'KeyZ';
  const keyY = (e.key && e.key.toLowerCase() === 'y') || e.code === 'KeyY';
  const isUndo = (e.ctrlKey || e.metaKey) && keyZ && !e.shiftKey;
  const isRedo = ((e.ctrlKey || e.metaKey) && keyY) || ((e.ctrlKey || e.metaKey) && e.shiftKey && keyZ);

  if(isUndo) { e.preventDefault(); if(is3D) undo3D(); else undo(); return; }
  if(isRedo) { e.preventDefault(); if(is3D) redo3D(); else redo(); return; }

  if((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A' || e.code === 'KeyA')) { e.preventDefault(); selectAll(); }
  if((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D' || e.code === 'KeyD')) { e.preventDefault(); duplicateSel(); }
  if((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomIn(); }
  if((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); zoomOut(); }
  if((e.ctrlKey || e.metaKey) && e.key === '0') { e.preventDefault(); zoomReset(); }

  if(!is3D) {
    const step = e.shiftKey ? 10 : 1;
    if(e.key === 'ArrowLeft') { e.preventDefault(); aps(l => l.x -= step); }
    if(e.key === 'ArrowRight') { e.preventDefault(); aps(l => l.x += step); }
    if(e.key === 'ArrowUp') { e.preventDefault(); aps(l => l.y -= step); }
    if(e.key === 'ArrowDown') { e.preventDefault(); aps(l => l.y += step); }
  }

  if(e.ctrlKey && e.key === '1') { e.preventDefault(); setSelectedLayer(1); }
  if(e.ctrlKey && e.key === '2') { e.preventDefault(); setSelectedLayer(2); }
  if(e.ctrlKey && e.key === '3') { e.preventDefault(); setSelectedLayer(3); }
});

const svgElement = document.getElementById('svg');
if(svgElement){
svgElement.addEventListener('mousedown', e => {
  if(e.button === 1) { e.preventDefault(); e.stopPropagation(); startPan(e); return; }
  if(e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.closest('input') || e.target.closest('textarea')) return;
  smd(e);
}, {passive: false});
svgElement.addEventListener('auxclick', e => { if(e.button === 1) { e.preventDefault(); e.stopPropagation(); } }, {passive: false});
svgElement.addEventListener('contextmenu', e => { e.preventDefault(); });
}

const cwElement = document.getElementById('cw');
if(cwElement){
cwElement.addEventListener('contextmenu', e => { e.preventDefault(); });
cwElement.addEventListener('mousedown', function(e) {
  if(e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA'){
    if(document.activeElement && document.activeElement !== document.body && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA'){
      document.activeElement.blur();
    }
  }
}, true);
}
