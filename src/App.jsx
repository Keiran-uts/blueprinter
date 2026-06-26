import { useMemo, useRef, useState } from 'react';
import './App.css';
import { parseSvg, extractSegments, detectWalls, buildDimensions } from './lib/geometry';
import { exportAnnotatedSvg } from './lib/exportSvg';
import PlanViewer from './components/PlanViewer';
import NorthCompass from './components/NorthCompass';

const SCALES = [20, 50, 100, 200, 500];

export default function App() {
  const fileRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [plan, setPlan] = useState(null); // { svg, box, innerHTML }
  const [scaleIdx, setScaleIdx] = useState(1); // default 1:50
  const [mmPerUnit, setMmPerUnit] = useState(50);
  const [calibrated, setCalibrated] = useState(false);
  const [hWalls, setHWalls] = useState([]);
  const [vWalls, setVWalls] = useState([]);
  const [manual, setManual] = useState([]);
  const [mode, setMode] = useState('confirm'); // 'confirm' | 'measure'
  const [calibrating, setCalibrating] = useState(false);
  const [northAngle, setNorthAngle] = useState(0);
  const [error, setError] = useState('');

  const dims = useMemo(() => buildDimensions(hWalls, vWalls), [hWalls, vWalls]);

  const loadFile = async (file) => {
    setError('');
    try {
      const text = await file.text();
      const { svg, box } = parseSvg(text);
      setPlan({ svg, box, innerHTML: svg.innerHTML });
      setFileName(file.name);
      setHWalls([]);
      setVWalls([]);
      setManual([]);
      setMode('confirm');
    } catch (e) {
      setError(e.message || 'Could not read that SVG.');
      setPlan(null);
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
      const input = window.prompt('Real length of the line you drew, in millimetres:', '1800');
      const real = parseFloat(input);
      if (Number.isFinite(real) && real > 0 && lenUnits > 0) {
        setMmPerUnit(real / lenUnits);
        setCalibrated(true);
      }
      setCalibrating(false);
      setMode('confirm');
    } else {
      setManual((m) => [...m, seg]);
    }
  };

  const onScale = (idx) => {
    setScaleIdx(idx);
    if (!calibrated) setMmPerUnit(SCALES[idx]);
  };

  const startCalibrate = () => {
    setCalibrating(true);
    setMode('measure');
  };

  const download = () => {
    if (!plan) return;
    const xml = exportAnnotatedSvg({
      svg: plan.svg, box: plan.box, dims, manual, mmPerUnit,
      north: { angle: northAngle },
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
            <button className="btn primary" onClick={() => fileRef.current?.click()}>
              + Add SVG file
            </button>
            {fileName && <div className="filename">{fileName}</div>}
          </section>

          <section className="step">
            <h3>2 · Plan scale</h3>
            <input
              type="range" min="0" max={SCALES.length - 1} step="1" value={scaleIdx}
              onChange={(e) => onScale(+e.target.value)} className="slider"
            />
            <div className="scale-ticks">
              {SCALES.map((s, i) => (
                <span key={s} className={i === scaleIdx ? 'active' : ''}>1:{s}</span>
              ))}
            </div>
            <div className="calib-row">
              <span>{mmPerUnit.toFixed(2)} mm / unit {calibrated && <em>(calibrated)</em>}</span>
              <button className="btn ghost sm" disabled={!plan} onClick={startCalibrate}>
                Calibrate
              </button>
            </div>
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
            {manual.length > 0 && (
              <button className="btn ghost sm" onClick={() => setManual([])}>Clear manual</button>
            )}
          </section>

          <section className="step">
            <h3>4 · North point</h3>
            <NorthCompass angle={northAngle} onChange={setNorthAngle} />
          </section>

          <section className="step">
            <h3>5 · Export</h3>
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
