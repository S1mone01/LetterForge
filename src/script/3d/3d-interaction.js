let threeRaycaster = new THREE.Raycaster();
let threeMouse = new THREE.Vector2();
let threeSelectionIndicator = [];
let threeSelectedMesh = null;
let threeSelectionOrder = [];
let threeScaleLocked = false;
let isMarqueeActive = false;
let marqueeStart = { x: 0, y: 0 };
let marqueeEl = null;
let marqueeJustFinished = false;

function on3DMousedown(event) {
  if (event.altKey && event.button === 0) {
    const container = document.getElementById('preview-3d-canvas');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    
    isMarqueeActive = true;
    marqueeStart.x = event.clientX - rect.left;
    marqueeStart.y = event.clientY - rect.top;
    
    if (!marqueeEl) {
      marqueeEl = document.createElement('div');
      marqueeEl.style.cssText = 'position:absolute;border:1px solid var(--accent);background:rgba(200,255,0,0.1);pointer-events:none;z-index:10000;display:none;';
      container.appendChild(marqueeEl);
    }
    
    marqueeEl.style.left = marqueeStart.x + 'px';
    marqueeEl.style.top = marqueeStart.y + 'px';
    marqueeEl.style.width = '0px';
    marqueeEl.style.height = '0px';
    marqueeEl.style.display = 'block';
    
    if (threeControls) threeControls.enabled = false;
    event.preventDefault();
    event.stopPropagation();
  }
}

function on3DMousemove(event) {
  if (isMarqueeActive) {
    const container = document.getElementById('preview-3d-canvas');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const currentX = event.clientX - rect.left;
    const currentY = event.clientY - rect.top;
    
    const x = Math.min(currentX, marqueeStart.x);
    const y = Math.min(currentY, marqueeStart.y);
    const w = Math.abs(currentX - marqueeStart.x);
    const h = Math.abs(currentY - marqueeStart.y);
    
    marqueeEl.style.left = x + 'px';
    marqueeEl.style.top = y + 'px';
    marqueeEl.style.width = w + 'px';
    marqueeEl.style.height = h + 'px';
  }
}

function on3DMouseup(event) {
  if (isMarqueeActive) {
    isMarqueeActive = false;
    const rect = marqueeEl ? marqueeEl.getBoundingClientRect() : { width: 0, height: 0 };
    if (marqueeEl) marqueeEl.style.display = 'none';
    if (threeControls) threeControls.enabled = true;
    
    if (rect.width > 2 || rect.height > 2) {
      selectObjectsInRect(rect, event.shiftKey);
      marqueeJustFinished = true;
      setTimeout(() => marqueeJustFinished = false, 100);
    }
  }
}

function selectObjectsInRect(marqueeRect, shiftKey) {
  if (!threeScene || !threeCamera || !threeRenderer) return;
  
  const canvasRect = threeRenderer.domElement.getBoundingClientRect();
  if (!shiftKey) clear3DSelection();

  threeMeshes.filter(m => m.visible).forEach(mesh => {
    const bbox = new THREE.Box3().setFromObject(mesh);
    const points = [
      new THREE.Vector3(bbox.min.x, bbox.min.y, bbox.min.z),
      new THREE.Vector3(bbox.min.x, bbox.min.y, bbox.max.z),
      new THREE.Vector3(bbox.min.x, bbox.max.y, bbox.min.z),
      new THREE.Vector3(bbox.min.x, bbox.max.y, bbox.max.z),
      new THREE.Vector3(bbox.max.x, bbox.min.y, bbox.min.z),
      new THREE.Vector3(bbox.max.x, bbox.min.y, bbox.max.z),
      new THREE.Vector3(bbox.max.x, bbox.max.y, bbox.min.z),
      new THREE.Vector3(bbox.max.x, bbox.max.y, bbox.max.z)
    ];
    
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    points.forEach(p => {
      p.project(threeCamera);
      const x = (p.x * 0.5 + 0.5) * canvasRect.width + canvasRect.left;
      const y = (-(p.y * 0.5) + 0.5) * canvasRect.height + canvasRect.top;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    });
    
    if (maxX >= marqueeRect.left && minX <= marqueeRect.right &&
        maxY >= marqueeRect.top && minY <= marqueeRect.bottom) {
      if (!threeSelectionOrder.includes(mesh)) threeSelectionOrder.push(mesh);
    }
  });
  
  updateSelectionIndicators();
}

function toggleScaleLock3D() {
  threeScaleLocked = !threeScaleLocked;
  const btn = document.getElementById('lock-scale-3d-btn');
  const icon = document.getElementById('lock-scale-3d-icon');
  if (btn && icon) {
    btn.style.color = threeScaleLocked ? 'var(--accent)' : 'var(--muted)';
    icon.innerHTML = threeScaleLocked 
      ? '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>'
      : '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 8 0v4"></path>'; // Simple unlocked representation
  }
  toast(threeScaleLocked ? 'Proporzioni bloccate' : 'Proporzioni libere');
}

function on3DObjectClick(event) {
  if (!threeScene || !threeCamera || !threeRenderer) return;
  
  // Prevent selection change if we just finished dragging an object or marquee
  if ((threeTransformControls && threeTransformControls._justFinishedDragging) || (typeof marqueeJustFinished !== 'undefined' && marqueeJustFinished)) {
    return;
  }

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
    } else {
      const existingIndex = threeSelectionOrder.indexOf(clickedMesh);
      if (event.shiftKey) {
        if (existingIndex === -1) { threeSelectionOrder.push(clickedMesh); }
        else { threeSelectionOrder.splice(existingIndex, 1); }
      } else {
        clear3DSelection(); threeSelectionOrder.push(clickedMesh);
      }
    }
    updateSelectionIndicators();
  } else { clear3DSelection(); }
}

function on3DObjectDblClick(event) { clear3DSelection(); toast('Selezione annullata'); }

function addSelectionIndicator(mesh) {
  // Now mostly handled by updateSelectionIndicators for consistency
  updateSelectionIndicators();
}

function addSelectionIndicatorForGroup(meshes) {
  // Now mostly handled by updateSelectionIndicators for consistency
  updateSelectionIndicators();
}

function selectAll3D() {
  if (!threeMeshes || threeMeshes.length === 0) return;
  threeSelectionOrder = [];
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
    hud.innerHTML = '<div style="background:rgba(0,0,0,.6);color:#5a5a7a;padding:6px 14px;border-radius:20px;font-size:11px;font-family:DM Mono,monospace;border:1px solid #2a2a3a;">Click oggetto per selezionare (Shift+Click multiplo) · Trascina le frecce per muovere</div>';
    update3DPositionInputs(); update3DScaleInputs(); update3DColorInputs(); return;
  }
  let html = `<div style="background:rgba(200,255,0,.1);color:#c8ff00;padding:6px 14px;border-radius:20px;font-size:11px;font-family:DM Mono,monospace;border:1px solid #c8ff00;">${threeSelectionOrder.length} oggetti selezionati</div>`;
  if (threeSelectionOrder.length === 2) html += '<div style="background:rgba(0,255,136,.12);color:#00ff88;padding:6px 14px;border-radius:20px;font-size:11px;font-family:DM Mono,monospace;border:1px solid #00ff88;">Unisci/Sottrai disponibile</div>';
  if (threeSelectionOrder.length > 1) html += '<div style="background:rgba(0,0,0,.5);color:#8a8a9a;padding:6px 14px;border-radius:20px;font-size:11px;font-family:DM Mono,monospace;border:1px dashed #3a3a4a;">Muovi/Scala insieme</div>';
  hud.innerHTML = html;
  update3DPositionInputs(); update3DScaleInputs(); update3DColorInputs();
}

function updateSelectionIndicators() {
  // Prevent re-entry if we're already updating from a transform
  if (threeTransformControls && threeTransformControls._isUpdatingSelection) return;
  if (threeTransformControls) threeTransformControls._isUpdatingSelection = true;

  threeSelectionIndicator.forEach(ind => { if (threeScene) threeScene.remove(ind); ind.geometry.dispose(); ind.material.dispose(); });
  threeSelectionIndicator = [];
  
  if (threeSelectionOrder.length === 0) {
    if (threeTransformControls) {
      threeTransformControls.detach(); threeTransformControls.visible = false;
      if (threeTransformControls._pivot) { threeScene.remove(threeTransformControls._pivot); threeTransformControls._pivot = null; }
    }
    update3DSelectionHUD(); 
    if (threeTransformControls) threeTransformControls._isUpdatingSelection = false;
    return;
  }

  const selectionColors = [0x00ff88, 0xff6b35, 0xc8ff00, 0x00ccff, 0xff66b2, 0x9933ff, 0xffcc00, 0x00ffcc, 0xff4444, 0x44ff44];
  const combinedBBox = new THREE.Box3();
  
  threeSelectionOrder.forEach((mesh, idx) => {
    const bbox = new THREE.Box3().setFromObject(mesh);
    combinedBBox.union(bbox);
    const size = bbox.getSize(new THREE.Vector3()), center = bbox.getCenter(new THREE.Vector3());
    const wireframe = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x * 1.02, size.y * 1.02, size.z * 1.02)), new THREE.LineBasicMaterial({ color: selectionColors[idx % selectionColors.length], linewidth: 2 }));
    wireframe.position.copy(center); wireframe.userData = { targetMesh: mesh, selectionIndex: idx };
    threeScene.add(wireframe); threeSelectionIndicator.push(wireframe);
  });

  if (threeTransformControls && threeTransformEnabled) {
    const center = combinedBBox.getCenter(new THREE.Vector3());
    
    // Only create/move pivot if not already dragging
    if (!threeTransformControls._dragging) {
      if (threeTransformControls._pivot) threeScene.remove(threeTransformControls._pivot);
      const pivot = new THREE.Object3D(); 
      pivot.position.copy(center); 
      
      if (threeSelectionOrder.length === 1) {
        pivot.scale.copy(threeSelectionOrder[0].scale);
      } else {
        pivot.scale.set(1, 1, 1);
      }
      
      threeScene.add(pivot); 
      threeTransformControls._pivot = pivot;
      threeTransformControls.attach(pivot); 
      threeTransformControls.visible = true;
    }
  }
  
  update3DSelectionHUD();
  if (threeTransformControls) threeTransformControls._isUpdatingSelection = false;
}

function update3DObjectPosition(axis, value) {
  if (threeSelectionOrder.length === 0) return;
  if (isNaN(value)) return;
  const mainMesh = threeSelectionOrder[0];
  const delta = value - mainMesh.position[axis];
  
  threeSelectionOrder.forEach(mesh => {
    mesh.position[axis] += delta;
  });

  if (threeTransformControls && threeTransformControls._pivot) {
    threeTransformControls._pivot.position[axis] += delta;
  }
  updateSelectionIndicators(); saveState3D();
}

function update3DObjectScale(axis, value) {
  if (threeSelectionOrder.length === 0) return;
  if (isNaN(value) || value === 0) return;
  
  const mainMesh = threeSelectionOrder[0];
  const oldScale = mainMesh.scale[axis];
  if (oldScale === 0) return;
  
  const ratio = value / oldScale;
  const pivotPos = threeTransformControls && threeTransformControls._pivot ? threeTransformControls._pivot.position : null;

  threeSelectionOrder.forEach(mesh => {
    if (threeScaleLocked) {
      mesh.scale.set(value, value, value);
      
      // Apply position offset to scale around pivot (even for single mesh)
      if (pivotPos) {
        const offset = new THREE.Vector3().subVectors(mesh.position, pivotPos);
        offset.multiplyScalar(ratio);
        mesh.position.copy(pivotPos).add(offset);
      }
    } else {
      mesh.scale[axis] *= ratio;
      
      // Apply position offset to scale around pivot (even for single mesh)
      if (pivotPos) {
        const offset = mesh.position[axis] - pivotPos[axis];
        mesh.position[axis] = pivotPos[axis] + (offset * ratio);
      }
    }
  });

  if (threeTransformControls && threeTransformControls._pivot) {
    if (threeSelectionOrder.length === 1) {
       if (threeScaleLocked) threeTransformControls._pivot.scale.set(value, value, value);
       else threeTransformControls._pivot.scale[axis] = value;
       // Pivot position stays the same because mesh scaled around it
    } else {
       if (threeScaleLocked) {
          threeTransformControls._pivot.scale.multiplyScalar(ratio);
       } else {
          threeTransformControls._pivot.scale[axis] *= ratio;
       }
    }
  }
  update3DScaleInputs();
  updateSelectionIndicators(); 
  saveState3D();
}

function update3DPositionInputs() {
  const xInput = document.getElementById('pos3d-x'), yInput = document.getElementById('pos3d-y'), zInput = document.getElementById('pos3d-z');
  if (threeSelectionOrder.length > 0) {
    const mesh = threeSelectionOrder[0]; 
    if (mesh) { 
      if (xInput && document.activeElement !== xInput) xInput.value = Math.round(mesh.position.x); 
      if (yInput && document.activeElement !== yInput) yInput.value = Math.round(mesh.position.y); 
      if (zInput && document.activeElement !== zInput) zInput.value = Math.round(mesh.position.z); 
    }
  } else { 
    if (xInput) xInput.value = 0; if (yInput) yInput.value = 0; if (zInput) zInput.value = 0; 
  }
}

function update3DScaleInputs() {
  const xInput = document.getElementById('sca3d-x'), yInput = document.getElementById('sca3d-y'), zInput = document.getElementById('sca3d-z');
  if (threeSelectionOrder.length > 0) {
    const mesh = threeSelectionOrder[0]; 
    if (mesh) { 
      if (xInput && document.activeElement !== xInput) xInput.value = mesh.scale.x.toFixed(2); 
      if (yInput && document.activeElement !== yInput) yInput.value = mesh.scale.y.toFixed(2); 
      if (zInput && document.activeElement !== zInput) zInput.value = mesh.scale.z.toFixed(2); 
    }
  } else { 
    if (xInput) xInput.value = 1; if (yInput) yInput.value = 1; if (zInput) zInput.value = 1; 
  }
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
