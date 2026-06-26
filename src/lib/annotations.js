// annotations.js — shared SVG-string builders for the north point and title
// block, used by both the on-screen viewer and the file export so they match.

const BLUE = '#2ea3ff';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Format a length given in millimetres into the chosen display unit. */
export function formatLength(mm, unit = 'mm') {
  if (unit === 'm') {
    return (mm / 1000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (unit === 'cm') {
    return (mm / 10).toLocaleString('en-US', { maximumFractionDigits: 1 });
  }
  return Math.round(mm).toLocaleString('en-US');
}

/** Common metrics derived from the plan's coordinate box. */
export function metrics(box) {
  const m = Math.max(box.w, box.h);
  return {
    m,
    off: m * 0.04,
    tick: m * 0.04 * 0.18,
    fs: m * 0.018,
    sw: m * 0.0016,
    padX: m * 0.09,
    padTop: m * 0.15,
    padBottom: m * 0.2,
    tbH: m * 0.09,
  };
}

/** Expanded viewBox that leaves room for dimension chains, north point and the
 *  title block. Returned both as an object and a ready string. */
export function viewBoxFor(box) {
  const { padX, padTop, padBottom } = metrics(box);
  const nb = {
    x: box.x - padX,
    y: box.y - padTop,
    w: box.w + padX * 2,
    h: box.h + padTop + padBottom,
  };
  return { nb, vb: `${nb.x} ${nb.y} ${nb.w} ${nb.h}` };
}

/** North compass, placed in the right margin near the bottom of the drawing.
 *  `angle` is degrees clockwise from straight up. */
export function northMarkup(box, angle = 0) {
  const { tick, fs, sw, m, padX } = metrics(box);
  const r = m * 0.04;
  const cx = box.x + box.w + padX * 0.5;
  const cy = box.y + box.h - r * 1.4;
  const rad = ((angle - 90) * Math.PI) / 180;
  const ex = cx + Math.cos(rad) * r;
  const ey = cy + Math.sin(rad) * r;
  const sx = cx - Math.cos(rad) * r * 0.55;
  const sy = cy - Math.sin(rad) * r * 0.55;
  // arrowhead
  const ah = r * 0.32;
  const back = rad + Math.PI;
  const p1x = ex + Math.cos(back - 0.4) * ah;
  const p1y = ey + Math.sin(back - 0.4) * ah;
  const p2x = ex + Math.cos(back + 0.4) * ah;
  const p2y = ey + Math.sin(back + 0.4) * ah;
  return `<g id="bp-north">`
    + `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="none" stroke="${BLUE}" stroke-width="${sw.toFixed(2)}"/>`
    + `<line x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" stroke="${BLUE}" stroke-width="${(sw * 1.8).toFixed(2)}"/>`
    + `<polygon points="${ex.toFixed(1)},${ey.toFixed(1)} ${p1x.toFixed(1)},${p1y.toFixed(1)} ${p2x.toFixed(1)},${p2y.toFixed(1)}" fill="${BLUE}"/>`
    + `<text x="${ex.toFixed(1)}" y="${(ey - tick * 1.2).toFixed(1)}" fill="${BLUE}" font-family="Consolas, monospace" font-size="${fs.toFixed(1)}" font-weight="700" text-anchor="middle">N</text>`
    + `</g>`;
}

/**
 * Title block strip along the bottom of the drawing.
 * fields = { title, scale, sheet, date, drawnBy }
 */
export function titleBlockMarkup(box, fields = {}) {
  const { off, sw, m } = metrics(box);
  const { nb } = viewBoxFor(box);

  // Span the full page (viewBox) width and stretch down to the bottom edge.
  const margin = m * 0.012;
  const x0 = nb.x + margin;
  const w = nb.w - margin * 2;
  const y0 = box.y + box.h + off;
  const h = Math.max(m * 0.07, nb.y + nb.h - margin - y0);

  const titleW = w * 0.42;
  const gx = x0 + titleW;
  const colW = (w - titleW) / 3;
  const rowH = h / 2;
  const pad = m * 0.008;
  // Three-tier hierarchy: title (largest) > value > label (smallest).
  const labelFs = m * 0.011;
  const valueFs = m * 0.019;
  const titleFs = m * 0.044;

  // Monospace glyphs are ~0.6em wide, so we can size text to fit without DOM
  // measurement: shrink the font until the string fits the available width,
  // never going below `minFs`.
  const fit = (t, availW, desired, ratio = 0.62, minFs = desired * 0.4) => {
    const s = String(t ?? '');
    if (!s) return desired;
    return Math.max(minFs, Math.min(desired, (availW - pad * 2) / (s.length * ratio)));
  };

  const rect = (x, y, wd, ht) =>
    `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${wd.toFixed(1)}" height="${ht.toFixed(1)}" fill="none" stroke="${BLUE}" stroke-width="${sw.toFixed(2)}"/>`;
  const line = (x1, y1, x2, y2) =>
    `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${BLUE}" stroke-width="${sw.toFixed(2)}"/>`;
  const labelEl = (x, y, t, availW) => {
    const fs = fit(t, availW, labelFs, 0.78);
    return `<text x="${(x + pad).toFixed(1)}" y="${(y + pad + fs).toFixed(1)}" fill="${BLUE}" opacity="0.65" font-family="Consolas, monospace" font-size="${fs.toFixed(1)}" letter-spacing="${(fs * 0.1).toFixed(2)}">${t}</text>`;
  };
  const valueEl = (x, y, t, availW, desired = valueFs, weight = 400, minFs) => {
    const fs = fit(t, availW, desired, 0.62, minFs ?? desired * 0.4);
    const by = y + pad + labelFs + pad + fs;
    return `<text x="${(x + pad).toFixed(1)}" y="${by.toFixed(1)}" fill="${BLUE}" font-family="Consolas, monospace" font-size="${fs.toFixed(1)}" font-weight="${weight}">${esc(t)}</text>`;
  };
  const cell = (x, y, lab, val) =>
    labelEl(x, y, lab, colW) + valueEl(x, y, val, colW) + rect(x, y, colW, rowH);

  const parts = [rect(x0, y0, w, h), line(gx, y0, gx, y0 + h)];
  // title (spans the left part, largest type; floored above the value size so
  // the hierarchy holds even when a long title is shrunk to fit)
  parts.push(labelEl(x0, y0, 'TITLE', titleW));
  parts.push(valueEl(x0, y0, fields.title || '', titleW, titleFs, 700, valueFs * 1.2));
  // 3x2 info grid on the right
  parts.push(cell(gx, y0, 'SCALE', fields.scale || ''));
  parts.push(cell(gx + colW, y0, 'SHEET SIZE', fields.sheet || ''));
  parts.push(cell(gx + colW * 2, y0, 'UNITS', fields.units || ''));
  parts.push(cell(gx, y0 + rowH, 'DATE', fields.date || ''));
  parts.push(cell(gx + colW, y0 + rowH, 'DRAWN BY', fields.drawnBy || ''));
  parts.push(cell(gx + colW * 2, y0 + rowH, 'ADDRESS', fields.address || ''));

  return `<g id="bp-title-block">${parts.join('')}</g>`;
}
