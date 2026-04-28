// 1. TOKENIZER PATH completo
function tokenizePath(d) {
  const tokens = [];
  const re = /([MLHVCSQTAZmlhvcsqtaz])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g;
  let m;
  while ((m = re.exec(d)) !== null) {
    if (m[1]) tokens.push({ type: 'cmd', v: m[1] });
    else tokens.push({ type: 'num', v: parseFloat(m[2]) });
  }
  return tokens;
}

// Converte path in array di segmenti assoluti
function pathToAbsoluteSegments(d) {
  const tokens = tokenizePath(d);
  const segs = [];
  let i = 0, cx = 0, cy = 0, mx = 0, my = 0;

  function nums(n) {
    const a = [];
    for (let k = 0; k < n; k++) {
      if (i < tokens.length && tokens[i].type === 'num') a.push(tokens[i++].v);
      else a.push(0);
    }
    return a;
  }

  while (i < tokens.length) {
    if (tokens[i].type !== 'cmd') { i++; continue; }
    const cmd = tokens[i++].v;
    const UC = cmd.toUpperCase();
    const rel = cmd !== UC;

    const ox = () => rel ? cx : 0;
    const oy = () => rel ? cy : 0;

    const repeat = () => i < tokens.length && tokens[i].type === 'num';

    do {
      if (UC === 'Z') {
        segs.push({ cmd: 'Z' });
        cx = mx; cy = my;
        break;
      } else if (UC === 'M') {
        const [x, y] = nums(2);
        cx = x + ox(); cy = y + oy();
        mx = cx; my = cy;
        segs.push({ cmd: 'M', x: cx, y: cy });
        while (repeat()) {
          const [x2, y2] = nums(2);
          cx = x2 + (rel ? cx : 0); cy = y2 + (rel ? cy : 0);
          segs.push({ cmd: 'L', x: cx, y: cy });
        }
        break;
      } else if (UC === 'L') {
        const [x, y] = nums(2);
        cx = x + ox(); cy = y + oy();
        segs.push({ cmd: 'L', x: cx, y: cy });
      } else if (UC === 'H') {
        const [x] = nums(1);
        cx = x + ox();
        segs.push({ cmd: 'L', x: cx, y: cy });
      } else if (UC === 'V') {
        const [y] = nums(1);
        cy = y + oy();
        segs.push({ cmd: 'L', x: cx, y: cy });
      } else if (UC === 'C') {
        const [x1, y1, x2, y2, x, y] = nums(6);
        const ax1 = x1 + ox(), ay1 = y1 + oy();
        const ax2 = x2 + ox(), ay2 = y2 + oy();
        const ax = x + ox(), ay = y + oy();
        segs.push({ cmd: 'C', x1: ax1, y1: ay1, x2: ax2, y2: ay2, x: ax, y: ay });
        cx = ax; cy = ay;
      } else if (UC === 'S') {
        const prev = segs[segs.length - 1];
        const rx1 = (prev && prev.cmd === 'C') ? 2 * cx - prev.x2 : cx;
        const ry1 = (prev && prev.cmd === 'C') ? 2 * cy - prev.y2 : cy;
        const [x2, y2, x, y] = nums(4);
        const ax2 = x2 + ox(), ay2 = y2 + oy();
        const ax = x + ox(), ay = y + oy();
        segs.push({ cmd: 'C', x1: rx1, y1: ry1, x2: ax2, y2: ay2, x: ax, y: ay });
        cx = ax; cy = ay;
      } else if (UC === 'Q') {
        const [x1, y1, x, y] = nums(4);
        const ax1 = x1 + ox(), ay1 = y1 + oy();
        const ax = x + ox(), ay = y + oy();
        segs.push({ cmd: 'Q', x1: ax1, y1: ay1, x: ax, y: ay });
        cx = ax; cy = ay;
      } else if (UC === 'T') {
        const prev = segs[segs.length - 1];
        const rx1 = (prev && prev.cmd === 'Q') ? 2 * cx - prev.x1 : cx;
        const ry1 = (prev && prev.cmd === 'Q') ? 2 * cy - prev.y1 : cy;
        const [x, y] = nums(2);
        const ax = x + ox(), ay = y + oy();
        segs.push({ cmd: 'Q', x1: rx1, y1: ry1, x: ax, y: ay });
        cx = ax; cy = ay;
      } else if (UC === 'A') {
        const [rx2, ry2, xRot, laf, sf, x, y] = nums(7);
        const ax = x + ox(), ay = y + oy();
        segs.push({ cmd: 'A', rx: rx2, ry: ry2, xRot, laf, sf, x: ax, y: ay, x0: cx, y0: cy });
        cx = ax; cy = ay;
      } else {
        i++; break;
      }
    } while (UC !== 'M' && UC !== 'Z' && repeat());
  }
  return segs;
}

// 2. APPLICA MATRICE DI TRASFORMAZIONE a segmenti assoluti
function applyMatrixToSegs(segs, m) {
  const tx = (x, y) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f });
  return segs.map(s => {
    if (s.cmd === 'Z') return { cmd: 'Z' };
    if (s.cmd === 'M') { const p = tx(s.x, s.y); return { cmd: 'M', x: p.x, y: p.y }; }
    if (s.cmd === 'L') { const p = tx(s.x, s.y); return { cmd: 'L', x: p.x, y: p.y }; }
    if (s.cmd === 'C') {
      const p1 = tx(s.x1, s.y1), p2 = tx(s.x2, s.y2), p = tx(s.x, s.y);
      return { cmd: 'C', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, x: p.x, y: p.y };
    }
    if (s.cmd === 'Q') {
      const p1 = tx(s.x1, s.y1), p = tx(s.x, s.y);
      return { cmd: 'Q', x1: p1.x, y1: p1.y, x: p.x, y: p.y };
    }
    if (s.cmd === 'A') {
      const curves = arcToCubics(s.x0, s.y0, s.rx, s.ry, s.xRot, s.laf, s.sf, s.x, s.y);
      return curves.map(c => {
        const p1 = tx(c.x1, c.y1), p2 = tx(c.x2, c.y2), p = tx(c.x, c.y);
        return { cmd: 'C', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, x: p.x, y: p.y };
      });
    }
    return s;
  }).flat();
}

// 3. CONVERSIONE ARCO → CUBIC BEZIER
function arcToCubics(x1, y1, rx, ry, phi, fA, fS, x2, y2) {
  if (x1 === x2 && y1 === y2) return [];
  if (rx === 0 || ry === 0) return [{ x1: x1, y1: y1, x2: x2, y2: y2, x: x2, y: y2 }];

  const sinPhi = Math.sin(phi * Math.PI / 180);
  const cosPhi = Math.cos(phi * Math.PI / 180);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;

  rx = Math.abs(rx); ry = Math.abs(ry);
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) { rx *= Math.sqrt(lambda); ry *= Math.sqrt(lambda); }

  const rxSq = rx * rx, rySq = ry * ry;
  const x1pSq = x1p * x1p, y1pSq = y1p * y1p;
  let sq = Math.max(0, (rxSq * rySq - rxSq * y1pSq - rySq * x1pSq) / (rxSq * y1pSq + rySq * x1pSq));
  sq = Math.sqrt(sq) * (fA === fS ? -1 : 1);

  const cxp = sq * rx * y1p / ry;
  const cyp = -sq * ry * x1p / rx;
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  const ang = (ux, uy, vx, vy) => {
    const d = Math.sqrt((ux*ux+uy*uy)*(vx*vx+vy*vy));
    if (!d) return 0;
    const a = Math.acos(Math.max(-1, Math.min(1, (ux*vx+uy*vy)/d)));
    return (ux*vy - uy*vx < 0) ? -a : a;
  };
  let theta1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dTheta = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!fS && dTheta > 0) dTheta -= 2 * Math.PI;
  if (fS && dTheta < 0) dTheta += 2 * Math.PI;

  const n = Math.ceil(Math.abs(dTheta) / (Math.PI / 2));
  const curves = [];
  for (let i = 0; i < n; i++) {
    const t1 = theta1 + i * dTheta / n;
    const t2 = theta1 + (i + 1) * dTheta / n;
    const dt = t2 - t1;
    const a = 4 / 3 * Math.tan(dt / 4);
    const cos1 = Math.cos(t1), sin1 = Math.sin(t1);
    const cos2 = Math.cos(t2), sin2 = Math.sin(t2);
    const ox1 = cx + cosPhi * rx * cos1 - sinPhi * ry * sin1;
    const oy1 = cy + sinPhi * rx * cos1 + cosPhi * ry * sin1;
    const ox2 = cx + cosPhi * rx * cos2 - sinPhi * ry * sin2;
    const oy2 = cy + sinPhi * rx * cos2 + cosPhi * ry * sin2;
    curves.push({
      x1: ox1 + a * (-cosPhi * rx * sin1 - sinPhi * ry * cos1),
      y1: oy1 + a * (-sinPhi * rx * sin1 + cosPhi * ry * cos1),
      x2: ox2 - a * (-cosPhi * rx * sin2 - sinPhi * ry * cos2),
      y2: oy2 - a * (-sinPhi * rx * sin2 + cosPhi * ry * cos2),
      x: ox2, y: oy2
    });
  }
  return curves;
}

// 4. PARSE TRANSFORM STRING → DOMMatrix
function parseTransformToMatrix(transformStr) {
  let m = new DOMMatrix();
  if (!transformStr) return m;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let match;
  while ((match = re.exec(transformStr)) !== null) {
    const fn = match[1];
    const args = match[2].trim().split(/[\s,]+/).map(Number);
    const [a0=0,a1=0,a2=0,a3=0,a4=0,a5=0] = args;
    let tm;
    if (fn === 'matrix') {
      tm = new DOMMatrix([a0, a1, a2, a3, a4, a5]);
    } else if (fn === 'translate') {
      tm = new DOMMatrix().translate(a0, a1);
    } else if (fn === 'scale') {
      tm = new DOMMatrix().scale(a0, args.length > 1 ? a1 : a0);
    } else if (fn === 'rotate') {
      if (args.length > 1) {
        tm = new DOMMatrix().translate(a1, a2).rotate(a0).translate(-a1, -a2);
      } else {
        tm = new DOMMatrix().rotate(a0);
      }
    } else if (fn === 'skewX') {
      tm = new DOMMatrix([1, 0, Math.tan(a0 * Math.PI / 180), 1, 0, 0]);
    } else if (fn === 'skewY') {
      tm = new DOMMatrix([1, Math.tan(a0 * Math.PI / 180), 0, 1, 0, 0]);
    } else continue;
    m = m.multiply(tm);
  }
  return m;
}

// 5. ELEMENTO SVG → PATH DATA
function svgElToPathD(el) {
  const tag = el.tagName.toLowerCase().replace(/^svg:/,'');
  if (tag === 'path') return el.getAttribute('d') || '';
  if (tag === 'rect') {
    const x = +el.getAttribute('x')||0, y = +el.getAttribute('y')||0;
    const w = +el.getAttribute('width')||0, h = +el.getAttribute('height')||0;
    const rx = Math.min(+el.getAttribute('rx')||0, w/2);
    const ry = Math.min(+el.getAttribute('ry')||rx, h/2);
    if (!w || !h) return '';
    if (rx || ry) {
      return `M${x+rx},${y} L${x+w-rx},${y} A${rx},${ry} 0 0 1 ${x+w},${y+ry} L${x+w},${y+h-ry} A${rx},${ry} 0 0 1 ${x+w-rx},${y+h} L${x+rx},${y+h} A${rx},${ry} 0 0 1 ${x},${y+h-ry} L${x},${y+ry} A${rx},${ry} 0 0 1 ${x+rx},${y} Z`;
    }
    return `M${x},${y} L${x+w},${y} L${x+w},${y+h} L${x},${y+h} Z`;
  }
  if (tag === 'circle') {
    const cx = +el.getAttribute('cx')||0, cy = +el.getAttribute('cy')||0, r = +el.getAttribute('r')||0;
    if (!r) return '';
    return `M${cx-r},${cy} A${r},${r} 0 1 0 ${cx+r},${cy} A${r},${r} 0 1 0 ${cx-r},${cy} Z`;
  }
  if (tag === 'ellipse') {
    const cx = +el.getAttribute('cx')||0, cy = +el.getAttribute('cy')||0;
    const rx = +el.getAttribute('rx')||0, ry = +el.getAttribute('ry')||0;
    if (!rx || !ry) return '';
    return `M${cx-rx},${cy} A${rx},${ry} 0 1 0 ${cx+rx},${cy} A${rx},${ry} 0 1 0 ${cx-rx},${cy} Z`;
  }
  if (tag === 'line') {
    const x1 = +el.getAttribute('x1')||0, y1 = +el.getAttribute('y1')||0;
    const x2 = +el.getAttribute('x2')||0, y2 = +el.getAttribute('y2')||0;
    return `M${x1},${y1} L${x2},${y2}`;
  }
  if (tag === 'polyline' || tag === 'polygon') {
    const pts = (el.getAttribute('points')||'').trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (pts.length < 4) return '';
    let d = `M${pts[0]},${pts[1]}`;
    for (let k = 2; k < pts.length - 1; k += 2) d += ` L${pts[k]},${pts[k+1]}`;
    if (tag === 'polygon') d += ' Z';
    return d;
  }
  return '';
}

// 6. STROKE → FILL
/**
 * Offset a 2D polygon contour outward by `delta` units.
 *
 * Coordinate system: SVG (Y points DOWN).
 * In SVG, a CCW polygon has POSITIVE signed area.
 * Outward normal for CCW polygon in SVG: rotate edge vector +90° (i.e. right-hand side).
 *
 * pts: array of [x, y], closed polygon (last point ≠ first)
 * delta: > 0 = expand outward for a CCW contour
 */
function offsetContour2D(pts, delta) {
  const n = pts.length;
  if (n < 3) return pts.slice();
  const result = [];

  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const curr = pts[i];
    const next = pts[(i + 1) % n];

    // Edge A: prev→curr, Edge B: curr→next
    const ax = curr[0] - prev[0], ay = curr[1] - prev[1];
    const bx = next[0] - curr[0], by = next[1] - curr[1];

    const la = Math.sqrt(ax*ax + ay*ay);
    const lb = Math.sqrt(bx*bx + by*by);
    if (la < 1e-10 || lb < 1e-10) { result.push([curr[0], curr[1]]); continue; }

    // Outward unit normals (for CCW polygon in SVG, outward = rotate edge CW = (+dy, -dx)/len)
    const nax =  ay / la,  nay = -ax / la;   // right-hand normal of edge A
    const nbx =  by / lb,  nby = -bx / lb;   // right-hand normal of edge B

    // Bisector of the two outward normals
    let bix = nax + nbx, biy = nay + nby;
    const blen = Math.sqrt(bix*bix + biy*biy);

    if (blen < 1e-10) {
      // Edges are anti-parallel (180° turn): just use normal of B
      result.push([curr[0] + nbx * delta, curr[1] + nby * delta]);
      continue;
    }
    bix /= blen; biy /= blen;

    // Miter scale: distance along bisector to reach offset distance `delta`
    const dot = nax * bix + nay * biy;          // cos(half-angle)
    const miter = Math.abs(dot) > 1e-4 ? delta / dot : delta;

    // Clamp miter at 2.5× delta – tighter limit reduces self-intersections on
    // sharp concave corners of curved letters (was 4×)
    const limit = Math.abs(delta) * 2.5;
    const clamped = Math.max(-limit, Math.min(limit, miter));

    result.push([curr[0] + bix * clamped, curr[1] + biy * clamped]);
  }
  return result;
}

/**
 * Build an SVG path string for a filled border ring around a glyph path.
 *
 * Strategy (correct, simple):
 *   - Parse every subpath into a point array
 *   - Classify each subpath as outer (positive signed area in SVG coords) or hole (negative)
 *   - Border path = [outer contours expanded by borderWidth] + [original outer contours reversed
 *     as holes] + [original hole contours unchanged as holes]
 *   - fill-rule="evenodd" on the resulting path produces only the outer ring.
 *
 * This means the border never enters the interior of letters (e.g. the hole in "O"),
 * never overlaps the glyph fill, and never spills into adjacent characters.
 */
function buildBorderPathD(pathD, borderWidth) {
  if (!borderWidth || borderWidth <= 0) return null;

  const segs = pathToAbsoluteSegments(pathD);
  if (!segs.length) return null;

  // ── 1. Discretise each subpath into a flat point array ──────────────────
  const BEZIER_STEPS = 16;
  const subpaths = [];
  let current = [];
  let cx = 0, cy = 0, startX = 0, startY = 0;

  for (const s of segs) {
    if (s.cmd === 'M') {
      if (current.length >= 3) subpaths.push(current);
      current = [[s.x, s.y]];
      cx = startX = s.x; cy = startY = s.y;
    } else if (s.cmd === 'L') {
      current.push([s.x, s.y]); cx = s.x; cy = s.y;
    } else if (s.cmd === 'H') {
      current.push([s.x, cy]); cx = s.x;
    } else if (s.cmd === 'V') {
      current.push([cx, s.y]); cy = s.y;
    } else if (s.cmd === 'C') {
      for (let k = 1; k <= BEZIER_STEPS; k++) {
        const t = k / BEZIER_STEPS, mt = 1 - t;
        current.push([
          mt*mt*mt*cx + 3*mt*mt*t*s.x1 + 3*mt*t*t*s.x2 + t*t*t*s.x,
          mt*mt*mt*cy + 3*mt*mt*t*s.y1 + 3*mt*t*t*s.y2 + t*t*t*s.y
        ]);
      }
      cx = s.x; cy = s.y;
    } else if (s.cmd === 'Q') {
      for (let k = 1; k <= BEZIER_STEPS; k++) {
        const t = k / BEZIER_STEPS, mt = 1 - t;
        current.push([
          mt*mt*cx + 2*mt*t*s.x1 + t*t*s.x,
          mt*mt*cy + 2*mt*t*s.y1 + t*t*s.y
        ]);
      }
      cx = s.x; cy = s.y;
    } else if (s.cmd === 'Z') {
      // Remove last point if it duplicates the start (common in font paths)
      if (current.length > 1) {
        const last = current[current.length - 1];
        const dx = last[0] - current[0][0], dy = last[1] - current[0][1];
        if (Math.sqrt(dx*dx + dy*dy) < 0.5) current.pop();
      }
      if (current.length >= 3) subpaths.push(current);
      current = [];
      cx = startX; cy = startY;
    }
  }
  if (current.length >= 3) subpaths.push(current);
  if (!subpaths.length) return null;

  // ── 2. Signed area: positive = CCW winding (outer in SVG), negative = CW (hole) ──
  function signedArea(pts) {
    let a = 0;
    for (let i = 0, n = pts.length; i < n; i++) {
      const j = (i + 1) % n;
      a += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
    }
    return a / 2;
  }

  // ── 3. Remove duplicate / near-duplicate consecutive points ──────────────
  function dedupe(pts) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i][0] - out[out.length-1][0];
      const dy = pts[i][1] - out[out.length-1][1];
      if (Math.sqrt(dx*dx + dy*dy) > 0.1) out.push(pts[i]);
    }
    return out;
  }

  // ── 4. Convert point array back to a closed SVG subpath string ───────────
  function ptsToD(pts) {
    if (pts.length < 3) return '';
    let d = `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`;
    for (let k = 1; k < pts.length; k++) d += ` L${pts[k][0].toFixed(2)},${pts[k][1].toFixed(2)}`;
    return d + ' Z';
  }

  // ── 5. Classify subpaths ─────────────────────────────────────────────────
  const outers = [];  // positive area = CCW = outer fill
  const holes  = [];  // negative area = CW  = counter-clockwise holes

  for (const raw of subpaths) {
    const pts = dedupe(raw);
    if (pts.length < 3) continue;
    const area = signedArea(pts);
    if (area >= 0) outers.push(pts);
    else           holes.push(pts);
  }

  if (!outers.length) return null;

  // ── 6. Build the border path ─────────────────────────────────────────────
  let borderD = '';

  for (const pts of outers) {
    // Expand outward
    const expanded = offsetContour2D(pts, borderWidth);
    if (expanded.length < 3) continue;
    borderD += ptsToD(expanded);          // outer ring (CCW, positive area)
    borderD += ptsToD([...pts].reverse()); // hole = original reversed → CW
  }

  // Original holes: keep them as-is (CW), they cancel any fill that might bleed in
  for (const pts of holes) {
    borderD += ptsToD(pts);
  }

  return borderD || null;
}

function strokeToFillPath(segs, strokeWidth) {
  const hw = strokeWidth / 2;
  const pts = [];
  let lastX = 0, lastY = 0;
  for (const s of segs) {
    if (s.cmd === 'M' || s.cmd === 'L') { pts.push([s.x, s.y]); lastX = s.x; lastY = s.y; }
    else if (s.cmd === 'C') {
      for (let t = 0; t <= 1; t += 0.125) {
        const mt = 1 - t;
        const x = mt*mt*mt*lastX + 3*mt*mt*t*s.x1 + 3*mt*t*t*s.x2 + t*t*t*s.x;
        const y = mt*mt*mt*lastY + 3*mt*mt*t*s.y1 + 3*mt*t*t*s.y2 + t*t*t*s.y;
        pts.push([x, y]);
      }
      lastX = s.x; lastY = s.y;
    } else if (s.cmd === 'Q') {
      for (let t = 0; t <= 1; t += 0.125) {
        const mt = 1 - t;
        const x = mt*mt*lastX + 2*mt*t*s.x1 + t*t*s.x;
        const y = mt*mt*lastY + 2*mt*t*s.y1 + t*t*s.y;
        pts.push([x, y]);
      }
      lastX = s.x; lastY = s.y;
    }
  }
  if (pts.length < 2) return null;

  function norm(ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const len = Math.sqrt(dx*dx+dy*dy);
    if (!len) return [0, 0];
    return [-dy/len, dx/len];
  }

  const side1 = [], side2 = [];
  for (let k = 0; k < pts.length; k++) {
    let nx, ny;
    if (k === pts.length - 1) { [nx, ny] = norm(pts[k-1][0], pts[k-1][1], pts[k][0], pts[k][1]); }
    else { [nx, ny] = norm(pts[k][0], pts[k][1], pts[k+1][0], pts[k+1][1]); }
    side1.push([pts[k][0] + nx*hw, pts[k][1] + ny*hw]);
    side2.push([pts[k][0] - nx*hw, pts[k][1] - ny*hw]);
  }

  let d = `M${side1[0][0].toFixed(2)},${side1[0][1].toFixed(2)}`;
  for (let k = 1; k < side1.length; k++) d += ` L${side1[k][0].toFixed(2)},${side1[k][1].toFixed(2)}`;
  for (let k = side2.length - 1; k >= 0; k--) d += ` L${side2[k][0].toFixed(2)},${side2[k][1].toFixed(2)}`;
  d += ' Z';
  return d;
}

// 7. RACCOLTA RICORSIVA con matrice accumulata
function collectShapesV2(node, shapes, parentMatrix) {
  if (!node || node.nodeType !== 1) return;
  const tag = node.tagName.toLowerCase().replace(/^svg:/,'');
  const skip = ['defs','style','title','desc','metadata','symbol','clippath','mask',
                'filter','lineargradient','radialgradient','pattern','use','script'];
  if (skip.includes(tag)) return;

  const myTfStr = node.getAttribute ? (node.getAttribute('transform') || '') : '';
  const myMatrix = myTfStr ? parseTransformToMatrix(myTfStr) : new DOMMatrix();
  const accMatrix = parentMatrix.multiply(myMatrix);

  const leafTags = ['path','rect','circle','ellipse','line','polyline','polygon'];
  if (leafTags.includes(tag)) {
    const rawD = svgElToPathD(node);
    if (!rawD) return;

    const style = node.getAttribute('style') || '';
    const getAttr = (attr, cssName) => {
      const cssMatch = style.match(new RegExp(cssName + '\\s*:\\s*([^;]+)', 'i'));
      if (cssMatch) return cssMatch[1].trim();
      return node.getAttribute(attr) || null;
    };
    const fill = getAttr('fill', 'fill');
    const stroke = getAttr('stroke', 'stroke');
    const strokeWidth = parseFloat(getAttr('stroke-width', 'stroke-width') || '1');
    const display = getAttr('display', 'display');
    const visibility = getAttr('visibility', 'visibility');

    if (display === 'none' || visibility === 'hidden') return;

    shapes.push({ rawD, matrix: accMatrix, fill, stroke, strokeWidth });
    return;
  }

  Array.from(node.childNodes || []).forEach(child => {
    collectShapesV2(child, shapes, accMatrix);
  });
}

// 8. CONVERTI SEGMENTI → STRINGA PATH pulita
function segsToPathD(segs) {
  return segs.map(s => {
    if (s.cmd === 'Z') return 'Z';
    const r = n => parseFloat(n.toFixed(3));
    if (s.cmd === 'M') return `M${r(s.x)},${r(s.y)}`;
    if (s.cmd === 'L') return `L${r(s.x)},${r(s.y)}`;
    if (s.cmd === 'C') return `C${r(s.x1)},${r(s.y1)} ${r(s.x2)},${r(s.y2)} ${r(s.x)},${r(s.y)}`;
    if (s.cmd === 'Q') return `Q${r(s.x1)},${r(s.y1)} ${r(s.x)},${r(s.y)}`;
    return '';
  }).filter(Boolean).join(' ');
}

// 9. CALCOLA BOUNDING BOX tramite DOM
function calcRealBBox(pathD) {
  const tmpSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  tmpSvg.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;visibility:hidden;pointer-events:none';
  document.body.appendChild(tmpSvg);
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', pathD);
  tmpSvg.appendChild(p);
  let bbox;
  try { bbox = p.getBBox(); } catch(e) { bbox = {x:0, y:0, width:0, height:0}; }
  tmpSvg.remove();
  return bbox;
}

// 10. SCALA path
function scaleSegs(segs, scale) {
  return segs.map(s => {
    if (s.cmd === 'Z') return { cmd: 'Z' };
    const sc = v => v * scale;
    if (s.cmd === 'M') return { cmd: 'M', x: sc(s.x), y: sc(s.y) };
    if (s.cmd === 'L') return { cmd: 'L', x: sc(s.x), y: sc(s.y) };
    if (s.cmd === 'C') return { cmd: 'C', x1: sc(s.x1), y1: sc(s.y1), x2: sc(s.x2), y2: sc(s.y2), x: sc(s.x), y: sc(s.y) };
    if (s.cmd === 'Q') return { cmd: 'Q', x1: sc(s.x1), y1: sc(s.y1), x: sc(s.x), y: sc(s.y) };
    return s;
  });
}

// 11. TRASLA path
function translateSegs(segs, dx, dy) {
  return segs.map(s => {
    if (s.cmd === 'Z') return { cmd: 'Z' };
    const tr = (x, y) => ({ x: x + dx, y: y + dy });
    if (s.cmd === 'M') { const p = tr(s.x, s.y); return { cmd: 'M', x: p.x, y: p.y }; }
    if (s.cmd === 'L') { const p = tr(s.x, s.y); return { cmd: 'L', x: p.x, y: p.y }; }
    if (s.cmd === 'C') {
      const p1 = tr(s.x1, s.y1), p2 = tr(s.x2, s.y2), p = tr(s.x, s.y);
      return { cmd: 'C', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, x: p.x, y: p.y };
    }
    if (s.cmd === 'Q') {
      const p1 = tr(s.x1, s.y1), p = tr(s.x, s.y);
      return { cmd: 'Q', x1: p1.x, y1: p1.y, x: p.x, y: p.y };
    }
    return s;
  });
}

function escHtml(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function r(v){ return v !== undefined ? (Math.round(v*100)/100) : 0; }
