let threeTransformEnabled = true;

const COLOR_PRESETS = [
  { name: 'Bianco', hex: '#ffffff' }, { name: 'Nero', hex: '#111111' }, { name: 'Rosso', hex: '#ff0000' }, { name: 'Verde', hex: '#00cc00' }, { name: 'Blu', hex: '#0066ff' },
  { name: 'Giallo', hex: '#ffcc00' }, { name: 'Arancione', hex: '#ff6b35' }, { name: 'Viola', hex: '#8800ff' }, { name: 'Rosa', hex: '#ff66b2' }, { name: 'Ciano', hex: '#00cccc' },
];

function toggleColorPalette() {
  const presetsContainer = document.getElementById('color-presets');
  if (presetsContainer) presetsContainer.style.display = (presetsContainer.style.display === 'grid' || presetsContainer.style.display === 'block') ? 'none' : 'grid';
}

function initColorPresets() {
  const container = document.getElementById('color-presets'); if (!container) return;
  container.innerHTML = '';
  COLOR_PRESETS.forEach(preset => {
    const btn = document.createElement('button'); btn.title = preset.name; btn.style.cssText = `width:100%;aspect-ratio:1;border-radius:4px;border:2px solid var(--border);cursor:pointer;transition:all 0.2s;position:relative;background:${preset.hex};`;
    if (preset.hex.toLowerCase() === '#ffffff' || preset.hex.toLowerCase() === '#ffcc00') btn.style.borderColor = '#444';
    btn.onmouseover = () => { btn.style.transform = 'scale(1.1)'; btn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)'; };
    btn.onmouseout = () => { btn.style.transform = 'scale(1)'; btn.style.boxShadow = 'none'; };
    btn.onclick = (e) => { e.stopPropagation(); update3DObjectColor(preset.hex); finalize3DObjectColor(); };
    container.appendChild(btn);
  });
}

function getColorName(hex) {
  if (!hex) return 'Bianco';
  const normalized = hex.toLowerCase();
  for (const preset of COLOR_PRESETS) if (preset.hex.toLowerCase() === normalized) return preset.name;
  return hex;
}

function update3DObjectColor(color) {
  if (threeSelectionOrder.length === 0) return;
  threeSelectionOrder.forEach(mesh => {
    if (!mesh || !mesh.material) return;
    if (!mesh.userData.oldColorHex) mesh.userData.oldColorHex = mesh.userData.colorHex || '#' + mesh.material.color.getHexString();
    mesh.material.color.set(color);
  });
  const textInput = document.getElementById('color3d-text'); if (textInput) textInput.value = getColorName(color);
}

function finalize3DObjectColor() {
  if (threeSelectionOrder.length === 0) return;
  const newColor = '#' + threeSelectionOrder[0].material.color.getHexString();
  threeSelectionOrder.forEach(mesh => {
    if (!mesh || !mesh.material) return;
    const oldColor = mesh.userData.oldColorHex || mesh.userData.colorHex;
    if (oldColor && oldColor !== newColor) { updateExtrusionColor(oldColor, newColor); updateCanvasLetterColorFrom3D(newColor, oldColor); }
    else mesh.userData.colorHex = newColor;
    mesh.userData.oldColorHex = null;
  });
  updateSelectionIndicators();
  const presetsContainer = document.getElementById('color-presets'); if (presetsContainer) presetsContainer.style.display = 'none';
  saveState3D();
}

function updateCanvasLetterColorFrom3D(newColor, oldColor) {
  if (threeSelectionOrder.length === 0) return;
  const mesh = threeSelectionOrder[0]; if (!mesh) return;
  if (mesh.userData.groupId) {
    S.letters.forEach(letter => { if (letter.groupId === mesh.userData.groupId && letter.fill === oldColor) { letter.fill = newColor; } });
  } else if (mesh.userData.bbox2D) {
    const mB = mesh.userData.bbox2D, mCX = mB.x + (mB.w||0)/2, mCY = mB.y + (mB.h||0)/2;
    S.letters.forEach(letter => {
      if (letter.fill === oldColor) {
        const lCX = letter.x, lCY = letter.y; // Simplified center check
        if (Math.abs(lCX - mCX) < 5 && Math.abs(lCY - mCY) < 5) letter.fill = newColor;
      }
    });
  }
}

function updateExtrusionColor(oldColor, newColor) {
  if (!threeExtrusionLevels[oldColor]) return;
  const changedMeshes = threeSelectionOrder.filter(m => m.userData.colorHex === oldColor || m.userData.oldColorHex === oldColor);
  if (changedMeshes.length === 0) return;
  changedMeshes.forEach(mesh => {
    mesh.userData.colorHex = newColor; mesh.userData.oldColorHex = null;
    const idx = threeExtrusionLevels[oldColor].meshes.indexOf(mesh); if (idx !== -1) threeExtrusionLevels[oldColor].meshes.splice(idx, 1);
    if (!threeExtrusionLevels[newColor]) { threeExtrusionLevels[newColor] = { extrusion: 20, meshes: [] }; threeVisibilityState[newColor] = true; }
    threeExtrusionLevels[newColor].meshes.push(mesh);
  });
  if (threeExtrusionLevels[oldColor].meshes.length === 0) { delete threeExtrusionLevels[oldColor]; delete threeVisibilityState[oldColor]; }
  buildExtrusionControlsFromState();
}

function buildExtrusionControlsFromState() {
  const container = document.getElementById('extrusion-controls'); if (!container) return;
  container.innerHTML = '';
  const colors = Object.keys(threeExtrusionLevels);
  if (colors.length === 0) { container.innerHTML = '<div style="color:var(--muted);font-size:10px;text-align:center;padding:12px">Nessun colore</div>'; return; }
  colors.forEach(color => {
    if (threeExtrusionLevels[color].meshes.length === 0) return;
    const controlDiv = document.createElement('div'); controlDiv.style.cssText = 'margin-bottom:6px;padding:6px 8px;background:var(--panel2);border-radius:5px;border:1px solid var(--border);';
    controlDiv.dataset.color = color;
    const isVisible = threeVisibilityState[color] !== false;
    controlDiv.innerHTML = `<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;"><div style="width:14px;height:14px;border-radius:3px;background:${color};border:1px solid var(--border);flex-shrink:0;"></div><span style="flex:1;font-size:10px;font-weight:600;color:var(--text);">${getColorName(color)}</span><button style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;background:transparent;border:1px solid var(--border);border-radius:4px;cursor:pointer;color:var(--text);font-size:14px;padding:0;flex-shrink:0;opacity:${isVisible?'1':'0.5'}" onclick="toggleColorVisibility('${color}')">${isVisible?'👁':'👁‍🗨'}</button></div><div style="display:flex;align-items:center;gap:6px;"><input type="range" min="0" max="100" value="${threeExtrusionLevels[color].extrusion}" style="flex:1;accent-color:var(--accent);"><input type="number" min="0" max="200" value="${threeExtrusionLevels[color].extrusion}" style="width:52px;padding:4px 6px;background:var(--panel2);border:1px solid var(--border);color:var(--text);font-family:'DM Mono',monospace;font-size:10px;border-radius:4px;outline:none;text-align:center;flex-shrink:0;"><span style="color:var(--muted);font-size:10px;min-width:16px;">px</span></div>`;
    const slider = controlDiv.querySelector('input[type="range"]'), num = controlDiv.querySelector('input[type="number"]');
    slider.oninput = () => { num.value = slider.value; updateExtrusion(color, parseFloat(slider.value), true); };
    slider.onchange = () => updateExtrusion(color, parseFloat(slider.value));
    num.oninput = () => { slider.value = num.value; updateExtrusion(color, parseFloat(num.value), true); };
    num.onchange = () => updateExtrusion(color, parseFloat(num.value));
    container.appendChild(controlDiv);
  });
}

function buildExtrusionControls(colorGroups) {
  // Just use buildExtrusionControlsFromState as it handles current state correctly
  buildExtrusionControlsFromState();
}

function updateExtrusion(color, newDepth, noSave = false) {
  if (!threeExtrusionLevels[color]) return;
  threeExtrusionLevels[color].extrusion = newDepth;
  threeExtrusionLevels[color].meshes.forEach(mesh => {
    if (mesh.userData && mesh.userData.isBooleanResult) return;
    if (mesh.geometry && mesh.geometry.userData && mesh.geometry.userData.originalGeom2) {
      try {
        const newGeom3 = window.OpenJSCADBridge.extrudeGeom2ToGeom3(mesh.geometry.userData.originalGeom2, newDepth);
        if (newGeom3) {
          const newGeo = window.OpenJSCADBridge.geom3ToThreeGeometry(newGeom3);
          newGeo.userData = { ...mesh.geometry.userData, csgDepth: newDepth };
          mesh.geometry.dispose(); mesh.geometry = newGeo;
        }
      } catch (e) {}
    }
  });
  if (!noSave) saveState3D();
}

function toggleColorVisibility(color) {
  if (!threeExtrusionLevels[color]) return;
  threeVisibilityState[color] = !(threeVisibilityState[color] !== false);
  const isV = threeVisibilityState[color];
  threeExtrusionLevels[color].meshes.forEach(mesh => {
    mesh.visible = isV; if (!isV) { const idx = threeSelectionOrder.indexOf(mesh); if (idx !== -1) threeSelectionOrder.splice(idx, 1); }
  });
  if (!isV) { clear3DSelection(); updateSelectionIndicators(); }
  buildExtrusionControlsFromState();
  saveState3D();
}

function toggleTransformControls() {
  threeTransformEnabled = !threeTransformEnabled;
  const btn = document.getElementById('toggle-transform-btn');
  if (threeTransformEnabled) {
    btn.style.color = '#00ff88'; if (threeTransformControls && threeSelectionOrder.length > 0) { threeTransformControls.visible = true; updateSelectionIndicators(); }
  } else { btn.style.color = '#5a5a7a'; if (threeTransformControls) threeTransformControls.visible = false; }
}

function toggle3DGrid(visible) {
  threeGraphicsSettings.gridVisible = (typeof visible === 'boolean') ? visible : !threeGraphicsSettings.gridVisible;
  if (threeGridHelper) threeGridHelper.visible = threeGraphicsSettings.gridVisible;
  const btn = document.getElementById('grid-toggle-btn'); if (btn) btn.style.color = threeGraphicsSettings.gridVisible ? 'var(--accent)' : 'var(--muted)';
  saveState3D();
}

function change3DBgColor(color) {
  threeGraphicsSettings.bgColor = color; if (threeScene) threeScene.background = new THREE.Color(color);
  const dot = document.getElementById('bg-color-picker-dot'); if (dot) dot.style.background = color;
  saveState3D();
}

function change3DAmbientLight(value) {
  const intensity = value / 100; threeGraphicsSettings.ambientIntensity = intensity;
  const el = document.getElementById('ambient-light-value'); if(el) el.textContent = value + '%';
  if (threeAmbientLight) threeAmbientLight.intensity = intensity;
  saveState3D();
}

function change3DSpecular(value) {
  const spec = new THREE.Color(`hsl(0, 0%, ${value}%)`); threeGraphicsSettings.specular = spec.getHex();
  const el = document.getElementById('specular-value'); if(el) el.textContent = value + '%';
  threeMeshes.forEach(m => { if (m.material) m.material.specular = spec; });
  saveState3D();
}

function change3DShininess(value) {
  const shine = parseFloat(value); threeGraphicsSettings.shininess = shine;
  const el = document.getElementById('shininess-value'); if(el) el.textContent = value + '%';
  threeMeshes.forEach(m => { if (m.material) m.material.shininess = shine; });
  saveState3D();
}

function refresh3DControlsUI() {
  buildExtrusionControlsFromState();
}
