import { useMemo, useState } from 'react'
import { addMonths, eachDayOfInterval, endOfMonth, format, getDay, startOfMonth, subMonths } from 'date-fns'
import { nb } from 'date-fns/locale'
import type { Segment, Settings } from '../types'
import { countryName } from '../lib/airports'
import { computePresence, fmtDate, iso, sortSegments, todayISO, type DayInfo } from '../lib/rules'
import { placeLabel } from '../lib/report'

function dayClass(d: DayInfo | undefined, s: Settings): string {
  if (!d) return 'empty'
  const hasPost = d.countries.includes(s.postCountry)
  const hasHome = d.countries.includes(s.homeCountry)
  const hasOther = d.countries.some((c) => c !== s.postCountry && c !== s.homeCountry)
  if (d.countries.length === 0) return 'transit'
  if (hasPost && hasHome) return 'both'
  if (hasPost && hasOther) return 'mixed'
  if (hasHome && hasOther) return 'mixed-no'
  if (hasPost) return 'fr'
  if (hasHome) return 'no'
  return 'other'
}

export function CalendarView({ segments, settings }: { segments: Segment[]; settings: Settings }) {
  const today = todayISO()
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [selected, setSelected] = useState<string | null>(null)
  const presence = useMemo(() => computePresence(segments, settings, [today, iso(endOfMonth(addMonths(month, 12)))].sort().pop()!), [segments, settings, today, month])

  const days = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) })
  const lead = (getDay(startOfMonth(month)) + 6) % 7 // mandag først
  const mf = iso(startOfMonth(month))
  const mt = iso(endOfMonth(month))
  const monthDays = presence.days.filter((d) => d.date >= mf && d.date <= mt && d.date <= today)
  const count = (pred: (d: DayInfo) => boolean) => monthDays.filter(pred).length

  const sel = selected ? presence.byDate.get(selected) : undefined
  const selSegs = selected ? sortSegments(segments).filter((x) => x.date === selected || x.arrivalDate === selected) : []

  return (
    <div className="stack">
      <div className="card">
        <div className="row between" style={{ marginBottom: 10 }}>
          <button className="btn small" onClick={() => setMonth(subMonths(month, 1))} aria-label="Forrige måned">
            ‹
          </button>
          <h2 style={{ margin: 0, textTransform: 'capitalize' }}>{format(month, 'MMMM yyyy', { locale: nb })}</h2>
          <button className="btn small" onClick={() => setMonth(addMonths(month, 1))} aria-label="Neste måned">
            ›
          </button>
        </div>
        <div className="cal">
          {['ma', 'ti', 'on', 'to', 'fr', 'lø', 'sø'].map((d) => (
            <div key={d} className="dow">
              {d}
            </div>
          ))}
          {Array.from({ length: lead }).map((_, i) => (
            <div key={`l${i}`} className="day empty" />
          ))}
          {days.map((d) => {
            const key = iso(d)
            const info = presence.byDate.get(key)
            const cls = key < settings.postingStart ? 'empty' : dayClass(info, settings)
            const hasSeg = segments.some((x) => x.date === key)
            return (
              <div
                key={key}
                className={`day ${cls} ${key === today ? 'today' : ''} ${key > today ? 'future' : ''} ${selected === key ? 'selected' : ''}`}
                onClick={() => cls !== 'empty' && setSelected(key)}
                title={info ? info.countries.map(countryName).join(' + ') : ''}
              >
                {d.getDate()}
                {hasSeg && <span className="flag">✈</span>}
              </div>
            )
          })}
        </div>
        <div className="row small muted" style={{ marginTop: 12, gap: 14 }}>
          <span>
            <span className="dot fr" />
            {countryName(settings.postCountry)}: {count((d) => d.countries.includes(settings.postCountry))}
          </span>
          <span>
            <span className="dot no" />
            {countryName(settings.homeCountry)}: {count((d) => d.countries.includes(settings.homeCountry))}
          </span>
          <span>
            <span className="dot other" />
            Andre: {count((d) => d.countries.some((c) => c !== settings.postCountry && c !== settings.homeCountry))}
          </span>
          <span>
            <span className="dot transit" />
            Underveis
          </span>
        </div>
      </div>

      {selected && (
        <div className="card">
          <div className="eyebrow">{fmtDate(selected)}</div>
          {sel ? (
            <>
              <p style={{ margin: '4px 0' }}>
                Opphold: <strong>{sel.countries.map(countryName).join(' og ') || 'underveis'}</strong>
                {' · '}overnatting: <strong>{sel.endOfDay === 'XX' ? 'underveis' : countryName(sel.endOfDay)}</strong>
              </p>
              {selSegs.length ? (
                <ul className="steps">
                  {selSegs.map((x) => (
                    <li key={x.id}>
                      {placeLabel(x.from, settings)} → {placeLabel(x.to, settings)} {[x.carrier, x.flight].filter(Boolean).join(' ')}
                      {x.arrivalDate && x.arrivalDate !== x.date ? ` (ankomst ${fmtDate(x.arrivalDate)})` : ''}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="small muted" style={{ margin: 0 }}>Ingen reiser denne dagen.</p>
              )}
            </>
          ) : (
            <p className="small muted">Før utsendelsen startet.</p>
          )}
        </div>
      )}
    </div>
  )
}
