// exportSvg.js — serialise the original SVG plus a blue annotation overlay
// (dimension chains, manual measurements, north point and title block).

import { metrics, viewBoxFor, northMarkup, titleBlockMarkup, formatLength } from './annotations';

const BLUE = '#2ea3ff';

/** Dimension chains + manual measurements as an SVG-string group. */
function buildDimGroup({ dims, manual, mmPerUnit, box, showInterior, unit }) {
  const fmt = (mm) => formatLength(mm, unit);
  const { off, tick, fs, sw } = metrics(box);
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

  if (showInterior) {
    for (const d of dims) {
      if (d.cross == null) continue;
      const mm = d.units * mmPerUnit;
      if (d.axis === 'h') {
        parts.push(line(d.from, d.cross, d.to, d.cross));
        parts.push(line(d.from, d.cross - tick, d.from, d.cross + tick));
        parts.push(line(d.to, d.cross - tick, d.to, d.cross + tick));
        parts.push(text((d.from + d.to) / 2, d.cross - tick * 0.6, fmt(mm)));
      } else {
        parts.push(line(d.cross, d.from, d.cross, d.to));
        parts.push(line(d.cross - tick, d.from, d.cross + tick, d.from));
        parts.push(line(d.cross - tick, d.to, d.cross + tick, d.to));
        parts.push(text(d.cross - tick * 0.6, (d.from + d.to) / 2, fmt(mm), 'middle', -90));
      }
    }
  }

  for (const mseg of manual) {
    const mm = Math.hypot(mseg.x2 - mseg.x1, mseg.y2 - mseg.y1) * mmPerUnit;
    parts.push(line(mseg.x1, mseg.y1, mseg.x2, mseg.y2));
    const a = Math.atan2(mseg.y2 - mseg.y1, mseg.x2 - mseg.x1);
    const nx = Math.sin(a) * tick;
    const ny = -Math.cos(a) * tick;
    parts.push(line(mseg.x1 + nx, mseg.y1 + ny, mseg.x1 - nx, mseg.y1 - ny));
    parts.push(line(mseg.x2 + nx, mseg.y2 + ny, mseg.x2 - nx, mseg.y2 - ny));
    parts.push(text((mseg.x1 + mseg.x2) / 2 + nx * 1.6, (mseg.y1 + mseg.y2) / 2 + ny * 1.6, fmt(mm)));
  }

  return `<g id="bp-dimensions">${parts.join('')}</g>`;
}

/** Inject all annotations into the original SVG and expand the viewBox. */
export function exportAnnotatedSvg({ svg, box, dims, manual, mmPerUnit, north, titleBlock, showInterior, unit }) {
  const clone = svg.cloneNode(true);
  clone.querySelectorAll('#bp-dimensions, #bp-north, #bp-title-block').forEach((n) => n.remove());

  const { vb } = viewBoxFor(box);
  clone.setAttribute('viewBox', vb);
  clone.removeAttribute('width');
  clone.removeAttribute('height');

  const overlay = buildDimGroup({ dims, manual, mmPerUnit, box, showInterior, unit })
    + northMarkup(box, north?.angle ?? 0)
    + titleBlockMarkup(box, titleBlock || {});

  let xml = new XMLSerializer().serializeToString(clone);
  xml = xml.replace(/<\/svg>\s*$/, `${overlay}</svg>`);
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + xml;
}
