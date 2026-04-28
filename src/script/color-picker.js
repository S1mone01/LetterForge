
(function(){
  const PRESETS = [
    '#ffffff','#e8e8f0','#c8c8d8','#888899','#5a5a7a','#2a2a3a','#1a1a25','#0d0d0f',
    '#c8ff00','#b8ef00','#ff6b35','#ff4444','#00ff88','#00ccff','#9933ff','#ff66b2',
    '#ff0000','#ff8800','#ffff00','#00ff00','#00ffff','#0088ff','#8800ff','#ff0088',
  ];

  let cpId = null;       // which picker id is open
  let cpCallback = null; // function(hex) to call on change
  let cpDotId = null;    // dot element id to update
  let cpHue = 0;         // 0-360
  let cpSat = 1;         // 0-1
  let cpVal = 1;         // 0-1 (value/brightness)
  let cpDraggingGrad = false;
  let cpDraggingHue = false;

  // ── Colour math ──────────────────────────────────────────────────
  function hsvToRgb(h,s,v){
    let r,g,b;
    const i=Math.floor(h/60)%6, f=h/60-Math.floor(h/60);
    const p=v*(1-s),q=v*(1-f*s),t=v*(1-(1-f)*s);
    [[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]][i].forEach((c,idx)=>{[r,g,b]=[r,g,b];if(idx===0)r=c;else if(idx===1)g=c;else b=c;});
    // simpler:
    const rgb=[[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]][i];
    return rgb.map(c=>Math.round(c*255));
  }
  function rgbToHex(r,g,b){return '#'+[r,g,b].map(c=>c.toString(16).padStart(2,'0')).join('');}
  function hexToRgb(hex){
    const m=hex.replace('#','').match(/.{2}/g);
    return m?m.map(c=>parseInt(c,16)):[0,0,0];
  }
  function rgbToHsv(r,g,b){
    r/=255;g/=255;b/=255;
    const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
    let h=0,s=max===0?0:d/max,v=max;
    if(d!==0){
      if(max===r) h=((g-b)/d)%6;
      else if(max===g) h=(b-r)/d+2;
      else h=(r-g)/d+4;
      h=((h*60)+360)%360;
    }
    return[h,s,v];
  }
  function currentHex(){const[r,g,b]=hsvToRgb(cpHue,cpSat,cpVal);return rgbToHex(r,g,b);}

  // ── Draw gradient ────────────────────────────────────────────────
  function drawGradient(){
    const canvas=document.getElementById('cp-canvas');
    if(!canvas)return;
    const ctx=canvas.getContext('2d');
    const W=canvas.width,H=canvas.height;
    // White → Hue
    const gH=ctx.createLinearGradient(0,0,W,0);
    const[r,g,b]=hsvToRgb(cpHue,1,1);
    gH.addColorStop(0,'#fff');
    gH.addColorStop(1,`rgb(${r},${g},${b})`);
    ctx.fillStyle=gH; ctx.fillRect(0,0,W,H);
    // Transparent → Black
    const gV=ctx.createLinearGradient(0,0,0,H);
    gV.addColorStop(0,'rgba(0,0,0,0)');
    gV.addColorStop(1,'#000');
    ctx.fillStyle=gV; ctx.fillRect(0,0,W,H);
  }

  // ── Update cursors & preview ─────────────────────────────────────
  function updateUI(){
    drawGradient();
    const canvas=document.getElementById('cp-canvas');
    const W=canvas?canvas.offsetWidth:196,H=canvas?canvas.offsetHeight:130;
    const gc=document.getElementById('cp-gcursor');
    if(gc){gc.style.left=(cpSat*W)+'px';gc.style.top=((1-cpVal)*H)+'px';}
    const hc=document.getElementById('cp-hcursor');
    const hbar=document.getElementById('cp-hue');
    if(hc&&hbar){hc.style.left=(cpHue/360*hbar.offsetWidth)+'px';}
    const hex=currentHex();
    const prev=document.getElementById('cp-preview');
    if(prev)prev.style.background=hex;
    const inp=document.getElementById('cp-hex');
    if(inp&&document.activeElement!==inp)inp.value=hex.toUpperCase();
  }

  // ── Gradient mouse ───────────────────────────────────────────────
  function gradPos(e,canvas){
    const r=canvas.getBoundingClientRect();
    const x=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));
    const y=Math.max(0,Math.min(1,(e.clientY-r.top)/r.height));
    cpSat=x; cpVal=1-y;
  }
  function huePos(e,bar){
    const r=bar.getBoundingClientRect();
    cpHue=Math.max(0,Math.min(360,(e.clientX-r.left)/r.width*360));
  }

  // ── Dispatch colour to callback ──────────────────────────────────
  function dispatchColor(){
    const hex=currentHex();
    // Update dot
    const dot=document.getElementById(cpDotId);
    if(dot)dot.style.background=hex;
    if(cpCallback)cpCallback(hex);
  }

  // ── Position popup near anchor ───────────────────────────────────
  function positionPopup(anchor){
    const popup=document.getElementById('cp-popup');
    const r=anchor.getBoundingClientRect();
    let top=r.bottom+6, left=r.left;
    if(left+224>window.innerWidth)left=window.innerWidth-228;
    if(top+320>window.innerHeight)top=r.top-326;
    popup.style.top=top+'px';
    popup.style.left=left+'px';
  }

  // ── Build swatches ───────────────────────────────────────────────
  function buildSwatches(){
    const cont=document.getElementById('cp-swatches');
    if(!cont||cont.children.length)return;
    PRESETS.forEach(hex=>{
      const d=document.createElement('div');
      d.className='cp-sw';
      d.style.background=hex;
      d.title=hex;
      d.onclick=()=>{
        const[r,g,b]=hexToRgb(hex);
        [cpHue,cpSat,cpVal]=rgbToHsv(r,g,b);
        updateUI(); dispatchColor();
      };
      cont.appendChild(d);
    });
  }

  // ── Public API ───────────────────────────────────────────────────
  window.openCP=function(id, anchorEl){
    cpId=id;
    // Map id → callback and dotId
    const map={
      'canvas-bg-picker':{ cb: v=>{ if(typeof setCanvasBg==='function')setCanvasBg(v); }, dot:'canvas-bg-picker-dot' },
      'fcol':            { cb: v=>{ if(typeof apFill==='function')apFill(v); const el=document.getElementById('pfill'); if(el)el.value=v; }, dot:'fcol-dot' },
      'pbordercol':      { cb: v=>{ if(typeof apBorderCol==='function')apBorderCol(v); }, dot:'pbordercol-dot' },
      'bg-color-picker': { cb: v=>{ if(typeof change3DBgColor==='function')change3DBgColor(v); }, dot:'bg-color-picker-dot' },
    };
    const entry=map[id]||{cb:()=>{},dot:null};
    cpCallback=entry.cb;
    cpDotId=entry.dot;

    // Read current colour from dot
    const dot=document.getElementById(cpDotId);
    const currentColor=dot?dot.style.background:'#ffffff';
    // Parse it
    let hex=currentColor;
    if(hex.startsWith('rgb')){
      const m=hex.match(/\d+/g);
      if(m)hex=rgbToHex(+m[0],+m[1],+m[2]);
    }
    const[r,g,b]=hexToRgb(hex);
    [cpHue,cpSat,cpVal]=rgbToHsv(r,g,b);

    buildSwatches();
    const popup=document.getElementById('cp-popup');
    popup.classList.add('open');
    // Wait for layout then position & draw
    requestAnimationFrame(()=>{
      positionPopup(anchorEl||dot||document.body);
      updateUI();
    });
  };

  window.closeCP=function(){
    const popup=document.getElementById('cp-popup');
    if(popup)popup.classList.remove('open');
  };

  // ── Mouse events ─────────────────────────────────────────────────
  document.addEventListener('mousedown',function(e){
    const popup=document.getElementById('cp-popup');
    if(!popup||!popup.classList.contains('open'))return;
    const canvas=document.getElementById('cp-canvas');
    const hbar=document.getElementById('cp-hue');
    if(canvas&&canvas.contains(e.target)){
      cpDraggingGrad=true;
      gradPos(e,canvas); updateUI(); dispatchColor(); e.preventDefault();
    } else if(hbar&&hbar.contains(e.target)){
      cpDraggingHue=true;
      huePos(e,hbar); updateUI(); dispatchColor(); e.preventDefault();
    } else if(!popup.contains(e.target)){
      closeCP();
    }
  },true);

  document.addEventListener('mousemove',function(e){
    if(cpDraggingGrad){
      const canvas=document.getElementById('cp-canvas');
      if(canvas){gradPos(e,canvas);updateUI();dispatchColor();}
    } else if(cpDraggingHue){
      const hbar=document.getElementById('cp-hue');
      if(hbar){huePos(e,hbar);updateUI();dispatchColor();}
    }
  });

  document.addEventListener('mouseup',function(){
    cpDraggingGrad=false; cpDraggingHue=false;
  });

  // ── Hex input ────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded',function(){
    const inp=document.getElementById('cp-hex');
    if(inp){
      inp.addEventListener('input',function(){
        let v=this.value.trim();
        if(!v.startsWith('#'))v='#'+v;
        if(/^#[0-9a-fA-F]{6}$/.test(v)){
          const[r,g,b]=hexToRgb(v);
          [cpHue,cpSat,cpVal]=rgbToHsv(r,g,b);
          updateUI(); dispatchColor();
        }
      });
      inp.addEventListener('keydown',function(e){
        if(e.key==='Enter'||e.key==='Escape')closeCP();
        e.stopPropagation();
      });
      inp.addEventListener('mousedown',function(e){e.stopPropagation();this.focus();});
    }
  });
})();
