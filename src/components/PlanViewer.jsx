import { useRef, useState } from 'react';

const BLUE = '#2ea3ff';
const fmt = (mm) => Math.round(mm).toLocaleString('en-US');

/** Renders the uploaded plan with the blue dimension overlay. In "measure"
 *  mode the user clicks two points to add a manual measurement. Wall lines can
 *  be toggled on/off to confirm the auto-detection. */
export default function PlanViewer({
  planInner, box, hWalls, vWalls, dims, mmPerUnit,
  manual, mode, north, onToggleWall, onAddManual,
}) {
  const svgRef = useRef(null);
  const [pending, setPending] = useState(null); // first clicked point in measure mode

  const pad = Math.max(box.w, box.h) * 0.09;
  const off = Math.max(box.w, box.h) * 0.04;
  const tick = off * 0.18;
  const fs = Math.max(box.w, box.h) * 0.018;
  const sw = Math.max(box.w, box.h) * 0.0016;
  const vb = `${box.x - pad} ${box.y - pad} ${box.w + pad * 2} ${box.h + pad * 2}`;
  const topY = box.y - off;
  const leftX = box.x - off;

  const toUser = (e) => {
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = svg.getScreenCTM().inverse();
    const p = pt.matrixTransform(m);
    return { x: p.x, y: p.y };
  };

  const onClick = (e) => {
    if (mode !== 'measure') return;
    const p = toUser(e);
    if (!pending) {
      setPending(p);
    } else {
      onAddManual({ x1: pending.x, y1: pending.y, x2: p.x, y2: p.y });
      setPending(null);
    }
  };

  return (
    <svg
      ref={svgRef}
      className="plan-svg"
      viewBox={vb}
      onClick={onClick}
      style={{ cursor: mode === 'measure' ? 'crosshair' : 'default' }}
    >
      {/* uploaded plan */}
      <g dangerouslySetInnerHTML={{ __html: planInner }} />

      {/* detected wall lines (clickable to toggle in confirm mode) */}
      {[...hWalls, ...vWalls].map((w) => {
        const isH = w.axis === 'h';
        const x1 = isH ? w.min : w.pos;
        const y1 = isH ? w.pos : w.min;
        const x2 = isH ? w.max : w.pos;
        const y2 = isH ? w.pos : w.max;
        return (
          <line
            key={w.id}
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={w.enabled ? BLUE : '#ff5d73'}
            strokeWidth={sw * (w.enabled ? 2.2 : 1.4)}
            strokeDasharray={w.enabled ? 'none' : `${tick} ${tick}`}
            style={{ cursor: mode === 'confirm' ? 'pointer' : 'inherit', opacity: w.enabled ? 0.9 : 0.5 }}
            onClick={(e) => {
              if (mode === 'confirm') { e.stopPropagation(); onToggleWall(w.id); }
            }}
          />
        );
      })}

      {/* dimension chains */}
      {dims.map((d, i) => {
        const mm = d.units * mmPerUnit;
        if (d.axis === 'h') {
          return (
            <g key={`d${i}`} stroke={BLUE} fill={BLUE}>
              <line x1={d.from} y1={topY} x2={d.to} y2={topY} strokeWidth={sw} />
              <line x1={d.from} y1={topY - tick} x2={d.from} y2={topY + tick} strokeWidth={sw} />
              <line x1={d.to} y1={topY - tick} x2={d.to} y2={topY + tick} strokeWidth={sw} />
              <text x={(d.from + d.to) / 2} y={topY - tick} fontSize={fs} textAnchor="middle"
                fontFamily="Consolas, monospace" stroke="none">{fmt(mm)}</text>
            </g>
          );
        }
        return (
          <g key={`d${i}`} stroke={BLUE} fill={BLUE}>
            <line x1={leftX} y1={d.from} x2={leftX} y2={d.to} strokeWidth={sw} />
            <line x1={leftX - tick} y1={d.from} x2={leftX + tick} y2={d.from} strokeWidth={sw} />
            <line x1={leftX - tick} y1={d.to} x2={leftX + tick} y2={d.to} strokeWidth={sw} />
            <text x={leftX - tick} y={(d.from + d.to) / 2} fontSize={fs} textAnchor="middle"
              fontFamily="Consolas, monospace" stroke="none"
              transform={`rotate(-90 ${leftX - tick} ${(d.from + d.to) / 2})`}>{fmt(mm)}</text>
          </g>
        );
      })}

      {/* manual measurements */}
      {manual.map((m, i) => {
        const mm = Math.hypot(m.x2 - m.x1, m.y2 - m.y1) * mmPerUnit;
        return (
          <g key={`m${i}`} stroke={BLUE} fill={BLUE}>
            <line x1={m.x1} y1={m.y1} x2={m.x2} y2={m.y2} strokeWidth={sw * 1.4} />
            <circle cx={m.x1} cy={m.y1} r={sw * 2} />
            <circle cx={m.x2} cy={m.y2} r={sw * 2} />
            <text x={(m.x1 + m.x2) / 2} y={(m.y1 + m.y2) / 2 - tick * 0.5} fontSize={fs}
              textAnchor="middle" fontFamily="Consolas, monospace" stroke="none">{fmt(mm)}</text>
          </g>
        );
      })}

      {pending && <circle cx={pending.x} cy={pending.y} r={sw * 3} fill="none" stroke={BLUE} strokeWidth={sw} />}
    </svg>
  );
}
