import { useRef } from 'react';

/** Interactive north-point compass. Drag the needle to set the north angle
 *  (degrees clockwise from straight up). */
export default function NorthCompass({ angle, onChange }) {
  const ref = useRef(null);

  const setFromEvent = (e) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    let deg = (Math.atan2(dx, -dy) * 180) / Math.PI; // 0 = up, clockwise
    deg = Math.round(((deg % 360) + 360) % 360);
    onChange(deg);
  };

  const onDown = (e) => {
    e.preventDefault();
    setFromEvent(e);
    const move = (ev) => setFromEvent(ev);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const size = 120;
  const c = size / 2;
  const r = c - 14;
  const rad = ((angle - 90) * Math.PI) / 180;
  const nx = c + Math.cos(rad) * r;
  const ny = c + Math.sin(rad) * r;
  const tx = c - Math.cos(rad) * (r * 0.5);
  const ty = c - Math.sin(rad) * (r * 0.5);

  return (
    <div className="compass">
      <svg
        ref={ref}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        onPointerDown={onDown}
        style={{ cursor: 'grab', touchAction: 'none' }}
      >
        <circle cx={c} cy={c} r={r} className="bp-stroke" fill="none" />
        <circle cx={c} cy={c} r={r * 0.04} className="bp-fill" />
        {[0, 90, 180, 270].map((d) => {
          const a = ((d - 90) * Math.PI) / 180;
          return (
            <line
              key={d}
              x1={c + Math.cos(a) * (r - 6)}
              y1={c + Math.sin(a) * (r - 6)}
              x2={c + Math.cos(a) * r}
              y2={c + Math.sin(a) * r}
              className="bp-stroke"
            />
          );
        })}
        <line x1={tx} y1={ty} x2={nx} y2={ny} className="bp-needle" />
        <circle cx={nx} cy={ny} r={6} className="bp-fill" />
        <text x={nx} y={ny - 9} className="bp-label" textAnchor="middle">N</text>
      </svg>
      <div className="compass-readout">{angle}&deg;</div>
    </div>
  );
}
