import { useMemo, useState } from 'react'
import type { Segment, Settings, StoredImage } from '../types'
import { db, exportLocalBackup } from '../lib/db'
import { API_BASE } from '../lib/api'
import { getImageBlob } from '../lib/sync'
import { countryName } from '../lib/airports'
import { computePresence, todayISO } from '../lib/rules'
import { buildPdf, daysCsv, deliverFile, monthRows, tripsCsv } from '../lib/report'
import { Icon } from './Icon'
import { useToast } from './Toast'

export function ReportPage({ segments, settings }: { segments: Segment[]; settings: Settings }) {
  const toast = useToast()
  const today = todayISO()
  const startYear = parseInt(settings.postingStart.slice(0, 4), 10)
  const thisYear = parseInt(today.slice(0, 4), 10)
  const years = Array.from({ length: thisYear - startYear + 1 }, (_, i) => startYear + i)
  const [mode, setMode] = useState<string>(String(thisYear))
  const [from, setFrom] = useState(settings.postingStart)
  const [to, setTo] = useState(today)
  const [includeRules, setIncludeRules] = useState(true)
  const [includeDays, setIncludeDays] = useState(false)
  const [includeImages, setIncludeImages] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const range = useMemo(() => {
    if (mode === 'all') return { from: settings.postingStart, to: today }
    if (mode === 'custom') return { from, to }
    const y = mode
    return { from: [`${y}-01-01`, settings.postingStart].sort().pop()!, to: [`${y}-12-31`, today].sort()[0] }
  }, [mode, from, to, settings.postingStart, today])

  const rows = useMemo(() => {
    const p = computePresence(segments, settings, [today, range.to].sort().pop()!)
    return monthRows(segments, p, settings, range.from, range.to)
  }, [segments, settings, range, today])
  const tot = rows.reduce((a, r) => ({ post: a.post + r.post, home: a.home + r.home, other: a.other + r.other, visits: a.visits + r.visits }), { post: 0, home: 0, other: 0, visits: 0 })

  const fileBase = `traveldays-${(settings.name || 'rapport').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${range.from}_${range.to}`

  async function pdf() {
    setBusy('pdf')
    try {
      const imgs = new Map<string, StoredImage>()
      if (includeImages) {
        const ids = new Set(segments.filter((s) => s.date >= range.from && s.date <= range.to && s.imageId).map((s) => s.imageId!))
        for (const id of ids) {
          const meta = await db.photos.get(id)
          const blob = await getImageBlob(id)
          if (meta && blob) imgs.set(id, { ...meta, blob })
        }
      }
      const blob = await buildPdf(segments, imgs, settings, { ...range, includeRules, includeDays, includeImages }, today)
      const r = await deliverFile(blob, `${fileBase}.pdf`, 'Reisedagslogg')
      if (r !== 'cancelled') toast(r === 'shared' ? 'Rapporten er delt.' : 'PDF-en er lastet ned.')
    } catch (e) {
      console.error(e)
      toast('Kunne ikke lage PDF.')
    } finally {
      setBusy(null)
    }
  }

  async function csv(kind: 'trips' | 'days') {
    const text = kind === 'trips' ? tripsCsv(segments, settings, range.from, range.to) : daysCsv(segments, settings, range.from, range.to, today)
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
    const r = await deliverFile(blob, `${fileBase}-${kind === 'trips' ? 'reiser' : 'dager'}.csv`, 'Traveldays CSV')
    if (r !== 'cancelled') toast('CSV-filen er klar.')
  }

  async function backup() {
    setBusy('backup')
    try {
      let blob: Blob
      try {
        const res = await fetch(`${API_BASE}backup.php`, { credentials: 'same-origin' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        blob = await res.blob()
      } catch {
        toast('Serveren svarte ikke – lager lokal kopi i stedet.')
        blob = new Blob([JSON.stringify(await exportLocalBackup())], { type: 'application/json' })
      }
      const r = await deliverFile(blob, `traveldays-sikkerhetskopi-${today}.json`, 'Traveldays sikkerhetskopi')
      if (r !== 'cancelled') toast('Sikkerhetskopien er lagret.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="stack">
      <div className="card">
        <div className="eyebrow">Rapport</div>
        <h2>Logg til ambassaden og Skatteetaten</h2>
        <div className="form-grid">
          <label className="field">
            Periode
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              {years.map((y) => (
                <option key={y} value={y}>
                  Kalenderåret {y}
                </option>
              ))}
              <option value="all">Hele utsendelsen</option>
              <option value="custom">Egen periode</option>
            </select>
          </label>
          {mode === 'custom' && (
            <>
              <label className="field">
                Fra
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label className="field">
                Til
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </label>
            </>
          )}
        </div>
        <div className="stack" style={{ marginTop: 12 }}>
          <label className="check">
            <input type="checkbox" checked={includeRules} onChange={(e) => setIncludeRules(e.target.checked)} />
            <span>Ta med status mot reglene (UD og Skatteetaten)</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={includeImages} onChange={(e) => setIncludeImages(e.target.checked)} />
            <span>Legg ved bilder av boardingkortene som vedlegg</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={includeDays} onChange={(e) => setIncludeDays(e.target.checked)} />
            <span>Ta med dag-for-dag-liste (lang)</span>
          </label>
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn primary" onClick={pdf} disabled={busy !== null}>
            <Icon name="share" size={18} />
            {busy === 'pdf' ? 'Lager PDF …' : 'Lag og del PDF'}
          </button>
          <button className="btn" onClick={() => csv('trips')}>
            <Icon name="download" size={18} />
            CSV reiser
          </button>
          <button className="btn" onClick={() => csv('days')}>
            <Icon name="download" size={18} />
            CSV dager
          </button>
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>
          På mobil åpnes delingsarket (e-post, Messages, Filer). På PC lastes filen ned.
        </p>
      </div>

      <div className="card">
        <div className="eyebrow">Forhåndsvisning</div>
        <h3 style={{ marginBottom: 8 }}>Sammendrag per måned</h3>
        <div style={{ overflowX: 'auto' }}>
          <table className="plain">
            <thead>
              <tr>
                <th>Måned</th>
                <th className="num">{countryName(settings.postCountry)}</th>
                <th className="num">{countryName(settings.homeCountry)}</th>
                <th className="num">Andre</th>
                <th className="num">Netter {settings.postCity}</th>
                <th className="num">Netter {countryName(settings.homeCountry)}</th>
                <th className="num">Besøksreiser</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.from}>
                  <td style={{ textTransform: 'capitalize' }}>{r.label}</td>
                  <td className="num">{r.post}</td>
                  <td className="num">{r.home}</td>
                  <td className="num">{r.other}</td>
                  <td className="num">{r.nightsPost}</td>
                  <td className="num">{r.nightsHome}</td>
                  <td className="num">{r.visits}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 600 }}>
                <td>Sum</td>
                <td className="num">{tot.post}</td>
                <td className="num">{tot.home}</td>
                <td className="num">{tot.other}</td>
                <td className="num" />
                <td className="num" />
                <td className="num">{tot.visits}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="eyebrow">Sikkerhetskopi</div>
        <p className="small muted">
          Dataene ligger i databasen på serveren din. Last likevel ned en kopi (JSON med bilder) et par ganger i året og legg den i iCloud/OneDrive. Gjenopprett under Innstillinger.
        </p>
        <button className="btn" onClick={backup} disabled={busy !== null}>
          <Icon name="download" size={18} />
          {busy === 'backup' ? 'Pakker …' : 'Last ned sikkerhetskopi'}
        </button>
      </div>
    </div>
  )
}
