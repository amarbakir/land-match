// Root App — shell + routing + tweaks
const { useState: useS, useEffect: useE, useMemo: useM } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "density": "spacious",
  "scoreViz": "meters",
  "visualTone": "earthy",
  "accent": "#D4A843"
}/*EDITMODE-END*/;

function App() {
  const { PROFILES, MATCHES, DEFAULT_WEIGHTS } = window.LM_DATA;
  const [route, setRoute] = useS(() => localStorage.getItem('lm_route') || 'inbox');
  const [selectedId, setSelectedId] = useS(() => localStorage.getItem('lm_sel') || 'm2');
  const [selectedProfile, setSelectedProfile] = useS('p1');
  const [filter, setFilter] = useS('all');
  const [profilePopOpen, setProfilePopOpen] = useS(false);
  const [shortlistSet, setShortlistSet] = useS(new Set(['m2']));
  const [dismissSet, setDismissSet] = useS(new Set(['m6']));
  const [readSet, setReadSet] = useS(new Set(['m3','m4','m5','m6']));

  // Tweaks
  const [tweaksOpen, setTweaksOpen] = useS(false);
  const [editMode, setEditMode] = useS(false);
  const [density, setDensity] = useS(TWEAK_DEFAULTS.density);
  const [scoreViz, setScoreViz] = useS(TWEAK_DEFAULTS.scoreViz);
  const [visualTone, setVisualTone] = useS(TWEAK_DEFAULTS.visualTone);
  const [accent, setAccent] = useS(TWEAK_DEFAULTS.accent);

  useE(() => { localStorage.setItem('lm_route', route); }, [route]);
  useE(() => { localStorage.setItem('lm_sel', selectedId); }, [selectedId]);
  useE(() => {
    document.body.classList.toggle('dense', density === 'dense');
    document.body.classList.toggle('topo', visualTone === 'topo');
    document.documentElement.style.setProperty('--accent', accent);
  }, [density, visualTone, accent]);

  // Edit mode protocol
  useE(() => {
    const handler = (e) => {
      if (!e.data || typeof e.data !== 'object') return;
      if (e.data.type === '__activate_edit_mode') { setEditMode(true); setTweaksOpen(true); }
      if (e.data.type === '__deactivate_edit_mode') { setEditMode(false); setTweaksOpen(false); }
    };
    window.addEventListener('message', handler);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', handler);
  }, []);

  const persist = (patch) => {
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits: patch }, '*');
  };

  // Current profile + visible matches
  const profile = PROFILES.find(p => p.id === selectedProfile);
  const profileMatches = MATCHES.filter(m => m.profileId === selectedProfile);
  const filteredMatches = profileMatches.filter(m => {
    if (filter === 'unread') return !readSet.has(m.id) && !dismissSet.has(m.id);
    if (filter === 'strong') return m.scoreOverall >= 80 && !dismissSet.has(m.id);
    if (filter === 'shortlist') return shortlistSet.has(m.id);
    if (filter === 'dismissed') return dismissSet.has(m.id);
    return !dismissSet.has(m.id); // default 'all' hides dismissed
  });

  const selected = MATCHES.find(m => m.id === selectedId) || filteredMatches[0];

  const onAction = (action, m) => {
    if (action === 'shortlist') {
      const ns = new Set(shortlistSet);
      ns.has(m.id) ? ns.delete(m.id) : ns.add(m.id);
      setShortlistSet(ns);
    } else if (action === 'dismiss') {
      const ns = new Set(dismissSet);
      ns.has(m.id) ? ns.delete(m.id) : ns.add(m.id);
      setDismissSet(ns);
    }
  };

  const selectMatch = (m) => {
    setSelectedId(m.id);
    if (!readSet.has(m.id)) {
      const ns = new Set(readSet); ns.add(m.id); setReadSet(ns);
    }
  };

  return (
    <div className="app">
      {/* Nav */}
      <aside className="nav">
        <div className="brand">
          <div className="brand-mark">L</div>
          <div className="brand-name">Land<em>Match</em></div>
        </div>
        <div className="nav-label">Workspace</div>
        <div className={`nav-item ${route === 'inbox' ? 'active' : ''}`} onClick={() => setRoute('inbox')}>
          <window.Ic.Inbox className="nav-ico"/> Matches
          <span className="nav-count">{MATCHES.filter(m => !readSet.has(m.id) && !dismissSet.has(m.id)).length}</span>
        </div>
        <div className={`nav-item ${route === 'shortlist' ? 'active' : ''}`} onClick={() => setRoute('shortlist')}>
          <window.Ic.Star className="nav-ico"/> Shortlist
          <span className="nav-count">{shortlistSet.size}</span>
        </div>
        <div className={`nav-item ${route === 'dismissed' ? 'active' : ''}`} onClick={() => setRoute('dismissed')}>
          <window.Ic.Archive className="nav-ico"/> Dismissed
          <span className="nav-count">{dismissSet.size}</span>
        </div>

        <div className="nav-label">Profiles</div>
        {PROFILES.map(p => (
          <div key={p.id} className={`nav-item ${route === 'profile' && selectedProfile === p.id ? 'active' : ''}`}
               onClick={() => { setRoute('profile'); setSelectedProfile(p.id); }}>
            <window.Ic.Sliders className="nav-ico"/>
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
            {p.counts.new > 0 && <span className="nav-count">+{p.counts.new}</span>}
          </div>
        ))}
        <div className="nav-item" onClick={() => setRoute('new-profile')}>
          <window.Ic.Plus className="nav-ico"/> New profile
        </div>

        <div className="nav-label">Account</div>
        <div className="nav-item"><window.Ic.Bell className="nav-ico"/> Alert settings</div>
        <div className="nav-item"><window.Ic.Settings className="nav-ico"/> Settings</div>

        <div className="nav-footer">
          <div className="avatar">AB</div>
          <div className="user-info">
            <div className="user-name">Amar Bakir</div>
            <div className="user-email">amar@landmatch.co</div>
          </div>
        </div>
      </aside>

      <div className="main">
        {/* Topbar */}
        <div className="topbar">
          <div className="crumbs">
            <span>Workspace</span>
            <span className="sep">›</span>
            <strong>{
              route === 'inbox' ? 'Matches' :
              route === 'shortlist' ? 'Shortlist' :
              route === 'dismissed' ? 'Dismissed' :
              route === 'profile' ? profile?.name :
              route === 'new-profile' ? 'New profile' : route
            }</strong>
          </div>
          <div className="topbar-actions">
            <div className="coord-chip">41.94°N · 74.02°W · 60mi</div>
            <button className="icon-btn" title="Search"><window.Ic.Search size={14}/></button>
            <button className="icon-btn" title="Alerts"><window.Ic.Bell size={14}/><span className="dot"/></button>
            <button className="icon-btn" title="Tweaks" onClick={() => setTweaksOpen(v => !v)}><window.Ic.Sliders size={14}/></button>
          </div>
        </div>

        <div className="content">
          {route === 'inbox' && (
            <div className="inbox">
              <ListPane
                profile={profile}
                profiles={PROFILES}
                matches={filteredMatches}
                selectedId={selected?.id}
                onSelect={selectMatch}
                filter={filter}
                setFilter={setFilter}
                counts={{
                  all: profileMatches.filter(m => !dismissSet.has(m.id)).length,
                  unread: profileMatches.filter(m => !readSet.has(m.id) && !dismissSet.has(m.id)).length,
                  strong: profileMatches.filter(m => m.scoreOverall >= 80 && !dismissSet.has(m.id)).length,
                  shortlist: profileMatches.filter(m => shortlistSet.has(m.id)).length,
                }}
                readSet={readSet}
                shortlistSet={shortlistSet}
                profilePopOpen={profilePopOpen}
                setProfilePopOpen={setProfilePopOpen}
                setSelectedProfile={setSelectedProfile}
              />
              <div className="detail-pane">
                {selected ? (
                  <window.Report match={selected} scoreViz={scoreViz} weights={DEFAULT_WEIGHTS} onAction={onAction} shortlistSet={shortlistSet} dismissSet={dismissSet}/>
                ) : (
                  <EmptyState/>
                )}
              </div>
            </div>
          )}

          {route === 'shortlist' && (
            <ShortlistView matches={MATCHES.filter(m => shortlistSet.has(m.id))} onOpen={(m) => { setRoute('inbox'); setSelectedId(m.id); setSelectedProfile(m.profileId); }}/>
          )}

          {route === 'dismissed' && (
            <ShortlistView dismissed matches={MATCHES.filter(m => dismissSet.has(m.id))} onOpen={(m) => { setRoute('inbox'); setSelectedId(m.id); setSelectedProfile(m.profileId); }}/>
          )}

          {route === 'profile' && (
            <div className="detail-pane"><window.ProfileEditor profile={profile} onClose={() => setRoute('inbox')}/></div>
          )}
          {route === 'new-profile' && (
            <div className="detail-pane"><window.ProfileEditor profile={null} onClose={() => setRoute('inbox')}/></div>
          )}
        </div>
      </div>

      {/* Tweaks */}
      <div className={`tweaks ${tweaksOpen ? 'open' : ''}`}>
        <h4>Tweaks <span>v1</span></h4>
        <div className="t-row">
          <label>Density</label>
          <div className="t-seg">
            {['spacious','dense'].map(v => (
              <button key={v} className={density===v?'on':''} onClick={() => { setDensity(v); persist({ density: v }); }}>{v}</button>
            ))}
          </div>
        </div>
        <div className="t-row">
          <label>Score viz</label>
          <div className="t-seg">
            {['meters','radar'].map(v => (
              <button key={v} className={scoreViz===v?'on':''} onClick={() => { setScoreViz(v); persist({ scoreViz: v }); }}>{v}</button>
            ))}
          </div>
        </div>
        <div className="t-row">
          <label>Visual tone</label>
          <div className="t-seg">
            {['earthy','topo'].map(v => (
              <button key={v} className={visualTone===v?'on':''} onClick={() => { setVisualTone(v); persist({ visualTone: v }); }}>{v}</button>
            ))}
          </div>
        </div>
        <div className="t-row">
          <label>Accent</label>
          <div className="t-seg">
            {[{c:'#D4A843',l:'gold'},{c:'#7DB88A',l:'moss'},{c:'#C4956A',l:'clay'}].map(x => (
              <button key={x.c} className={accent===x.c?'on':''} onClick={() => { setAccent(x.c); persist({ accent: x.c }); }} style={{ background: accent===x.c ? x.c : undefined, color: accent===x.c ? '#0F1410' : undefined }}>{x.l}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ListPane({ profile, profiles, matches, selectedId, onSelect, filter, setFilter, counts, readSet, shortlistSet, profilePopOpen, setProfilePopOpen, setSelectedProfile }) {
  const Ic = window.Ic;
  return (
    <div className="list-pane">
      <div className="list-header">
        <div className="profile-picker" style={{ position: 'relative' }}>
          <div className="profile-name" onClick={() => setProfilePopOpen(v => !v)}>
            {profile?.name} <span className="caret">▾</span>
          </div>
          <div className="profile-sub"><span className="live"/>{profile?.sub}</div>
          {profilePopOpen && (
            <div className="pop">
              {profiles.map(p => (
                <div key={p.id} className="pop-item" onClick={() => { setSelectedProfile(p.id); setProfilePopOpen(false); }}>
                  <div><div className="nm">{p.name}</div><div className="sb">{p.sub}</div></div>
                  {p.counts.new > 0 && <span className="nav-count">+{p.counts.new}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
        <button className="icon-btn" title="Edit profile"><Ic.Sliders size={13}/></button>
      </div>

      <div className="list-filters">
        {[
          ['all','All',counts.all],
          ['unread','Unread',counts.unread],
          ['strong','≥80',counts.strong],
          ['shortlist','★',counts.shortlist],
        ].map(([key,label,n]) => (
          <button key={key} className={`chip ${filter === key ? 'active' : ''}`} onClick={() => setFilter(key)}>
            {label}<span className="c-count">{n}</span>
          </button>
        ))}
      </div>

      <div className="list-scroll">
        {matches.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div className="mono faint" style={{ fontSize: 11, letterSpacing: '0.1em' }}>NO MATCHES</div>
            <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 6 }}>Loosen a filter or expand this profile's criteria.</div>
          </div>
        )}
        {matches.map(m => (
          <MatchRow key={m.id} match={m} selected={selectedId === m.id} unread={!readSet.has(m.id)} shortlisted={shortlistSet.has(m.id)} onClick={() => onSelect(m)}/>
        ))}
      </div>
    </div>
  );
}

function MatchRow({ match, selected, unread, shortlisted, onClick }) {
  const m = match;
  return (
    <div className={`match ${selected ? 'selected' : ''} ${unread ? 'unread' : ''}`} onClick={onClick}>
      <window.ScoreRing score={m.scoreOverall}/>
      <div className="match-body">
        <div className="match-title">
          {shortlisted && <window.Ic.Star size={11} style={{ color: 'var(--accent)', marginRight: 4, verticalAlign: '-1px' }}/>}
          {m.title}
        </div>
        <div className="match-meta">
          <span>${(m.price/1000).toFixed(0)}K</span>
          <span className="sep">·</span>
          <span>{m.acreage}ac</span>
          <span className="sep">·</span>
          <span>{m.source}</span>
        </div>
        <div className="match-sum">{m.summary}</div>
        <div className="match-tags">
          {m.tags.slice(0,3).map(t => <window.Tag key={t.label} label={t.label} tone={t.tone}/>)}
        </div>
      </div>
      <div className="match-right">
        <span className="match-time">{m.time}</span>
      </div>
    </div>
  );
}

function ShortlistView({ matches, dismissed, onOpen }) {
  if (matches.length === 0) return <EmptyState title={dismissed ? 'Nothing dismissed' : 'No shortlisted properties yet'} sub={dismissed ? 'Properties you archive from the inbox show up here.' : 'Star a property in the inbox to save it here.'}/>;
  return (
    <div className="page">
      <div className="report-eyebrow">{dismissed ? 'Dismissed' : 'Shortlist'}</div>
      <h1 className="page-title">{dismissed ? 'Dismissed properties' : 'Your shortlisted properties'}</h1>
      <p className="page-sub">{matches.length} {matches.length === 1 ? 'property' : 'properties'}.</p>
      <div className="shortlist-grid">
        {matches.map(m => (
          <div key={m.id} className="shortcard" onClick={() => onOpen(m)}>
            <div className="sc-head">
              <div>
                <div className="sc-title">{m.title}</div>
                <div className="sc-meta">${(m.price/1000).toFixed(0)}K · {m.acreage}ac · {m.source}</div>
              </div>
              <window.ScoreRing score={m.scoreOverall} size={40}/>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>{m.summary}</div>
            <div className="sc-bars">
              {['soil','flood','price','acreage'].map(k => (
                <div key={k} className="sc-bar"><div className="f" style={{ width: `${m.scores[k]}%`, background: m.scores[k] >= 80 ? 'var(--success)' : m.scores[k] >= 60 ? 'var(--accent-2)' : 'var(--accent)' }}/></div>
              ))}
            </div>
            <div className="sc-footer">
              <span>{m.soil.class <= 2 ? 'Prime' : `Class ${['I','II','III','IV','V','VI','VII','VIII'][m.soil.class-1]}`}</span>
              <span>Zone {m.flood.zone}</span>
              <span>{m.foundAt}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ title = 'Nothing here yet', sub = 'Your matches will show up here as they come in.' }) {
  return (
    <div className="empty">
      <svg className="empty-ill" viewBox="0 0 160 160" fill="none">
        <circle cx="80" cy="80" r="60" stroke="#2C3E2D" strokeWidth="1.5" strokeDasharray="3 4"/>
        <path d="M40,95 Q70,70 100,85 T140,80" stroke="#3a5040" strokeWidth="1.2" fill="none"/>
        <path d="M30,110 Q70,85 110,100 T150,95" stroke="#3a5040" strokeWidth="1.2" fill="none"/>
        <circle cx="80" cy="80" r="4" fill="#D4A843"/>
      </svg>
      <div className="serif" style={{ fontSize: 20, fontWeight: 600, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--text-dim)', maxWidth: 320 }}>{sub}</div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
