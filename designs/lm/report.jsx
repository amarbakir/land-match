// Report (detail pane) — shown when a match is selected
const { useState: useStateR } = React;

function Report({ match, scoreViz, weights, onAction, shortlistSet, dismissSet }) {
  const m = match;
  const shortlisted = shortlistSet.has(m.id);
  const dismissed = dismissSet.has(m.id);

  const componentKeys = [
    { key: 'soil', label: 'Soil' },
    { key: 'flood', label: 'Flood' },
    { key: 'price', label: 'Price' },
    { key: 'acreage', label: 'Acreage' },
    { key: 'zoning', label: 'Zoning' },
    { key: 'geography', label: 'Geography' },
    { key: 'infrastructure', label: 'Infra' },
    { key: 'climate', label: 'Climate' },
  ];

  const tierCls = m.scoreOverall >= 85 ? 's-high' : m.scoreOverall >= 70 ? 's-high' : m.scoreOverall >= 60 ? 's-mid' : 's-fail';

  return (
    <div className="report">
      {/* Hero */}
      <div className="report-hero">
        <div>
          <div className="report-eyebrow">{m.source} · Found {m.foundAt}</div>
          <h1 className="report-title">{m.title}</h1>
          <div className="report-addr">{m.address}</div>
          <div className="actions-bar" style={{ marginTop: 18 }}>
            <button className={`btn primary`} onClick={() => onAction('open', m)}>
              <window.Ic.External size={13}/> Open on {m.source}
            </button>
            <button className={`btn ghost ${shortlisted ? 'active' : ''}`} onClick={() => onAction('shortlist', m)}>
              <window.Ic.Star size={13}/> {shortlisted ? 'Shortlisted' : 'Shortlist'}
            </button>
            <button className="btn ghost" onClick={() => onAction('note', m)}>
              <window.Ic.Note size={13}/> Add note
            </button>
            <button className="btn ghost" onClick={() => onAction('share', m)}>
              <window.Ic.Share size={13}/> Share
            </button>
            <button className={`btn ghost ${dismissed ? 'active' : ''}`} onClick={() => onAction('dismiss', m)} style={{ marginLeft: 'auto' }}>
              <window.Ic.Dismiss size={13}/> {dismissed ? 'Dismissed' : 'Dismiss'}
            </button>
          </div>
        </div>
        <div className="report-price">
          <div className="price-val">${m.price.toLocaleString()}</div>
          <div className="price-lab">Asking · ${Math.round(m.ppa).toLocaleString()}/ac</div>
        </div>
      </div>

      {/* Key stats */}
      <div className="report-stats">
        <div className="stat"><div className="stat-label">Acreage</div><div className="stat-val">{m.acreage} <span className="faint" style={{fontSize:11}}>ac</span></div></div>
        <div className="stat"><div className="stat-label">Soil Class</div><div className="stat-val">{['I','II','III','IV','V','VI','VII','VIII'][m.soil.class-1]} <span className="faint" style={{fontSize:11}}>· {m.soil.primeFarmland === 'Yes' ? 'Prime' : '—'}</span></div></div>
        <div className="stat"><div className="stat-label">Flood Zone</div><div className={`stat-val ${m.flood.zone === 'X' ? 's-high' : 's-mid'}`}>{m.flood.zone}</div></div>
        <div className="stat"><div className="stat-label">Zoning</div><div className="stat-val mono">{m.parcel.zoning.split(' — ')[0]}</div></div>
      </div>

      {/* Verdict */}
      <div className="section">
        <div className="section-head">
          <span className="section-num">01</span>
          <span className="section-title">AI Verdict</span>
          <span className="section-rule"/>
          <span className="mono faint" style={{fontSize:10, letterSpacing:'0.1em'}}>CLAUDE HAIKU</span>
        </div>
        <div className="verdict">
          <div className="verdict-text">{m.summary}</div>
          <div className="verdict-tags">
            {m.tags.map(t => <Tag key={t.label} label={t.label} tone={t.tone}/>)}
          </div>
        </div>
      </div>

      {/* Score breakdown */}
      <div className="section">
        <div className="section-head">
          <span className="section-num">02</span>
          <span className="section-title">Score breakdown</span>
          <span className="section-rule"/>
          <span className="mono faint" style={{fontSize:10, letterSpacing:'0.1em'}}>WEIGHTED · /100</span>
        </div>
        <div className="score-grid">
          <div className="overall-score">
            <div className={`overall-num ${tierCls}`}>{m.scoreOverall}</div>
            <div className="overall-lab">Overall</div>
            <div className={`overall-tier ${tierCls}`}>{m.tier}</div>
          </div>
          {scoreViz === 'radar' ? (
            <div className="radar-wrap"><Radar scores={m.scores}/></div>
          ) : (
            <div className="meters">
              {componentKeys.map(({key, label}) => (
                <Meter key={key} label={label} value={m.scores[key]} weight={weights[key]}/>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Enrichment */}
      <div className="section">
        <div className="section-head">
          <span className="section-num">03</span>
          <span className="section-title">Enrichment data</span>
          <span className="section-rule"/>
          <span className="mono faint" style={{fontSize:10, letterSpacing:'0.1em'}}>{m.sourcesUsed.length} SOURCES</span>
        </div>
        <div className="data-grid">
          {/* Soil */}
          <div className="data-card">
            <div className="dc-head">
              <div className="dc-icon"><window.Ic.Seed size={14}/></div>
              <div className="dc-title">Soil · USDA</div>
              <div className={`dc-tier ${m.scores.soil >= 80 ? '' : m.scores.soil >= 60 ? 'mid' : 'low'}`}>{m.scores.soil}</div>
            </div>
            <div className="dc-rows">
              <div className="dc-row"><span className="k">Capability class</span><span className="v">{['I','II','III','IV','V','VI','VII','VIII'][m.soil.class-1]} — {m.soil.classLabel}</span></div>
              <div className="dc-row"><span className="k">Drainage</span><span className="v">{m.soil.drainage}</span></div>
              <div className="dc-row"><span className="k">Texture</span><span className="v">{m.soil.texture}</span></div>
              <div className="dc-row"><span className="k">Prime farmland</span><span className="v">{m.soil.primeFarmland}</span></div>
            </div>
          </div>

          {/* Flood */}
          <div className="data-card">
            <div className="dc-head">
              <div className="dc-icon"><window.Ic.Droplet size={14}/></div>
              <div className="dc-title">Flood · FEMA NFHL</div>
              <div className={`dc-tier ${m.scores.flood >= 80 ? '' : m.scores.flood >= 60 ? 'mid' : 'low'}`}>{m.scores.flood}</div>
            </div>
            <div className="dc-rows">
              <div className="dc-row"><span className="k">Zone</span><span className="v">{m.flood.zone}</span></div>
              <div className="dc-row"><span className="k">Description</span><span className="v">{m.flood.zoneLabel}</span></div>
              <div className="dc-row"><span className="k">FEMA panel</span><span className="v">{m.flood.femaPanel}</span></div>
              <div className="dc-row"><span className="k">Effective</span><span className="v">{m.flood.effective}</span></div>
            </div>
          </div>

          {/* Parcel */}
          <div className="data-card">
            <div className="dc-head">
              <div className="dc-icon"><window.Ic.Home size={14}/></div>
              <div className="dc-title">Parcel · Regrid</div>
              <div className={`dc-tier ${m.scores.zoning >= 80 ? '' : m.scores.zoning >= 60 ? 'mid' : 'low'}`}>{m.scores.zoning}</div>
            </div>
            <div className="dc-rows">
              <div className="dc-row"><span className="k">Zoning</span><span className="v">{m.parcel.zoning}</span></div>
              <div className="dc-row"><span className="k">Verified acreage</span>{m.parcel.verifiedAcreage ? <span className="v">{m.parcel.verifiedAcreage} ac</span> : <span className="v na">Not available</span>}</div>
              <div className="dc-row"><span className="k">APN</span><span className="v">{m.parcel.apn}</span></div>
            </div>
          </div>

          {/* Climate */}
          <div className="data-card">
            <div className="dc-head">
              <div className="dc-icon"><window.Ic.Sun size={14}/></div>
              <div className="dc-title">Climate · First Street</div>
              <div className={`dc-tier ${m.scores.climate >= 80 ? '' : m.scores.climate >= 60 ? 'mid' : 'low'}`}>{m.scores.climate}</div>
            </div>
            <div className="dc-rows">
              <div className="dc-row"><span className="k">Fire risk</span><span className="v">{m.climate.fire}/10</span></div>
              <div className="dc-row"><span className="k">Flood risk</span><span className="v">{m.climate.flood}/10</span></div>
              <div className="dc-row"><span className="k">Heat risk</span><span className="v">{m.climate.heat}/10</span></div>
              <div className="dc-row"><span className="k">Drought risk</span><span className="v">{m.climate.drought}/10</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* Locator */}
      <div className="section">
        <div className="section-head">
          <span className="section-num">04</span>
          <span className="section-title">Location</span>
          <span className="section-rule"/>
          <span className="mono faint" style={{fontSize:10, letterSpacing:'0.1em'}}>PARCEL OVERLAY</span>
        </div>
        <Locator lat={m.lat} lng={m.lng} floodZone={m.flood.zone}/>
      </div>

      {/* Infrastructure */}
      <div className="section">
        <div className="section-head">
          <span className="section-num">05</span>
          <span className="section-title">Infrastructure on-record</span>
          <span className="section-rule"/>
        </div>
        <div className="options-row">
          {m.infra.map(i => <span key={i} className="opt on">{i}</span>)}
        </div>
      </div>

      {/* Data provenance */}
      <div className="section">
        <div className="section-head">
          <span className="section-num">06</span>
          <span className="section-title">Data provenance</span>
          <span className="section-rule"/>
        </div>
        <div className="options-row">
          {m.sourcesUsed.map(s => <span key={s} className="opt on"><window.Ic.Check size={10}/> &nbsp;{s}</span>)}
          {m.sourcesSkipped.map(s => <span key={s} className="opt on-danger">{s}</span>)}
        </div>
      </div>
    </div>
  );
}

window.Report = Report;
