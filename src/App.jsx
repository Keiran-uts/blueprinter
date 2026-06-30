import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { parseSvg, extractSegments, detectWalls, buildDimensions, physicalSizeMM } from './lib/geometry';
import { exportAnnotatedSvg } from './lib/exportSvg';
import PlanViewer from './components/PlanViewer';
import NorthCompass from './components/NorthCompass';

const SCALES = [20, 50, 100, 200, 500];
const UNITS = ['mm', 'cm', 'm'];
// ISO A paper sizes in millimetres [short, long].
const PAPER = { A4: [210, 297], A3: [297, 420], A2: [420, 594], A1: [594, 841], A0: [841, 1189] };
const PAPER_SIZES = ['A4', 'A3', 'A2', 'A1', 'A0'];

// Match a physical size (mm) to a standard ISO A-size, orientation-independent.
function matchPaperSize(w, h) {
  const lo = Math.min(w, h);
  const hi = Math.max(w, h);
  const tol = Math.max(3, hi * 0.01); // a few mm of slack for rounding
  for (const name of PAPER_SIZES) {
    const [s, l] = PAPER[name];
    if (Math.abs(lo - s) <= tol && Math.abs(hi - l) <= tol) return name;
  }
  return null;
}

export default function App() {
  const fileRef = useRef(null);
  const logoRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [plan, setPlan] = useState(null); // { svg, box, innerHTML }
  const [scaleIdx, setScaleIdx] = useState(1); // default 1:50
  const [paperSize, setPaperSize] = useState('A1');
  const [paperOverride, setPaperOverride] = useState(false); // user picked an A-size manually
  const [unit, setUnit] = useState('mm');
  const [calib, setCalib] = useState(null); // mm-per-unit override from Calibrate, or null
  const [hWalls, setHWalls] = useState([]);
  const [vWalls, setVWalls] = useState([]);
  const [manual, setManual] = useState([]);
  const [mode, setMode] = useState('confirm'); // 'confirm' | 'measure'
  const [showInterior, setShowInterior] = useState(true);
  const [calibrating, setCalibrating] = useState(false);
  const [calibPending, setCalibPending] = useState(null); // { lenUnits, seg } awaiting real length
  const [calibInput, setCalibInput] = useState('1800');
  const [northAngle, setNorthAngle] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [exportFmt, setExportFmt] = useState('svg'); // 'svg' | 'pdf'
  const [exporting, setExporting] = useState(false);
  const [dark, setDark] = useState(false);

  // Drag offsets (SVG units) for the repositionable annotations.
  const [offsets, setOffsets] = useState({
    north: { dx: 0, dy: 0 },
    scaleBar: { dx: 0, dy: 0 },
    titleBlock: { dx: 0, dy: 0 },
  });
  const moveAnnotation = (key, off) => setOffsets((o) => ({ ...o, [key]: off }));

  // Drive the UI theme from the <html data-theme> attribute so the body
  // graph-paper backdrop (outside the React tree) inverts too.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }, [dark]);

  // Title-block fields
  const [titleText, setTitleText] = useState('');
  const [address, setAddress] = useState('');
  const [drawnBy, setDrawnBy] = useState('');
  const [logo, setLogo] = useState(null); // data URL of the brand logo
  const [logoName, setLogoName] = useState('');
  const [drawingDate, setDrawingDate] = useState(() => new Date().toISOString().slice(0, 10));

  const dims = useMemo(() => buildDimensions(hWalls, vWalls), [hWalls, vWalls]);

  // Physical page size read from the file itself (exact), if it declares one.
  const detectedMM = useMemo(() => (plan ? physicalSizeMM(plan.svg) : null), [plan]);
  // The page size actually used to scale: the file's own size unless the user
  // has overridden it with a manual A-size choice (or the file declares none).
  const usingDetected = detectedMM != null && !paperOverride;
  const detectedPaperName = detectedMM ? matchPaperSize(detectedMM.w, detectedMM.h) : null;
  const pageLongMM = usingDetected
    ? Math.max(detectedMM.w, detectedMM.h)
    : Math.max(...PAPER[paperSize]);
  const sheetLabel = usingDetected
    ? (detectedPaperName || `${Math.round(detectedMM.w)}×${Math.round(detectedMM.h)}`)
    : paperSize;

  const titleBlock = useMemo(() => ({
    title: titleText,
    address,
    scale: `1:${SCALES[scaleIdx]}`,
    sheet: sheetLabel,
    units: unit,
    date: drawingDate,
    drawnBy,
    logo,
  }), [titleText, address, scaleIdx, sheetLabel, unit, drawingDate, drawnBy, logo]);

  // Real-world millimetres per SVG unit. A manual calibration wins; otherwise:
  //   real mm = (units mapped to physical page mm) × scale denominator
  // e.g. at 1:20, one page-mm reads as 20 real mm.
  const mmPerUnit = useMemo(() => {
    if (calib != null) return calib;
    const denom = SCALES[scaleIdx];
    if (plan) {
      const svgLong = Math.max(plan.box.w, plan.box.h);
      if (svgLong > 0) return (pageLongMM / svgLong) * denom;
    }
    return denom;
  }, [calib, scaleIdx, pageLongMM, plan]);

  const loadSvgText = (text, name) => {
    setError('');
    try {
      const { svg, box } = parseSvg(text);
      setPlan({ svg, box, innerHTML: svg.innerHTML });
      setFileName(name);
      setHWalls([]);
      setVWalls([]);
      setManual([]);
      setMode('confirm');
      setCalib(null);
      setPaperOverride(false);
    } catch (e) {
      setError(e.message || 'Could not read that SVG.');
      setPlan(null);
    }
  };

  const loadFile = async (file) => {
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!isPdf) {
      loadSvgText(await file.text(), file.name);
      return;
    }
    setError('');
    setBusy('Reading PDF…');
    try {
      const { pdfToSvgText } = await import('./lib/pdf');
      const svgText = await pdfToSvgText(file);
      loadSvgText(svgText, file.name);
    } catch (e) {
      setError(e.message || 'Could not read that PDF.');
    } finally {
      setBusy('');
    }
  };

  const loadExample = async () => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}example-plan.svg`);
      if (!res.ok) throw new Error('Example file could not be loaded.');
      loadSvgText(await res.text(), 'example-plan.svg');
    } catch (e) {
      setError(e.message || 'Could not load the example.');
    }
  };

  const onPick = (e) => {
    const f = e.target.files?.[0];
    if (f) loadFile(f);
  };

  // Load a brand logo (image or PDF) into the title block as a data URL.
  const loadLogo = async (file) => {
    try {
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
      if (isPdf) {
        const { pdfToPngDataUrl } = await import('./lib/pdf');
        setLogo(await pdfToPngDataUrl(file));
      } else {
        const url = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result);
          r.onerror = rej;
          r.readAsDataURL(file);
        });
        setLogo(url);
      }
      setLogoName(file.name);
    } catch (e) {
      setError(e.message || 'Could not load that logo.');
    }
  };

  const onPickLogo = (e) => {
    const f = e.target.files?.[0];
    if (f) loadLogo(f);
  };

  const loadExampleLogo = async () => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}example-logo.png`);
      const blob = await res.blob();
      const url = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
      setLogo(url);
      setLogoName('example-logo.png');
    } catch (e) {
      setError(e.message || 'Could not load the example logo.');
    }
  };

  const runDetect = () => {
    if (!plan) return;
    const segs = extractSegments(plan.svg);
    const res = detectWalls(segs, plan.box);
    setHWalls(res.hWalls);
    setVWalls(res.vWalls);
    if (res.hWalls.length + res.vWalls.length === 0) {
      setError('No structural walls detected automatically — use Measure to add dimensions manually.');
    } else {
      setError('');
    }
  };

  const toggleWall = (id) => {
    setHWalls((ws) => ws.map((w) => (w.id === id ? { ...w, enabled: !w.enabled } : w)));
    setVWalls((ws) => ws.map((w) => (w.id === id ? { ...w, enabled: !w.enabled } : w)));
  };

  const addManual = (seg) => {
    if (calibrating) {
      const lenUnits = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1);
      setCalibrating(false);
      setMode('confirm');
      if (lenUnits > 0) setCalibPending({ lenUnits, seg });
    } else {
      setManual((m) => [...m, seg]);
    }
  };

  const applyCalibration = () => {
    const real = parseFloat(calibInput);
    if (Number.isFinite(real) && real > 0 && calibPending?.lenUnits > 0) {
      setCalib(real / calibPending.lenUnits);
      setCalibPending(null);
    }
  };

  const onScale = (idx) => setScaleIdx(idx);

  const startCalibrate = () => {
    setCalibPending(null);
    setCalibrating(true);
    setMode('measure');
  };

  const download = async () => {
    if (!plan) return;
    const params = {
      svg: plan.svg, box: plan.box, dims, manual, mmPerUnit,
      north: { angle: northAngle }, titleBlock, showInterior, unit, offsets,
    };
    const base = fileName.replace(/\.(svg|pdf)$/i, '') + '-dimensioned';

    if (exportFmt === 'pdf') {
      setExporting(true);
      setError('');
      try {
        const { exportAnnotatedPdf } = await import('./lib/exportPdf');
        await exportAnnotatedPdf(params, base);
      } catch (e) {
        setError(e.message || 'PDF export failed.');
      } finally {
        setExporting(false);
      }
      return;
    }

    const xml = exportAnnotatedSvg(params);
    const blob = new Blob([xml], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = base + '.svg';
    a.click();
    URL.revokeObjectURL(url);
  };

  const wallCount = hWalls.filter((w) => w.enabled).length + vWalls.filter((w) => w.enabled).length;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">⊹</span> BLUEPRINTER
        </div>
        <div className="topbar-right">
          <div className="tagline">SVG PLAN · DIMENSION READER</div>
          <button
            className="theme-toggle"
            onClick={() => setDark((d) => !d)}
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            title={dark ? 'Light mode' : 'Dark mode'}
          >
            {dark ? '☀' : '☾'}
          </button>
        </div>
      </header>

      <div className="layout">
        <aside className="panel">
          <input ref={fileRef} type="file" accept=".svg,.pdf,image/svg+xml,application/pdf" hidden onChange={onPick} />

          <section className="step">
            <h3>1 · Add drawing</h3>
            <div className="add-row">
              <button className="btn primary" onClick={() => fileRef.current?.click()}>
                Add file
              </button>
              <button className="btn" onClick={loadExample}>
                Input example SVG file
              </button>
            </div>
            <p className="hint">Open an SVG or PDF floor plan. Export as either.</p>
            {busy && <div className="filename busy">{busy}</div>}
            {fileName && !busy && <div className="filename">{fileName}</div>}
          </section>

          <section className="step">
            <h3>2 · Scale &amp; page size</h3>
            <input
              type="range" min="0" max={SCALES.length - 1} step="1" value={scaleIdx}
              onChange={(e) => onScale(+e.target.value)} className="slider"
            />
            <div className="scale-ticks">
              {SCALES.map((s, i) => (
                <span key={s} className={i === scaleIdx ? 'active' : ''}>1:{s}</span>
              ))}
            </div>
            <label className="field-label">Page size</label>
            <div className="paper-row">
              {PAPER_SIZES.map((p) => (
                <button
                  key={p}
                  className={(usingDetected ? p === detectedPaperName : p === paperSize) ? 'on' : ''}
                  onClick={() => { setPaperSize(p); setPaperOverride(true); }}
                >
                  {p}
                </button>
              ))}
            </div>
            <p className="hint">
              {usingDetected
                ? `Auto-detected ${detectedPaperName ? `${detectedPaperName} ` : ''}from file: ${Math.round(detectedMM.w)} × ${Math.round(detectedMM.h)} mm`
                : detectedMM
                  ? `Overridden — using ${paperSize}. `
                  : 'No page size in file — pick the sheet it was drawn on.'}
              {detectedMM && paperOverride && (
                <button className="btn ghost sm" onClick={() => setPaperOverride(false)}>Use file size</button>
              )}
            </p>
            <label className="field-label">Display units</label>
            <div className="paper-row">
              {UNITS.map((u) => (
                <button key={u} className={u === unit ? 'on' : ''} onClick={() => setUnit(u)}>
                  {u}
                </button>
              ))}
            </div>
            <div className="calib-row">
              <span>{mmPerUnit.toFixed(2)} mm / unit {calib != null && <em>(calibrated)</em>}</span>
              <button className="btn ghost sm" disabled={!plan} onClick={startCalibrate}>
                Calibrate
              </button>
            </div>
            {calibrating && (
              <p className="hint">Click two points over a known dimension on the plan.</p>
            )}
            {calibPending && (
              <div className="calib-form">
                <label className="field-label">Real length of drawn line</label>
                <div className="calib-input">
                  <input
                    type="number" min="0" value={calibInput} autoFocus
                    onChange={(e) => setCalibInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') applyCalibration(); }}
                  />
                  <span className="unit">mm</span>
                  <button className="btn primary sm" onClick={applyCalibration}>Apply</button>
                  <button className="btn ghost sm" onClick={() => setCalibPending(null)}>Cancel</button>
                </div>
              </div>
            )}
            {calib != null && (
              <button className="btn ghost sm" onClick={() => setCalib(null)}>Use page &amp; scale instead</button>
            )}
          </section>

          <section className="step">
            <h3>3 · Detect &amp; edit</h3>
            <button className="btn" disabled={!plan} onClick={runDetect}>
              ⊹ Detect walls
            </button>
            <div className="mode-toggle">
              <button className={mode === 'confirm' ? 'on' : ''} disabled={!plan}
                onClick={() => setMode('confirm')}>Confirm walls</button>
              <button className={mode === 'measure' ? 'on' : ''} disabled={!plan}
                onClick={() => { setCalibrating(false); setMode('measure'); }}>Measure</button>
            </div>
            <p className="hint">
              {mode === 'confirm'
                ? 'Click a wall line to include / exclude it.'
                : calibrating
                  ? 'Click two points over a known dimension.'
                  : 'Click two points to measure a distance.'}
            </p>
            <div className="stat">
              <span>{wallCount} walls</span>
              <span>{dims.length} dims</span>
              <span>{manual.length} manual</span>
            </div>
            <label className="check-row">
              <input type="checkbox" checked={showInterior}
                onChange={(e) => setShowInterior(e.target.checked)} />
              Interior dimensions (inside building)
            </label>
            {manual.length > 0 && (
              <button className="btn ghost sm" onClick={() => setManual([])}>Clear manual</button>
            )}
          </section>

          <section className="step">
            <h3>4 · North point</h3>
            <NorthCompass angle={northAngle} onChange={setNorthAngle} />
          </section>

          <section className="step">
            <h3>5 · Title block</h3>
            <label className="field-label">Title</label>
            <input className="text-input" value={titleText} placeholder="e.g. Upper Floor Plan"
              onChange={(e) => setTitleText(e.target.value)} />
            <input ref={logoRef} type="file" accept="image/*,.pdf,.svg" hidden onChange={onPickLogo} />
            <label className="field-label">Logo</label>
            <div className="paper-row">
              <button onClick={() => logoRef.current?.click()}>Add a logo</button>
              <button onClick={loadExampleLogo}>Input example logo</button>
            </div>
            {logo && (
              <div className="logo-preview">
                <img src={logo} alt="logo" />
                <span>{logoName}</span>
                <button className="btn ghost sm" onClick={() => { setLogo(null); setLogoName(''); }}>Remove</button>
              </div>
            )}
            <label className="field-label">Address</label>
            <input className="text-input" value={address} placeholder="e.g. 12 Example St, Sydney"
              onChange={(e) => setAddress(e.target.value)} />
            <label className="field-label">Drawn by</label>
            <input className="text-input" value={drawnBy} placeholder="Your name"
              onChange={(e) => setDrawnBy(e.target.value)} />
            <label className="field-label">Date</label>
            <input className="text-input" type="date" value={drawingDate}
              onChange={(e) => setDrawingDate(e.target.value)} />
            <div className="tb-auto">
              <span>Scale <b>1:{SCALES[scaleIdx]}</b></span>
              <span>Sheet <b>{sheetLabel}</b></span>
              <span>Units <b>{unit}</b></span>
            </div>
            <p className="hint">Scale &amp; sheet update automatically from step 2.</p>
          </section>

          <section className="step">
            <h3>6 · Export</h3>
            <label className="field-label">Format</label>
            <div className="paper-row">
              {['svg', 'pdf'].map((f) => (
                <button key={f} className={f === exportFmt ? 'on' : ''} onClick={() => setExportFmt(f)}>
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
            <button className="btn primary export-btn" disabled={!plan || exporting} onClick={download}>
              {exporting ? 'Generating PDF…' : `↓ Save dimensioned ${exportFmt.toUpperCase()}`}
            </button>
          </section>
        </aside>

        <main className="stage">
          {error && <div className="banner">{error}</div>}
          {plan ? (
            <div className="canvas-wrap">
              <PlanViewer
                planInner={plan.innerHTML}
                box={plan.box}
                hWalls={hWalls}
                vWalls={vWalls}
                dims={dims}
                mmPerUnit={mmPerUnit}
                manual={manual}
                mode={mode}
                north={{ angle: northAngle }}
                calibSeg={calibPending?.seg}
                titleBlock={titleBlock}
                showInterior={showInterior}
                unit={unit}
                offsets={offsets}
                onMoveAnnotation={moveAnnotation}
                onToggleWall={toggleWall}
                onAddManual={addManual}
              />
            </div>
          ) : (
            <div className="empty">
              <div className="empty-grid" />
              <p>Add an SVG floor plan to begin.</p>
              <p className="sub">Walls are auto-detected; you confirm them and read off the dimensions.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
