function addText(){
  const txt=document.getElementById('ti').value;
  if(!txt.trim())return;
  const fs=+document.getElementById('fsize').value||80;
  const fcolDot=document.getElementById('fcol-dot');
  let fill=fcolDot?fcolDot.style.background:'#111111';
  // Normalize rgb(...) → #hex
  if(fill.startsWith('rgb')){const m=fill.match(/\d+/g);if(m&&m.length>=3)fill='#'+[+m[0],+m[1],+m[2]].map(c=>c.toString(16).padStart(2,'0')).join('');}
  const fontList=S.selectedFonts.size>0?[...S.selectedFonts]:(S.curFont?[S.curFont]:[]);
  if(!fontList.length){toast('Seleziona almeno un font dalla lista a sinistra!');return;}
  const ctx=document.getElementById('dc').getContext('2d');
  const lh=fs*1.4;
  const padding=60;
  const maxTextWidth=S.canvasW-padding*2;

  // Calcola le righe necessarie per ogni font
  const linesPerFont=[];
  fontList.forEach((fontName,fi)=>{
    const css=S.fonts[fontName]||'sans-serif';
    ctx.font=`${fs}px ${css}`;

    // Suddividi il testo in righe che entrano nella larghezza del canvas
    const lines=[];
    let currentLine='';
    let currentWidth=0;

    for(const ch of txt){
      const chWidth=ctx.measureText(ch).width;
      if(currentWidth+chWidth>maxTextWidth && currentLine.length>0){
        lines.push(currentLine);
        currentLine=ch;
        currentWidth=chWidth;
      }else{
        currentLine+=ch;
        currentWidth+=chWidth;
      }
    }
    if(currentLine.length>0) lines.push(currentLine);

    linesPerFont.push({fontName,css,lines});
  });

  // Calcola l'altezza totale necessaria
  const totalLines=linesPerFont.reduce((sum,lf)=>sum+lf.lines.length,0);
  const neededHeight=totalLines*lh+padding*2;

  // Se necessario, aumenta l'altezza del canvas
  if(neededHeight>S.canvasH){
    const newHeight=Math.ceil(neededHeight/50)*50; // Arrotonda a multipli di 50
    S.canvasH=newHeight;
    document.getElementById('cvH').value=newHeight;
    applySize();
  }

  // Posiziona il testo centrato verticalmente
  const startY=(S.canvasH/2)-(totalLines*lh/2)+(fs*0.8);

  // Aggiungi le lettere al canvas
  let currentLineIndex=0;
  linesPerFont.forEach((lf,fi)=>{
    ctx.font=`${fs}px ${lf.css}`;
    lf.lines.forEach((line,lineIndex)=>{
      const y=startY+currentLineIndex*lh;
      currentLineIndex++;
      // Calcola la larghezza della riga per centrarla
      const lineWidth=ctx.measureText(line).width;
      let x=S.canvasW/2; // Inizia dal centro

      for(const ch of line){
        const w=ctx.measureText(ch).width;
        S.letters.push({id:uid++,ch,x:x-(lineWidth/2)+w/2,y,fontSize:fs,fill,fontFamily:lf.css,fontName:lf.fontName,sx:1,sy:1,rot:0,skew:0,op:1,borderWidth:0,borderColor:'#000000',layer:2});
        x+=w+fs*0.05;
      }
    });
  });

  render();upd();saveState();
  toast(`Testo aggiunto con ${fontList.length} font su ${totalLines} righe ✓`);

  // Scroll to top to ensure toolbar is visible
  const cw=document.getElementById('cw');
  if(cw) cw.scrollTop=0;
}

function splitSelectedLetter(){
  const sel=[...S.sel];if(sel.length!==1){toast('Seleziona esattamente una lettera da dividere.');return;}
  const lIndex=sel[0],L=S.letters[lIndex],openFont=S.openFonts[L.fontName];
  if(!openFont){alert('Devi usare un font caricato da te (.ttf/.otf) per poter dividere la geometria.');return;}
  const cmds=openFont.getPath(L.ch,0,0,L.fontSize).commands;
  let contours=[],cur=null;
  cmds.forEach(cmd=>{if(cmd.type==='M'){if(cur)contours.push(cur);cur=[cmd];}else if(cur)cur.push(cmd);});
  if(cur)contours.push(cur);
  if(contours.length<=1){toast('Questa lettera e un pezzo unico.');return;}
  let cdata=contours.map(c=>{
    let xMin=Infinity,xMax=-Infinity,yMin=Infinity,yMax=-Infinity;
    c.forEach(cmd=>{
      ['x','y','x1','y1','x2','y2'].forEach(k=>{if(cmd[k]!==undefined){if(k.startsWith('x')){xMin=Math.min(xMin,cmd[k]);xMax=Math.max(xMax,cmd[k]);}else{yMin=Math.min(yMin,cmd[k]);yMax=Math.max(yMax,cmd[k]);}}});
    });
    return{cmds:c,box:{xMin,xMax,yMin,yMax},area:(xMax-xMin)*(yMax-yMin)};
  });
  cdata.sort((a,b)=>b.area-a.area);
  let pieces=[];
  cdata.forEach(contour=>{
    let isHole=false;
    for(let piece of pieces){
      const pb=piece.box,cb=contour.box;
      if(cb.xMin>=pb.xMin-1&&cb.xMax<=pb.xMax+1&&cb.yMin>=pb.yMin-1&&cb.yMax<=pb.yMax+1){piece.contours.push(contour);isHole=true;break;}
    }
    if(!isHole)pieces.push({box:contour.box,contours:[contour]});
  });
  if(pieces.length<=1){toast('Questa lettera e un unico pezzo con un buco.');return;}
  const newIds=[];
  pieces.forEach(piece=>{
    const d=piece.contours.map(c=>c.cmds.map(cmd=>{
      if(cmd.type==='M')return`M ${cmd.x} ${cmd.y}`;
      if(cmd.type==='L')return`L ${cmd.x} ${cmd.y}`;
      if(cmd.type==='C')return`C ${cmd.x1} ${cmd.y1}, ${cmd.x2} ${cmd.y2}, ${cmd.x} ${cmd.y}`;
      if(cmd.type==='Q')return`Q ${cmd.x1} ${cmd.y1}, ${cmd.x} ${cmd.y}`;
      if(cmd.type==='Z')return'Z';return'';
    }).join(' ')).join(' ');
    S.letters.push({...L,id:uid++,customPath:d});
    newIds.push(S.letters.length-1);
  });
  S.letters.splice(lIndex,1);S.sel.clear();newIds.forEach(id=>S.sel.add(id));
  render();upd();toast(`Separato in ${pieces.length} pezzi 3D pronti ✓`);
}

function duplicateSel(){
  const copies=[];
  [...S.sel].forEach(i=>copies.push({...S.letters[i],id:uid++,x:S.letters[i].x+20,y:S.letters[i].y+20}));
  const newSel=new Set();
  copies.forEach(c=>{newSel.add(S.letters.length);S.letters.push(c);});
  S.sel=newSel;render();renderHandles();upd();saveState();
}

function deleteSelected(){
  [...S.sel].sort((a,b)=>b-a).forEach(i=>S.letters.splice(i,1));
  S.sel.clear();render();renderHandles();upd();saveState();
}

function deleteUnselected(){
  for(let i=S.letters.length-1;i>=0;i--){if(!S.sel.has(i))S.letters.splice(i,1);}
  S.sel.clear();render();renderHandles();upd();saveState();
  toast('Elementi non selezionati eliminati ✓');
}

function clearCanvas(){
  customConfirm('Svuotare il canvas?', () => {
    S.letters=[];
    S.sel.clear();
    uid = 0; // Reset unique IDs for elements
    S.currentProjectName = null;
    
    // Reset 3D state to avoid sync errors and stale data
    threeMeshes = [];
    threeExtrusionLevels = {};
    threeVisibilityState = {};
    threeSelectionOrder = [];
    threeSelectedMesh = null;
    if (S.history3D) S.history3D = [];
    S.historyIndex3D = -1;

    render(); renderHandles(); upd(); saveState();
    toast('Canvas svuotato correttamente ✓');
  });
}
