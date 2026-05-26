function toast(msg){
  const el=document.createElement('div');
  el.textContent=msg;
  Object.assign(el.style,{position:'fixed',bottom:'22px',right:'22px',background:'#c8ff00',color:'#000',padding:'7px 14px',borderRadius:'3px',fontFamily:'DM Mono,monospace',fontSize:'12px',zIndex:9999,boxShadow:'0 4px 20px rgba(0,0,0,.5)',transition:'opacity .3s'});
  document.body.appendChild(el);
  setTimeout(()=>{el.style.opacity='0';setTimeout(()=>el.remove(),300);},2200);
}

// ── AGGIORNA TITOLO BARRA ──────────────────────────────────────────────────
function updateTitleBar() {
  const el = document.getElementById('title-bar-filename');
  if (!el) return;
  
  const home = document.getElementById('home-screen');
  const isHomeVisible = home && home.style.display !== 'none' && !home.classList.contains('hidden');

  if (isHomeVisible) {
    el.textContent = '';
    return;
  }
  
  if (S.currentProjectName) {
    el.textContent = S.currentProjectName.replace('.json', '');
  } else if (S.lastImportedName) {
    // Se non c'è un progetto salvato, mostriamo l'ultimo file importato
    el.textContent = S.lastImportedName;
  } else {
    el.textContent = 'Nuovo file';
  }
}

// ── CUSTOM CONFIRM (evita dialog nativo che causa perdita focus in Electron) ──
function customConfirm(msg, onOk) {
  const overlay = document.getElementById('custom-confirm');
  document.getElementById('custom-confirm-msg').textContent = msg;
  overlay.classList.add('show');

  const btnOk     = document.getElementById('custom-confirm-ok');
  const btnCancel = document.getElementById('custom-confirm-cancel');

  function close(confirmed) {
    overlay.classList.remove('show');
    btnOk.removeEventListener('click', handleOk);
    btnCancel.removeEventListener('click', handleCancel);
    // Ripristina immediatamente il focus sul documento
    requestAnimationFrame(() => {
      const ti = document.getElementById('ti');
      if (ti) ti.focus();
    });
    if (confirmed) onOk();
  }

  function handleOk()     { close(true);  }
  function handleCancel() { close(false); }

  btnOk.addEventListener('click', handleOk);
  btnCancel.addEventListener('click', handleCancel);
}

// ── CUSTOM PROMPT (per inserimento testo con stile custom) ───────────────────
function customPrompt(msg, onOk) {
  const overlay = document.getElementById('custom-prompt');
  const input = document.getElementById('custom-prompt-input');
  document.getElementById('custom-prompt-msg').textContent = msg;
  overlay.classList.add('show');
  input.value = '';
  input.focus();

  const btnOk     = document.getElementById('custom-prompt-ok');
  const btnCancel = document.getElementById('custom-prompt-cancel');

  function close(confirmed) {
    overlay.classList.remove('show');
    btnOk.removeEventListener('click', handleOk);
    btnCancel.removeEventListener('click', handleCancel);
    input.removeEventListener('keydown', handleKey);
    requestAnimationFrame(() => {
      const ti = document.getElementById('ti');
      if (ti) ti.focus();
    });
    if (confirmed) onOk(input.value.trim());
  }

  function handleOk() { close(true); }
  function handleCancel() { close(false); }
  function handleKey(e) { if (e.key === 'Enter') handleOk(); if (e.key === 'Escape') handleCancel(); }

  btnOk.addEventListener('click', handleOk);
  btnCancel.addEventListener('click', handleCancel);
  input.addEventListener('keydown', handleKey);
}

// ── AUTO-UPDATE NOTIFICATION FUNCTIONS ───────────────────────────────────
let updateState = { available: false, version: '', downloading: false, downloaded: false };

function showUpdateNotify(info) {
  const panel = document.getElementById('update-notify');
  const overlay = document.getElementById('update-overlay');
  const verEl = document.getElementById('un-version');
  const fillEl = document.getElementById('un-fill');
  const pctEl = document.getElementById('un-pct');
  const downloadBtn = document.getElementById('un-download-btn');
  const restartBtn = document.getElementById('un-restart-btn');
  const infoEl = document.getElementById('un-info');

  updateState.available = true;
  if (info && info.version) updateState.version = info.version;

  if (verEl) verEl.textContent = 'Versione ' + updateState.version;
  
  // Gestione visibilità pulsanti e progressi
  if (updateState.downloaded) {
    if (fillEl) fillEl.style.width = '100%';
    if (pctEl) pctEl.textContent = '100%';
    if (downloadBtn) downloadBtn.style.display = 'none';
    if (restartBtn) restartBtn.style.display = 'block';
    if (infoEl) {
      infoEl.style.display = 'block';
      infoEl.innerHTML = "L'aggiornamento verrà installato al riavvio.";
    }
  } else if (updateState.downloading) {
    // Se sta già scaricando, non mostriamo il pulsante download ma lasciamo la barra
    if (downloadBtn) downloadBtn.style.display = 'none';
    if (restartBtn) restartBtn.style.display = 'none';
    if (infoEl) infoEl.style.display = 'none';
  } else {
    // Stato iniziale: aggiornamento disponibile ma non iniziato
    if (fillEl) fillEl.style.width = '0%';
    if (pctEl) pctEl.textContent = '0%';
    if (downloadBtn) downloadBtn.style.display = 'block';
    if (restartBtn) restartBtn.style.display = 'none';
    if (infoEl) infoEl.style.display = 'none';
  }

  if (overlay) overlay.classList.add('show');
  if (panel) panel.classList.add('show');
}

function hideUpdateNotify() {
  const panel = document.getElementById('update-notify');
  const overlay = document.getElementById('update-overlay');
  if (panel) panel.classList.remove('show');
  if (overlay) overlay.classList.remove('show');
}

function downloadUpdate() {
  if (updateState.downloading) return;
  updateState.downloading = true;

  const downloadBtn = document.getElementById('un-download-btn');
  const fillEl = document.getElementById('un-fill');
  const pctEl = document.getElementById('un-pct');

  if (downloadBtn) downloadBtn.style.display = 'none';
  if (fillEl) fillEl.style.width = '10%';
  if (pctEl) pctEl.textContent = 'Inizio download...';

  window.electronAPI.downloadUpdate().then(result => {
    if (!result.success) {
      toast('Errore download: ' + (result.error || 'sconosciuto'));
      updateState.downloading = false;
      if (downloadBtn) downloadBtn.style.display = 'block';
      if (fillEl) fillEl.style.width = '0%';
      if (pctEl) pctEl.textContent = '0%';
    }
  }).catch(err => {
    toast('Errore download: ' + err.message);
    updateState.downloading = false;
    if (downloadBtn) downloadBtn.style.display = 'block';
    if (fillEl) fillEl.style.width = '0%';
    if (pctEl) pctEl.textContent = '0%';
  });
}

function quitAndInstall() {
  window.electronAPI.quitAndInstall();
}

// ── EXIT CONFIRMATION ────────────────────────────────────────────────────
function showExitModal() {
  const modal = document.getElementById('exit-confirm');
  if (modal) modal.classList.add('show');
}
function hideExitModal() {
  const modal = document.getElementById('exit-confirm');
  if (modal) modal.classList.remove('show');
}
function confirmExit() {
  window.electronAPI.confirmClose();
}

// ELECTRON AUTO-UPDATE INTEGRATION
if (window.electronAPI && window.electronAPI.onShowCloseModal) {
  window.electronAPI.onShowCloseModal(() => showExitModal());
}

function handleUpdateStatus(data) {
  const panel = document.getElementById('update-notify');
  const verEl = document.getElementById('un-version');
  const fillEl = document.getElementById('un-fill');
  const pctEl = document.getElementById('un-pct');
  const downloadBtn = document.getElementById('un-download-btn');
  const restartBtn = document.getElementById('un-restart-btn');
  const infoEl = document.getElementById('un-info');

  // Home screen elements
  const homeVer = document.getElementById('home-version-display');
  const homeStatus = document.getElementById('home-update-status');
  const homeSpinner = document.getElementById('home-update-spinner');
  const homeIcon = document.getElementById('home-update-icon');
  const homeUpdateText = document.getElementById('home-update-text');

  switch(data.status) {
    case 'checking':
      if (homeVer) homeVer.style.display = 'none';
      if (homeStatus) homeStatus.style.display = 'flex';
      if (homeSpinner) homeSpinner.style.display = 'block';
      if (homeIcon) homeIcon.style.display = 'none';
      if (homeUpdateText) homeUpdateText.style.display = 'none';
      break;

    case 'available':
      updateState.version = data.version;
      updateState.available = true;
      if (homeVer) homeVer.style.display = 'none'; 
      if (homeStatus) homeStatus.style.display = 'flex';
      if (homeSpinner) homeSpinner.style.display = 'none';
      if (homeIcon) homeIcon.style.display = 'none';
      if (homeUpdateText) {
        homeUpdateText.style.display = 'flex';
        homeUpdateText.className = 'home-update-link';
        homeUpdateText.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          <span>aggiorna...</span>
        `;
        homeUpdateText.onclick = () => showUpdateNotify({ version: data.version });
      }
      break;

    case 'not-available':
      if (homeVer) homeVer.style.display = 'block';
      if (homeStatus) homeStatus.style.display = 'none';
      if (homeSpinner) homeSpinner.style.display = 'none';
      if (homeIcon) homeIcon.style.display = 'none';
      if (homeUpdateText) homeUpdateText.style.display = 'none';
      break;

    case 'downloading':
      updateState.downloading = true;
      const pct = Math.round(data.percent);
      if (fillEl) fillEl.style.width = pct + '%';
      if (pctEl) pctEl.textContent = pct + '% - Download in corso...';
      
      if (homeVer) homeVer.style.display = 'none';
      if (homeStatus) homeStatus.style.display = 'flex';
      if (homeSpinner) homeSpinner.style.display = 'none';
      if (homeUpdateText) {
          homeUpdateText.style.display = 'flex';
          homeUpdateText.className = 'home-update-link';
          homeUpdateText.innerHTML = `
            <div class="spinner" style="width:12px; height:12px; border-width:2px; margin-right:5px"></div>
            <span>Scaricando ${pct}%...</span>
          `;
          homeUpdateText.onclick = null;
      }
      break;

    case 'downloaded':
      updateState.downloading = false;
      updateState.downloaded = true;
      updateState.version = data.version;

      if (verEl) verEl.textContent = 'Versione ' + data.version + ' pronta!';
      if (fillEl) fillEl.style.width = '100%';
      if (pctEl) pctEl.textContent = '100%';
      if (downloadBtn) downloadBtn.style.display = 'none';
      if (restartBtn) restartBtn.style.display = 'block';
      if (infoEl) {
        infoEl.style.display = 'block';
        infoEl.innerHTML = "L'aggiornamento verrà installato al riavvio.";
      }

      if (homeVer) homeVer.style.display = 'none';
      if (homeStatus) homeStatus.style.display = 'flex';
      if (homeSpinner) homeSpinner.style.display = 'none';
      if (homeUpdateText) {
        homeUpdateText.style.display = 'flex';
        homeUpdateText.className = 'home-update-link success';
        homeUpdateText.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          <span>riavvia ora</span>
        `;
        homeUpdateText.onclick = () => quitAndInstall();
      }

      toast('Download completato! Riavvia per installare.');
      break;

    case 'error':
      updateState.downloading = false;
      console.error('[RENDERER] Update error:', data.error);
      if (homeVer) homeVer.style.display = 'block';
      if (homeStatus) homeStatus.style.display = 'none';
      break;
  }
}

// ELECTRON AUTO-UPDATE INTEGRATION
if (window.electronAPI && window.electronAPI.onUpdateStatus) {
  window.electronAPI.onUpdateStatus(handleUpdateStatus);
}

// Auto-update version display from package.json
if (window.electronAPI && window.electronAPI.onAppVersion) {
  window.electronAPI.onAppVersion((version) => {
    const verEl = document.getElementById('app-version');
    const unVerEl = document.getElementById('un-version');
    const homeVerEl = document.getElementById('home-version-display');
    if (verEl) verEl.textContent = 'v' + version;
    if (unVerEl) unVerEl.textContent = 'Versione ' + version;
    if (homeVerEl) homeVerEl.textContent = 'v' + version;
  });
}
