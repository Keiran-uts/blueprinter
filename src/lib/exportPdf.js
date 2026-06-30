// exportPdf.js — render the annotated drawing to a vector PDF via jsPDF + svg2pdf.

import { jsPDF } from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';
import { exportAnnotatedSvg } from './exportSvg';

// svg2pdf reads presentation attributes / inline styles but not CSS classes, so
// flatten the computed style of every element onto itself first. This keeps
// class-styled plans (e.g. PDF-imported drawings using `.cls-1 { stroke: … }`)
// rendering correctly in the PDF.
const STYLE_PROPS = [
  'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
  'stroke-dasharray', 'opacity', 'fill-opacity', 'stroke-opacity',
  'font-size', 'font-family', 'font-weight', 'text-anchor',
];

function inlineComputedStyles(root) {
  const els = root.querySelectorAll('*');
  els.forEach((el) => {
    const cs = window.getComputedStyle(el);
    for (const p of STYLE_PROPS) {
      const v = cs.getPropertyValue(p);
      if (v) el.style.setProperty(p, v);
    }
  });
}

/**
 * Build the annotated SVG, then save it as a vector PDF sized to the drawing.
 * @param params  same shape passed to exportAnnotatedSvg
 * @param baseName output file name without extension
 */
export async function exportAnnotatedPdf(params, baseName) {
  const svgString = exportAnnotatedSvg(params);
  const parsed = new DOMParser().parseFromString(svgString, 'image/svg+xml');
  const svgEl = parsed.documentElement;

  const vb = (svgEl.getAttribute('viewBox') || '0 0 1000 1000').split(/[\s,]+/).map(Number);
  const w = vb[2];
  const h = vb[3];

  // Mount off-screen so getComputedStyle resolves class-based styles.
  svgEl.setAttribute('width', String(w));
  svgEl.setAttribute('height', String(h));
  svgEl.style.position = 'fixed';
  svgEl.style.left = '-99999px';
  svgEl.style.top = '0';
  document.body.appendChild(svgEl);

  try {
    inlineComputedStyles(svgEl);

    // Keep the page a sane physical size while preserving proportions.
    const maxDim = Math.max(w, h);
    const scale = maxDim > 2600 ? 2600 / maxDim : 1;
    const pw = w * scale;
    const ph = h * scale;

    const pdf = new jsPDF({
      orientation: pw >= ph ? 'landscape' : 'portrait',
      unit: 'pt',
      format: [pw, ph],
    });
    await svg2pdf(svgEl, pdf, { x: 0, y: 0, width: pw, height: ph });
    pdf.save(`${baseName}.pdf`);
  } finally {
    document.body.removeChild(svgEl);
  }
}
