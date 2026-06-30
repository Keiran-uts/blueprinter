// exportSvg.js — serialise the original SVG plus a blue annotation overlay
// (dimension chains, manual measurements, north point and title block).

import { metrics, viewBoxFor, northMarkup, titleBlockMarkup, scaleBarMarkup, formatLength } from './annotations';

const INK = '#111111';

/** Dimension chains + manual measurements as an SVG-string group. */
function buildDimGroup({ dims, manual, mmPerUnit, box, showInterior, unit }) {
  const fmt = (mm) => formatLength(mm, unit);
  const { off, tick, fs, sw } = metrics(box);
  const parts = [];

  const line = (x1, y1, x2, y2, w = sw) =>
    `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${INK}" stroke-width="${w}"/>`;
  const text = (x, y, str, anchor = 'middle', rot = 0) =>
    `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" fill="${INK}" font-family="'NB Akademie', 'Helvetica Neue', Inter, Arial, sans-serif" font-size="${fs.toFixed(1)}" text-anchor="${anchor}" transform="rotate(${rot} ${x.toFixed(1)} ${y.toFixed(1)})">${str}</text>`;
  // architectural diagonal "slash" tick at a dimension endpoint
  const slash = (px, py) => line(px - tick, py + tick, px + tick, py - tick);
  // dashed dimension line (used for the interior dimensions)
  const dline = (x1, y1, x2, y2) =>
    `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${INK}" stroke-width="${sw}" stroke-dasharray="${tick.toFixed(1)} ${(tick * 0.6).toFixed(1)}"/>`;

  const topY = box.y - off;
  const leftX = box.x - off;

  for (const d of dims) {
    const mm = d.units * mmPerUnit;
    if (d.axis === 'h') {
      parts.push(line(d.from, topY, d.to, topY));
      parts.push(slash(d.from, topY));
      parts.push(slash(d.to, topY));
      parts.push(text((d.from + d.to) / 2, topY - tick, fmt(mm)));
    } else {
      parts.push(line(leftX, d.from, leftX, d.to));
      parts.push(slash(leftX, d.from));
      parts.push(slash(leftX, d.to));
      parts.push(text(leftX - tick, (d.from + d.to) / 2, fmt(mm), 'middle', -90));
    }
  }

  if (showInterior) {
    for (const d of dims) {
      if (d.cross == null) continue;
      const mm = d.units * mmPerUnit;
      if (d.axis === 'h') {
        parts.push(dline(d.from, d.cross, d.to, d.cross));
        parts.push(slash(d.from, d.cross));
        parts.push(slash(d.to, d.cross));
        parts.push(text((d.from + d.to) / 2, d.cross - tick * 0.6, fmt(mm)));
      } else {
        parts.push(dline(d.cross, d.from, d.cross, d.to));
        parts.push(slash(d.cross, d.from));
        parts.push(slash(d.cross, d.to));
        parts.push(text(d.cross - tick * 0.6, (d.from + d.to) / 2, fmt(mm), 'middle', -90));
      }
    }
  }

  for (const mseg of manual) {
    const mm = Math.hypot(mseg.x2 - mseg.x1, mseg.y2 - mseg.y1) * mmPerUnit;
    parts.push(line(mseg.x1, mseg.y1, mseg.x2, mseg.y2));
    parts.push(slash(mseg.x1, mseg.y1));
    parts.push(slash(mseg.x2, mseg.y2));
    const a = Math.atan2(mseg.y2 - mseg.y1, mseg.x2 - mseg.x1);
    const nx = Math.sin(a) * tick;
    const ny = -Math.cos(a) * tick;
    parts.push(text((mseg.x1 + mseg.x2) / 2 + nx * 1.6, (mseg.y1 + mseg.y2) / 2 + ny * 1.6, fmt(mm)));
  }

  return `<g id="bp-dimensions">${parts.join('')}</g>`;
}

// Wrap annotation markup in a translate group when it has been dragged, so the
// export reproduces the on-screen layout.
function shifted(off, inner) {
  if (!off || (!off.dx && !off.dy)) return inner;
  return `<g transform="translate(${off.dx} ${off.dy})">${inner}</g>`;
}

/** Inject all annotations into the original SVG and expand the viewBox. */
export function exportAnnotatedSvg({ svg, box, dims, manual, mmPerUnit, north, titleBlock, showInterior, unit, offsets = {} }) {
  const clone = svg.cloneNode(true);
  clone.querySelectorAll('#bp-dimensions, #bp-north, #bp-title-block').forEach((n) => n.remove());

  const { vb } = viewBoxFor(box);
  clone.setAttribute('viewBox', vb);
  clone.removeAttribute('width');
  clone.removeAttribute('height');

  const overlay = buildDimGroup({ dims, manual, mmPerUnit, box, showInterior, unit })
    + shifted(offsets.north, northMarkup(box, north?.angle ?? 0))
    + shifted(offsets.scaleBar, scaleBarMarkup(box, mmPerUnit, unit))
    + shifted(offsets.titleBlock, titleBlockMarkup(box, titleBlock || {}));

  let xml = new XMLSerializer().serializeToString(clone);
  xml = xml.replace(/<\/svg>\s*$/, `${overlay}</svg>`);
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + xml;
}
