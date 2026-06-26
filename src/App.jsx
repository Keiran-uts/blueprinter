import { useMemo, useRef, useState } from 'react';
import './App.css';
import { parseSvg, extractSegments, detectWalls, buildDimensions } from './lib/geometry';
import { exportAnnotatedSvg } from './lib/exportSvg';
import PlanViewer from './components/PlanViewer';
import NorthCompass from './components/NorthCompass';

const SCALES = [20, 50, 100, 200, 500];
const UNITS = ['mm', 'cm', 'm'];
// ISO A paper sizes in millimetres [short, long].
const PAPER = { A4: [210, 297], A3: [297, 420], A2: [420, 594], A1: [594, 841], A0: [841, 1189] };
const PAPER_SIZES = ['A4', 'A3', 'A2', 'A1', 'A0'];

export default function App() {
  const fileRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [plan, setPlan] = useState(null); // { svg, box, innerHTML }
  const [scaleIdx, setScaleIdx] = useState(1); // default 1:50
  const [paperSize, setPaperSize] = useState('A1');
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

  // Title-block fields
  const [titleText, setTitleText] = useState('');
  const [address, setAddress] = useState('');
  const [drawnBy, setDrawnBy] = useState('');
  const [drawingDate, setDrawingDate] = useState(() => new Date().toISOString().slice(0, 10));

  const titleBlock = useMemo(() => ({
    title: titleText,
    address,
    scale: `1:${SCALES[scaleIdx]}`,
    sheet: paperSize,
    units: unit,
    date: drawingDate,
    drawnBy,
  }), [titleText, address, scaleIdx, paperSize, unit, drawingDate, drawnBy]);

  const dims = useMemo(() => buildDimensions(hWalls, vWalls), [hWalls, vWalls]);

  // Real-world millimetres per SVG unit. A manual calibration wins; otherwise it
  // is derived from the page size (how big the sheet is) and the drawing scale.
  const mmPerUnit = useMemo(() => {
    if (calib != null) return calib;
    const denom = SCALES[scaleIdx];
    if (plan) {
      const svgLong = Math.max(plan.box.w, plan.box.h);
      const pageLong = Math.max(...PAPER[paperSize]);
      if (svgLong > 0) return (pageLong / svgLong) * denom;
    }
    return denom;
  }, [calib, scaleIdx, paperSize, plan]);

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
    } catch (e) {
      setError(e.message || 'Could not read that SVG.');
      setPlan(null);
    }
  };

  const loadFile = async (file) => {
    loadSvgText(await file.text(), file.name);
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

  const download = () => {
    if (!plan) return;
    const xml = exportAnnotatedSvg({
      svg: plan.svg, box: plan.box, dims, manual, mmPerUnit,
      north: { angle: northAngle }, titleBlock, showInterior, unit,
    });
    const blob = new Blob([xml], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName.replace(/\.svg$/i, '') + '-dimensioned.svg';
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
        <div className="tagline">SVG PLAN · DIMENSION READER</div>
      </header>

      <div className="layout">
        <aside className="panel">
          <input ref={fileRef} type="file" accept=".svg,image/svg+xml" hidden onChange={onPick} />

          <section className="step">
            <h3>1 · Add drawing</h3>
            <div className="add-row">
              <button className="btn primary" onClick={() => fileRef.current?.click()}>
                + Add SVG file
              </button>
              <button className="btn" onClick={loadExample}>
                Input example SVG file
              </button>
            </div>
            {fileName && <div className="filename">{fileName}</div>}
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
                <button key={p} className={p === paperSize ? 'on' : ''} onClick={() => setPaperSize(p)}>
                  {p}
                </button>
              ))}
            </div>
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
              <span>Sheet <b>{paperSize}</b></span>
              <span>Units <b>{unit}</b></span>
            </div>
            <p className="hint">Scale &amp; sheet update automatically from step 2.</p>
          </section>

          <section className="step">
            <h3>6 · Export</h3>
            <button className="btn primary" disabled={!plan} onClick={download}>
              ↓ Save dimensioned SVG
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
