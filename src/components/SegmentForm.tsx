import { useEffect, useState } from 'react'
import type { Segment, Settings, Source } from '../types'
import { AIRPORTS, COUNTRY_CODES, countryName, lookupAirport } from '../lib/airports'

export type SegmentDraft = Omit<Segment, 'id' | 'createdAt' | 'updatedAt' | 'order' | 'source'> & { source?: Source }

export const emptyDraft = (date: string, settings: Settings, fromCountry?: string): SegmentDraft => ({
  date,
  from: '',
  to: '',
  fromCountry: fromCountry ?? settings.postCountry,
  toCountry: fromCountry === settings.postCountry ? settings.homeCountry : settings.postCountry,
})

export function SegmentForm({
  initial,
  settings,
  onSave,
  onCancel,
  saveLabel = 'Lagre',
}: {
  initial: SegmentDraft
  settings: Settings
  onSave: (d: SegmentDraft) => void
  onCancel?: () => void
  saveLabel?: string
}) {
  const [d, setD] = useState<SegmentDraft>(initial)
  const [multiDay, setMultiDay] = useState(Boolean(initial.arrivalDate && initial.arrivalDate !== initial.date))
  useEffect(() => setD(initial), [initial])

  const set = <K extends keyof SegmentDraft>(k: K, v: SegmentDraft[K]) => setD((x) => ({ ...x, [k]: v }))

  const onCode = (field: 'from' | 'to', value: string) => {
    const v = value.toUpperCase()
    const ap = lookupAirport(v, settings.customAirports)
    setD((x) => ({ ...x, [field]: v, ...(ap ? { [`${field}Country`]: ap.country } : {}) }))
  }

  const valid = d.date && d.from.trim() && d.to.trim() && d.fromCountry && d.toCountry && (!multiDay || (d.arrivalDate && d.arrivalDate >= d.date))

  const codes = Object.keys({ ...AIRPORTS, ...settings.customAirports }).sort()

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid) return
        onSave({ ...d, from: d.from.trim().toUpperCase(), to: d.to.trim().toUpperCase(), arrivalDate: multiDay ? d.arrivalDate : undefined })
      }}
      className="stack"
    >
      <datalist id="airport-codes">
        {codes.map((c) => (
          <option key={c} value={c}>
            {lookupAirport(c, settings.customAirports)?.city}
          </option>
        ))}
      </datalist>
      <div className="form-grid">
        <label className="field">
          Avreisedato
          <input type="date" required value={d.date} onChange={(e) => set('date', e.target.value)} />
        </label>
        {multiDay && (
          <label className="field">
            Ankomstdato
            <input type="date" required value={d.arrivalDate ?? d.date} min={d.date} onChange={(e) => set('arrivalDate', e.target.value)} />
          </label>
        )}
      </div>
      <label className="check small">
        <input type="checkbox" checked={multiDay} onChange={(e) => { setMultiDay(e.target.checked); if (e.target.checked && !d.arrivalDate) set('arrivalDate', d.date) }} />
        <span>Ankomst en annen dag (nattfly / flere døgn underveis)</span>
      </label>
      <div className="form-grid">
        <label className="field">
          Fra (IATA-kode eller sted)
          <input list="airport-codes" required value={d.from} placeholder="CDG" onChange={(e) => onCode('from', e.target.value)} autoCapitalize="characters" />
        </label>
        <label className="field">
          Land (fra)
          <select value={d.fromCountry} onChange={(e) => set('fromCountry', e.target.value)}>
            {COUNTRY_CODES.map((c) => (
              <option key={c} value={c}>
                {countryName(c)}
              </option>
            ))}
            <option value="XX">Annet land</option>
          </select>
        </label>
        <label className="field">
          Til (IATA-kode eller sted)
          <input list="airport-codes" required value={d.to} placeholder="OSL" onChange={(e) => onCode('to', e.target.value)} autoCapitalize="characters" />
        </label>
        <label className="field">
          Land (til)
          <select value={d.toCountry} onChange={(e) => set('toCountry', e.target.value)}>
            {COUNTRY_CODES.map((c) => (
              <option key={c} value={c}>
                {countryName(c)}
              </option>
            ))}
            <option value="XX">Annet land</option>
          </select>
        </label>
      </div>
      <div className="form-grid">
        <label className="field">
          Flyselskap
          <input value={d.carrier ?? ''} placeholder="SK" onChange={(e) => set('carrier', e.target.value.toUpperCase())} />
        </label>
        <label className="field">
          Flightnummer
          <input value={d.flight ?? ''} placeholder="4703" onChange={(e) => set('flight', e.target.value)} />
        </label>
        <label className="field">
          Bookingreferanse
          <input value={d.pnr ?? ''} onChange={(e) => set('pnr', e.target.value.toUpperCase())} />
        </label>
        <label className="field">
          Sete
          <input value={d.seat ?? ''} onChange={(e) => set('seat', e.target.value.toUpperCase())} />
        </label>
      </div>
      <label className="field">
        Merknad (vises i rapporten)
        <input value={d.note ?? ''} placeholder="f.eks. jobbreise, ferie, tog Paris–Lyon" onChange={(e) => set('note', e.target.value)} />
      </label>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            Avbryt
          </button>
        )}
        <button type="submit" className="btn primary" disabled={!valid}>
          {saveLabel}
        </button>
      </div>
    </form>
  )
}
