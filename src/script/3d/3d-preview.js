let threeScene = null;
let threeCamera = null;
let threeRenderer = null;
let threeControls = null;
let threeMeshes = [];
let threeExtrusionLevels = {};
let threeVisibilityState = {};
let threeAnimationId = null;
let threeGridHelper = null;
let threeAmbientLight = null;
let threeDirectionalLight1 = null;
let threeDirectionalLight2 = null;
let threeViewportGizmo = null;
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
  const meshSnapshots = threeMeshes.map(mesh => {
    const matColor = (mesh.material && mesh.material.color) ? '#' + mesh.material.color.getHexString() : (mesh.userData.colorHex || '#ffffff');
    return {
      position: mesh.position.clone(), quaternion: mesh.quaternion.clone(), scale: mesh.scale.clone(), visible: mesh.visible, colorHex: matColor,
      isBooleanResult: mesh.userData.isBooleanResult || false, isSubtractResult: mesh.userData.isSubtractResult || false, hiddenByBoolean: mesh.userData.hiddenByBoolean || false,
    };
  });
  const extrusionLevelsData = {};
  for (const col in threeExtrusionLevels) { extrusionLevelsData[col] = threeExtrusionLevels[col].extrusion; }
  const state = { meshSnapshots: meshSnapshots, meshCount: threeMeshes.length, extrusionLevels: extrusionLevelsData, visibilityState: JSON.parse(JSON.stringify(threeVisibilityState || {})), graphics: JSON.parse(JSON.stringify(threeGraphicsSettings)) };
  S.history3D.push(state);
  if (S.history3D.length > 50) S.history3D.shift(); else S.historyIndex3D++;
}

function undo3D() {
  if (S.historyIndex3D > 0) { S.historyIndex3D--; restoreState3D(S.history3D[S.historyIndex3D]); toast('Annullato (3D)'); }
}

function redo3D() {
  if (S.historyIndex3D < S.history3D.length - 1) { S.historyIndex3D++; restoreState3D(S.history3D[S.historyIndex3D]); toast('Ripristinato (3D)'); }
}

function restoreState3D(state) {
  for (let i = state.meshCount; i < threeMeshes.length; i++) {
    const mesh = threeMeshes[i]; if (!mesh) continue; mesh.visible = false; mesh.userData.hiddenByBoolean = true;
  }
  if (state.meshSnapshots) {
    state.meshSnapshots.forEach((snap, i) => {
      const mesh = threeMeshes[i]; if (!mesh) return;
      mesh.position.copy(snap.position); mesh.quaternion.copy(snap.quaternion); mesh.scale.copy(snap.scale);
      if (mesh.material && snap.colorHex) mesh.material.color.set(snap.colorHex);
      mesh.userData.colorHex = snap.colorHex; mesh.userData.oldColorHex = null;
      mesh.visible = snap.visible; mesh.userData.hiddenByBoolean = snap.hiddenByBoolean || false;
    });
  }
  const oldExtrusion = {};
  for (const col in threeExtrusionLevels) oldExtrusion[col] = threeExtrusionLevels[col].extrusion;
  for (const col in state.extrusionLevels) oldExtrusion[col] = state.extrusionLevels[col];
  threeExtrusionLevels = {};
  threeMeshes.forEach(mesh => {
    if (!mesh || mesh.userData.hiddenByBoolean) return;
    const color = mesh.userData.colorHex || '#ffffff';
    if (!threeExtrusionLevels[color]) threeExtrusionLevels[color] = { extrusion: oldExtrusion[color] !== undefined ? oldExtrusion[color] : 20, meshes: [] };
    if (!threeExtrusionLevels[color].meshes.includes(mesh)) threeExtrusionLevels[color].meshes.push(mesh);
  });
  threeVisibilityState = JSON.parse(JSON.stringify(state.visibilityState));
  threeMeshes.forEach(mesh => {
    if (mesh.userData.hiddenByBoolean) return;
    const color = mesh.userData.colorHex || '#ffffff';
    if (threeVisibilityState[color] !== undefined) mesh.visible = threeVisibilityState[color];
  });
  threeGraphicsSettings = JSON.parse(JSON.stringify(state.graphics));
  const gridToggleBtn = document.getElementById('grid-toggle-btn'); if (gridToggleBtn) gridToggleBtn.style.color = threeGraphicsSettings.gridVisible ? 'var(--accent)' : 'var(--muted)';
  const bgColorDot = document.getElementById('bg-color-picker-dot'); if (bgColorDot) bgColorDot.style.background = threeGraphicsSettings.bgColor;
  if (threeGridHelper) threeGridHelper.visible = threeGraphicsSettings.gridVisible;
  if (threeScene) threeScene.background = new THREE.Color(threeGraphicsSettings.bgColor);
  if (threeAmbientLight) threeAmbientLight.intensity = threeGraphicsSettings.ambientIntensity;
  threeSelectionOrder = []; threeSelectedMesh = null;
  threeSelectionIndicator.forEach(ind => { if (threeScene) threeScene.remove(ind); });
  threeSelectionIndicator = [];
  if (threeTransformControls) {
    threeTransformControls.detach();
    if (threeTransformControls._pivot) { threeScene.remove(threeTransformControls._pivot); threeTransformControls._pivot = null; }
  }
  buildExtrusionControlsFromState(); refresh3DControlsUI(); update3DSelectionHUD(); if (threeControls) threeControls.update();
}

function open3DPreview() {
  try {
    const titleLogo = document.getElementById('main-title-logo');
    if (titleLogo) titleLogo.innerHTML = 'Letter<span>Forge</span> 3D';

    document.getElementById('preview-3d-overlay').style.display = 'block';
    init3DScene(); setup3DCanvasKeyboard(); build3DObjects(); start3DAnimation();
    setTimeout(() => {
      const btn = document.getElementById('toggle-transform-btn');
      if (btn) btn.style.color = threeTransformEnabled ? '#00ff88' : '#5a5a7a';
      update3DSelectionHUD(); initColorPresets();
    }, 150);
    S.history3D = []; S.historyIndex3D = -1; saveState3D();
  } catch (e) { console.error(e); toast('Errore anteprima 3D: ' + e.message); }
}

function close3DPreview() {
  customConfirm('Chiudere l\'anteprima 3D?', () => {
    if (threeAnimationId) cancelAnimationFrame(threeAnimationId);
    if (threeRenderer && threeRenderer.domElement) {
      threeRenderer.domElement.removeEventListener('click', on3DObjectClick);
      threeRenderer.domElement.removeEventListener('dblclick', on3DObjectDblClick);
      threeRenderer.domElement.removeEventListener('mousedown', on3DMousedown);
      window.removeEventListener('mousemove', on3DMousemove);
      window.removeEventListener('mouseup', on3DMouseup);
    }
    if (threeScene) {
      threeScene.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) { if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose()); else obj.material.dispose(); }
      });
      threeScene.clear();
    }
    if (threeRenderer) {
      const container = document.getElementById('preview-3d-canvas');
      if (container && threeRenderer.domElement.parentNode === container) container.removeChild(threeRenderer.domElement);
      threeRenderer.dispose(); threeRenderer = null;
    }
    threeMeshes = []; threeExtrusionLevels = {}; threeSelectionOrder = []; threeSelectedMesh = null;
    threeSelectionIndicator.forEach(ind => { if (threeScene) threeScene.remove(ind); }); threeSelectionIndicator = [];
    if (threeTransformControls) {
      threeTransformControls.detach();
      if (threeTransformControls._pivot) { threeScene.remove(threeTransformControls._pivot); threeTransformControls._pivot = null; }
      threeScene.remove(threeTransformControls); threeTransformControls.dispose(); threeTransformControls = null;
    }
    if (threeViewportGizmo) {
      threeViewportGizmo.dispose();
      threeViewportGizmo = null;
    }
    const hudEl = document.getElementById('sel3d-hud'); if (hudEl) hudEl.remove();
    document.getElementById('preview-3d-overlay').style.display = 'none';

    const actions3D = document.getElementById('title-bar-actions-3d');
    if (actions3D) actions3D.style.display = 'none';

    const titleLogo = document.getElementById('main-title-logo');
    if (titleLogo) titleLogo.innerHTML = 'Letter<span>Forge</span>';
  });
}

function init3DScene() {
  const container = document.getElementById('preview-3d-canvas');
  while (container.firstChild) container.removeChild(container.firstChild);
  threeScene = new THREE.Scene(); threeScene.background = new THREE.Color(0x1a1a22);
  const aspect = container.clientWidth / container.clientHeight;
  // Increase range for "infinite" zoom: 0.01 near to 1,000,000 far
  threeCamera = new THREE.PerspectiveCamera(60, aspect, 0.01, 1000000); threeCamera.position.set(0, 0, 800);
  // Enable logarithmicDepthBuffer for better depth precision at huge scales
  threeRenderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
  threeRenderer.setSize(container.clientWidth, container.clientHeight);
  threeRenderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(threeRenderer.domElement);
  threeControls = new THREE.OrbitControls(threeCamera, threeRenderer.domElement);
  threeControls.enableDamping = true; threeControls.dampingFactor = 0.1;
  threeControls.zoomSpeed = 1.2;
  threeControls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.DOLLY };
  threeRenderer.domElement.addEventListener('click', on3DObjectClick);
  threeRenderer.domElement.addEventListener('dblclick', on3DObjectDblClick);
  threeRenderer.domElement.addEventListener('mousedown', on3DMousedown);
  window.addEventListener('mousemove', on3DMousemove);
  window.addEventListener('mouseup', on3DMouseup);
  threeAmbientLight = new THREE.AmbientLight(0xffffff, 0.6); threeScene.add(threeAmbientLight);
  threeDirectionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8); threeDirectionalLight1.position.set(200, 300, 400); threeScene.add(threeDirectionalLight1);
  threeDirectionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4); threeDirectionalLight2.position.set(-200, -100, 200); threeScene.add(threeDirectionalLight2);
  threeGridHelper = new THREE.GridHelper(1000, 50, 0x333344, 0x222233); threeGridHelper.rotation.x = Math.PI / 2; threeScene.add(threeGridHelper);
  update3DGrid();
  threeTransformControls = new THREE.TransformControls(threeCamera, threeRenderer.domElement);
  threeTransformControls.setSize(0.8); threeTransformControls.setSpace('world'); threeTransformControls.setMode('translate');
  threeTransformControls.visible = false; threeScene.add(threeTransformControls);
  threeTransformControls.addEventListener('dragging-changed', e => threeControls.enabled = !e.value);
  threeTransformControls.addEventListener('objectChange', () => {
    const pivot = threeTransformControls._pivot; if (!pivot) return;
    const mode = threeTransformControls.getMode();

    if (!threeTransformControls._dragging) {
      threeTransformControls._pivotStartPos = pivot.position.clone();
      threeTransformControls._pivotStartScale = pivot.scale.clone();
      
      // Store initial state for all selected objects
      threeTransformControls._initialStates = threeSelectionOrder.map(m => ({
        mesh: m,
        pos: m.position.clone(),
        scale: m.scale.clone()
      }));
      
      threeTransformControls._dragging = true;
    }

    if (mode === 'translate') {
      const delta = new THREE.Vector3().subVectors(pivot.position, threeTransformControls._pivotStartPos);
      threeTransformControls._initialStates.forEach(state => {
        state.mesh.position.copy(state.pos).add(delta);
      });
    } else if (mode === 'scale') {
      let ratio = new THREE.Vector3(
        pivot.scale.x / threeTransformControls._pivotStartScale.x,
        pivot.scale.y / threeTransformControls._pivotStartScale.y,
        pivot.scale.z / threeTransformControls._pivotStartScale.z
      );
      
      // If locked, find the dominant axis change and apply it to all
      if (typeof threeScaleLocked !== 'undefined' && threeScaleLocked) {
        const dx = Math.abs(ratio.x - 1), dy = Math.abs(ratio.y - 1), dz = Math.abs(ratio.z - 1);
        let unifiedRatio = 1;
        if (dx >= dy && dx >= dz) unifiedRatio = ratio.x;
        else if (dy >= dx && dy >= dz) unifiedRatio = ratio.y;
        else unifiedRatio = ratio.z;
        
        ratio.set(unifiedRatio, unifiedRatio, unifiedRatio);
        pivot.scale.set(
          threeTransformControls._pivotStartScale.x * unifiedRatio,
          threeTransformControls._pivotStartScale.y * unifiedRatio,
          threeTransformControls._pivotStartScale.z * unifiedRatio
        );
      }
      
      threeTransformControls._initialStates.forEach(state => {
        state.mesh.scale.set(
          state.scale.x * ratio.x,
          state.scale.y * ratio.y,
          state.scale.z * ratio.z
        );
        
        const offset = new THREE.Vector3().subVectors(state.pos, threeTransformControls._pivotStartPos);
        offset.x *= ratio.x;
        offset.y *= ratio.y;
        offset.z *= ratio.z;
        state.mesh.position.copy(threeTransformControls._pivotStartPos).add(offset);
      });
    }

    // DINAMICALLY update wireframes (selection indicators) during drag
    threeSelectionIndicator.forEach(ind => {
      const target = ind.userData.targetMesh;
      if (target) {
        // Position update
        const bbox = new THREE.Box3().setFromObject(target);
        ind.position.copy(bbox.getCenter(new THREE.Vector3()));
        
        // Scale update for wireframe to match mesh scaling in real-time
        if (mode === 'scale') {
            const size = bbox.getSize(new THREE.Vector3());
            // Since BoxGeometry was created with size * 1.02, we need to adjust the ind.scale 
            // relative to how the mesh scale changed from the start of the drag.
            const meshStartScale = threeTransformControls._initialStates.find(s => s.mesh === target)?.scale;
            if (meshStartScale) {
                ind.scale.set(
                    target.scale.x / meshStartScale.x,
                    target.scale.y / meshStartScale.y,
                    target.scale.z / meshStartScale.z
                );
            }
        }
      }
    });
  });
  threeTransformControls.addEventListener('mouseUp', () => {
    if (threeTransformControls._pivot) {
      threeSelectionOrder.forEach(mesh => {
        if (mesh && mesh.userData.letterId !== undefined) {
          const l = S.letters.find(x => x.id === mesh.userData.letterId);
          if (l && l.isSTL) {
            l.pos3d = { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z };
            l.rot3d = { x: mesh.rotation.x, y: mesh.rotation.y, z: mesh.rotation.z };
            l.sca3d = { x: mesh.scale.x, y: mesh.scale.y, z: mesh.scale.z };
            l.x = (S.canvasW / 2) + mesh.position.x; l.y = (S.canvasH / 2) + mesh.position.z;
          }
        }
      });
      saveState3D(); 
      update3DPositionInputs(); 
      update3DScaleInputs();
      update3DGrid();
      
      // Mark that we just finished dragging to prevent on3DObjectClick from changing selection
      threeTransformControls._justFinishedDragging = true;
      setTimeout(() => { if (threeTransformControls) threeTransformControls._justFinishedDragging = false; }, 100);

      // REFRESH indicators (this recreates them with 1.0 scale and new geometry size)
      if (typeof updateSelectionIndicators === 'function') {
        updateSelectionIndicators();
      }
    }
    threeTransformControls._dragging = false; 
    threeTransformControls._pivotStartPos = null; 
    threeTransformControls._pivotStartScale = null;
    threeTransformControls._initialStates = null;
  });
  const resizeObserver = new ResizeObserver(() => {
    if (!threeCamera || !threeRenderer) return;
    const w = container.clientWidth, h = container.clientHeight;
    threeCamera.aspect = w / h; threeCamera.updateProjectionMatrix(); threeRenderer.setSize(w, h);
    if (threeViewportGizmo) threeViewportGizmo.update();
  });
  resizeObserver.observe(container);

  // Initialize Viewport Gizmo
  try {
    threeViewportGizmo = new ViewportGizmo(threeCamera, threeRenderer, {
      container: container,
      type: 'rounded-cube', // Angoli arrotondati come richiesto
      placement: 'top-right',
      size: 120,
      offset: { top: 20, right: 20, left: 20, bottom: 20 },
      resolution: 128,
      font: {
        family: 'Inter, sans-serif',
        weight: 'bold'
      },
      background: {
        enabled: true,
        color: 0x111115,
        opacity: 0.95,
        hover: { color: 0x1a1a22, opacity: 1 }
      },
      // Bordi e angoli scuri
      corners: {
        color: 0x2a2a2e,
        hover: { color: 0x3a3a3e }
      },
      edges: {
        color: 0x2a2a2e,
        hover: { color: 0x3a3a3e }
      },
      // Configurazione facce in Italiano - Tutto bianco su fondo scuro
      x: { label: 'Destra', color: 0x1a1a22, labelColor: 0xffffff },
      nx: { label: 'Sinistra', color: 0x1a1a22, labelColor: 0xffffff },
      y: { label: 'Sopra', color: 0x1a1a22, labelColor: 0xffffff },
      ny: { label: 'Sotto', color: 0x1a1a22, labelColor: 0xffffff },
      z: { label: 'Fronte', color: 0x1a1a22, labelColor: 0xffffff },
      nz: { label: 'Dietro', color: 0x1a1a22, labelColor: 0xffffff }
    });
    threeViewportGizmo.attachControls(threeControls);
  } catch (e) {
    console.error('Gizmo init error:', e);
  }
}

function setup3DCanvasKeyboard() {
  const canvas = document.getElementById('preview-3d-canvas'); if (!canvas) return;
  canvas.setAttribute('tabindex', '0');
  canvas.addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    if (e.key === 'Escape') close3DPreview();
    else if (e.key === 'Home') {
      if (threeControls && threeMeshes.length > 0) {
        const globalBBox = new THREE.Box3();
        threeMeshes.forEach(mesh => globalBBox.union(new THREE.Box3().setFromObject(mesh)));
        const size = new THREE.Vector3(); globalBBox.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = threeCamera.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.3;
        threeCamera.position.set(0, 0, cameraZ); threeControls.target.set(0, 0, 0); threeControls.update();
      }
    }
    else if (key === 'w') {
      if (threeTransformControls) {
        threeTransformControls.setMode('translate');
        const icon = document.getElementById('transform-mode-icon');
        if (icon) icon.textContent = 'M';
        const btn = document.getElementById('switch-transform-mode-btn');
        if (btn) btn.style.color = '#5a5a7a';
        toast('Modalità: Muovi');
      }
    }
    else if (key === 's') {
      if (threeTransformControls) {
        threeTransformControls.setMode('scale');
        const icon = document.getElementById('transform-mode-icon');
        if (icon) icon.textContent = 'S';
        const btn = document.getElementById('switch-transform-mode-btn');
        if (btn) btn.style.color = 'var(--accent)';
        toast('Modalità: Scala');
      }
    }
    else if (key === 'z') {
      if (typeof union3DObjects === 'function') union3DObjects();
    }
    else if (key === 'x') {
      if (typeof subtract3DObjects === 'function') subtract3DObjects();
    }
    else if (key === 'c') {
      if (typeof createPocket3D === 'function') createPocket3D();
    }
  });
  canvas.focus();
}

function start3DAnimation() {
  function animate() {
    if (!threeControls || !threeRenderer || !threeScene || !threeCamera) return;
    threeControls.update();
    if (threeTransformControls && threeTransformControls.visible) threeTransformControls.update();
    if (threeTransformControls && threeTransformControls._dragging) {
      update3DPositionInputs();
      update3DScaleInputs();
    }
    threeRenderer.render(threeScene, threeCamera);
    if (threeViewportGizmo) threeViewportGizmo.render();
    threeAnimationId = requestAnimationFrame(animate);
  }
  animate();
}

// Hook into render to update 3D preview when canvas changes
const originalRenderFunc = window.render;
window.render = function() {
  if (originalRenderFunc) originalRenderFunc();
  if (document.getElementById('preview-3d-overlay') && document.getElementById('preview-3d-overlay').style.display !== 'none') {
    // build3DObjects is in 3d-geometry.js
    if (typeof build3DObjects === 'function') setTimeout(build3DObjects, 100);
  }
};

function update3DGrid() {
  if (!threeScene) return;
  
  let maxDim = 1000;
  if (threeMeshes.length > 0) {
    const globalBBox = new THREE.Box3();
    let hasVisible = false;
    threeMeshes.forEach(mesh => {
      if (mesh.visible && !mesh.userData.hiddenByBoolean) {
        globalBBox.union(new THREE.Box3().setFromObject(mesh));
        hasVisible = true;
      }
    });
    
    if (hasVisible) {
      const size = new THREE.Vector3();
      globalBBox.getSize(size);
      // We want the grid to cover the area. Objects are centered around (0,0) in XY.
      maxDim = Math.max(size.x, size.y, 1000);
      maxDim *= 1.2; // Padding
    }
  }
  
  // Snap to steps of 500
  maxDim = Math.ceil(maxDim / 500) * 500;
  
  if (threeGridHelper && threeGridHelper.userData.gridSize === maxDim) return;

  const isVisible = threeGridHelper ? threeGridHelper.visible : threeGraphicsSettings.gridVisible;
  if (threeGridHelper) {
    threeScene.remove(threeGridHelper);
    if (threeGridHelper.geometry) threeGridHelper.geometry.dispose();
    if (threeGridHelper.material) threeGridHelper.material.dispose();
  }

  // Keep divisions reasonable. 50 divisions for 1000 units = 20 units/square.
  // We MUST ensure divisions is an EVEN number so the center lines are correctly drawn at (0,0).
  let divisions = Math.max(20, Math.floor(maxDim / 20));
  if (divisions % 2 !== 0) divisions++;
  
  threeGridHelper = new THREE.GridHelper(maxDim, divisions, 0x333344, 0x222233);
  threeGridHelper.rotation.x = Math.PI / 2;
  threeGridHelper.visible = isVisible;
  threeGridHelper.userData.gridSize = maxDim;
  threeScene.add(threeGridHelper);
}
