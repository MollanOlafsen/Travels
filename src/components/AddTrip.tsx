import { useEffect, useRef, useState } from 'react'
import type { Settings, Source } from '../types'
import { db, uid } from '../lib/db'
import { store } from '../lib/sync'
import { bcbpToDrafts, downscale, findBcbp, guessFromOcr, runOcr, scanBarcodes, type BarcodeHit } from '../lib/scan'
import { todayISO } from '../lib/rules'
import { countryName, lookupAirport } from '../lib/airports'
import { SegmentForm, emptyDraft, type SegmentDraft } from './SegmentForm'
import { Icon } from './Icon'
import { useToast } from './Toast'

type Phase = 'idle' | 'scanning' | 'ocr' | 'review'

interface ScanState {
  file: File
  blob: Blob
  width: number
  height: number
  previewUrl: string
  rawBarcode?: string
  ocrText?: string
  drafts: SegmentDraft[]
  source: Source
  note: string
}

export function AddTrip({ settings, onDone }: { settings: Settings; onDone: () => void }) {
  const toast = useToast()
  const [phase, setPhase] = useState<Phase>('idle')
  const [over, setOver] = useState(false)
  const [progress, setProgress] = useState(0)
  const [state, setState] = useState<ScanState | null>(null)
  const [manual, setManual] = useState(false)
  const [current, setCurrent] = useState(0)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => () => { if (state) URL.revokeObjectURL(state.previewUrl) }, [state])

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) {
      toast('Velg et bilde (JPG/PNG/HEIC). PDF-boardingkort: ta skjermbilde først.')
      return
    }
    setPhase('scanning')
    setManual(false)
    const ref = new Date(file.lastModified || Date.now())
    try {
      const { blob, width, height } = await downscale(file)
      const previewUrl = URL.createObjectURL(blob)
      let hits: BarcodeHit[] = []
      try {
        hits = await scanBarcodes(blob)
        if (!hits.length) hits = await scanBarcodes(file) // prøv originalen i full oppløsning
      } catch (e) {
        console.warn('Strekkodelesing feilet', e)
      }
      const bcbp = findBcbp(hits)
      if (bcbp) {
        const drafts = bcbpToDrafts(bcbp, ref, settings.customAirports)
        setState({ file, blob, width, height, previewUrl, rawBarcode: bcbp.raw, drafts, source: 'barcode', note: `Strekkode lest: ${bcbp.legs.length} strekning${bcbp.legs.length > 1 ? 'er' : ''}.` })
        setCurrent(0)
        setPhase('review')
        return
      }
      // OCR som reserve
      setPhase('ocr')
      setProgress(0)
      let text = ''
      try {
        text = await runOcr(blob, setProgress)
      } catch (e) {
        console.warn('OCR feilet', e)
      }
      const guess = guessFromOcr(text, ref, [settings.homeCountry, settings.postCountry], settings.customAirports)
      const fromAp = guess.from ? lookupAirport(guess.from, settings.customAirports) : undefined
      const toAp = guess.to ? lookupAirport(guess.to, settings.customAirports) : undefined
      const draft: SegmentDraft = {
        ...emptyDraft(guess.date ?? todayISO(), settings, fromAp?.country),
        from: guess.from ?? '',
        to: guess.to ?? '',
        ...(fromAp ? { fromCountry: fromAp.country } : {}),
        ...(toAp ? { toCountry: toAp.country } : {}),
        carrier: guess.carrier,
        flight: guess.flight,
        seat: guess.seat,
      }
      const note =
        hits.length && !bcbp
          ? 'Fant en strekkode, men den var ikke et boardingkort-format. Feltene under er tolket fra teksten – kontroller dem.'
          : text
            ? `Ingen strekkode funnet. Teksten er tolket med OCR (${guess.confidence === 'high' ? 'god' : guess.confidence === 'medium' ? 'middels' : 'lav'} sikkerhet) – kontroller feltene.`
            : 'Fant verken strekkode eller lesbar tekst. Fyll inn feltene manuelt.'
      setState({ file, blob, width, height, previewUrl, ocrText: text || undefined, drafts: [draft], source: text ? 'ocr' : 'manual', note })
      setCurrent(0)
      setPhase('review')
    } catch (e) {
      console.error(e)
      toast('Kunne ikke lese bildet.')
      setPhase('idle')
    }
  }

  async function saveAll(drafts: SegmentDraft[], source: Source, withImage: boolean) {
    setSaving(true)
    try {
      let imageId: string | undefined
      const now = Date.now()
      if (withImage && state) {
        imageId = uid()
        await store.addImage({
          id: imageId,
          blob: state.blob,
          name: state.file.name || 'boardingkort.jpg',
          mime: state.blob.type || 'image/jpeg',
          width: state.width,
          height: state.height,
          createdAt: now,
          updatedAt: now,
          rawBarcode: state.rawBarcode,
          ocrText: state.ocrText,
        })
      }
      const byDate = new Map<string, number>()
      for (const d of drafts) {
        const existing = await db.segments.where('date').equals(d.date).count()
        const n = (byDate.get(d.date) ?? existing) + 1
        byDate.set(d.date, n)
        await store.putSegment({
          ...d,
          id: uid(),
          source: d.source ?? source,
          imageId,
          createdAt: now,
          updatedAt: now,
          order: n - 1,
          carrier: d.carrier || undefined,
          flight: d.flight || undefined,
          pnr: d.pnr || undefined,
          seat: d.seat || undefined,
          note: d.note || undefined,
        })
      }
      toast(drafts.length === 1 ? 'Reisen er lagret.' : `${drafts.length} strekninger lagret.`)
      setState(null)
      setPhase('idle')
      onDone()
    } finally {
      setSaving(false)
    }
  }

  const reset = () => {
    setState(null)
    setPhase('idle')
    setManual(false)
  }

  if (manual) {
    return (
      <div className="stack">
        <div className="card">
          <div className="eyebrow">Manuell registrering</div>
          <h2>Ny reise</h2>
          <p className="small muted">Bruk dette for tog, bil eller når du ikke har boardingkortet. Ett skjema per strekning.</p>
          <SegmentForm initial={emptyDraft(todayISO(), settings)} settings={settings} onCancel={reset} onSave={(d) => saveAll([d], 'manual', false)} saveLabel={saving ? 'Lagrer …' : 'Lagre reise'} />
        </div>
      </div>
    )
  }

  if (phase === 'review' && state) {
    const d = state.drafts[current]
    return (
      <div className="stack">
        <div className="card">
          <div className="row between">
            <div className="eyebrow">{state.source === 'barcode' ? 'Lest fra strekkode' : state.source === 'ocr' ? 'Tolket med OCR' : 'Bilde uten data'}</div>
            <button className="btn small ghost" onClick={reset}>
              Avbryt
            </button>
          </div>
          <img src={state.previewUrl} alt="Boardingkort" className="preview" style={{ marginTop: 10 }} />
          <p className={`notice ${state.source === 'barcode' ? 'ok' : 'warn'}`} style={{ marginTop: 12 }}>
            {state.note}
            {d.from && !lookupAirport(d.from, settings.customAirports) && (
              <>
                {' '}Koden <strong>{d.from}</strong> er ukjent – velg land manuelt (eller legg til flyplassen under Innstillinger).
              </>
            )}
            {d.to && !lookupAirport(d.to, settings.customAirports) && (
              <>
                {' '}Koden <strong>{d.to}</strong> er ukjent – velg land manuelt.
              </>
            )}
          </p>
        </div>
        <div className="card">
          {state.drafts.length > 1 && (
            <div className="row" style={{ marginBottom: 10 }}>
              {state.drafts.map((x, i) => (
                <button key={i} className={`btn small ${i === current ? 'primary' : ''}`} onClick={() => setCurrent(i)}>
                  {i + 1}. {x.from} → {x.to}
                </button>
              ))}
            </div>
          )}
          <h3 style={{ marginBottom: 8 }}>
            Strekning {current + 1} av {state.drafts.length}
            {d.passenger ? <span className="small muted"> · {d.passenger}</span> : null}
          </h3>
          <SegmentForm
            key={current}
            initial={d}
            settings={settings}
            saveLabel={state.drafts.length > 1 && current < state.drafts.length - 1 ? 'Neste strekning' : saving ? 'Lagrer …' : `Lagre${state.drafts.length > 1 ? ' alle' : ''}`}
            onSave={(nd) => {
              const drafts = state.drafts.map((x, i) => (i === current ? nd : x))
              setState({ ...state, drafts })
              if (state.drafts.length > 1 && current < state.drafts.length - 1) setCurrent(current + 1)
              else saveAll(drafts, state.source, true)
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="stack">
      <div className="card">
        <div className="eyebrow">Boardingkort</div>
        <h2>Registrer reise</h2>
        <p className="small muted">
          Ta bilde av boardingkortet (papir eller mobilskjerm). Appen leser strekkoden (PDF417/Aztec/QR) og fyller ut dato, rute og flight. Finner den ingen strekkode, tolkes teksten med OCR.
        </p>
        <div
          className={`dropzone ${over ? 'over' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
        >
          <input ref={inputRef} type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />
          {phase === 'idle' && (
            <>
              <Icon name="camera" size={34} />
              <p style={{ margin: '8px 0 2px', fontWeight: 600 }}>Ta bilde eller velg fra kamerarullen</p>
              <p className="small muted" style={{ margin: 0 }}>Du kan også slippe et bilde her</p>
            </>
          )}
          {phase === 'scanning' && <p style={{ margin: 0 }}>Leser strekkode …</p>}
          {phase === 'ocr' && (
            <>
              <p style={{ margin: 0 }}>Ingen strekkode – kjører tekstgjenkjenning …</p>
              <div className="progress info" style={{ maxWidth: 260, margin: '10px auto 0' }}>
                <span style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <p className="small muted" style={{ margin: '6px 0 0' }}>Første gang lastes OCR-modellen (ca. 10 MB).</p>
            </>
          )}
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" onClick={() => setManual(true)}>
            Registrer manuelt (tog, bil, uten boardingkort)
          </button>
        </div>
      </div>
      <div className="card">
        <div className="eyebrow">Slik telles dagene</div>
        <ul className="steps" style={{ marginTop: 6 }}>
          <li>Appen antar at du er i {settings.postCity || countryName(settings.postCountry)} fra {settings.postingStart} til første registrerte reise.</li>
          <li>Hver reise flytter deg fra ett land til et annet; dagene imellom telles der du sist ankom.</li>
          <li>Reisedagen teller {settings.travelDayCountsBoth ? 'i begge land (Skatteetatens praksis)' : 'bare i ankomstlandet'}.</li>
          <li>Reiser til tredjeland (ferie i Italia o.l.) telles som fravær fra tjenestestedet, men ikke som dager i Norge.</li>
        </ul>
      </div>
    </div>
  )
}
