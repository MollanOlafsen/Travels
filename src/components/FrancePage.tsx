import { useMemo, useRef, useState } from 'react'
import type { Segment, Settings, Visit } from '../types'
import { REGIONS } from '../data/franceMap'
import {
  DEPT_BY_CODE,
  REGION_BY_CODE,
  REGION_INFO,
  TOTAL_DEPTS,
  TOTAL_REGIONS,
  badges,
  computeFrance,
  suggestionsFromTrips,
} from '../lib/france'
import { fmtDate } from '../lib/rules'
import { confetti, mapToPng, shareOrDownload } from '../lib/celebrate'
import { FranceMap } from './FranceMap'
import { VisitForm, locate, newVisitDraft, type VisitDraft } from './VisitForm'
import { useImageUrl } from './TripList'
import { useToast } from './Toast'

const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember']

function shortDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${parseInt(d, 10)}.${parseInt(m, 10)}.${y.slice(2)}`
}

function visitDates(v: Visit) {
  return v.endDate ? `${fmtDate(v.date)} – ${fmtDate(v.endDate)}` : fmtDate(v.date)
}

function JournalThumb({ id, onOpen }: { id: string; onOpen: (url: string) => void }) {
  const url = useImageUrl(id)
  if (!url) return <div className="fr-jthumb" />
  return (
    <img
      src={url}
      alt=""
      className="fr-jthumb"
      onClick={(e) => {
        e.stopPropagation()
        onOpen(url)
      }}
    />
  )
}

export function FrancePage({ visits, segments, settings, onSettings }: { visits: Visit[]; segments: Segment[]; settings: Settings; onSettings: (s: Settings) => void }) {
  const toast = useToast()
  const mapRef = useRef<SVGSVGElement>(null) // skjult oversiktskart for deling
  const mapCardRef = useRef<HTMLDivElement>(null)
  const [focus, setFocus] = useState<string>()
  const [dept, setDept] = useState<string>()
  const [form, setForm] = useState<VisitDraft | null>(null)
  const [here, setHere] = useState<{ lat: number; lon: number }>()
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)

  const stats = useMemo(() => computeFrance(visits, settings), [visits, settings])
  const earned = useMemo(() => badges(stats, visits), [stats, visits])
  const suggestions = useMemo(() => suggestionsFromTrips(segments, visits, settings.franceDismissed), [segments, visits, settings.franceDismissed])
  const sortedVisits = useMemo(() => visits.slice().sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt), [visits])

  const focusStatus = focus ? stats.regions.find((r) => r.code === focus) : undefined
  const focusRegion = focus ? REGION_BY_CODE.get(focus) : undefined
  const focusInfo = focus ? REGION_INFO[focus] : undefined
  const selDept = dept ? DEPT_BY_CODE.get(dept) : undefined
  const nextInfo = stats.next ? REGION_INFO[stats.next] : undefined
  const pct = Math.round((stats.regionsVisited / TOTAL_REGIONS) * 100)
  const toNext = stats.nextLevel ? stats.nextLevel.min - stats.regionsVisited : 0

  function selectRegion(code: string | undefined) {
    setFocus(code)
    setDept(undefined)
  }

  function showOnMap(code: string, d?: string) {
    setFocus(code)
    setDept(d)
    mapCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function onSaved(v: Visit) {
    const reg = DEPT_BY_CODE.get(v.dept)!.region
    const wasVisited = stats.regions.find((r) => r.code === reg)?.visited
    const deptNew = !stats.deptsVisited.has(v.dept)
    setForm(null)
    if (!wasVisited) {
      const n = stats.regionsVisited + 1
      confetti([REGION_INFO[reg].color, '#3b5bdb', '#ffffff', '#c0392b', '#c9a961'])
      toast(n === TOTAL_REGIONS ? '🏆 Alle 13 regioner! Tour de France fullført!' : `${REGION_INFO[reg].emoji} Ny region låst opp: ${REGION_BY_CODE.get(reg)!.name} (${n}/${TOTAL_REGIONS})`)
    } else if (deptNew) toast(`Nytt departement: ${DEPT_BY_CODE.get(v.dept)!.name} (${stats.deptsVisited.size + 1}/${TOTAL_DEPTS})`)
    else toast('Besøket er lagret.')
    showOnMap(reg, v.dept)
  }

  async function imHere() {
    setLocating(true)
    try {
      const p = await locate()
      setHere({ lat: p.lat, lon: p.lon })
      if (!p.dept) {
        toast('Du ser ikke ut til å være i Frankrike akkurat nå.')
        return
      }
      const reg = DEPT_BY_CODE.get(p.dept)!.region
      setFocus(reg)
      setDept(p.dept)
      setForm(newVisitDraft({ dept: p.dept, place: p.place ?? '', lat: p.lat, lon: p.lon, source: 'gps' }))
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setLocating(false)
    }
  }

  async function share() {
    if (!mapRef.current) return
    try {
      const blob = await mapToPng(
        mapRef.current,
        `${stats.regionsVisited} av ${TOTAL_REGIONS} regioner`,
        `${stats.level.emoji} ${stats.level.title}`,
        `${stats.deptsVisited.size} av ${TOTAL_DEPTS} departementer · ca. ${Math.round(stats.areaPct)} % av Frankrike`,
      )
      const r = await shareOrDownload(blob, `tour-de-france-${stats.regionsVisited}-av-13.png`, `Min Tour de France: ${stats.regionsVisited} av 13 regioner 🇫🇷`)
      if (r === 'downloaded') toast('Kartet er lastet ned som bilde.')
    } catch (e) {
      toast((e as Error).message)
    }
  }

  function dismiss(segmentId: string) {
    onSettings({ ...settings, franceDismissed: [...settings.franceDismissed, segmentId] })
  }

  // Dagbok gruppert per måned
  const journal = useMemo(() => {
    const groups: { key: string; label: string; items: Visit[] }[] = []
    for (const v of sortedVisits) {
      const key = v.date.slice(0, 7)
      let g = groups[groups.length - 1]
      if (!g || g.key !== key) {
        g = { key, label: `${MONTHS[parseInt(key.slice(5), 10) - 1]} ${key.slice(0, 4)}`, items: [] }
        groups.push(g)
      }
      g.items.push(v)
    }
    return groups
  }, [sortedVisits])

  return (
    <div className="stack">
      {/* ---------- Fremdrift ---------- */}
      <section className="card fr-hero">
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="eyebrow" style={{ color: 'var(--gold)' }}>
              Tour de France
            </div>
            <div className="fr-count">
              <span>{stats.regionsVisited}</span>
              <small>/ {TOTAL_REGIONS} regioner</small>
            </div>
          </div>
          <div className="fr-level" title="Nivå">
            <span className="fr-level-emoji">{stats.level.emoji}</span>
            <span>{stats.level.title}</span>
          </div>
        </div>

        <div className="fr-segbar" aria-label={`${pct} prosent av regionene`}>
          {stats.regions
            .slice()
            .sort((a, b) => (a.firstDate ?? (a.home ? '0' : '9')).localeCompare(b.firstDate ?? (b.home ? '0' : '9')))
            .map((r) => (
              <span key={r.code} title={REGION_BY_CODE.get(r.code)!.name} style={{ background: r.visited ? REGION_INFO[r.code].color : undefined }} />
            ))}
        </div>

        <div className="fr-substats">
          <div>
            <b>{stats.deptsVisited.size}</b>
            <span>av {TOTAL_DEPTS} departementer</span>
          </div>
          <div>
            <b>{Math.round(stats.areaPct)} %</b>
            <span>av arealet</span>
          </div>
          <div>
            <b>{visits.length}</b>
            <span>besøk logget</span>
          </div>
        </div>

        {stats.nextLevel && (
          <p className="small" style={{ margin: '10px 0 0', opacity: 0.85 }}>
            {toNext} {toNext === 1 ? 'region' : 'regioner'} igjen til {stats.nextLevel.emoji} <i>{stats.nextLevel.title}</i>
          </p>
        )}

        <div className="row" style={{ marginTop: 14, gap: 8 }}>
          <button className="btn gold" onClick={imHere} disabled={locating}>
            📍 {locating ? 'Finner deg …' : 'Jeg er her nå'}
          </button>
          <button className="btn ghost" style={{ color: 'var(--cream)' }} onClick={() => setForm(newVisitDraft())}>
            + Legg til besøk
          </button>
          <button className="btn ghost" style={{ color: 'var(--cream)' }} onClick={share}>
            Del kartet
          </button>
        </div>
      </section>

      {/* ---------- Kart ---------- */}
      <section className="card fr-mapcard" ref={mapCardRef}>
        <div className="row between" style={{ marginBottom: 6 }}>
          <div className="small muted">{focus ? 'Trykk på et departement for detaljer' : 'Trykk på en region for å zoome inn'}</div>
          {focus && (
            <button className="btn small" onClick={() => selectRegion(undefined)}>
              ← Hele Frankrike
            </button>
          )}
        </div>
        <FranceMap stats={stats} visits={visits} focusRegion={focus} selectedDept={dept} here={here} onRegion={selectRegion} onDept={setDept} />
        <div className="fr-legend small muted">
          <span>
            <i style={{ background: '#3b5bdb' }} /> besøkt departement
          </span>
          <span>
            <i style={{ background: '#c5cdf3' }} /> region låst opp
          </span>
          <span>
            <i className="hatch" /> ikke besøkt ennå
          </span>
        </div>

        {focusRegion && focusInfo && focusStatus && (
          <div className="fr-region" style={{ borderColor: focusInfo.color }}>
            <div className="row between" style={{ alignItems: 'flex-start' }}>
              <div>
                <div className="eyebrow" style={{ color: focusInfo.color }}>
                  {focusStatus.home ? 'Hjemregion' : focusStatus.visited ? `Låst opp ${focusStatus.firstDate ? fmtDate(focusStatus.firstDate) : ''}` : 'Ikke besøkt ennå'}
                </div>
                <h3 style={{ fontSize: '1.35rem' }}>
                  {focusInfo.emoji} {focusRegion.name}
                </h3>
              </div>
              <span className="badge navy">
                {focusStatus.deptsVisited.length}/{focusRegion.depts.length} dep.
              </span>
            </div>

            {selDept ? (
              <div className="fr-dept-box">
                <div className="row between">
                  <div>
                    <b>{selDept.name}</b> <span className="muted">({selDept.code})</span>
                    <div className="small muted">
                      {(() => {
                        const n = visits.filter((v) => v.dept === selDept.code).length
                        return n ? `${n} besøk registrert` : 'Ikke besøkt ennå'
                      })()}
                    </div>
                  </div>
                  <button className="btn primary small" onClick={() => setForm(newVisitDraft({ dept: selDept.code }))}>
                    Jeg har vært her!
                  </button>
                </div>
              </div>
            ) : (
              <dl className="fr-facts">
                <dt>Hovedstad</dt>
                <dd>{focusInfo.capital}</dd>
                <dt>Smak på</dt>
                <dd>{focusInfo.taste}</dd>
                <dt>Må se</dt>
                <dd>{focusInfo.mustSee}</dd>
                <dt>Fra Paris</dt>
                <dd>{focusInfo.fromParis}</dd>
              </dl>
            )}

            <div className="fr-chips">
              {focusRegion.depts.map((code) => {
                const v = stats.deptsVisited.has(code)
                return (
                  <button
                    key={code}
                    className={`fr-chip${v ? ' on' : ''}${dept === code ? ' sel' : ''}`}
                    style={v ? { background: focusInfo.color, borderColor: focusInfo.color } : undefined}
                    onClick={() => setDept(dept === code ? undefined : code)}
                  >
                    {code} {DEPT_BY_CODE.get(code)!.name}
                  </button>
                )
              })}
            </div>

            {focusStatus.visits.length > 0 && (
              <ul className="fr-mini">
                {focusStatus.visits
                  .filter((v) => !dept || v.dept === dept)
                  .slice()
                  .reverse()
                  .map((v) => (
                    <li key={v.id} onClick={() => setForm({ ...v })}>
                      <span>{v.place || DEPT_BY_CODE.get(v.dept)!.name}</span>
                      <span className="muted small">{visitDates(v)}</span>
                    </li>
                  ))}
              </ul>
            )}
            {!selDept && (
              <button className="btn small" style={{ marginTop: 10 }} onClick={() => setForm(newVisitDraft({ dept: focusRegion.depts.length === 1 ? focusRegion.depts[0] : '' }))}>
                + Legg til besøk i {focusRegion.name}
              </button>
            )}
          </div>
        )}
      </section>

      {/* ---------- Forslag fra reiseloggen ---------- */}
      {suggestions.length > 0 && (
        <section className="card">
          <div className="eyebrow">Fant i reiseloggen</div>
          <h3 style={{ marginBottom: 8 }}>Har du vært her?</h3>
          {suggestions.slice(0, 5).map((s) => {
            const reg = DEPT_BY_CODE.get(s.dept)!.region
            return (
              <div key={s.segment.id} className="row between fr-sug">
                <div>
                  <b>
                    {REGION_INFO[reg].emoji} {s.place}
                  </b>
                  <div className="small muted">
                    {fmtDate(s.segment.arrivalDate ?? s.segment.date)} · {s.segment.from} → {s.segment.to} · {DEPT_BY_CODE.get(s.dept)!.name}
                  </div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn small ghost" onClick={() => dismiss(s.segment.id)}>
                    Nei
                  </button>
                  <button
                    className="btn small primary"
                    onClick={() => setForm(newVisitDraft({ dept: s.dept, place: s.place, date: s.segment.arrivalDate ?? s.segment.date, segmentId: s.segment.id, source: 'trip' }))}
                  >
                    Legg til
                  </button>
                </div>
              </div>
            )
          })}
        </section>
      )}

      {/* ---------- Neste mål ---------- */}
      {stats.next && nextInfo && (
        <section className="card fr-next" style={{ borderLeftColor: nextInfo.color }} onClick={() => showOnMap(stats.next!)}>
          <div className="eyebrow">Forslag til neste tur</div>
          <h3>
            {nextInfo.emoji} {REGION_BY_CODE.get(stats.next)!.name}
          </h3>
          <p className="small" style={{ margin: '4px 0 0' }}>
            {nextInfo.fromParis}. Må se: {nextInfo.mustSee}. Smak på: {nextInfo.taste.toLowerCase()}.
          </p>
        </section>
      )}

      {/* ---------- Pass-stempler ---------- */}
      <section>
        <div className="row between" style={{ marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>Stempler i passet</h2>
          <span className="small muted">
            {stats.regionsVisited} av {TOTAL_REGIONS}
          </span>
        </div>
        <div className="fr-stamps">
          {REGIONS.map((r, i) => {
            const st = stats.regions.find((x) => x.code === r.code)!
            const info = REGION_INFO[r.code]
            return (
              <button
                key={r.code}
                className={`fr-stamp${st.visited ? ' on' : ''}`}
                style={st.visited ? { color: info.color, borderColor: info.color, transform: `rotate(${((i * 37) % 9) - 4}deg)` } : undefined}
                onClick={() => showOnMap(r.code)}
              >
                <span className="fr-stamp-emoji">{st.visited ? info.emoji : '?'}</span>
                <span className="fr-stamp-name">{r.name}</span>
                <span className="fr-stamp-date">{st.home ? 'Hjemme' : st.firstDate ? shortDate(st.firstDate) : '—'}</span>
              </button>
            )
          })}
        </div>
      </section>

      {/* ---------- Merker ---------- */}
      <section className="card">
        <div className="row between">
          <div className="eyebrow">Merker</div>
          <span className="small muted">
            {earned.filter((b) => b.earned).length} av {earned.length}
          </span>
        </div>
        <div className="fr-badges">
          {earned.map((b) => (
            <div key={b.id} className={`fr-badge${b.earned ? ' on' : ''}`} title={b.hint}>
              <span>{b.emoji}</span>
              <b>{b.title}</b>
              <small>{b.hint}</small>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Dagbok ---------- */}
      <section>
        <h2>Reisedagbok</h2>
        {journal.length === 0 && (
          <div className="notice info">
            Ingen besøk ennå. Trykk <b>📍 Jeg er her nå</b> neste gang du er på tur, eller legg inn tidligere turer med <b>+ Legg til besøk</b>.
          </div>
        )}
        {journal.map((g) => (
          <div key={g.key} style={{ marginBottom: 14 }}>
            <div className="month-head">{g.label}</div>
            <div className="card" style={{ padding: 0 }}>
              {g.items.map((v) => {
                const d = DEPT_BY_CODE.get(v.dept)
                const info = d ? REGION_INFO[d.region] : undefined
                return (
                  <div key={v.id} className="fr-entry" onClick={() => setForm({ ...v })}>
                    <span className="fr-entry-dot" style={{ background: info?.color }}>
                      {info?.emoji}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="row between" style={{ gap: 6 }}>
                        <b>{v.place || d?.name}</b>
                        <span className="small muted">{visitDates(v)}</span>
                      </div>
                      <div className="small muted">
                        {d?.name} ({v.dept}) · {d ? REGION_BY_CODE.get(d.region)!.name : ''}
                        {v.source === 'gps' ? ' · 📍' : ''}
                      </div>
                      {v.note && <div className="small fr-note">{v.note}</div>}
                      {(v.photoIds?.length ?? 0) > 0 && (
                        <div className="row" style={{ gap: 6, marginTop: 6 }}>
                          {v.photoIds!.map((id) => (
                            <JournalThumb key={id} id={id} onOpen={setLightbox} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </section>

      <section className="card">
        <label className="row between" style={{ cursor: 'pointer' }}>
          <span>
            Tell Île-de-France som besøkt
            <div className="small muted">Du bor i Paris – hjemregionen er låst opp fra start.</div>
          </span>
          <span className="switch">
            <input type="checkbox" checked={settings.franceHomeCounts} onChange={(e) => onSettings({ ...settings, franceHomeCounts: e.target.checked })} />
            <span />
          </span>
        </label>
        {settings.franceDismissed.length > 0 && (
          <button className="btn small ghost" style={{ marginTop: 8 }} onClick={() => onSettings({ ...settings, franceDismissed: [] })}>
            Vis {settings.franceDismissed.length} avviste reiseforslag igjen
          </button>
        )}
      </section>

      <div hidden aria-hidden="true">
        <FranceMap ref={mapRef} stats={stats} visits={visits} onRegion={() => {}} onDept={() => {}} />
      </div>

      {form && <VisitForm initial={form} onSaved={onSaved} onClose={() => setForm(null)} />}
      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" />
        </div>
      )}
    </div>
  )
}
