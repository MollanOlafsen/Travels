import { useState } from 'react'
import type { Visit } from '../types'
import { REGIONS } from '../data/franceMap'
import { CITIES, DEPT_BY_CODE, REGION_INFO, deptAt, findCity, nearestCity } from '../lib/france'
import { todayISO } from '../lib/rules'
import { downscale } from '../lib/scan'
import { uid } from '../lib/db'
import { store } from '../lib/sync'
import { useImageUrl } from './TripList'
import { Icon } from './Icon'
import { useToast } from './Toast'

export type VisitDraft = Omit<Visit, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: number }

export const newVisitDraft = (patch: Partial<VisitDraft> = {}): VisitDraft => ({ date: todayISO(), dept: '', ...patch })

/** Henter posisjonen og slår opp departement og nærmeste kjente by. */
export function locate(): Promise<{ lat: number; lon: number; dept?: string; place?: string }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Nettleseren støtter ikke posisjon.'))
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Math.round(pos.coords.latitude * 10000) / 10000
        const lon = Math.round(pos.coords.longitude * 10000) / 10000
        resolve({ lat, lon, dept: deptAt(lat, lon)?.code, place: nearestCity(lat, lon)?.name })
      },
      (err) => reject(new Error(err.code === err.PERMISSION_DENIED ? 'Du må gi appen tilgang til posisjon.' : 'Fant ikke posisjonen.')),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 },
    )
  })
}

function PhotoThumb({ id, onRemove }: { id: string; onRemove: () => void }) {
  const url = useImageUrl(id)
  return (
    <div className="fr-photo">
      {url ? <img src={url} alt="" /> : <div />}
      <button type="button" aria-label="Fjern bilde" onClick={onRemove}>
        ×
      </button>
    </div>
  )
}

export function VisitForm({ initial, onSaved, onClose }: { initial: VisitDraft; onSaved: (v: Visit) => void; onClose: () => void }) {
  const toast = useToast()
  const [d, setD] = useState<VisitDraft>(initial)
  const [multi, setMulti] = useState(Boolean(initial.endDate))
  const [busy, setBusy] = useState<string | null>(null)
  const [removed, setRemoved] = useState<string[]>([])
  // Bilder lagt til i dette skjemaet – slettes igjen hvis man avbryter
  const [added, setAdded] = useState<string[]>([])
  const set = <K extends keyof VisitDraft>(k: K, v: VisitDraft[K]) => setD((x) => ({ ...x, [k]: v }))
  const dept = DEPT_BY_CODE.get(d.dept)
  const info = dept ? REGION_INFO[dept.region] : undefined

  function onPlace(text: string) {
    const c = findCity(text)
    setD((x) => ({ ...x, place: text, ...(c && x.source !== 'gps' ? { dept: c.dept } : {}) }))
  }

  async function useGps() {
    setBusy('Finner posisjonen …')
    try {
      const p = await locate()
      if (!p.dept) {
        toast('Du ser ikke ut til å være i Frankrike akkurat nå.')
        return
      }
      setD((x) => ({ ...x, lat: p.lat, lon: p.lon, dept: p.dept!, place: x.place || p.place || '', source: 'gps' }))
      toast(`📍 ${DEPT_BY_CODE.get(p.dept)?.name}${p.place ? ` · nær ${p.place}` : ''}`)
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return
    setBusy('Lagrer bilder …')
    try {
      const ids: string[] = []
      for (const f of Array.from(files)) {
        const { blob, width, height } = await downscale(f, 1600)
        const id = uid()
        await store.addImage({ id, blob, name: f.name || 'bilde.jpg', mime: 'image/jpeg', width, height, createdAt: Date.now(), updatedAt: Date.now() })
        ids.push(id)
      }
      setD((x) => ({ ...x, photoIds: [...(x.photoIds ?? []), ...ids] }))
      setAdded((a) => [...a, ...ids])
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function save() {
    if (!d.dept) {
      toast('Velg departement (eller skriv inn en kjent by).')
      return
    }
    if (multi && d.endDate && d.endDate < d.date) {
      toast('Siste dag kan ikke være før første dag.')
      return
    }
    const now = Date.now()
    const v: Visit = {
      ...d,
      id: d.id ?? uid(),
      place: d.place?.trim() || undefined,
      note: d.note?.trim() || undefined,
      endDate: multi && d.endDate && d.endDate !== d.date ? d.endDate : undefined,
      source: d.source ?? 'manual',
      createdAt: d.createdAt ?? now,
      updatedAt: now,
    }
    for (const id of removed) await store.deleteImage(id)
    await store.putVisit(v)
    onSaved(v)
  }

  function cancel() {
    for (const id of added) void store.deleteImage(id)
    onClose()
  }

  async function remove() {
    if (!d.id || !confirm('Slette dette besøket?')) return
    await store.deleteVisit(d.id)
    toast('Besøket er slettet.')
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={cancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Besøk">
        <div className="row between" style={{ marginBottom: 12 }}>
          <div>
            <div className="eyebrow">{d.id ? 'Endre besøk' : 'Nytt besøk'}</div>
            <h2 style={{ margin: 0 }}>
              {info ? `${info.emoji} ${dept!.name}` : 'Hvor har du vært?'}
            </h2>
          </div>
          <button className="btn ghost small" onClick={cancel} aria-label="Lukk">
            ✕
          </button>
        </div>

        <div className="stack">
          <button className="btn" type="button" onClick={useGps} disabled={Boolean(busy)}>
            📍 Bruk posisjonen min
          </button>

          <div className="form-grid">
            <label className="field">
              By eller sted
              <input list="fr-cities" value={d.place ?? ''} onChange={(e) => onPlace(e.target.value)} placeholder="f.eks. Lyon, Saint-Malo …" />
              <datalist id="fr-cities">
                {CITIES.map((c) => (
                  <option key={c.name} value={c.name} />
                ))}
              </datalist>
            </label>
            <label className="field">
              Departement
              <select value={d.dept} onChange={(e) => setD((x) => ({ ...x, dept: e.target.value, ...(x.source === 'gps' ? { source: 'manual', lat: undefined, lon: undefined } : {}) }))}>
                <option value="">Velg …</option>
                {REGIONS.slice()
                  .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
                  .map((r) => (
                    <optgroup key={r.code} label={`${REGION_INFO[r.code].emoji} ${r.name}`}>
                      {r.depts.map((code) => (
                        <option key={code} value={code}>
                          {DEPT_BY_CODE.get(code)!.name} ({code})
                        </option>
                      ))}
                    </optgroup>
                  ))}
              </select>
            </label>
          </div>

          <div className="form-grid">
            <label className="field">
              {multi ? 'Første dag' : 'Dato'}
              <input type="date" value={d.date} onChange={(e) => set('date', e.target.value)} />
            </label>
            {multi && (
              <label className="field">
                Siste dag
                <input type="date" value={d.endDate ?? d.date} min={d.date} onChange={(e) => set('endDate', e.target.value)} />
              </label>
            )}
          </div>
          <label className="check small">
            <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} />
            Flere dager
          </label>

          <label className="field">
            Notat
            <textarea rows={3} value={d.note ?? ''} onChange={(e) => set('note', e.target.value)} placeholder="Hva gjorde du? Beste måltid?" />
          </label>

          <div>
            <div className="small muted" style={{ marginBottom: 6 }}>
              Bilder
            </div>
            <div className="row" style={{ gap: 8 }}>
              {(d.photoIds ?? []).map((id) => (
                <PhotoThumb
                  key={id}
                  id={id}
                  onRemove={() => {
                    setD((x) => ({ ...x, photoIds: (x.photoIds ?? []).filter((p) => p !== id) }))
                    setRemoved((r) => [...r, id])
                  }}
                />
              ))}
              <label className="fr-photo add">
                <Icon name="camera" />
                <input type="file" accept="image/*" multiple onChange={(e) => void addPhotos(e.target.files)} />
              </label>
            </div>
          </div>

          {busy && <div className="small muted">{busy}</div>}

          <div className="row between">
            {d.id ? (
              <button className="btn danger" type="button" onClick={remove}>
                <Icon name="trash" size={18} /> Slett
              </button>
            ) : (
              <span />
            )}
            <div className="row">
              <button className="btn ghost" type="button" onClick={cancel}>
                Avbryt
              </button>
              <button className="btn primary" type="button" onClick={save} disabled={Boolean(busy)}>
                Lagre besøk
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
