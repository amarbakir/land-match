// Search profile editor — criteria + weights
const { useState: useStateP } = React;

function ProfileEditor({ profile, onClose }) {
  const [acreageMin, setAcreageMin] = useStateP(5);
  const [acreageMax, setAcreageMax] = useStateP(30);
  const [priceMax, setPriceMax] = useStateP(450);
  const [soilMax, setSoilMax] = useStateP(3);
  const [floodExclude, setFloodExclude] = useStateP(['A','AE','VE']);
  const [zoning, setZoning] = useStateP(['agricultural','residential-agricultural']);
  const [infra, setInfra] = useStateP(['well','septic','electric']);
  const [radius, setRadius] = useStateP(60);
  const [threshold, setThreshold] = useStateP(profile?.alertThreshold ?? 70);
  const [frequency, setFrequency] = useStateP(profile?.alertFrequency ?? 'daily');
  const [weights, setWeights] = useStateP({ ...window.LM_DATA.DEFAULT_WEIGHTS });

  const toggle = (arr, setArr, v) => setArr(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);

  const floodOpts = ['X','A','AE','VE','D'];
  const zoningOpts = ['agricultural','residential-agricultural','rural-residential','conservation'];
  const infraOpts = ['well','septic','electric','paved road','internet','outbuildings'];

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 6 }}>
        <div style={{ minWidth: 0, flex: '1 1 320px' }}>
          <div className="report-eyebrow">Search profile</div>
          <h1 className="page-title" style={{ wordBreak: 'break-word' }}>{profile?.name || 'New profile'}</h1>
        </div>
        <div className="row" style={{ flex: '0 0 auto' }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary">Save profile</button>
        </div>
      </div>
      <p className="page-sub">Tune what lands in your inbox. Changes apply to future listings — past scores aren't retroactively recalculated.</p>

      {/* Geography */}
      <div className="field">
        <div className="field-head">
          <div className="field-title">Geography</div>
          <div className="field-hint">RADIUS · 41.94°N 74.02°W</div>
        </div>
        <div className="range-bar">
          <div className="range-track"/>
          <div className="range-fill" style={{ left: 0, width: `${(radius/200)*100}%` }}/>
          <div className="range-handle" style={{ left: `${(radius/200)*100}%` }}/>
          <div className="range-labs" style={{ left: `${(radius/200)*100}%` }}>{radius}mi</div>
        </div>
        <div className="options-row" style={{ marginTop: 16 }}>
          {['radius','counties','drive time'].map(t => (
            <button key={t} className={`opt ${t === 'radius' ? 'on' : ''}`}>{t}</button>
          ))}
        </div>
      </div>

      {/* Acreage */}
      <div className="field">
        <div className="field-head">
          <div className="field-title">Acreage</div>
          <div className="field-hint">{acreageMin} – {acreageMax} ACRES</div>
        </div>
        <div className="range-bar">
          <div className="range-track"/>
          <div className="range-fill" style={{ left: `${(acreageMin/100)*100}%`, width: `${((acreageMax-acreageMin)/100)*100}%` }}/>
          <div className="range-handle" style={{ left: `${(acreageMin/100)*100}%` }}/>
          <div className="range-handle" style={{ left: `${(acreageMax/100)*100}%` }}/>
        </div>
      </div>

      {/* Price */}
      <div className="field">
        <div className="field-head">
          <div className="field-title">Price ceiling</div>
          <div className="field-hint">UP TO ${priceMax}K</div>
        </div>
        <div className="range-bar">
          <div className="range-track"/>
          <div className="range-fill" style={{ left: 0, width: `${(priceMax/1000)*100}%` }}/>
          <div className="range-handle" style={{ left: `${(priceMax/1000)*100}%` }}/>
        </div>
      </div>

      {/* Soil */}
      <div className="field">
        <div className="field-head">
          <div className="field-title">Soil capability class</div>
          <div className="field-hint">MAX CLASS {['I','II','III','IV','V','VI','VII','VIII'][soilMax-1]}</div>
        </div>
        <div className="options-row">
          {[1,2,3,4,5,6].map(n => (
            <button key={n} className={`opt ${n <= soilMax ? 'on' : ''}`} onClick={() => setSoilMax(n)}>
              Class {['I','II','III','IV','V','VI'][n-1]}
            </button>
          ))}
        </div>
      </div>

      {/* Flood exclusions */}
      <div className="field">
        <div className="field-head">
          <div className="field-title">Exclude flood zones</div>
          <div className="field-hint">HARD FILTER</div>
        </div>
        <div className="options-row">
          {floodOpts.map(z => (
            <button key={z} className={`opt ${floodExclude.includes(z) ? 'on-danger' : ''}`} onClick={() => toggle(floodExclude, setFloodExclude, z)}>
              Zone {z}
            </button>
          ))}
        </div>
      </div>

      {/* Zoning */}
      <div className="field">
        <div className="field-head">
          <div className="field-title">Preferred zoning</div>
          <div className="field-hint">NORMALIZED</div>
        </div>
        <div className="options-row">
          {zoningOpts.map(z => (
            <button key={z} className={`opt ${zoning.includes(z) ? 'on' : ''}`} onClick={() => toggle(zoning, setZoning, z)}>{z}</button>
          ))}
        </div>
      </div>

      {/* Infra */}
      <div className="field">
        <div className="field-head">
          <div className="field-title">Infrastructure wish-list</div>
          <div className="field-hint">BOOSTS · NOT REQUIRED</div>
        </div>
        <div className="options-row">
          {infraOpts.map(i => (
            <button key={i} className={`opt ${infra.includes(i) ? 'on' : ''}`} onClick={() => toggle(infra, setInfra, i)}>{i}</button>
          ))}
        </div>
      </div>

      {/* Weights */}
      <div className="field">
        <div className="field-head">
          <div className="field-title">Custom weights</div>
          <div className="field-hint">0 – 2.0</div>
        </div>
        <div className="weights-grid">
          {Object.entries(weights).map(([k,v]) => (
            <div key={k} className="weight-row">
              <div className="weight-lab">{k}</div>
              <div className="weight-bar" onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                const nv = Math.max(0, Math.min(2, ((e.clientX - r.left) / r.width) * 2));
                setWeights({ ...weights, [k]: Math.round(nv*10)/10 });
              }}>
                <div className="weight-fill" style={{ width: `${(v/2)*100}%` }}/>
              </div>
              <div className="weight-val">{v.toFixed(1)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Alerts */}
      <div className="field">
        <div className="field-head">
          <div className="field-title">Alerts</div>
          <div className="field-hint">THRESHOLD · FREQ</div>
        </div>
        <div className="range-bar" style={{ marginBottom: 12 }}>
          <div className="range-track"/>
          <div className="range-fill" style={{ left: 0, width: `${threshold}%` }}/>
          <div className="range-handle" style={{ left: `${threshold}%` }}/>
          <div className="range-labs" style={{ left: `${threshold}%` }}>≥ {threshold}</div>
        </div>
        <div className="options-row" style={{ marginTop: 18 }}>
          {['instant','daily','weekly'].map(f => (
            <button key={f} className={`opt ${frequency === f ? 'on' : ''}`} onClick={() => setFrequency(f)}>{f}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

window.ProfileEditor = ProfileEditor;
