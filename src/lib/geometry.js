// geometry.js — extract straight segments from an SVG and detect structural wall lines.

/**
 * Parse an SVG string into a document + return the root <svg> element and its
 * coordinate box (viewBox if present, else width/height).
 */
export function parseSvg(svgText) {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const err = doc.querySelector('parsererror');
  if (err) throw new Error('That file could not be parsed as SVG.');
  const svg = doc.documentElement;
  if (!svg || svg.tagName.toLowerCase() !== 'svg') {
    throw new Error('No <svg> root element found.');
  }

  let box = null;
  const vb = svg.getAttribute('viewBox');
  if (vb) {
    const p = vb.trim().split(/[\s,]+/).map(Number);
    if (p.length === 4 && p.every((n) => Number.isFinite(n))) {
      box = { x: p[0], y: p[1], w: p[2], h: p[3] };
    }
  }
  if (!box) {
    const w = parseFloat(svg.getAttribute('width')) || 1000;
    const h = parseFloat(svg.getAttribute('height')) || 1000;
    box = { x: 0, y: 0, w, h };
  }
  return { doc, svg, box };
}

/** Flatten the `d` attribute of a <path> into straight segments. Curves are
 *  approximated by their endpoints (walls are straight, so this is fine). */
function pathSegments(d) {
  const segs = [];
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
  if (!tokens) return segs;

  let i = 0;
  let cmd = '';
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  const num = () => parseFloat(tokens[i++]);
  const isCmd = (t) => /^[a-zA-Z]$/.test(t);

  while (i < tokens.length) {
    if (isCmd(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();

    if (C === 'M') {
      let x = num();
      let y = num();
      if (rel) { x += cx; y += cy; }
      cx = x; cy = y; sx = x; sy = y;
      cmd = rel ? 'l' : 'L'; // subsequent pairs are implicit lineto
    } else if (C === 'L') {
      let x = num();
      let y = num();
      if (rel) { x += cx; y += cy; }
      segs.push({ x1: cx, y1: cy, x2: x, y2: y });
      cx = x; cy = y;
    } else if (C === 'H') {
      let x = num();
      if (rel) x += cx;
      segs.push({ x1: cx, y1: cy, x2: x, y2: cy });
      cx = x;
    } else if (C === 'V') {
      let y = num();
      if (rel) y += cy;
      segs.push({ x1: cx, y1: cy, x2: cx, y2: y });
      cy = y;
    } else if (C === 'Z') {
      segs.push({ x1: cx, y1: cy, x2: sx, y2: sy });
      cx = sx; cy = sy;
    } else {
      // curve / arc — consume operands, approximate with endpoint
      const counts = { C: 6, S: 4, Q: 4, T: 2, A: 7 };
      const n = counts[C] || 2;
      let ex = cx;
      let ey = cy;
      for (let k = 0; k < n; k++) {
        const v = num();
        if (k === n - 2) ex = rel ? cx + v : v;
        if (k === n - 1) ey = rel ? cy + v : v;
      }
      segs.push({ x1: cx, y1: cy, x2: ex, y2: ey });
      cx = ex; cy = ey;
    }
  }
  return segs;
}

/** Extract all straight segments from common SVG shape elements. */
export function extractSegments(svg) {
  const segs = [];
  const push = (s) => {
    if (Number.isFinite(s.x1) && Number.isFinite(s.y1) && Number.isFinite(s.x2) && Number.isFinite(s.y2)) {
      segs.push(s);
    }
  };

  svg.querySelectorAll('line').forEach((el) => {
    push({
      x1: +el.getAttribute('x1'), y1: +el.getAttribute('y1'),
      x2: +el.getAttribute('x2'), y2: +el.getAttribute('y2'),
    });
  });

  svg.querySelectorAll('rect').forEach((el) => {
    const x = +el.getAttribute('x') || 0;
    const y = +el.getAttribute('y') || 0;
    const w = +el.getAttribute('width') || 0;
    const h = +el.getAttribute('height') || 0;
    push({ x1: x, y1: y, x2: x + w, y2: y });
    push({ x1: x + w, y1: y, x2: x + w, y2: y + h });
    push({ x1: x + w, y1: y + h, x2: x, y2: y + h });
    push({ x1: x, y1: y + h, x2: x, y2: y });
  });

  const points = (el) => (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
  svg.querySelectorAll('polyline, polygon').forEach((el) => {
    const p = points(el);
    for (let k = 0; k + 3 < p.length; k += 2) {
      push({ x1: p[k], y1: p[k + 1], x2: p[k + 2], y2: p[k + 3] });
    }
    if (el.tagName.toLowerCase() === 'polygon' && p.length >= 4) {
      push({ x1: p[p.length - 2], y1: p[p.length - 1], x2: p[0], y2: p[1] });
    }
  });

  svg.querySelectorAll('path').forEach((el) => {
    const d = el.getAttribute('d');
    if (d) pathSegments(d).forEach(push);
  });

  return segs;
}

const len = (s) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1);

/** Cluster 1-D positions (weighted by segment length) into wall lines. */
function clusterAxis(items, tol) {
  const sorted = [...items].sort((a, b) => a.pos - b.pos);
  const clusters = [];
  for (const it of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && it.pos - last.pos <= tol) {
      const w = last.weight + it.weight;
      last.pos = (last.pos * last.weight + it.pos * it.weight) / w;
      last.weight = w;
      last.min = Math.min(last.min, it.min);
      last.max = Math.max(last.max, it.max);
    } else {
      clusters.push({ pos: it.pos, weight: it.weight, min: it.min, max: it.max });
    }
  }
  return clusters;
}

/**
 * Detect orthogonal structural wall lines and the dimension chains between them.
 * @param {Array} segments  output of extractSegments
 * @param {object} box       coordinate box {x,y,w,h}
 * @param {object} opts      { angleTol, mergeFrac, keepFrac, minLenFrac }
 */
export function detectWalls(segments, box, opts = {}) {
  const angleTol = opts.angleTol ?? 8; // degrees off-axis still counts as ortho
  const mergeFrac = opts.mergeFrac ?? 0.022; // wall-thickness merge band (folds both faces of a wall into one line)
  const keepFrac = opts.keepFrac ?? 0.28; // min coverage to count as structural
  const minLenFrac = opts.minLenFrac ?? 0.04; // ignore tiny segments (furniture/text)

  const diag = Math.hypot(box.w, box.h);
  const minLen = diag * minLenFrac;
  const mergeTol = Math.max(box.w, box.h) * mergeFrac;

  const hItems = []; // horizontal segments -> cluster by Y
  const vItems = []; // vertical segments -> cluster by X

  for (const s of segments) {
    const l = len(s);
    if (l < minLen) continue;
    let deg = (Math.atan2(s.y2 - s.y1, s.x2 - s.x1) * 180) / Math.PI;
    deg = ((deg % 180) + 180) % 180; // 0..180
    const isH = deg <= angleTol || deg >= 180 - angleTol;
    const isV = Math.abs(deg - 90) <= angleTol;
    if (isH) {
      hItems.push({ pos: (s.y1 + s.y2) / 2, weight: l, min: Math.min(s.x1, s.x2), max: Math.max(s.x1, s.x2) });
    } else if (isV) {
      vItems.push({ pos: (s.x1 + s.x2) / 2, weight: l, min: Math.min(s.y1, s.y2), max: Math.max(s.y1, s.y2) });
    }
  }

  const hClusters = clusterAxis(hItems, mergeTol).filter((c) => (c.max - c.min) >= box.w * keepFrac);
  const vClusters = clusterAxis(vItems, mergeTol).filter((c) => (c.max - c.min) >= box.h * keepFrac);

  let id = 0;
  const hWalls = hClusters
    .sort((a, b) => a.pos - b.pos)
    .map((c) => ({ id: `h${id++}`, axis: 'h', pos: c.pos, min: c.min, max: c.max, enabled: true }));
  const vWalls = vClusters
    .sort((a, b) => a.pos - b.pos)
    .map((c) => ({ id: `v${id++}`, axis: 'v', pos: c.pos, min: c.min, max: c.max, enabled: true }));

  return { hWalls, vWalls, box };
}

// Midpoint of the overlap of two [min,max] ranges; falls back to the midpoint
// of the first range when they don't overlap.
function overlapMid(aMin, aMax, bMin, bMax) {
  const lo = Math.max(aMin, bMin);
  const hi = Math.min(aMax, bMax);
  return lo <= hi ? (lo + hi) / 2 : (aMin + aMax) / 2;
}

/** Build dimension chains between consecutive enabled wall lines. Each dim also
 *  carries a `cross` coordinate marking where it sits *inside* the plan, used
 *  for the optional interior dimensions. */
export function buildDimensions(hWalls, vWalls) {
  const h = hWalls.filter((w) => w.enabled).sort((a, b) => a.pos - b.pos);
  const v = vWalls.filter((w) => w.enabled).sort((a, b) => a.pos - b.pos);
  const dims = [];

  // vertical dims (gaps between horizontal walls) — outer chain down the left;
  // interior line at the mid-x of where the two walls overlap.
  for (let i = 0; i + 1 < h.length; i++) {
    dims.push({
      axis: 'v', from: h[i].pos, to: h[i + 1].pos, units: h[i + 1].pos - h[i].pos,
      cross: overlapMid(h[i].min, h[i].max, h[i + 1].min, h[i + 1].max),
    });
  }
  // horizontal dims (gaps between vertical walls) — outer chain across the top;
  // interior line at the mid-y of where the two walls overlap.
  for (let i = 0; i + 1 < v.length; i++) {
    dims.push({
      axis: 'h', from: v[i].pos, to: v[i + 1].pos, units: v[i + 1].pos - v[i].pos,
      cross: overlapMid(v[i].min, v[i].max, v[i + 1].min, v[i + 1].max),
    });
  }
  return dims;
}
