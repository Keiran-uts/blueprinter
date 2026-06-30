import { useRef, useState } from 'react';
import { viewBoxFor, northMarkup, titleBlockMarkup, scaleBarMarkup, formatLength } from '../lib/annotations';

const INK = '#111111';       // dimension / annotation colour
const WALL_ON = '#111111';   // detected wall, included (black, dashed)
const WALL_OFF = '#ef4444';  // detected wall, excluded (red)

/** A drag-to-reposition wrapper around one annotation (north point, scale bar
 *  or title block). The markup is injected as-is; `pointer-events:all` makes the
 *  whole region grabbable even where shapes are unfilled. `toUser` converts a
 *  pointer event to SVG user coordinates so the drag tracks 1:1 with the cursor. */
function Draggable({ offset, onChange, toUser, markup }) {
  const drag = useRef(null);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (e) => {
    e.stopPropagation();
    const p = toUser(e);
    drag.current = { sx: p.x, sy: p.y, ox: offset.dx, oy: offset.dy };
    setDragging(true);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* pointer not capturable */ }
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    const p = toUser(e);
    onChange({ dx: drag.current.ox + (p.x - drag.current.sx), dy: drag.current.oy + (p.y - drag.current.sy) });
  };
  const endDrag = (e) => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
  };

  return (
    <g
      className={`bp-draggable${dragging ? ' dragging' : ''}`}
      transform={`translate(${offset.dx} ${offset.dy})`}
      style={{ pointerEvents: 'all' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={(e) => e.stopPropagation()}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}

/** Renders the uploaded plan with the black dimension overlay. In "measure"
 *  mode the user clicks two points to add a manual measurement. Wall lines can
 *  be toggled on/off to confirm the auto-detection. */
export default function PlanViewer({
  planInner, box, hWalls, vWalls, dims, mmPerUnit,
  manual, mode, north, calibSeg, titleBlock, showInterior, unit, onToggleWall, onAddManual,
  offsets, onMoveAnnotation,
}) {
  const fmt = (mm) => formatLength(mm, unit);
  const svgRef = useRef(null);
  const [pending, setPending] = useState(null); // first clicked point in measure mode

  const off = Math.max(box.w, box.h) * 0.04;
  const tick = off * 0.18;
  const fs = Math.max(box.w, box.h) * 0.018;
  const sw = Math.max(box.w, box.h) * 0.0016;
  const vb = viewBoxFor(box).vb;
  const topY = box.y - off;
  const leftX = box.x - off;

  // architectural diagonal "slash" tick at a dimension endpoint
  const slash = (px, py, key) => (
    <line key={key} x1={px - tick} y1={py + tick} x2={px + tick} y2={py - tick} strokeWidth={sw} />
  );

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
            stroke={w.enabled ? WALL_ON : WALL_OFF}
            strokeWidth={sw * (w.enabled ? 2.2 : 1.4)}
            strokeDasharray={w.enabled ? `${tick * 1.4} ${tick * 0.9}` : `${tick} ${tick}`}
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
            <g key={`d${i}`} stroke={INK} fill={INK}>
              <line x1={d.from} y1={topY} x2={d.to} y2={topY} strokeWidth={sw} />
              {slash(d.from, topY, 'a')}
              {slash(d.to, topY, 'b')}
              <text x={(d.from + d.to) / 2} y={topY - tick} fontSize={fs} textAnchor="middle"
                fontFamily="'NB Akademie', 'Helvetica Neue', Inter, Arial, sans-serif" stroke="none">{fmt(mm)}</text>
            </g>
          );
        }
        return (
          <g key={`d${i}`} stroke={INK} fill={INK}>
            <line x1={leftX} y1={d.from} x2={leftX} y2={d.to} strokeWidth={sw} />
            {slash(leftX, d.from, 'a')}
            {slash(leftX, d.to, 'b')}
            <text x={leftX - tick} y={(d.from + d.to) / 2} fontSize={fs} textAnchor="middle"
              fontFamily="'NB Akademie', 'Helvetica Neue', Inter, Arial, sans-serif" stroke="none"
              transform={`rotate(-90 ${leftX - tick} ${(d.from + d.to) / 2})`}>{fmt(mm)}</text>
          </g>
        );
      })}

      {/* interior dimensions — drawn inside the building between the walls */}
      {showInterior && dims.map((d, i) => {
        const mm = d.units * mmPerUnit;
        if (d.cross == null) return null;
        if (d.axis === 'h') {
          return (
            <g key={`i${i}`} stroke={INK} fill={INK} opacity="0.85">
              <line x1={d.from} y1={d.cross} x2={d.to} y2={d.cross} strokeWidth={sw} strokeDasharray={`${tick} ${tick * 0.6}`} />
              {slash(d.from, d.cross, 'a')}
              {slash(d.to, d.cross, 'b')}
              <text x={(d.from + d.to) / 2} y={d.cross - tick * 0.6} fontSize={fs} textAnchor="middle"
                fontFamily="'NB Akademie', 'Helvetica Neue', Inter, Arial, sans-serif" stroke="none">{fmt(mm)}</text>
            </g>
          );
        }
        return (
          <g key={`i${i}`} stroke={INK} fill={INK} opacity="0.85">
            <line x1={d.cross} y1={d.from} x2={d.cross} y2={d.to} strokeWidth={sw} strokeDasharray={`${tick} ${tick * 0.6}`} />
            {slash(d.cross, d.from, 'a')}
            {slash(d.cross, d.to, 'b')}
            <text x={d.cross - tick * 0.6} y={(d.from + d.to) / 2} fontSize={fs} textAnchor="middle"
              fontFamily="'NB Akademie', 'Helvetica Neue', Inter, Arial, sans-serif" stroke="none"
              transform={`rotate(-90 ${d.cross - tick * 0.6} ${(d.from + d.to) / 2})`}>{fmt(mm)}</text>
          </g>
        );
      })}

      {/* manual measurements */}
      {manual.map((m, i) => {
        const mm = Math.hypot(m.x2 - m.x1, m.y2 - m.y1) * mmPerUnit;
        return (
          <g key={`m${i}`} stroke={INK} fill={INK}>
            <line x1={m.x1} y1={m.y1} x2={m.x2} y2={m.y2} strokeWidth={sw * 1.4} />
            {slash(m.x1, m.y1, 'a')}
            {slash(m.x2, m.y2, 'b')}
            <text x={(m.x1 + m.x2) / 2} y={(m.y1 + m.y2) / 2 - tick * 0.5} fontSize={fs}
              textAnchor="middle" fontFamily="'NB Akademie', 'Helvetica Neue', Inter, Arial, sans-serif" stroke="none">{fmt(mm)}</text>
          </g>
        );
      })}

      {/* calibration line awaiting its real length */}
      {calibSeg && (
        <line x1={calibSeg.x1} y1={calibSeg.y1} x2={calibSeg.x2} y2={calibSeg.y2}
          stroke="#ffd23f" strokeWidth={sw * 2} strokeDasharray={`${tick} ${tick * 0.6}`} />
      )}

      {pending && <circle cx={pending.x} cy={pending.y} r={sw * 3} fill="none" stroke={INK} strokeWidth={sw} />}

      {/* north point + scale bar + title block (shared builders, identical to
          export). Each is drag-to-reposition; offsets flow back up to App so the
          export reproduces the same layout. */}
      <Draggable offset={offsets.north} onChange={(o) => onMoveAnnotation('north', o)}
        toUser={toUser} markup={northMarkup(box, north?.angle ?? 0)} />
      <Draggable offset={offsets.scaleBar} onChange={(o) => onMoveAnnotation('scaleBar', o)}
        toUser={toUser} markup={scaleBarMarkup(box, mmPerUnit, unit)} />
      <Draggable offset={offsets.titleBlock} onChange={(o) => onMoveAnnotation('titleBlock', o)}
        toUser={toUser} markup={titleBlockMarkup(box, titleBlock || {})} />
    </svg>
  );
}
