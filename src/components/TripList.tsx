import { useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { nb } from 'date-fns/locale'
import type { Segment, Settings } from '../types'
import { getImageBlob, store } from '../lib/sync'
import { countryName } from '../lib/airports'
import { fmtDate, sortSegments } from '../lib/rules'
import { SOURCE_LABEL, placeLabel } from '../lib/report'
import { SegmentForm, type SegmentDraft } from './SegmentForm'
import { Icon } from './Icon'
import { useToast } from './Toast'

export function useImageUrl(imageId: string | undefined): string | undefined {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    let revoked = false
    let u: string | undefined
    setUrl(undefined)
    if (!imageId) return
    getImageBlob(imageId).then((blob) => {
      if (revoked || !blob) return
      u = URL.createObjectURL(blob)
      setUrl(u)
    })
    return () => {
      revoked = true
      if (u) URL.revokeObjectURL(u)
    }
  }, [imageId])
  return url
}

function Thumb({ imageId, onOpen }: { imageId?: string; onOpen: (url: string) => void }) {
  const url = useImageUrl(imageId)
  if (!url) return <div className="thumb" style={{ cursor: 'default' }} />
  return <img src={url} alt="Boardingkort" className="thumb" onClick={() => onOpen(url)} />
}

export function TripList({ segments, settings }: { segments: Segment[]; settings: Settings }) {
  const toast = useToast()
  const [editing, setEditing] = useState<Segment | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const sorted = useMemo(() => sortSegments(segments).reverse(), [segments])

  const groups = useMemo(() => {
    const m = new Map<string, Segment[]>()
    for (const s of sorted) {
      const k = s.date.slice(0, 7)
      m.set(k, [...(m.get(k) ?? []), s])
    }
    return [...m.entries()]
  }, [sorted])

  async function remove(s: Segment) {
    if (!confirm(`Slette reisen ${fmtDate(s.date)} ${s.from} → ${s.to}?`)) return
    await store.deleteSegment(s.id)
    toast('Reisen er slettet.')
  }

  async function update(d: SegmentDraft) {
    if (!editing) return
    await store.updateSegment(editing.id, {
      ...d,
      carrier: d.carrier || undefined,
      flight: d.flight || undefined,
      pnr: d.pnr || undefined,
      seat: d.seat || undefined,
      note: d.note || undefined,
      arrivalDate: d.arrivalDate || undefined,
    })
    setEditing(null)
    toast('Endringene er lagret.')
  }

  return (
    <div className="stack">
      <div className="row between">
        <h2 style={{ margin: 0 }}>Reiser</h2>
        <span className="small muted">{segments.length} strekninger</span>
      </div>
      {segments.length === 0 && (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>Ingen reiser registrert ennå. Gå til «Legg til» for å lese inn et boardingkort.</p>
        </div>
      )}
      {groups.map(([month, list]) => (
        <section key={month}>
          <div className="month-head" style={{ textTransform: 'capitalize' }}>{format(parseISO(`${month}-01`), 'MMMM yyyy', { locale: nb })}</div>
          <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
            {list.map((s) => (
              <div key={s.id} className="trip">
                <Thumb imageId={s.imageId} onOpen={setLightbox} />
                <div>
                  <div className="date">{fmtDate(s.date)}{s.arrivalDate && s.arrivalDate !== s.date ? ` → ${fmtDate(s.arrivalDate)}` : ''}</div>
                  <div className="route">
                    {placeLabel(s.from, settings)} → {placeLabel(s.to, settings)}
                  </div>
                  <div className="small muted">
                    {countryName(s.fromCountry)} → {countryName(s.toCountry)}
                    {s.carrier || s.flight ? ` · ${[s.carrier, s.flight].filter(Boolean).join(' ')}` : ''}
                    {s.seat ? ` · sete ${s.seat}` : ''}
                    {' · '}
                    <span className={`badge ${s.source === 'barcode' ? 'ok' : s.source === 'ocr' ? 'warn' : 'off'}`}>{SOURCE_LABEL[s.source]}</span>
                  </div>
                  {s.note && <div className="small">{s.note}</div>}
                </div>
                <div className="row" style={{ gap: 4 }}>
                  <button className="btn small ghost" onClick={() => setEditing(s)} aria-label="Rediger">
                    <Icon name="edit" size={18} />
                  </button>
                  <button className="btn small ghost" onClick={() => remove(s)} aria-label="Slett" style={{ color: 'var(--crit)' }}>
                    <Icon name="trash" size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Rediger reise</h2>
            <SegmentForm initial={editing} settings={settings} onSave={update} onCancel={() => setEditing(null)} />
          </div>
        </div>
      )}
      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Boardingkort" />
        </div>
      )}
    </div>
  )
}
