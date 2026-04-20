// Shared components: score ring, meter, tags
const { useState, useEffect, useRef, useMemo } = React;

const scoreClass = (s) => s >= 80 ? 'high' : s >= 60 ? 'mid' : s >= 40 ? 'low' : 'fail';
const scoreStroke = (s) => `s-${scoreClass(s)}-stroke`;
const scoreColor = (s) => `s-${scoreClass(s)}`;

function ScoreRing({ score, size = 48 }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - score / 100);
  return (
    <div className="score-ring" style={{ width: size, height: size, flexBasis: size }}>
      <svg width={size} height={size}>
        <circle className="bg" cx={size/2} cy={size/2} r={r} strokeWidth="3" fill="none"/>
        <circle className={`fg ${scoreStroke(score)}`} cx={size/2} cy={size/2} r={r}
                strokeWidth="3" fill="none"
                strokeDasharray={c} strokeDashoffset={off}/>
      </svg>
      <span className={`num ${scoreColor(score)}`}>{score}</span>
    </div>
  );
}

function Meter({ label, value, weight, tone }) {
  const cls = tone || scoreClass(value);
  return (
    <div className="meter-row">
      <div className="meter-lab">
        <span>{label}</span>
        {weight != null && <span className="w">×{weight.toFixed(1)}</span>}
      </div>
      <div className="meter-bar">
        <div className={`meter-fill ${cls}`} style={{ width: `${value}%` }}/>
      </div>
      <div className={`meter-val ${scoreColor(value)}`}>{value}</div>
    </div>
  );
}

function Tag({ label, tone = 'default' }) {
  return <span className={`tag ${tone}`}>{label}</span>;
}

// Stylized locator "map" — not a real tile map, a cartographic sketch w/ parcel pin
function Locator({ lat, lng, floodZone }) {
  const showFlood = floodZone && floodZone.startsWith('AE');
  return (
    <div className="locator">
      <div className="loc-head">
        <span className="loc-title">Locator</span>
        <span className="loc-coord">{lat.toFixed(4)}°N · {Math.abs(lng).toFixed(4)}°W</span>
      </div>
      <svg className="loc-svg" viewBox="0 0 600 220" preserveAspectRatio="xMidYMid slice">
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1a2118" strokeWidth="0.5"/>
          </pattern>
          <pattern id="flood" width="8" height="8" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="8" stroke="#7DB88A" strokeWidth="2" opacity="0.35"/>
          </pattern>
        </defs>
        <rect width="600" height="220" fill="url(#grid)"/>
        {/* Topographic contour lines */}
        <g fill="none" stroke="#2C3E2D" strokeWidth="0.8" opacity="0.7">
          <path d="M-20,80 Q120,30 280,60 T620,100"/>
          <path d="M-20,110 Q140,60 300,90 T620,130"/>
          <path d="M-20,140 Q160,90 320,120 T620,160"/>
          <path d="M-20,170 Q180,120 340,150 T620,190"/>
        </g>
        {/* Road */}
        <path d="M0,130 Q180,170 300,130 T600,140" fill="none" stroke="#3a5040" strokeWidth="2.5" strokeLinecap="round"/>
        {/* Stream + flood corridor */}
        <path d="M80,220 Q140,150 200,120 T360,60 T560,0" fill="none" stroke="#4a6a5c" strokeWidth="1.4" strokeDasharray="3 3"/>
        {showFlood && (
          <path d="M80,220 Q140,150 200,120 T360,60 T560,0" fill="none" stroke="url(#flood)" strokeWidth="26" opacity="0.8"/>
        )}
        {/* Parcel boundary */}
        <polygon points="250,70 360,65 390,140 310,175 230,150" fill="rgba(212,168,67,0.08)" stroke="#D4A843" strokeWidth="1.4" strokeDasharray="4 3"/>
        {/* Pin */}
        <g transform="translate(310,110)">
          <circle r="16" fill="rgba(212,168,67,0.18)"/>
          <circle r="6" fill="#D4A843" stroke="#0F1410" strokeWidth="2"/>
        </g>
        {/* Scale bar */}
        <g transform="translate(500,200)">
          <line x1="0" y1="0" x2="60" y2="0" stroke="#9BA393" strokeWidth="1"/>
          <line x1="0" y1="-3" x2="0" y2="3" stroke="#9BA393" strokeWidth="1"/>
          <line x1="60" y1="-3" x2="60" y2="3" stroke="#9BA393" strokeWidth="1"/>
          <text x="30" y="-6" textAnchor="middle" fontSize="9" fill="#9BA393" fontFamily="IBM Plex Mono">¼ mi</text>
        </g>
      </svg>
      <div className="loc-legend">
        <span className="l-parcel">Parcel</span>
        {showFlood && <span className="l-flood">Flood AE</span>}
      </div>
    </div>
  );
}

// Radar chart for score-viz tweak
function Radar({ scores, weights }) {
  const keys = ['soil','flood','price','acreage','zoning','geography','infrastructure','climate'];
  const size = 260, cx = size/2, cy = size/2, R = 95;
  const angle = (i) => (Math.PI * 2 * i) / keys.length - Math.PI/2;
  const pt = (i, v) => {
    const r = (v/100) * R;
    return [cx + Math.cos(angle(i)) * r, cy + Math.sin(angle(i)) * r];
  };
  const poly = keys.map((k,i) => pt(i, scores[k]).join(',')).join(' ');
  return (
    <svg className="radar" viewBox={`0 0 ${size} ${size}`}>
      {[0.25, 0.5, 0.75, 1].map(f => (
        <polygon key={f}
          points={keys.map((_,i) => pt(i, f*100).join(',')).join(' ')}
          fill="none" stroke="#2C3E2D" strokeWidth="0.6" opacity={f===1?0.7:0.3}/>
      ))}
      {keys.map((k, i) => {
        const [x,y] = pt(i, 100);
        return <line key={k} x1={cx} y1={cy} x2={x} y2={y} stroke="#2C3E2D" strokeWidth="0.5" opacity="0.5"/>;
      })}
      <polygon points={poly} fill="rgba(212,168,67,0.22)" stroke="#D4A843" strokeWidth="1.4" strokeLinejoin="round"/>
      {keys.map((k,i) => {
        const [x,y] = pt(i, scores[k]);
        return <circle key={k} cx={x} cy={y} r="3" fill="#D4A843" stroke="#0F1410" strokeWidth="1.2"/>;
      })}
      {keys.map((k, i) => {
        const [x,y] = pt(i, 100);
        const lx = cx + Math.cos(angle(i)) * (R + 18);
        const ly = cy + Math.sin(angle(i)) * (R + 18) + 3;
        return <text key={`l-${k}`} x={lx} y={ly} textAnchor="middle" fontSize="9.5" fill="#9BA393" fontFamily="IBM Plex Mono" letterSpacing="0.6">{k.slice(0,4).toUpperCase()}</text>;
      })}
    </svg>
  );
}

Object.assign(window, { ScoreRing, Meter, Tag, Locator, Radar, scoreClass, scoreColor, scoreStroke });
