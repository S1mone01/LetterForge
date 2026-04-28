
/* ── Home Screen Logic ─────────────────────────────────────────── */
async function initHome() {
  console.log('Home initialization...');
  
  // Request version and check for updates
  if (window.electronAPI && window.electronAPI.checkForUpdates) {
     window.electronAPI.checkForUpdates();
  }

  // Handle Recent Projects
  renderRecentProjects();
}

async function renderRecentProjects() {
  const grid = document.getElementById('recent-grid');
  if (!grid) return;

  if (window.electronAPI && window.electronAPI.listSavedProjects) {
    try {
      // List projects from the "saved" folder
      const projects = await window.electronAPI.listSavedProjects();
      if (!projects || projects.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; padding: 40px; text-align: center; color: var(--muted); background: var(--panel); border-radius: 12px; border: 1px dashed var(--border); font-size: 13px;">Nessun progetto salvato nella cartella /saved</div>`;
        return;
      }

      // Show ALL projects, not just 4
      grid.innerHTML = projects.map(p => {
        const date = new Date(p.mtime).toLocaleDateString();
        // Aggiungo timestamp ?t= per forzare il refresh dell'anteprima se il file è stato sovrascritto
        const previewImg = p.preview 
          ? `<img src="file://${p.preview.replace(/\\/g, '/')}?t=${Date.now()}" style="width:100%;height:100%;object-fit:contain;border-radius:4px">`
          : `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;
        
        return `
          <div class="recent-item" onclick="loadRecentProject('${p.path.replace(/\\/g, '/')}')">
            <div class="recent-preview">
               ${previewImg}
            </div>
            <div class="recent-info">
              <div class="recent-name" title="${p.name}">${p.name.replace('.json', '')}</div>
              <div class="recent-date">${date}</div>
            </div>
            <div class="recent-delete" onclick="event.stopPropagation(); deleteRecentProject('${p.path.replace(/\\/g, '/')}')" title="Elimina progetto">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            </div>
          </div>
        `;
      }).join('');
    } catch (e) {
      console.error('Error listing projects:', e);
      grid.innerHTML = `<div style="grid-column: 1/-1; padding: 20px; color: #ff4444; font-size: 11px;">Errore nel recupero dei file</div>`;
    }
  }
}

async function deleteRecentProject(path) {
  customConfirm('Sei sicuro di voler eliminare questo progetto? L\'azione è irreversibile.', async () => {
    if (window.electronAPI && window.electronAPI.deleteSavedProject) {
      const success = await window.electronAPI.deleteSavedProject(path);
      if (success) {
        toast('Progetto eliminato ✓');
        renderRecentProjects();
      } else {
        toast('Errore durante l\'eliminazione');
      }
    }
  });
}

// Ensure the version is also updated on the home screen when received
if (window.electronAPI && window.electronAPI.onAppVersion) {
  window.electronAPI.onAppVersion((version) => {
    const homeVer = document.getElementById('home-version-display');
    if (homeVer) homeVer.textContent = 'v' + version;
  });
}

function newProject() {
  const home = document.getElementById('home-screen');
  if (home) {
    home.classList.add('hidden');
    setTimeout(() => home.style.display = 'none', 400);
  }
  // Clear canvas without confirmation since we're starting a new file
  if (typeof S !== 'undefined') {
    S.letters = [];
    S.sel.clear();
    S.currentProjectName = null;
    if (typeof render === 'function') render();
    if (typeof renderHandles === 'function') renderHandles();
    if (typeof upd === 'function') upd();
    
    // Forza la modalità font all'inizio di un nuovo progetto
    toggleViewMode('fonts');

    if (typeof saveState === 'function') saveState();
    toast('Nuovo progetto creato ✓');
  }
}

async function openProjectFromFile() {
  if (window.electronAPI && window.electronAPI.loadProjectFile) {
    const response = await window.electronAPI.loadProjectFile();
    if (response) {
      applyProjectData(response.content);
      S.currentProjectName = response.name;
      const home = document.getElementById('home-screen');
      if (home) {
        home.classList.add('hidden');
        setTimeout(() => home.style.display = 'none', 400);
      }
    }
  }
}

async function loadRecentProject(path) {
  if (window.electronAPI && window.electronAPI.loadSavedProjectByPath) {
    try {
      const response = await window.electronAPI.loadSavedProjectByPath(path);
      if (response) {
        applyProjectData(response.content);
        S.currentProjectName = response.name;
        const home = document.getElementById('home-screen');
        if (home) {
          home.classList.add('hidden');
          setTimeout(() => home.style.display = 'none', 400);
        }
      }
    } catch (e) {
      toast('Errore nel caricamento del progetto');
    }
  }
}

function goHome() {
  customConfirm('Tornare alla home? I progressi non salvati andranno persi.', () => {
    const home = document.getElementById('home-screen');
    if (home) {
      renderRecentProjects();
      home.style.display = 'flex';
      setTimeout(() => home.classList.remove('hidden'), 10);
    }
  });
}

// Inizializza la lista sidebar (font o svg) al caricamento
setTimeout(() => {
  if (typeof handleSearch === 'function') handleSearch('');
}, 100);
