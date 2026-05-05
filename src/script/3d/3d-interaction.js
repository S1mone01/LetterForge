let threeRaycaster = new THREE.Raycaster();
let threeMouse = new THREE.Vector2();
let threeSelectionIndicator = [];
let threeSelectedMesh = null;
let threeSelectionOrder = [];

function on3DObjectClick(event) {
  if (!threeScene || !threeCamera || !threeRenderer) return;
  const rect = threeRenderer.domElement.getBoundingClientRect();
  threeMouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  threeMouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  threeRaycaster.setFromCamera(threeMouse, threeCamera);
  const intersects = threeRaycaster.intersectObjects(threeMeshes.filter(m => m.visible), false);

  if (intersects.length > 0) {
    const clickedMesh = intersects[0].object;
    if (clickedMesh.userData.groupId) {
      clear3DSelection();
      const groupMeshes = threeMeshes.filter(m => m.userData.groupId === clickedMesh.userData.groupId && m.visible);
      groupMeshes.forEach(mesh => threeSelectionOrder.push(mesh));
      addSelectionIndicatorForGroup(groupMeshes);
      update3DSelectionHUD();
    } else {
      const existingIndex = threeSelectionOrder.indexOf(clickedMesh);
      if (event.shiftKey) {
        if (existingIndex === -1) { threeSelectionOrder.push(clickedMesh); addSelectionIndicator(clickedMesh); }
        else { threeSelectionOrder.splice(existingIndex, 1); clear3DSelection(); threeSelectionOrder.forEach(m => addSelectionIndicator(m)); }
      } else {
        clear3DSelection(); threeSelectionOrder.push(clickedMesh); addSelectionIndicator(clickedMesh);
      }
      update3DSelectionHUD();
    }
  } else { clear3DSelection(); }
}

function on3DObjectDblClick(event) { clear3DSelection(); toast('Selezione annullata'); }

function addSelectionIndicator(mesh) {
  const bbox = new THREE.Box3().setFromObject(mesh);
  const size = bbox.getSize(new THREE.Vector3()), center = bbox.getCenter(new THREE.Vector3());
  const isFirst = threeSelectionOrder.indexOf(mesh) === 0;
  const color = isFirst ? 0x00ff88 : 0xff6b35;
  const geometry = new THREE.BoxGeometry(size.x * 1.02, size.y * 1.02, size.z * 1.02);
  const wireframe = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: color, linewidth: 2 }));
  wireframe.position.copy(center); wireframe.userData = { targetMesh: mesh, selectionRole: isFirst ? 'cutter' : 'target' };
  threeScene.add(wireframe); threeSelectionIndicator.push(wireframe);

  if (isFirst && threeTransformControls && threeTransformEnabled) {
    if (threeTransformControls._pivot) threeScene.remove(threeTransformControls._pivot);
    const pivot = new THREE.Object3D(); 
    pivot.position.copy(center); 
    pivot.scale.copy(mesh.scale); // FIX: Inherit current scale
    pivot.userData.targetMesh = mesh;
    threeScene.add(pivot); threeTransformControls._pivot = pivot;
    threeTransformControls._pivotStartPos = pivot.position.clone(); 
    threeTransformControls._pivotStartScale = pivot.scale.clone();
    threeTransformControls._meshStartPos = mesh.position.clone();
    threeTransformControls._meshStartScale = mesh.scale.clone();
    threeTransformControls.attach(pivot); threeTransformControls.visible = true;
  } else if (threeSelectionOrder.length > 1 && threeTransformControls && threeTransformControls._pivot) {
    const firstMesh = threeSelectionOrder[0];
    if (firstMesh && firstMesh.visible) {
      const firstBbox = new THREE.Box3().setFromObject(firstMesh);
      threeTransformControls._pivot.position.copy(firstBbox.getCenter(new THREE.Vector3()));
    }
  }
}

function addSelectionIndicatorForGroup(meshes) {
  const combinedBBox = new THREE.Box3(); meshes.forEach(mesh => combinedBBox.union(new THREE.Box3().setFromObject(mesh)));
  const size = combinedBBox.getSize(new THREE.Vector3()), center = combinedBBox.getCenter(new THREE.Vector3());
  const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
  const wireframe = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: 0x00ff88, linewidth: 2 }));
  wireframe.position.copy(center); wireframe.userData.targetMeshes = meshes;
  threeScene.add(wireframe); threeSelectionIndicator.push(wireframe);
}

function selectAll3D() {
  if (!threeMeshes || threeMeshes.length === 0) return;
  threeSelectionIndicator.forEach(ind => { if (threeScene) threeScene.remove(ind); ind.geometry.dispose(); ind.material.dispose(); });
  threeSelectionIndicator = []; threeSelectionOrder = [];
  if (threeTransformControls) { threeTransformControls.detach(); threeTransformControls.visible = false; if (threeTransformControls._pivot) { threeScene.remove(threeTransformControls._pivot); threeTransformControls._pivot = null; } }
  threeMeshes.filter(m => m.visible).forEach(mesh => threeSelectionOrder.push(mesh));
  updateSelectionIndicators();
  toast(`${threeSelectionOrder.length} oggetti selezionati ✓`);
}

function clear3DSelection() {
  threeSelectionIndicator.forEach(ind => { if (threeScene) threeScene.remove(ind); ind.geometry.dispose(); ind.material.dispose(); });
  threeSelectionIndicator = []; threeSelectionOrder = [];
  if (threeTransformControls) {
    threeTransformControls.detach(); threeTransformControls.visible = false;
    if (threeTransformControls._pivot) { threeScene.remove(threeTransformControls._pivot); threeTransformControls._pivot = null; }
    threeTransformControls._pivotStartPos = null; threeTransformControls._meshStartPos = null;
  }
  update3DSelectionHUD();
}

function update3DSelectionHUD() {
  let hud = document.getElementById('sel3d-hud');
  if (!hud) {
    hud = document.createElement('div'); hud.id = 'sel3d-hud';
    hud.style.cssText = 'position:absolute;bottom:16px;left:50%;transform:translateX(-50%);display:flex;gap:10px;align-items:center;z-index:200;pointer-events:none;';
    const canvas3d = document.getElementById('preview-3d-canvas'); if (canvas3d) canvas3d.appendChild(hud);
  }
  if (threeSelectionOrder.length === 0) {
    hud.innerHTML = '<div style="background:rgba(0,0,0,.6);color:#5a5a7a;padding:6px 14px;border-radius:20px;font-size:11px;font-family:DM Mono,monospace;border:1px solid #2a2a3a;">Click oggetto per selezionare · Trascina le frecce per muovere</div>';
    update3DPositionInputs(); update3DScaleInputs(); update3DColorInputs(); return;
  }
  let html = `<div style="background:rgba(200,255,0,.1);color:#c8ff00;padding:6px 14px;border-radius:20px;font-size:11px;font-family:DM Mono,monospace;border:1px solid #c8ff00;">${threeSelectionOrder.length} oggetti selezionati</div>`;
  if (threeSelectionOrder.length === 2) html += '<div style="background:rgba(0,255,136,.12);color:#00ff88;padding:6px 14px;border-radius:20px;font-size:11px;font-family:DM Mono,monospace;border:1px solid #00ff88;">Unisci/Sottrai disponibile</div>';
  if (threeSelectionOrder.length > 1) html += '<div style="background:rgba(0,0,0,.5);color:#8a8a9a;padding:6px 14px;border-radius:20px;font-size:11px;font-family:DM Mono,monospace;border:1px dashed #3a3a4a;">Cambia colore per tutti</div>';
  hud.innerHTML = html;
  update3DPositionInputs(); update3DScaleInputs(); update3DColorInputs();
}

function updateSelectionIndicators() {
  threeSelectionIndicator.forEach(ind => { if (threeScene) threeScene.remove(ind); ind.geometry.dispose(); ind.material.dispose(); });
  threeSelectionIndicator = [];
  const selectionColors = [0x00ff88, 0xff6b35, 0xc8ff00, 0x00ccff, 0xff66b2, 0x9933ff, 0xffcc00, 0x00ffcc, 0xff4444, 0x44ff44];
  threeSelectionOrder.forEach((mesh, idx) => {
    const bbox = new THREE.Box3().setFromObject(mesh);
    const size = bbox.getSize(new THREE.Vector3()), center = bbox.getCenter(new THREE.Vector3());
    const wireframe = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x * 1.02, size.y * 1.02, size.z * 1.02)), new THREE.LineBasicMaterial({ color: selectionColors[idx % selectionColors.length], linewidth: 2 }));
    wireframe.position.copy(center); wireframe.userData = { targetMesh: mesh, selectionIndex: idx };
    threeScene.add(wireframe); threeSelectionIndicator.push(wireframe);
    if (idx === 0 && threeTransformControls && threeTransformEnabled) {
      if (threeTransformControls._pivot) threeScene.remove(threeTransformControls._pivot);
      const pivot = new THREE.Object3D(); pivot.position.copy(center); 
      pivot.scale.copy(mesh.scale); // Keep scale in sync
      pivot.userData.targetMesh = mesh;
      threeScene.add(pivot); threeTransformControls._pivot = pivot;
      threeTransformControls._pivotStartPos = pivot.position.clone(); 
      threeTransformControls._pivotStartScale = pivot.scale.clone();
      threeTransformControls._meshStartPos = mesh.position.clone();
      threeTransformControls._meshStartScale = mesh.scale.clone();
      threeTransformControls.attach(pivot); threeTransformControls.visible = true;
    }
  });
  if (threeSelectionOrder.length === 0 && threeTransformControls) {
    threeTransformControls.detach(); threeTransformControls.visible = false;
    if (threeTransformControls._pivot) { threeScene.remove(threeTransformControls._pivot); threeTransformControls._pivot = null; }
  }
  update3DSelectionHUD();
}

function update3DObjectPosition(axis, value) {
  if (threeSelectionOrder.length === 0) return;
  const mesh = threeSelectionOrder[0]; if (!mesh) return;
  switch(axis) { case 'x': mesh.position.x = value; break; case 'y': mesh.position.y = value; break; case 'z': mesh.position.z = value; break; }
  if (threeTransformControls && threeTransformControls._pivot) {
    threeTransformControls._pivot.position[axis] = value; threeTransformControls._pivotStartPos[axis] = value; threeTransformControls._meshStartPos[axis] = value;
  }
  updateSelectionIndicators(); saveState3D();
}

function update3DObjectScale(axis, value) {
  if (threeSelectionOrder.length === 0) return;
  const mesh = threeSelectionOrder[0]; if (!mesh) return;
  switch(axis) { case 'x': mesh.scale.x = value; break; case 'y': mesh.scale.y = value; break; case 'z': mesh.scale.z = value; break; }
  if (threeTransformControls && threeTransformControls._pivot) {
    threeTransformControls._pivot.scale[axis] = value; 
    threeTransformControls._pivotStartScale[axis] = value; 
    threeTransformControls._meshStartScale[axis] = value;
  }
  updateSelectionIndicators(); saveState3D();
}

function update3DPositionInputs() {
  const xInput = document.getElementById('pos3d-x'), yInput = document.getElementById('pos3d-y'), zInput = document.getElementById('pos3d-z');
  if (threeSelectionOrder.length > 0) {
    const mesh = threeSelectionOrder[0]; if (mesh) { if (xInput) xInput.value = Math.round(mesh.position.x); if (yInput) yInput.value = Math.round(mesh.position.y); if (zInput) zInput.value = Math.round(mesh.position.z); }
  } else { if (xInput) xInput.value = 0; if (yInput) yInput.value = 0; if (zInput) zInput.value = 0; }
}

function update3DScaleInputs() {
  const xInput = document.getElementById('sca3d-x'), yInput = document.getElementById('sca3d-y'), zInput = document.getElementById('sca3d-z');
  if (threeSelectionOrder.length > 0) {
    const mesh = threeSelectionOrder[0]; if (mesh) { 
      if (xInput) xInput.value = mesh.scale.x.toFixed(2); 
      if (yInput) yInput.value = mesh.scale.y.toFixed(2); 
      if (zInput) zInput.value = mesh.scale.z.toFixed(2); 
    }
  } else { if (xInput) xInput.value = 1; if (yInput) yInput.value = 1; if (zInput) xInput.value = 1; }
}

function update3DColorInputs() {
  const colorBtn = document.getElementById('color-palette-btn'), textInput = document.getElementById('color3d-text');
  const extrusionContainer = document.getElementById('extrusion-controls');
  if (extrusionContainer) {
    const cards = extrusionContainer.querySelectorAll('div[data-color]');
    cards.forEach(c => { c.style.borderColor = 'var(--border)'; c.style.boxShadow = 'none'; });
  }

  if (threeSelectionOrder.length > 0) {
    const mesh = threeSelectionOrder[0]; if (mesh && mesh.material && mesh.material.color) {
      const color = '#' + mesh.material.color.getHexString();
      if (colorBtn) colorBtn.style.background = color;
      if (textInput) textInput.value = getColorName(color);
      
      if (extrusionContainer) {
        const selectedCard = extrusionContainer.querySelector(`div[data-color="${color}"]`);
        if (selectedCard) {
          selectedCard.style.borderColor = 'var(--accent)';
          selectedCard.style.boxShadow = '0 0 0 1px var(--accent)';
        }
      }
    }
  } else {
    if (colorBtn) colorBtn.style.background = '#ffffff';
    if (textInput) textInput.value = 'Bianco';
  }
}
