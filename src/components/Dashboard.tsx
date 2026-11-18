import { useMemo } from 'react'
import type { Segment, Settings } from '../types'
import { countryName } from '../lib/airports'
import { RULE_MAP, computePresence, currentLocation, evaluateRules, fmtDate, todayISO, yearSummary } from '../lib/rules'
import { STATUS_LABEL } from '../lib/report'

export function Dashboard({ segments, settings, onGoTo }: { segments: Segment[]; settings: Settings; onGoTo: (tab: string) => void }) {
  const today = todayISO()
  const { results, loc, ys, year } = useMemo(() => {
    const p = computePresence(segments, settings, today)
    const year = parseInt(today.slice(0, 4), 10)
    return {
      results: evaluateRules(segments, settings, today),
      loc: currentLocation(p, today),
      ys: yearSummary(segments, p, settings, year, today),
      year,
    }
  }, [segments, settings, today])

  const active = results.filter((r) => r.status !== 'off')
  const worst = active.some((r) => r.status === 'critical') ? 'critical' : active.some((r) => r.status === 'warn') ? 'warn' : 'ok'
  const locName = loc ? (loc.country === settings.postCountry ? settings.postCity || countryName(loc.country) : loc.country === 'XX' ? 'underveis' : countryName(loc.country)) : '–'

  return (
    <div className="stack">
      <section className="card" style={{ background: 'var(--navy)', color: 'var(--cream)', borderColor: 'var(--navy)' }}>
        <div className="row between">
          <div>
            <div className="eyebrow" style={{ color: 'var(--gold)' }}>Akkurat nå</div>
            <h2 style={{ marginBottom: 2 }}>
              {loc ? `Du er i ${locName}` : 'Ingen data ennå'}
            </h2>
            {loc && (
              <div className="small" style={{ opacity: 0.8 }}>
                siden {fmtDate(loc.since)} · {loc.days} {loc.days === 1 ? 'dag' : 'dager'}
              </div>
            )}
          </div>
          <span className={`badge ${worst}`} style={{ fontSize: '0.85rem', padding: '6px 14px' }}>
            {worst === 'ok' ? 'Alt i orden' : worst === 'warn' ? 'Følg med' : 'Krever handling'}
          </span>
        </div>
        <div className="row" style={{ marginTop: 14, gap: 8 }}>
          <button className="btn gold" onClick={() => onGoTo('add')}>
            Registrer boardingkort
          </button>
          <button className="btn ghost" style={{ color: 'var(--cream)' }} onClick={() => onGoTo('report')}>
            Lag rapport
          </button>
        </div>
      </section>

      <section className="card">
        <div className="row between">
          <div className="eyebrow">Hittil i {year}</div>
          <span className="small muted">
            {fmtDate(ys.from)} – {fmtDate(ys.to)}
          </span>
        </div>
        <div className="grid grid-3" style={{ marginTop: 10 }}>
          <div className="stat">
            <span className="value" style={{ color: 'var(--fr)' }}>{ys.post}</span>
            <span className="label">
              <span className="dot fr" />
              dager i {countryName(settings.postCountry)}
            </span>
          </div>
          <div className="stat">
            <span className="value" style={{ color: 'var(--no)' }}>{ys.home}</span>
            <span className="label">
              <span className="dot no" />
              dager i {countryName(settings.homeCountry)}
            </span>
          </div>
          <div className="stat">
            <span className="value" style={{ color: 'var(--other)' }}>{ys.other}</span>
            <span className="label">
              <span className="dot other" />
              dager i andre land
            </span>
          </div>
          <div className="stat">
            <span className="value">{ys.nightsPost}</span>
            <span className="label">netter i {settings.postCity || countryName(settings.postCountry)}</span>
          </div>
          <div className="stat">
            <span className="value">{ys.nightsHome}</span>
            <span className="label">netter i {countryName(settings.homeCountry)}</span>
          </div>
          <div className="stat">
            <span className="value">{ys.visits.length}</span>
            <span className="label">besøksreiser hjem</span>
          </div>
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Reisedager teller {settings.travelDayCountsBoth ? 'som opphold i både avreise- og ankomstland' : 'bare i ankomstlandet'} (endres under Innstillinger).
        </p>
      </section>

      <div>
        <div className="row between" style={{ marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>Regler</h2>
          <button className="btn small ghost" onClick={() => onGoTo('rules')}>
            Se kilder og juster
          </button>
        </div>
        <div className="grid grid-2">
          {results.map((r) => {
            const def = RULE_MAP.get(r.id)!
            if (r.status === 'off') return null
            const pct = r.progress ? Math.min(100, Math.round((r.progress.value / Math.max(1, r.progress.max)) * 100)) : null
            return (
              <article key={r.id} className={`card rule-card ${r.status}`}>
                <div className="row between" style={{ alignItems: 'flex-start' }}>
                  <div>
                    <div className="eyebrow">{def.authority}</div>
                    <h3>{def.title}</h3>
                  </div>
                  <span className={`badge ${r.status}`}>{STATUS_LABEL[r.status]}</span>
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', margin: '8px 0 2px' }}>{r.value}</div>
                {pct !== null && (
                  <div className={`progress ${r.status}`}>
                    <span style={{ width: `${pct}%` }} />
                  </div>
                )}
                <p style={{ margin: '6px 0 4px', fontWeight: 500 }}>{r.headline}</p>
                <p className="small muted" style={{ margin: 0 }}>{r.detail}</p>
              </article>
            )
          })}
        </div>
      </div>

      {segments.length === 0 && (
        <div className="notice info">
          Ingen reiser er registrert ennå. Appen antar at du har vært i {settings.postCity || countryName(settings.postCountry)} sammenhengende siden {fmtDate(settings.postingStart)}. Legg inn reisene dine fra boardingkort eller manuelt.
        </div>
      )}
    </div>
  )
}
