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

// ── EXPORT SVG ──────────────────────────────────────────────────────────────

// Costruisce DOMMatrix da parametri lettera (uguale a render)
function _buildLetterMatrix(l, mw) {
  let m = new DOMMatrix();
  m = m.translate(l.x, l.y);
  if (l.rot) m = m.rotate(l.rot);
  if (l.sx !== 1 || l.sy !== 1) m = m.scale(l.sx, l.sy);
  if (l.skew) m = m.skewX(l.skew);
  m = m.translate(-l.x, -l.y);
  return m;
}

function _realBBox(pathD) {
  const bb = calcRealBBox(pathD);
  if (!bb) return null;
  return { x: bb.x, y: bb.y, x2: bb.x + bb.width, y2: bb.y + bb.height, w: bb.width, h: bb.height };
}

function _touch(a, b) {
  return a.x2 + 1 >= b.x && b.x2 + 1 >= a.x && a.y2 + 1 >= b.y && b.y2 + 1 >= a.y;
}

async function exportSVG() {
  try {
    if (S.letters.length === 0) { toast('Canvas vuoto!'); return; }
    const ctx = document.getElementById('dc').getContext('2d');
    const sortedIndices = S.letters.map((_, i) => i).sort((a, b) => (S.letters[a].layer || 2) - (S.letters[b].layer || 2));
    const items = [];

    sortedIndices.forEach((i, renderOrder) => {
      const l = S.letters[i];
      const color = l.fill || '#000000', opacity = (l.op != null) ? l.op : 1, bw = l.borderWidth || 0, bc = l.borderColor || '#000000';
      ctx.font = `${l.fontSize}px ${l.fontFamily}`;
      const mw = l.isGroup ? l.groupW : (l.isSvgImport ? (l.svgW || 100) : ctx.measureText(l.ch).width);
      const outerM = _buildLetterMatrix(l, mw);

      if (l.isGroup && l.groupHTML) {
        const dx = l.x - (l.originalX || l.x), dy = l.y - (l.originalY || l.y);
        const innerM = outerM.translate(dx, dy);
        const tempDiv = document.createElement('div'); tempDiv.innerHTML = l.groupHTML;
        const allSegs = [];
        tempDiv.querySelectorAll('path').forEach(p => {
          const d = p.getAttribute('d'); if (!d) return;
          const pTfStr = p.getAttribute('transform') || '', pM = pTfStr ? parseTransformToMatrix(pTfStr) : new DOMMatrix();
          const combined = innerM.multiply(pM);
          allSegs.push(...applyMatrixToSegs(pathToAbsoluteSegments(d), combined));
        });
        if (!allSegs.length) return;
        const pathD = segsToPathD(allSegs), bbox = _realBBox(pathD);
        if (bbox) items.push({ pathD, bbox, color, opacity, bw: 0, bc, renderOrder });
      } else if (l.customPath) {
        const innerX = l.isSvgImport ? l.x - (l.svgW || mw) / 2 : l.x - mw / 2;
        const combined = outerM.translate(innerX, l.y);
        const pathD = segsToPathD(applyMatrixToSegs(pathToAbsoluteSegments(l.customPath), combined)), bbox = _realBBox(pathD);
        if (bbox) items.push({ pathD, bbox, color, opacity, bw, bc, renderOrder });
      } else if (S.openFonts[l.fontName]) {
        const innerX = l.x - mw / 2;
        const combined = outerM.translate(innerX, l.y);
        const d = S.openFonts[l.fontName].getPath(l.ch, 0, 0, l.fontSize).toPathData(4);
        const pathD = segsToPathD(applyMatrixToSegs(pathToAbsoluteSegments(d), combined)), bbox = _realBBox(pathD);
        if (bbox) items.push({ pathD, bbox, color, opacity, bw, bc, renderOrder });
      } else {
        const opAttr = opacity !== 1 ? ` opacity="${opacity}"` : '';
        const bwAttr = bw > 0 ? ` stroke="${bc}" stroke-width="${bw}" stroke-linejoin="round" stroke-linecap="round" style="paint-order:stroke fill"` : '';
        const markup = `<text x="${l.x}" y="${l.y}" font-family="${escHtml(l.fontFamily)}" font-size="${l.fontSize}" fill="${color}" text-anchor="middle"${opAttr}${bwAttr}>${escHtml(l.ch)}</text>`;
        const fs = l.fontSize || 80, estW = fs * 0.65;
        const bbox = { x: l.x - estW / 2, y: l.y - fs, x2: l.x + estW / 2, y2: l.y };
        items.push({ isText: true, textMarkup: markup, bbox, color, opacity, bw, bc, renderOrder });
      }
    });

    if (!items.length) { toast('Nessun elemento esportabile!'); return; }
    const n = items.length, ufP = items.map((_, i) => i);
    function ufF(i) { while (ufP[i] !== i) { ufP[i] = ufP[ufP[i]]; i = ufP[i]; } return i; }
    function ufU(a, b) { ufP[ufF(a)] = ufF(b); }
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (_touch(items[a].bbox, items[b].bbox)) ufU(a, b);
    items.forEach((it, i) => { it.groupId = ufF(i); });

    const groupSizes = new Map(); items.forEach(it => { groupSizes.set(it.groupId, (groupSizes.get(it.groupId) || 0) + 1); });
    let svgContent = ''; const openedGroups = new Set(), closedGroups = new Set();
    const groupBounds = new Map(); items.forEach((it, idx) => {
      const g = it.groupId; if (!groupBounds.has(g)) groupBounds.set(g, { min: idx, max: idx });
      else { const b = groupBounds.get(g); if (idx < b.min) b.min = idx; if (idx > b.max) b.max = idx; }
    });

    let pendingPath = null;
    function flushPending() {
      if (!pendingPath) return;
      const { color, pathD, bw, bc, opacity } = pendingPath;
      const opAttr = opacity !== 1 ? ` opacity="${opacity}"` : '';
      if (bw > 0) { svgContent += `<path d="${pathD}" fill="${bc}"${opAttr} stroke="${bc}" stroke-width="${bw*2}" stroke-linejoin="round" stroke-linecap="round" style="paint-order:stroke fill"/>\n`; }
      svgContent += `<path d="${pathD}" fill="${color}"${opAttr}/>\n`;
      pendingPath = null;
    }

    items.forEach((it, idx) => {
      const gId = it.groupId, isMulti = groupSizes.get(gId) > 1;
      if (isMulti && !openedGroups.has(gId)) { flushPending(); svgContent += `<g>\n`; openedGroups.add(gId); }
      if (it.isText) { flushPending(); svgContent += it.textMarkup + '\n'; }
      else {
        if (pendingPath && pendingPath.color === it.color && pendingPath.groupId === gId && pendingPath.opacity === it.opacity) {
          pendingPath.pathD += ' ' + it.pathD; if (it.bw > pendingPath.bw) { pendingPath.bw = it.bw; pendingPath.bc = it.bc; }
        } else { flushPending(); pendingPath = { color: it.color, pathD: it.pathD, bw: it.bw, bc: it.bc, opacity: it.opacity, groupId: gId }; }
      }
      if (isMulti && idx === groupBounds.get(gId).max) { flushPending(); svgContent += `</g>\n`; closedGroups.add(gId); }
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
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'letterforge_export.svg'; a.click();
      toast('SVG scaricato ✓');
    }
  } catch (error) { console.error('Errore esportazione SVG:', error); toast('Errore esportazione!'); }
}
