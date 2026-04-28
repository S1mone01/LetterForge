/**
 * Build a geom2 representing ONLY the border ring of a glyph path, for 3D extrusion.
 */
function buildBorderGeom2(pathD, delta) {
  if (!delta || delta <= 0) return null;
  if (!window.OpenJSCADBridge || !window.OpenJSCADBridge.initialized) return null;

  const jscad = window.OpenJSCADBridge.jscad;
  const segs = pathToAbsoluteSegments(pathD);
  if (!segs || !segs.length) return null;

  const BSTEPS = 24;
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

  function dedupe(pts) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      if (Math.hypot(pts[i][0]-out[out.length-1][0], pts[i][1]-out[out.length-1][1]) > 0.1) out.push(pts[i]);
    }
    return out;
  }

  function signedAreaSVG(pts) {
    let a = 0, n = pts.length;
    for (let i = 0; i < n; i++) { const j=(i+1)%n; a += pts[i][0]*pts[j][1]-pts[j][0]*pts[i][1]; }
    return a / 2;
  }

  function toGeom2(svgPts) {
    let jpts = svgPts.map(p => [p[0], -p[1]]).reverse();
    const n = jpts.length;
    if (n > 0) {
      const first = jpts[0], last = jpts[n - 1];
      if (Math.hypot(first[0] - last[0], first[1] - last[1]) > 0.01) jpts = [...jpts, [...first]];
    }
    return jscad.geometries.geom2.fromPoints(jpts);
  }

  const allContours = [];
  for (const raw of subpaths) {
    const pts = dedupe(raw); if (pts.length < 3) continue;
    allContours.push({ pts, area: signedAreaSVG(pts) });
  }
  if (!allContours.length) return null;
  allContours.sort((a, b) => Math.abs(b.area) - Math.abs(a.area));
  const isReversed = allContours[0].area < 0;

  const outers = [];
  for (const { pts, area } of allContours) {
    const normArea = isReversed ? -area : area;
    if (normArea > 0) outers.push(isReversed ? [...pts].reverse() : pts);
  }
  if (!outers.length) return null;

  function isValidGeom2(g) {
    if (!g) return false;
    try { const ol = jscad.geometries.geom2.toOutlines(g); return ol && ol.length > 0; }
    catch(_) { return false; }
  }

  let borderGeom2 = null;
  for (const pts of outers) {
    const expandedSVG = offsetContour2D(pts, delta);
    if (!expandedSVG || expandedSVG.length < 3) continue;
    try {
      const inflatedG2 = toGeom2(expandedSVG), originalG2 = toGeom2(pts);
      if (!inflatedG2 || !originalG2) continue;
      let ring = null;
      try {
        const candidate = jscad.booleans.subtract(inflatedG2, originalG2);
        ring = isValidGeom2(candidate) ? candidate : (isValidGeom2(inflatedG2) ? inflatedG2 : null);
      } catch(subErr) { ring = isValidGeom2(inflatedG2) ? inflatedG2 : null; }
      if (!ring) continue;
      if (!borderGeom2) borderGeom2 = ring;
      else {
        try { const united = jscad.booleans.union(borderGeom2, ring); borderGeom2 = isValidGeom2(united) ? united : borderGeom2; }
        catch(uErr) {}
      }
    } catch(e) {}
  }
  return borderGeom2 || null;
}

function build3DObjects() {
  threeMeshes = []; threeExtrusionLevels = {};
  if (!threeVisibilityState) threeVisibilityState = {};
  const ctx = document.getElementById('dc').getContext('2d');
  const sortedIndices = S.letters.map((_, i) => i).sort((a, b) => (S.letters[a].layer || 2) - (S.letters[b].layer || 2));
  let items = [];

  sortedIndices.forEach((i, renderOrder) => {
    const l = S.letters[i];
    if (l.isSTL) {
      try {
        const binaryString = atob(l.stlData), bytes = new Uint8Array(binaryString.length);
        for (let j = 0; j < binaryString.length; j++) bytes[j] = binaryString.charCodeAt(j);
        const geometry = _parseSTLBinary(bytes.buffer);
        const material = new THREE.MeshPhongMaterial({ color: new THREE.Color(l.fill || '#111111'), specular: 0x444444, shininess: 30, side: THREE.DoubleSide, transparent: (l.op != null ? l.op : 1) < 1, opacity: l.op != null ? l.op : 1 });
        const mesh = new THREE.Mesh(geometry, material);
        if (l.pos3d) { mesh.position.set(l.pos3d.x, l.pos3d.y, l.pos3d.z); mesh.rotation.set(l.rot3d.x, l.rot3d.y, l.rot3d.z); mesh.scale.set(l.sca3d.x, l.sca3d.y, l.sca3d.z); }
        mesh.userData.letterId = l.id; mesh.userData.isSTL = true; mesh.userData.colorHex = l.fill || '#111111';
        threeScene.add(mesh); threeMeshes.push(mesh);
        const cHex = mesh.userData.colorHex;
        if (!threeExtrusionLevels[cHex]) {
          threeExtrusionLevels[cHex] = { extrusion: 20, meshes: [] };
          if (threeVisibilityState[cHex] === undefined) threeVisibilityState[cHex] = true;
        }
        mesh.visible = threeVisibilityState[cHex];
        threeExtrusionLevels[cHex].meshes.push(mesh);
      } catch (e) { console.error(e); }
      return;
    }
    const color = l.fill || '#000000', opacity = (l.op != null) ? l.op : 1, bw = l.borderWidth || 0, bc = l.borderColor || '#000000', groupId = l.groupId || null;
    ctx.font = `${l.fontSize}px ${l.fontFamily}`;
    const mw = l.isGroup ? l.groupW : (l.isSvgImport ? (l.svgW || 100) : ctx.measureText(l.ch).width);
    const outerM = _buildLetterMatrix(l, mw);
    let pathD = '', bbox = null;
    if (l.isGroup && l.groupHTML) {
      const dx = l.x - (l.originalX || l.x), dy = l.y - (l.originalY || l.y), innerM = outerM.translate(dx, dy);
      const tempDiv = document.createElement('div'); tempDiv.innerHTML = l.groupHTML; const allSegs = [];
      tempDiv.querySelectorAll('path').forEach(p => {
        const d = p.getAttribute('d'); if (!d) return;
        const pM = (p.getAttribute('transform') || '') ? parseTransformToMatrix(p.getAttribute('transform')) : new DOMMatrix();
        allSegs.push(...applyMatrixToSegs(pathToAbsoluteSegments(d), innerM.multiply(pM)));
      });
      if (allSegs.length) { pathD = segsToPathD(allSegs); bbox = _realBBox(pathD); }
    } else if (l.customPath) {
      const innerX = l.isSvgImport ? l.x - (l.svgW || mw) / 2 : l.x - mw / 2;
      const combined = outerM.translate(innerX, l.y);
      pathD = segsToPathD(applyMatrixToSegs(pathToAbsoluteSegments(l.customPath), combined)); bbox = _realBBox(pathD);
    } else if (S.openFonts[l.fontName]) {
      const innerX = l.x - mw / 2;
      const combined = outerM.translate(innerX, l.y);
      try {
        const d = S.openFonts[l.fontName].getPath(l.ch, 0, 0, l.fontSize).toPathData(4);
        pathD = segsToPathD(applyMatrixToSegs(pathToAbsoluteSegments(d), combined)); bbox = _realBBox(pathD);
      } catch(e) {
        const fs = l.fontSize || 80, estW = fs * 0.65, x = l.x - estW/2, y = l.y - fs;
        pathD = `M${x},${y} L${x+estW},${y} L${x+estW},${y+fs} L${x},${y+fs} Z`; bbox = { x, y, x2: x+estW, y2: y+fs };
      }
    } else {
      const fs = l.fontSize || 80, estW = fs * 0.65, x = l.x - estW/2, y = l.y - fs;
      pathD = `M${x},${y} L${x+estW},${y} L${x+estW},${y+fs} L${x},${y+fs} Z`; bbox = { x, y, x2: x+estW, y2: y+fs };
    }
    if (pathD && bbox) {
      items.push({ pathD, bbox, color, opacity, renderOrder, groupId, isBorder: false });
      if (bw > 0) {
        const borderGeom2 = buildBorderGeom2(pathD, bw);
        if (borderGeom2) items.push({ geom2: borderGeom2, pathD, bbox, color: bc, opacity, renderOrder: renderOrder + 0.1, groupId, isBorder: true });
      }
    }
  });

  const extrusionDepth = 20; const colorGroups = {};
  items.forEach((item) => {
    try {
      if (!window.OpenJSCADBridge || !window.OpenJSCADBridge.initialized) return;
      const jscad = window.OpenJSCADBridge.jscad;
      let geom2 = item.geom2 || window.OpenJSCADBridge.parseSVGPathToGeom2(item.pathD);
      if (!geom2) return;
      const geom3 = window.OpenJSCADBridge.extrudeGeom2ToGeom3(geom2, extrusionDepth);
      if (!geom3) return;
      const geometry = window.OpenJSCADBridge.geom3ToThreeGeometry(geom3);
      geometry.userData = { isJSCAD: true, csgDepth: extrusionDepth, originalGeom2: geom2, originalPathD: item.pathD };
      const material = new THREE.MeshPhongMaterial({ color: new THREE.Color(item.color), specular: 0x444444, shininess: 30, side: THREE.DoubleSide, transparent: item.opacity < 1, opacity: item.opacity });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(0, 0, item.isBorder ? 0.05 : 0);
      mesh.userData = { bbox2D: item.bbox, colorHex: item.color, groupId: item.groupId, isJSCAD: true, isBorder: item.isBorder };
      threeScene.add(mesh); threeMeshes.push(mesh);
      if (!threeExtrusionLevels[item.color]) {
        threeExtrusionLevels[item.color] = { extrusion: extrusionDepth, meshes: [] };
        if (threeVisibilityState[item.color] === undefined) threeVisibilityState[item.color] = true;
      }
      mesh.visible = threeVisibilityState[item.color];
      threeExtrusionLevels[item.color].meshes.push(mesh);
      if (!colorGroups[item.color]) colorGroups[item.color] = [];
      colorGroups[item.color].push(item);
    } catch (e) { console.error(e); }
  });

  buildExtrusionControls(colorGroups);
  if (threeCamera && threeControls && threeMeshes.length > 0) {
    const globalBBox = new THREE.Box3(); threeMeshes.forEach(mesh => globalBBox.union(new THREE.Box3().setFromObject(mesh)));
    const center = new THREE.Vector3(); globalBBox.getCenter(center);
    const size = new THREE.Vector3(); globalBBox.getSize(size);
    threeMeshes.forEach(mesh => { mesh.position.x -= center.x; mesh.position.y -= center.y; mesh.position.z -= globalBBox.min.z; });
    const fov = threeCamera.fov * (Math.PI / 180);
    threeCamera.position.set(0, 0, Math.abs(Math.max(size.x, size.y, size.z) / 2 / Math.tan(fov / 2)) * 1.3);
    threeControls.target.set(0, 0, size.z / 2); threeControls.update();
  }
}

function pathD_to_ThreeShapes(pathD) {
  const shapes = [];
  try {
    const commands = parseSVGPath(pathD); if (!commands.length) return shapes;
    const subpaths = []; let currentSubpath = [];
    commands.forEach(cmd => { if (cmd.type === 'M') { if (currentSubpath.length > 0) subpaths.push(currentSubpath); currentSubpath = [cmd]; } else currentSubpath.push(cmd); });
    if (currentSubpath.length > 0) subpaths.push(currentSubpath);
    if (subpaths.length === 0) return shapes;

    function subpathToShape(subpath, isHole = false) {
      const shape = isHole ? new THREE.Path() : new THREE.Shape();
      let started = false;
      for (const cmd of subpath) {
        if (cmd.type === 'M') { shape.moveTo(cmd.x, -cmd.y); started = true; }
        else if (cmd.type === 'L' && started) shape.lineTo(cmd.x, -cmd.y);
        else if (cmd.type === 'H' && started) shape.lineTo(cmd.x, -cmd.y);
        else if (cmd.type === 'V' && started) shape.lineTo(cmd.x, -cmd.y);
        else if (cmd.type === 'C' && started) shape.bezierCurveTo(cmd.x1, -cmd.y1, cmd.x2, -cmd.y2, cmd.x, -cmd.y);
        else if (cmd.type === 'Q' && started) shape.quadraticCurveTo(cmd.x1, -cmd.y1, cmd.x, -cmd.y);
        else if (cmd.type === 'Z' && started) shape.closePath();
      }
      return started ? shape : null;
    }

    const subpathsWithBBox = subpaths.map((subpath, idx) => {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, totalX = 0, totalY = 0, pointCount = 0;
      for (const cmd of subpath) {
        if (cmd.x !== undefined) { minX = Math.min(minX, cmd.x); maxX = Math.max(maxX, cmd.x); totalX += cmd.x; pointCount++; }
        if (cmd.y !== undefined) { minY = Math.min(minY, cmd.y); maxY = Math.max(maxY, cmd.y); totalY += cmd.y; if (pointCount === 0) pointCount++; }
      }
      return { idx, subpath, bbox: { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY, area: (maxX-minX)*(maxY-minY) }, center: { x: totalX / (pointCount || 1), y: totalY / (pointCount || 1) } };
    });
    subpathsWithBBox.sort((a, b) => b.bbox.area - a.bbox.area);
    const used = new Set(), groups = [];
    for (let i = 0; i < subpathsWithBBox.length; i++) {
      if (used.has(i)) continue;
      const outer = subpathsWithBBox[i]; used.add(i);
      const group = { outer: outer.subpath, holes: [] };
      for (let j = i + 1; j < subpathsWithBBox.length; j++) {
        if (used.has(j)) continue;
        const candidate = subpathsWithBBox[j];
        if (candidate.center.x >= outer.bbox.minX && candidate.center.x <= outer.bbox.maxX && candidate.center.y >= outer.bbox.minY && candidate.center.y <= outer.bbox.maxY) {
          group.holes.push(candidate.subpath); used.add(j);
        }
      }
      groups.push(group);
    }
    groups.forEach(group => {
      const outerShape = subpathToShape(group.outer, false); if (!outerShape) return;
      group.holes.forEach(holeSubpath => { const holePath = subpathToShape(holeSubpath, true); if (holePath) outerShape.holes.push(holePath); });
      shapes.push(outerShape);
    });
  } catch (e) { console.error(e); }
  return shapes;
}

function getLetterPathData(letter, ctx) {
  ctx.font = `${letter.fontSize}px ${letter.fontFamily}`;
  const mw = letter.isGroup ? letter.groupW : (letter.isSvgImport ? (letter.svgW || 100) : ctx.measureText(letter.ch).width);
  const outerM = _buildLetterMatrix(letter, mw);
  if (letter.isGroup && letter.groupHTML) {
    const dx = letter.x - (letter.originalX || letter.x), dy = letter.y - (letter.originalY || letter.y), innerM = outerM.translate(dx, dy);
    const tempDiv = document.createElement('div'); tempDiv.innerHTML = letter.groupHTML; const allSegs = [];
    tempDiv.querySelectorAll('path').forEach(p => {
      const d = p.getAttribute('d'); if (!d) return;
      const pM = (p.getAttribute('transform') || '') ? parseTransformToMatrix(p.getAttribute('transform')) : new DOMMatrix();
      allSegs.push(...applyMatrixToSegs(pathToAbsoluteSegments(d), innerM.multiply(pM)));
    });
    return allSegs.length ? segsToPathD(allSegs) : null;
  } else if (letter.customPath) {
    const innerX = letter.isSvgImport ? letter.x - (letter.svgW || mw) / 2 : letter.x - mw / 2;
    return segsToPathD(applyMatrixToSegs(pathToAbsoluteSegments(letter.customPath), outerM.translate(innerX, letter.y)));
  } else if (S.openFonts[letter.fontName]) {
    const innerX = letter.x - mw / 2;
    const d = S.openFonts[letter.fontName].getPath(letter.ch, 0, 0, letter.fontSize).toPathData(4);
    return segsToPathD(applyMatrixToSegs(pathToAbsoluteSegments(d), outerM.translate(innerX, letter.y)));
  } else {
    const fs = letter.fontSize || 80, estW = fs * 0.65, x = letter.x - estW/2, y = letter.y - fs;
    return `M${x},${y} L${x+estW},${y} L${x+estW},${y+fs} L${x},${y+fs} Z`;
  }
}

function parseSVGPath(pathString) {
  if (!pathString) return [];
  const commands = [], regex = /([MLHVCSQTAZmlhvcsqtaz])|(-?\d*\.?\d+(?:e[-+]?\d+)?)/g;
  let match, currentCmd = null, args = [];
  while ((match = regex.exec(pathString)) !== null) {
    if (match[1]) { if (currentCmd) commands.push({ type: currentCmd, args }); currentCmd = match[1]; args = []; }
    else if (match[2]) args.push(parseFloat(match[2]));
  }
  if (currentCmd) commands.push({ type: currentCmd, args });
  const result = []; let cx = 0, cy = 0, subpathX = 0, subpathY = 0;
  commands.forEach(cmd => {
    const type = cmd.type, UC = type.toUpperCase(), rel = type !== UC, a = cmd.args; let k = 0;
    if (UC === 'M' && a.length >= 2) {
      cx = a[0] + (rel ? cx : 0); cy = a[1] + (rel ? cy : 0);
      result.push({ type: 'M', x: cx, y: cy }); subpathX = cx; subpathY = cy; k = 2;
      while (k + 1 < a.length) { cx = a[k] + (rel ? cx : 0); cy = a[k+1] + (rel ? cy : 0); result.push({ type: 'L', x: cx, y: cy }); k += 2; }
    } else if (UC === 'L') while (k + 1 < a.length) { cx = a[k] + (rel ? cx : 0); cy = a[k+1] + (rel ? cy : 0); result.push({ type: 'L', x: cx, y: cy }); k += 2; }
    else if (UC === 'H') while (k < a.length) { cx = a[k] + (rel ? cx : 0); result.push({ type: 'L', x: cx, y: cy }); k++; }
    else if (UC === 'V') while (k < a.length) { cy = a[k] + (rel ? cy : 0); result.push({ type: 'L', x: cx, y: cy }); k++; }
    else if (UC === 'C') while (k + 5 < a.length) {
      const x1 = a[k]+(rel?cx:0), y1 = a[k+1]+(rel?cy:0), x2 = a[k+2]+(rel?cx:0), y2 = a[k+3]+(rel?cy:0), x = a[k+4]+(rel?cx:0), y = a[k+5]+(rel?cy:0);
      result.push({ type: 'C', x1, y1, x2, y2, x, y }); cx = x; cy = y; k += 6;
    } else if (UC === 'Q') while (k + 3 < a.length) {
      const x1 = a[k]+(rel?cx:0), y1 = a[k+1]+(rel?cy:0), x = a[k+2]+(rel?cx:0), y = a[k+3]+(rel?cy:0);
      result.push({ type: 'Q', x1, y1, x, y }); cx = x; cy = y; k += 4;
    } else if (UC === 'Z') { result.push({ type: 'Z' }); cx = subpathX; cy = subpathY; }
  });
  return result;
}

function _splitGeometryComponents(geometry) {
  const positions = geometry.attributes.position.array, normals = geometry.attributes.normal ? geometry.attributes.normal.array : null, nTris = positions.length / 9;
  if (nTris === 0) return [];
  const faceToVertices = [], vertexToFaces = new Map();
  for (let i = 0; i < nTris; i++) {
    const facesVertices = [];
    for (let j = 0; j < 3; j++) {
      const vIdx = i * 3 + j, key = `${Math.round(positions[vIdx*3]*10000)},${Math.round(positions[vIdx*3+1]*10000)},${Math.round(positions[vIdx*3+2]*10000)}`;
      facesVertices.push(key); if (!vertexToFaces.has(key)) vertexToFaces.set(key, []); vertexToFaces.get(key).push(i);
    }
    faceToVertices.push(facesVertices);
  }
  const visited = new Uint8Array(nTris), groups = [];
  for (let i = 0; i < nTris; i++) {
    if (visited[i]) continue;
    const group = [], stack = [i]; visited[i] = 1;
    while (stack.length > 0) {
      const faceIdx = stack.pop(); group.push(faceIdx);
      for (const vertexKey of faceToVertices[faceIdx]) {
        for (const neighborFaceIdx of vertexToFaces.get(vertexKey)) { if (!visited[neighborFaceIdx]) { visited[neighborFaceIdx] = 1; stack.push(neighborFaceIdx); } }
      }
    }
    groups.push(group);
  }
  return groups.map(group => {
    const groupPos = new Float32Array(group.length * 9), groupNorm = normals ? new Float32Array(group.length * 9) : null;
    for (let i = 0; i < group.length; i++) {
      const faceIdx = group[i]; for (let j = 0; j < 9; j++) { groupPos[i*9+j] = positions[faceIdx*9+j]; if (groupNorm) groupNorm[i*9+j] = normals[faceIdx*9+j]; }
    }
    const newGeom = new THREE.BufferGeometry(); newGeom.setAttribute('position', new THREE.BufferAttribute(groupPos, 3));
    if (groupNorm) newGeom.setAttribute('normal', new THREE.BufferAttribute(groupNorm, 3)); else newGeom.computeVertexNormals();
    newGeom.computeBoundingBox(); const center = new THREE.Vector3(); newGeom.boundingBox.getCenter(center);
    newGeom.translate(-center.x, -center.y, -center.z);
    return { geometry: newGeom, center: center };
  });
}

function _exportGeometryToSTLData(geometry) {
  const pos = geometry.attributes.position.array, n = pos.length / 9, buf = new ArrayBuffer(84 + n * 50), view = new DataView(buf);
  const header = `LetterForge component`.padEnd(80, ' ');
  for (let i = 0; i < 80; i++) view.setUint8(i, header.charCodeAt(i) & 0xff);
  view.setUint32(80, n, true);
  let offset = 84;
  for (let i = 0; i < n; i++) {
    const i9 = i * 9, a = [pos[i9], pos[i9+1], pos[i9+2]], b = [pos[i9+3], pos[i9+4], pos[i9+5]], c = [pos[i9+6], pos[i9+7], pos[i9+8]], [nx, ny, nz] = _triNormal(a, b, c);
    view.setFloat32(offset, nx, true); offset += 4; view.setFloat32(offset, ny, true); offset += 4; view.setFloat32(offset, nz, true); offset += 4;
    for (let j = 0; j < 9; j++) { view.setFloat32(offset, pos[i9 + j], true); offset += 4; }
    view.setUint16(offset, 0, true); offset += 2;
  }
  const bytes = new Uint8Array(buf); let binary = ''; for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

const IMPORT_PALETTE = ['#3498db', '#e74c3c', '#2ecc71', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#27ae60', '#2980b9', '#8e44ad'];

function _processImportedGeometry(name, geometryInput) {
  const geometries = Array.isArray(geometryInput) ? geometryInput : [geometryInput], collectiveBox = new THREE.Box3();
  geometries.forEach(g => { _fixWinding(g); g.computeBoundingBox(); collectiveBox.union(g.boundingBox); });
  const globalCenter = new THREE.Vector3(); collectiveBox.getCenter(globalCenter);
  const globalOffset = new THREE.Vector3().subVectors((threeControls ? threeControls.target.clone() : new THREE.Vector3(0,0,0)), globalCenter);
  let allComponents = []; geometries.forEach(geometry => allComponents = allComponents.concat(_splitGeometryComponents(geometry)));
  if (allComponents.length > 1) toast(`Identificati ${allComponents.length} oggetti separati`);
  allComponents.forEach((comp, idx) => {
    const compGeom = comp.geometry, compCenter = comp.center; _fixWinding(compGeom);
    const compData = _exportGeometryToSTLData(compGeom), baseName = name.replace(/\.(stl|obj)$/i, ''), compName = allComponents.length > 1 ? `${baseName}_${idx+1}` : name, colorHex = allComponents.length > 1 ? IMPORT_PALETTE[idx % IMPORT_PALETTE.length] : '#111111';
    const mesh = new THREE.Mesh(compGeom, new THREE.MeshPhongMaterial({ color: new THREE.Color(colorHex), specular: 0x333333, shininess: 30, side: THREE.DoubleSide }));
    mesh.position.copy(globalOffset).add(compCenter); mesh.updateMatrixWorld(true);
    mesh.userData = { colorHex, isSTL: true, stlName: compName, stlData: compData };
    threeScene.add(mesh); threeMeshes.push(mesh);
    if (!threeExtrusionLevels[colorHex]) {
      threeExtrusionLevels[colorHex] = { extrusion: 20, meshes: [] };
      if (threeVisibilityState[colorHex] === undefined) threeVisibilityState[colorHex] = true;
    }
    mesh.visible = threeVisibilityState[colorHex]; threeExtrusionLevels[colorHex].meshes.push(mesh);
    const newEl = { id: uid++, type: 'stl', isSTL: true, stlData: compData, stlName: compName, x: S.canvasW / 2, y: S.canvasH / 2, fill: colorHex, op: 1, layer: 2, pos3d: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z }, rot3d: { x: mesh.rotation.x, y: mesh.rotation.y, z: mesh.rotation.z }, sca3d: { x: mesh.scale.x, y: mesh.scale.y, z: mesh.scale.z } };
    S.letters.push(newEl); mesh.userData.letterId = newEl.id;
  });
  initColorPresets(); buildExtrusionControlsFromState(); update3DSelectionHUD(); saveState3D(); saveState();
  toast(`Importati ${allComponents.length} oggetti da "${name}" ✓`);
}

function _fixWinding(geometry) {
  if (!geometry.attributes.position) return false;
  const pos = geometry.attributes.position.array; if (pos.length < 9) return false;
  let volume = 0;
  for (let i = 0; i < pos.length; i += 9) {
    const x1 = pos[i], y1 = pos[i+1], z1 = pos[i+2], x2 = pos[i+3], y2 = pos[i+4], z2 = pos[i+5], x3 = pos[i+6], y3 = pos[i+7], z3 = pos[i+8];
    volume += (x1*y2*z3 - x1*y3*z2 - x2*y1*z3 + x2*y3*z1 + x3*y1*z2 - x3*y2*z1);
  }
  if (volume < -1e-7) {
    for (let i = 0; i < pos.length; i += 9) {
      const x2 = pos[i+3], y2 = pos[i+4], z2 = pos[i+5], x3 = pos[i+6], y3 = pos[i+7], z3 = pos[i+8];
      pos[i+3] = x3; pos[i+4] = y3; pos[i+5] = z3; pos[i+6] = x2; pos[i+7] = y2; pos[i+8] = z2;
    }
    geometry.attributes.position.needsUpdate = true; geometry.computeVertexNormals(); return true;
  }
  return false;
}

function _parseOBJ(text) {
  const lines = text.split('\n'), allVertices = [], objects = []; let currentObject = { name: 'default', faces: [] };
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (line.startsWith('v ')) { const parts = line.split(/\s+/); allVertices.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])); }
    else if (line.startsWith('o ') || line.startsWith('g ')) { if (currentObject.faces.length > 0) objects.push(currentObject); currentObject = { name: line.substring(2).trim(), faces: [] }; }
    else if (line.startsWith('f ')) {
      const parts = line.split(/\s+/), vIndices = [];
      for (let j = 1; j < parts.length; j++) {
        if (!parts[j]) continue;
        let vIndex = parseInt(parts[j].split('/')[0]); vIndex = vIndex < 0 ? (allVertices.length / 3) + vIndex : vIndex - 1;
        vIndices.push(vIndex);
      }
      for (let j = 1; j < vIndices.length - 1; j++) currentObject.faces.push(vIndices[0], vIndices[j], vIndices[j+1]);
    }
  }
  if (currentObject.faces.length > 0) objects.push(currentObject);
  return objects.map(obj => {
    const uniqueVertices = [], vertexMap = new Map(), indices = [];
    for (let i = 0; i < obj.faces.length; i++) {
      const vIdx = obj.faces[i], vx = allVertices[vIdx * 3], vy = -allVertices[vIdx * 3 + 2], vz = allVertices[vIdx * 3 + 1], key = `${vx.toFixed(6)},${vy.toFixed(6)},${vz.toFixed(6)}`;
      if (vertexMap.has(key)) indices.push(vertexMap.get(key)); else { const newIdx = uniqueVertices.length / 3; uniqueVertices.push(vx, vy, vz); vertexMap.set(key, newIdx); indices.push(newIdx); }
    }
    const positions = new Float32Array(indices.length * 3);
    for (let i = 0; i < indices.length; i++) { const idx = indices[i]; positions[i*3] = uniqueVertices[idx*3]; positions[i*3+1] = uniqueVertices[idx*3+1]; positions[i*3+2] = uniqueVertices[idx*3+2]; }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    _fixWinding(geometry); geometry.computeVertexNormals(); return geometry;
  });
}

function _parseSTLBinary(arrayBuffer) {
  const view = new DataView(arrayBuffer); if (arrayBuffer.byteLength < 84) throw new Error('File STL troppo corto');
  const nTris = view.getUint32(80, true);
  const positions = new Float32Array(nTris * 9), normals = new Float32Array(nTris * 9);
  for (let i = 0; i < nTris; i++) {
    const start = 84 + i * 50; if (start + 50 > arrayBuffer.byteLength) break;
    const nx = view.getFloat32(start, true), ny = view.getFloat32(start + 4, true), nz = view.getFloat32(start + 8, true);
    for (let j = 0; j < 3; j++) {
      const vStart = start + 12 + j * 12, x = view.getFloat32(vStart, true), y = view.getFloat32(vStart + 4, true), z = view.getFloat32(vStart + 8, true);
      positions[i*9+j*3] = x; positions[i*9+j*3+1] = y; positions[i*9+j*3+2] = z;
      normals[i*9+j*3] = nx; normals[i*9+j*3+1] = ny; normals[i*9+j*3+2] = nz;
    }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  return geometry;
}
