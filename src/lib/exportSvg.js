// exportSvg.js — serialise the original SVG plus a blue annotation overlay.

const BLUE = '#2ea3ff';

function fmt(mm) {
  const v = Math.round(mm);
  return v.toLocaleString('en-US');
}

/**
 * Produce annotation SVG markup (a single <g>) for the given dimensions,
 * manual measurements and north compass. Returns a string of SVG children.
 */
export function buildAnnotationGroup({ dims, manual, mmPerUnit, box, north }) {
  const off = Math.max(box.w, box.h) * 0.04; // offset of dimension chains from the plan
  const tick = off * 0.18;
  const fs = Math.max(box.w, box.h) * 0.018;
  const sw = Math.max(box.w, box.h) * 0.0016;
  const parts = [];

  const line = (x1, y1, x2, y2, w = sw) =>
    `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${BLUE}" stroke-width="${w}"/>`;
  const text = (x, y, str, anchor = 'middle', rot = 0) =>
    `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" fill="${BLUE}" font-family="Consolas, monospace" font-size="${fs.toFixed(1)}" text-anchor="${anchor}" transform="rotate(${rot} ${x.toFixed(1)} ${y.toFixed(1)})">${str}</text>`;

  const topY = box.y - off;
  const leftX = box.x - off;

  for (const d of dims) {
    const mm = d.units * mmPerUnit;
    if (d.axis === 'h') {
      parts.push(line(d.from, topY, d.to, topY));
      parts.push(line(d.from, topY - tick, d.from, topY + tick));
      parts.push(line(d.to, topY - tick, d.to, topY + tick));
      parts.push(text((d.from + d.to) / 2, topY - tick, fmt(mm)));
    } else {
      parts.push(line(leftX, d.from, leftX, d.to));
      parts.push(line(leftX - tick, d.from, leftX + tick, d.from));
      parts.push(line(leftX - tick, d.to, leftX + tick, d.to));
      parts.push(text(leftX - tick, (d.from + d.to) / 2, fmt(mm), 'middle', -90));
    }
  }

  for (const m of manual) {
    const mm = Math.hypot(m.x2 - m.x1, m.y2 - m.y1) * mmPerUnit;
    parts.push(line(m.x1, m.y1, m.x2, m.y2));
    const a = Math.atan2(m.y2 - m.y1, m.x2 - m.x1);
    const nx = Math.sin(a) * tick;
    const ny = -Math.cos(a) * tick;
    parts.push(line(m.x1 + nx, m.y1 + ny, m.x1 - nx, m.y1 - ny));
    parts.push(line(m.x2 + nx, m.y2 + ny, m.x2 - nx, m.y2 - ny));
    parts.push(text((m.x1 + m.x2) / 2 + nx * 1.6, (m.y1 + m.y2) / 2 + ny * 1.6, fmt(mm)));
  }

  // North compass, placed top-right of the plan box
  if (north) {
    const r = off * 0.9;
    const cx = box.x + box.w - r;
    const cy = box.y - off + r * 0.2;
    const rad = ((north.angle - 90) * Math.PI) / 180;
    const ex = cx + Math.cos(rad) * r;
    const ey = cy + Math.sin(rad) * r;
    parts.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="none" stroke="${BLUE}" stroke-width="${sw}"/>`);
    parts.push(line(cx, cy, ex, ey, sw * 1.6));
    parts.push(text(ex, ey - tick * 0.5, 'N'));
  }

  return `<g id="blueprinter-annotations">${parts.join('')}</g>`;
}

/** Inject the annotation group into the original SVG and expand the viewBox so
 *  the dimension chains aren't clipped. Returns a complete SVG string. */
export function exportAnnotatedSvg({ svg, box, dims, manual, mmPerUnit, north }) {
  const clone = svg.cloneNode(true);
  clone.querySelectorAll('#blueprinter-annotations').forEach((n) => n.remove());

  const pad = Math.max(box.w, box.h) * 0.09;
  const nb = { x: box.x - pad, y: box.y - pad, w: box.w + pad * 2, h: box.h + pad * 2 };
  clone.setAttribute('viewBox', `${nb.x} ${nb.y} ${nb.w} ${nb.h}`);
  clone.removeAttribute('width');
  clone.removeAttribute('height');

  const group = buildAnnotationGroup({ dims, manual, mmPerUnit, box, north });
  let xml = new XMLSerializer().serializeToString(clone);
  xml = xml.replace(/<\/svg>\s*$/, `${group}</svg>`);
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + xml;
}
