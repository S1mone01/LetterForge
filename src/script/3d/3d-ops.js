function union3DObjects() {
  if (threeSelectionOrder.length !== 2) { toast('Seleziona esattamente 2 oggetti per l\'unione (Shift+click)'); return; }
  const meshA = threeSelectionOrder[0], meshB = threeSelectionOrder[1];
  try {
    toast('Esecuzione unione in corso...');
    const colorA = meshA.material.color.getHex();
    if (window.OpenJSCADBridge && window.OpenJSCADBridge.initialized) {
      const resultMesh = window.OpenJSCADBridge.booleanOperation('union', meshA, meshB, colorA);
      if (!resultMesh) { toast('Errore: unione non ha prodotto geometria'); return; }
      meshA.visible = false; meshA.userData.hiddenByBoolean = true;
      meshB.visible = false; meshB.userData.hiddenByBoolean = true;
      resultMesh.userData = { isBooleanResult: true, isUnionResult: true, _hiddenTargetA: meshA, _hiddenTargetB: meshB, originalColor: colorA };
      const colorAHex = '#' + colorA.toString(16).padStart(6, '0');
      if (threeExtrusionLevels[colorAHex]) {
        const idxA = threeExtrusionLevels[colorAHex].meshes.indexOf(meshA); if (idxA !== -1) threeExtrusionLevels[colorAHex].meshes.splice(idxA, 1);
        const idxB = threeExtrusionLevels[colorAHex].meshes.indexOf(meshB); if (idxB !== -1) threeExtrusionLevels[colorAHex].meshes.splice(idxB, 1);
      }
      threeScene.add(resultMesh); threeMeshes.push(resultMesh);
      if (!threeExtrusionLevels[colorAHex]) { threeExtrusionLevels[colorAHex] = { extrusion: 10, meshes: [] }; if (threeVisibilityState[colorAHex] === undefined) threeVisibilityState[colorAHex] = true; }
      resultMesh.visible = threeVisibilityState[colorAHex]; resultMesh.userData.colorHex = colorAHex;
      threeExtrusionLevels[colorAHex].meshes.push(resultMesh);
      clear3DSelection(); saveState3D();
      toast(`✓ Unione completata!`); return;
    }
  } catch (e) { console.error(e); toast('Errore unione: ' + e.message); }
}

function subtract3DObjects() {
  if (threeSelectionOrder.length !== 2) { toast('Seleziona esattamente 2 oggetti per la sottrazione (Shift+click)'); return; }
  const cutter = threeSelectionOrder[0], target = threeSelectionOrder[1];
  try {
    toast('Sottrazione in corso...');
    const colorTarget = target.material.color.getHex();
    if (window.OpenJSCADBridge && window.OpenJSCADBridge.initialized) {
      const origScale = cutter.scale.clone(), origPos = cutter.position.clone();
      cutter.scale.z = origScale.z * 1.5;
      cutter.geometry.computeBoundingBox();
      cutter.position.z -= ((cutter.geometry.boundingBox.max.z - cutter.geometry.boundingBox.min.z) * cutter.scale.z * 0.15);
      cutter.position.x += 0.001; cutter.position.y += 0.001; cutter.updateMatrixWorld(true);
      const resultMesh = window.OpenJSCADBridge.booleanOperation('subtract', target, cutter, colorTarget);
      cutter.scale.copy(origScale); cutter.position.copy(origPos); cutter.updateMatrixWorld(true);
      if (!resultMesh) { toast('Errore: sottrazione non valida'); return; }
      target.visible = false; target.userData.hiddenByBoolean = true;
      const colorTargetHex = '#' + colorTarget.toString(16).padStart(6, '0');
      if (threeExtrusionLevels[colorTargetHex]) {
        const idx = threeExtrusionLevels[colorTargetHex].meshes.indexOf(target); if (idx !== -1) threeExtrusionLevels[colorTargetHex].meshes.splice(idx, 1);
      }
      resultMesh.userData = { isBooleanResult: true, isSubtractResult: true, _hiddenTarget: target, colorHex: colorTargetHex };
      threeScene.add(resultMesh); threeMeshes.push(resultMesh);
      if (!threeExtrusionLevels[colorTargetHex]) { threeExtrusionLevels[colorTargetHex] = { extrusion: 10, meshes: [] }; if (threeVisibilityState[colorTargetHex] === undefined) threeVisibilityState[colorTargetHex] = true; }
      resultMesh.visible = threeVisibilityState[colorTargetHex];
      threeExtrusionLevels[colorTargetHex].meshes.push(resultMesh);
      clear3DSelection(); saveState3D();
      toast(`✓ Sottrazione completata!`);
    }
  } catch (e) { console.error(e); toast('Errore sottrazione: ' + e.message); }
}

/**
 * createPocket3D — versione ibrida (SVG + STL/OBJ)
 *
 * Gestisce 4 combinazioni:
 *   A) sorgente SVG  + target SVG  → pipeline originale invariata
 *   B) sorgente 3D   + target SVG  → utensile da threeMeshToGeom3 + scale offset
 *   C) sorgente SVG  + target 3D   → utensile estrusione SVG traslato in world-space
 *   D) sorgente 3D   + target 3D   → entrambi in world-space, sottrazione diretta
 */
function createPocket3D() {
  if (threeSelectionOrder.length !== 2) {
    toast('Seleziona 2 oggetti: primo = utensile, secondo = target');
    return;
  }
  const sourceMesh = threeSelectionOrder[0];
  const targetMesh = threeSelectionOrder[1];

  try {
    toast('Creazione tasca in corso...');

    if (!window.OpenJSCADBridge || !window.OpenJSCADBridge.initialized) return;
    const jscad = window.OpenJSCADBridge.jscad;

    // ── Helper: risale la catena boolean per trovare originalPathD ────────────
    function getRootOriginalPathD(mesh) {
      if (mesh.geometry?.userData?.originalPathD)
        return mesh.geometry.userData.originalPathD;
      if (mesh.userData?._hiddenTarget)
        return getRootOriginalPathD(mesh.userData._hiddenTarget);
      if (mesh.userData?._hiddenTargetA)
        return getRootOriginalPathD(mesh.userData._hiddenTargetA);
      return null;
    }

    // ── Parametri UI ─────────────────────────────────────────────────────────
    const offsetValue   = parseFloat(document.getElementById('pocket-offset-input').value) || 2;
    const pocketDepth   = parseFloat(document.getElementById('pocket-depth-input').value)  || 5;
    const targetColorHex = targetMesh.userData.colorHex
                        || '#' + targetMesh.material.color.getHexString();
    
    // Calcoliamo il Bounding Box del target in world space per determinare il top
    const targetBB = new THREE.Box3().setFromObject(targetMesh);
    const targetTop = targetBB.max.z;
    const targetHeight = targetBB.max.z - targetBB.min.z;

    const sourcePathD = getRootOriginalPathD(sourceMesh);
    const targetPathD = getRootOriginalPathD(targetMesh);

    // ── BUILD CUTTER geom3 ────────────────────────────────────────────────────
    let cutterGeom3;
    let cutterIsWorldSpace;

    if (sourcePathD) {
      // ── Caso SVG: expand 2D → estrusione ──────────────
      const geom2    = window.OpenJSCADBridge.parseSVGPathToGeom2(sourcePathD);
      const expanded = jscad.expansions.expand(
        { delta: offsetValue, corners: 'round', segments: 32 },
        geom2
      );
      // Lo facciamo alto abbastanza da sporgere sopra il target
      cutterGeom3        = window.OpenJSCADBridge.extrudeGeom2ToGeom3(expanded, pocketDepth + 10);
      cutterIsWorldSpace = false;

    } else {
      // ── Caso STL/OBJ: conversione diretta + scale XY centrato ────────
      cutterGeom3 = window.OpenJSCADBridge.threeMeshToGeom3(sourceMesh);
      
      const sourceBB = new THREE.Box3().setFromObject(sourceMesh);
      const center = new THREE.Vector3();
      sourceBB.getCenter(center);
      
      const sizeX = sourceBB.max.x - sourceBB.min.x;
      const sizeY = sourceBB.max.y - sourceBB.min.y;
      const sizeZ = sourceBB.max.z - sourceBB.min.z;

      const scaleX = sizeX > 0 ? (sizeX + 2 * offsetValue) / sizeX : 1;
      const scaleY = sizeY > 0 ? (sizeY + 2 * offsetValue) / sizeY : 1;
      const scaleZ = sizeZ > 0 ? (pocketDepth + 10) / sizeZ : 1;
      
      // Scaliamo centrato rispetto al suo centro world
      cutterGeom3 = jscad.transforms.translate([-center.x, -center.y, -center.z], cutterGeom3);
      cutterGeom3 = jscad.transforms.scale([scaleX, scaleY, scaleZ], cutterGeom3);
      cutterGeom3 = jscad.transforms.translate([center.x, center.y, center.z], cutterGeom3);
      
      cutterIsWorldSpace = true;
    }

    // ── BUILD TARGET geom3 ────────────────────────────────────────────────────
    let targetGeom3;
    let targetIsWorldSpace;

    if (targetPathD) {
      const geom2 = window.OpenJSCADBridge.parseSVGPathToGeom2(targetPathD);
      const targetExtrusion = threeExtrusionLevels[targetColorHex]?.extrusion || 20;
      targetGeom3        = window.OpenJSCADBridge.extrudeGeom2ToGeom3(geom2, targetExtrusion);
      targetIsWorldSpace = false;
    } else {
      targetGeom3        = window.OpenJSCADBridge.threeMeshToGeom3(targetMesh);
      targetIsWorldSpace = true;
    }

    // ── ALLINEAMENTO del cutter ───────────────────────────────────────────────
    let cutterAligned;

    if (!cutterIsWorldSpace && !targetIsWorldSpace) {
      // A) SVG + SVG
      cutterAligned = jscad.transforms.translate(
        [
          sourceMesh.position.x - targetMesh.position.x + 0.001,
          sourceMesh.position.y - targetMesh.position.y + 0.001,
          targetHeight - pocketDepth
        ],
        cutterGeom3
      );
    } else if (cutterIsWorldSpace && !targetIsWorldSpace) {
      // B) STL + SVG
      // Il cutter è già in world space, il target è in local space SVG.
      const sourceBB = new THREE.Box3().setFromObject(sourceMesh);
      const center = new THREE.Vector3();
      sourceBB.getCenter(center);
      
      cutterAligned = jscad.transforms.translate(
        [
          -targetMesh.position.x + 0.001,
          -targetMesh.position.y + 0.001,
          0
        ],
        cutterGeom3
      );
      
      const newCutterHeight = pocketDepth + 10;
      const currentWorldBottom = center.z - (newCutterHeight / 2);
      const targetLocalTop = targetHeight; 
      const zShift = targetLocalTop - pocketDepth - currentWorldBottom;
      cutterAligned = jscad.transforms.translate([0, 0, zShift], cutterAligned);

    } else if (!cutterIsWorldSpace && targetIsWorldSpace) {
      // C) SVG + STL
      cutterAligned = jscad.transforms.translate(
        [
          sourceMesh.position.x + 0.001,
          sourceMesh.position.y + 0.001,
          targetTop - pocketDepth
        ],
        cutterGeom3
      );
    } else {
      // D) STL + STL
      const sourceBB = new THREE.Box3().setFromObject(sourceMesh);
      const center = new THREE.Vector3();
      sourceBB.getCenter(center);
      const newCutterHeight = pocketDepth + 10;
      const currentWorldBottom = center.z - (newCutterHeight / 2);
      const zShift = (targetTop - pocketDepth) - currentWorldBottom;
      cutterAligned = jscad.transforms.translate([0.001, 0.001, zShift], cutterGeom3);
    }

    // ── SOTTRAZIONE BOOLEANA ──────────────────────────────────────────────────
    const resultGeom3 = jscad.booleans.subtract(targetGeom3, cutterAligned);
    const resultGeo   = window.OpenJSCADBridge.geom3ToThreeGeometry(resultGeom3);
    const resultMesh  = new THREE.Mesh(resultGeo, targetMesh.material.clone());

    if (targetIsWorldSpace) {
      resultMesh.position.set(0, 0, 0);
    } else {
      resultMesh.position.copy(targetMesh.position);
    }

    resultMesh.userData = {
      isBooleanResult: true,
      isPocketResult:  true,
      colorHex:        targetColorHex,
      _hiddenTarget:   targetMesh
    };

    targetMesh.visible = false;
    targetMesh.userData.hiddenByBoolean = true;

    if (threeExtrusionLevels[targetColorHex]) {
      const idx = threeExtrusionLevels[targetColorHex].meshes.indexOf(targetMesh);
      if (idx !== -1) threeExtrusionLevels[targetColorHex].meshes.splice(idx, 1);
    }

    threeScene.add(resultMesh);
    threeMeshes.push(resultMesh);

    if (!threeExtrusionLevels[targetColorHex]) {
      const targetExtrusion = threeExtrusionLevels[targetColorHex]?.extrusion || 20;
      threeExtrusionLevels[targetColorHex] = { extrusion: targetExtrusion, meshes: [] };
      if (threeVisibilityState[targetColorHex] === undefined)
        threeVisibilityState[targetColorHex] = true;
    }
    resultMesh.visible = threeVisibilityState[targetColorHex] ?? true;
    threeExtrusionLevels[targetColorHex].meshes.push(resultMesh);

    clear3DSelection();
    saveState3D();
    toast('✓ Tasca creata!');

  } catch (e) {
    console.error(e);
    toast('Errore tasca: ' + e.message);
  }
}

function duplicate3DSelection() {
  if (threeSelectionOrder.length === 0) return;
  const newSels = [];
  threeSelectionOrder.forEach(mesh => {
    const clone = mesh.clone(); clone.position.x += 10;
    threeScene.add(clone); threeMeshes.push(clone);
    const cHex = mesh.userData.colorHex; if (threeExtrusionLevels[cHex]) threeExtrusionLevels[cHex].meshes.push(clone);
    newSels.push(clone);
  });
  threeSelectionOrder = newSels; updateSelectionIndicators(); saveState3D(); toast(`✓ Duplicato`);
}

function delete3DSelection() {
  if (threeSelectionOrder.length === 0) return;
  threeSelectionOrder.forEach(mesh => {
    mesh.visible = false; mesh.userData.hiddenByDelete = true;
    const cHex = mesh.userData.colorHex; if (threeExtrusionLevels[cHex]) { const idx = threeExtrusionLevels[cHex].meshes.indexOf(mesh); if (idx !== -1) threeExtrusionLevels[cHex].meshes.splice(idx, 1); }
  });
  clear3DSelection(); saveState3D(); toast(`✓ Eliminato`);
}

async function importSTL3D() {
  try {
    const result = await window.electronAPI.importSTLFile(); if (!result) return;
    const { name, data } = result, isOBJ = name.toLowerCase().endsWith('.obj');
    S.lastImportedName = name;
    const binaryString = atob(data), bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    let geometry = isOBJ ? _parseOBJ(new TextDecoder().decode(bytes)) : _parseSTLBinary(bytes.buffer);
    _processImportedGeometry(name, geometry);
  } catch (e) { toast('Errore: ' + e.message); }
}

function _collectTrisFromMesh(mesh) {
  mesh.updateMatrixWorld(true);
  const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  geo.applyMatrix4(mesh.matrixWorld);
  const pos = geo.attributes.position.array, tris = [];
  for (let i = 0; i < pos.length; i += 9) {
    const a = [pos[i], pos[i+1], pos[i+2]], b = [pos[i+3], pos[i+4], pos[i+5]], c = [pos[i+6], pos[i+7], pos[i+8]];
    if (a[0]===b[0]&&a[1]===b[1]&&a[2]===b[2]) continue; tris.push([a, b, c]);
  }
  geo.dispose(); return tris;
}

function _groupMeshesConnected() {
  if (!threeScene || threeMeshes.length === 0) return null;
  let active = threeMeshes.filter(m => threeScene.children.includes(m) && m.visible && !m.userData.isSubtracted);
  
  // Se c'è una selezione attiva in 3D, esporta solo quella
  if (typeof threeSelectionOrder !== 'undefined' && threeSelectionOrder.length > 0) {
    active = active.filter(m => threeSelectionOrder.includes(m));
  }
  
  if (!active.length) return null;
  const n = active.length, bboxes = active.map(m => { m.updateMatrixWorld(true); return new THREE.Box3().setFromObject(m); });
  const parent = Array.from({ length: n }, (_, i) => i);
  function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
  function unite(a, b) { parent[find(a)] = find(b); }
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (active[i].material.color.getHex() !== active[j].material.color.getHex()) continue;
    if (bboxes[i].intersectsBox(bboxes[j])) unite(i, j);
  }
  const rootMap = new Map();
  for (let i = 0; i < n; i++) { const r = find(i); if (!rootMap.has(r)) rootMap.set(r, []); rootMap.get(r).push(active[i]); }
  return Array.from(rootMap.values());
}

function _triNormal(a, b, c) {
  const ex=b[0]-a[0], ey=b[1]-a[1], ez=b[2]-a[2], fx=c[0]-a[0], fy=c[1]-a[1], fz=c[2]-a[2];
  let nx=ey*fz-ez*fy, ny=ez*fx-ex*fz, nz=ex*fy-ey*fx;
  const ln=Math.sqrt(nx*nx+ny*ny+nz*nz);
  return ln > 1e-10 ? [nx/ln, ny/ln, nz/ln] : [0, 0, 1];
}

function exportToSTL() {
  let active = threeMeshes.filter(m => threeScene.children.includes(m) && m.visible && !m.userData.isSubtracted);
  
  // Se c'è una selezione attiva in 3D, esporta solo quella
  if (typeof threeSelectionOrder !== 'undefined' && threeSelectionOrder.length > 0) {
    active = active.filter(m => threeSelectionOrder.includes(m));
  }
  
  if (!active.length) { 
    toast(typeof threeSelectionOrder !== 'undefined' && threeSelectionOrder.length > 0 ? 'La selezione non contiene elementi esportabili!' : 'Nessun elemento 3D visibile!'); 
    return; 
  }
  
  const tris = [];
  active.forEach(m => tris.push(..._collectTrisFromMesh(m)));
  if (!tris.length) return;

  const buf = new ArrayBuffer(84 + tris.length * 50), view = new DataView(buf);
  const header = `LetterForge Export`.padEnd(80, ' ');
  for (let i = 0; i < 80; i++) view.setUint8(i, header.charCodeAt(i) & 0xff);
  view.setUint32(80, tris.length, true);
  
  let offset = 84;
  tris.forEach(([a, b, c]) => {
    const [nx, ny, nz] = _triNormal(a, b, c);
    view.setFloat32(offset, nx, true); offset += 4;
    view.setFloat32(offset, ny, true); offset += 4;
    view.setFloat32(offset, nz, true); offset += 4;
    [a, b, c].forEach(v => {
      view.setFloat32(offset, v[0], true); offset += 4;
      view.setFloat32(offset, v[1], true); offset += 4;
      view.setFloat32(offset, v[2], true); offset += 4;
    });
    view.setUint16(offset, 0, true); offset += 2;
  });

  const blob = new Blob([buf], { type: 'application/octet-stream' }), 
        url = URL.createObjectURL(blob), 
        a = document.createElement('a');
  
  let filename = 'letterforge_design';
  if (S.currentProjectName) {
    filename = S.currentProjectName.replace(/\.json$/i, '');
  } else if (S.lastImportedName) {
    filename = S.lastImportedName.split('.').slice(0, -1).join('.') || S.lastImportedName;
  }
  
  a.href = url; a.download = `${filename}.stl`; 
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  toast(`STL esportato!`);
}

function exportTo3MF() {
  const groupsList = _groupMeshesConnected(); 
  if (!groupsList) { 
    toast(typeof threeSelectionOrder !== 'undefined' && threeSelectionOrder.length > 0 ? 'La selezione non contiene elementi esportabili!' : 'Nessun elemento 3D visibile!'); 
    return; 
  }

  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[i] = c;
  }
  function getCrc(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
    return (crc ^ 0xffffffff) >>> 0;
  }

  let objectsXml = '', buildItemsXml = '', objId = 1;
  groupsList.forEach((meshes) => {
    const colorHex = meshes[0].material.color.getHexString();
    const tris = [];
    meshes.forEach(m => tris.push(..._collectTrisFromMesh(m)));
    if (!tris.length) return;

    const vertMap = new Map(), verts = [];
    let vi = 0;
    function weld(v) { 
      const k = v[0].toFixed(3) + ',' + v[1].toFixed(3) + ',' + v[2].toFixed(3);
      if (vertMap.has(k)) return vertMap.get(k);
      verts.push(v); vertMap.set(k, vi); return vi++;
    }
    const faces = [];
    tris.forEach(([a, b, c]) => {
      const ia = weld(a), ib = weld(b), ic = weld(c);
      if (ia !== ib && ib !== ic && ia !== ic) faces.push([ia, ib, ic]);
    });
    if (!faces.length) return;

    objectsXml += `<object id="${objId}" type="model" name="color_${colorHex}">
      <mesh>
        <vertices>
          ${verts.map(v => `<vertex x="${v[0].toFixed(3)}" y="${v[1].toFixed(3)}" z="${v[2].toFixed(3)}"/>`).join('\n          ')}
        </vertices>
        <triangles>
          ${faces.map(f => `<triangle v1="${f[0]}" v2="${f[1]}" v3="${f[2]}"/>`).join('\n          ')}
        </triangles>
      </mesh>
    </object>\n`;
    buildItemsXml += `<item objectid="${objId}"/>\n`;
    objId++;
  });

  const modelXml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    ${objectsXml}
  </resources>
  <build>
    ${buildItemsXml}
  </build>
</model>`;

  const files = [
    { name: '3D/3dmodel.model', content: modelXml },
    { name: '_rels/.rels', content: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>` },
    { name: '[Content_Types].xml', content: `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>` }
  ];

  files.forEach(f => {
    f.data = new TextEncoder().encode(f.content);
    f.crc = getCrc(f.data);
    f.nameBuf = new TextEncoder().encode(f.name);
  });

  let offset = 0;
  const totalSize = files.reduce((acc, f) => acc + 30 + f.nameBuf.length + f.data.length + 46 + f.nameBuf.length, 0) + 22;
  const zip = new Uint8Array(totalSize);
  const v = new DataView(zip.buffer);

  files.forEach(f => {
    f.headerOffset = offset;
    v.setUint32(offset, 0x04034b50, true); offset += 4; 
    v.setUint16(offset, 20, true); offset += 2; 
    v.setUint16(offset, 0, true); offset += 2; 
    v.setUint16(offset, 0, true); offset += 2; 
    v.setUint16(offset, 0, true); offset += 2; 
    v.setUint16(offset, 0, true); offset += 2; 
    v.setUint32(offset, f.crc, true); offset += 4; 
    v.setUint32(offset, f.data.length, true); offset += 4; 
    v.setUint32(offset, f.data.length, true); offset += 4; 
    v.setUint16(offset, f.nameBuf.length, true); offset += 2; 
    v.setUint16(offset, 0, true); offset += 2; 
    zip.set(f.nameBuf, offset); offset += f.nameBuf.length;
    zip.set(f.data, offset); offset += f.data.length;
  });

  const cdStart = offset;
  files.forEach(f => {
    v.setUint32(offset, 0x02014b50, true); offset += 4; 
    v.setUint16(offset, 20, true); offset += 2; 
    v.setUint16(offset, 20, true); offset += 2; 
    v.setUint16(offset, 0, true); offset += 2; 
    v.setUint16(offset, 0, true); offset += 2; 
    v.setUint16(offset, 0, true); offset += 2; 
    v.setUint16(offset, 0, true); offset += 2; 
    v.setUint32(offset, f.crc, true); offset += 4;
    v.setUint32(offset, f.data.length, true); offset += 4;
    v.setUint32(offset, f.data.length, true); offset += 4;
    v.setUint16(offset, f.nameBuf.length, true); offset += 2;
    v.setUint16(offset, 0, true); offset += 2; 
    v.setUint16(offset, 0, true); offset += 2; 
    v.setUint16(offset, 0, true); offset += 2; 
    v.setUint16(offset, 0, true); offset += 2; 
    v.setUint32(offset, 0, true); offset += 4; 
    v.setUint32(offset, f.headerOffset, true); offset += 4; 
    zip.set(f.nameBuf, offset); offset += f.nameBuf.length;
  });
  const cdSize = offset - cdStart;

  v.setUint32(offset, 0x06054b50, true); offset += 4; 
  v.setUint16(offset, 0, true); offset += 2; 
  v.setUint16(offset, 0, true); offset += 2; 
  v.setUint16(offset, files.length, true); offset += 2; 
  v.setUint16(offset, files.length, true); offset += 2; 
  v.setUint32(offset, cdSize, true); offset += 4; 
  v.setUint32(offset, cdStart, true); offset += 4; 
  v.setUint16(offset, 0, true); offset += 2; 

  const blob = new Blob([zip], { type: 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  
  let filename = 'design_multicolore';
  if (S.currentProjectName) {
    filename = S.currentProjectName.replace(/\.json$/i, '');
  } else if (S.lastImportedName) {
    filename = S.lastImportedName.split('.').slice(0, -1).join('.') || S.lastImportedName;
  }
  
  a.href = url; a.download = `${filename}.3mf`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  toast(`3MF multi-colore esportato correttamente!`);
}

async function exportTo3MFAndOpenInBambu() {
  exportTo3MF();
}
