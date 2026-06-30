// pdf.js — convert the first page of a PDF into an SVG string, so the rest of
// the app (wall detection, dimensioning, export) can treat it like any SVG.

import * as pdfjsLib from 'pdfjs-dist/build/pdf';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.js?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

/**
 * Render the first page of a PDF (given as a File/Blob) to an SVG string.
 * Uses pdf.js's SVG back-end so vector linework is preserved for wall detection.
 */
export async function pdfToSvgText(file) {
  const data = await file.arrayBuffer();
  // fontExtraProperties is required by the SVG back-end to embed font glyphs.
  const doc = await pdfjsLib.getDocument({ data, fontExtraProperties: true }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const opList = await page.getOperatorList();

  const svgGfx = new pdfjsLib.SVGGraphics(page.commonObjs, page.objs);
  svgGfx.embedFonts = true;
  const svgEl = await svgGfx.getSVG(opList, viewport);

  // viewBox in PDF points (the path coordinate system); width/height carry the
  // true physical page size in mm (1pt = 1/72 inch) so the app can scale exactly.
  svgEl.setAttribute('viewBox', `0 0 ${viewport.width} ${viewport.height}`);
  const PT_TO_MM = 25.4 / 72;
  svgEl.setAttribute('width', `${(viewport.width * PT_TO_MM).toFixed(3)}mm`);
  svgEl.setAttribute('height', `${(viewport.height * PT_TO_MM).toFixed(3)}mm`);
  await doc.cleanup();

  // pdf.js emits SVG-namespaced elements with an "svg:" prefix (e.g. <svg:path>).
  // Strip the prefix and add a default SVG namespace so parseSvg / extractSegments
  // can read the lines and paths plainly.
  let xml = new XMLSerializer().serializeToString(svgEl);
  xml = xml.replace(/svg:/g, '');
  if (!/\sxmlns=/.test(xml)) {
    xml = xml.replace(/<svg(\s|>)/, '<svg xmlns="http://www.w3.org/2000/svg"$1');
  }
  return xml;
}

/** Render the first page of a PDF to a PNG data URL (used for PDF logos). */
export async function pdfToPngDataUrl(file, maxPx = 600) {
  const data = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const page = await doc.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const scale = maxPx / Math.max(base.width, base.height);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  await doc.cleanup();
  return canvas.toDataURL('image/png');
}
