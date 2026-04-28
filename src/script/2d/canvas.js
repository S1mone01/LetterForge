function setZoom(z){
  S.zoom = Math.min(30, Math.max(0.1, z));
  const svg = document.getElementById('svg');
  svg.setAttribute('width',  Math.round(S.canvasW * S.zoom));
  svg.setAttribute('height', Math.round(S.canvasH * S.zoom));
  document.getElementById('zoom-label').textContent = Math.round(S.zoom*100)+'%';
}
function zoomIn()   { setZoom(S.zoom * 1.1); }
function zoomOut()  { setZoom(S.zoom / 1.1); }
function zoomReset(){
  setZoom(1);
  const cw = document.getElementById('cw');
  cw.scrollLeft = (cw.scrollWidth - cw.clientWidth) / 2;
  cw.scrollTop  = (cw.scrollHeight - cw.clientHeight) / 2;
}

document.getElementById('cw').addEventListener('wheel', e => {
  e.preventDefault(); 
  const cw = document.getElementById('cw');
  if (e.ctrlKey || e.metaKey) {
    cw.scrollLeft += e.deltaX;
    cw.scrollTop  += e.deltaY;
  } else {
    const rect = cw.getBoundingClientRect();
    const mx = e.clientX - rect.left + cw.scrollLeft;
    const my = e.clientY - rect.top  + cw.scrollTop;
    const oldZoom = S.zoom;
    const zoomFactor = 1.1;
    setZoom(e.deltaY > 0 ? S.zoom / zoomFactor : S.zoom * zoomFactor);
    const ratio = S.zoom / oldZoom;
    cw.scrollLeft = mx * ratio - (e.clientX - rect.left);
    cw.scrollTop = my * ratio - (e.clientY - rect.top);
  }
}, {passive: false});

function toggleSnap(){
  S.snapEnabled = !S.snapEnabled;
  const btn = document.getElementById('snap-btn');
  if(S.snapEnabled){
    btn.classList.add('snap-on');
    toast('Snap attivato ✓');
  } else {
    btn.classList.remove('snap-on');
    toast('Snap disattivato ○');
  }
}

function pt(e){
  const svg = document.getElementById('svg');
  const p   = svg.createSVGPoint();
  p.x = e.clientX;
  p.y = e.clientY;
  return p.matrixTransform(svg.getScreenCTM().inverse());
}

function applySize(){
  const w=+document.getElementById('cvW').value||800;
  const h=+document.getElementById('cvH').value||500;
  S.canvasW=w;S.canvasH=h;
  const svg=document.getElementById('svg');
  svg.setAttribute('viewBox',`0 0 ${w} ${h}`);
  svg.setAttribute('width',Math.round(w*S.zoom));
  svg.setAttribute('height',Math.round(h*S.zoom));
  ['bg','gr'].forEach(id=>{const el=document.getElementById(id);el.setAttribute('width',w);el.setAttribute('height',h);});
  
  // Assicura che il canvas sia scrollabile dopo il ridimensionamento
  const cw=document.getElementById('cw');
  if(cw) cw.scrollTop=0;
}

function setCanvasBg(color) {
  S.canvasBg = color;
  document.getElementById('bg').setAttribute('fill', color);
  const r=parseInt(color.slice(1,3),16), g=parseInt(color.slice(3,5),16), b=parseInt(color.slice(5,7),16);
  const lum = (r*299 + g*587 + b*114) / 1000;
  const gridStroke = lum > 128 ? '#cccccc' : '#ffffff33';
  document.querySelector('#grid path').setAttribute('stroke', gridStroke);
  const dot = document.getElementById('canvas-bg-picker-dot');
  if (dot) dot.style.background = color;
  saveState();
}

function toggleGrid() {
  S.gridOn = !S.gridOn;
  document.getElementById('gr').style.display = S.gridOn ? 'block' : 'none';
  const btn = document.getElementById('grid-btn');
  if (btn) btn.style.color = S.gridOn ? 'var(--accent)' : 'var(--muted)';
  saveState();
}

// Initial center scroll
requestAnimationFrame(() => {
  const cw = document.getElementById('cw');
  if (cw) {
    cw.scrollLeft = (cw.scrollWidth - cw.clientWidth) / 2;
    cw.scrollTop  = (cw.scrollHeight - cw.clientHeight) / 2;
  }
});
