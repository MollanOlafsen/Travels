// Lesing av boardingkort: 1) strekkode (PDF417/Aztec/QR → BCBP), 2) OCR som reserve.
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader'
import zxingWasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'
import { AIRPORTS, CARRIERS, lookupAirport, type Airport } from './airports'
import { parseBcbp, resolveJulianDate, type Bcbp } from './bcbp'

// Bundle WASM-filen lokalt slik at appen virker offline (PWA) og uten CDN.
prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? zxingWasmUrl : prefix + path),
  },
})

export interface BarcodeHit {
  text: string
  format: string
}

export async function scanBarcodes(blob: Blob): Promise<BarcodeHit[]> {
  const results = await readBarcodes(blob, {
    formats: ['PDF417', 'Aztec', 'QRCode', 'DataMatrix'],
    tryHarder: true,
    tryRotate: true,
    tryInvert: true,
    tryDownscale: true,
    maxNumberOfSymbols: 4,
    textMode: 'Plain',
  })
  return results.filter((r) => r.isValid && r.text).map((r) => ({ text: r.text, format: r.format }))
}

/** Finner og tolker BCBP i strekkodetreff. */
export function findBcbp(hits: BarcodeHit[]): Bcbp | null {
  for (const h of hits) {
    const b = parseBcbp(h.text)
    if (b) return b
  }
  return null
}

/* ---------- Bildehåndtering ---------- */

export async function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.decoding = 'async'
    await new Promise<void>((res, rej) => {
      img.onload = () => res()
      img.onerror = () => rej(new Error('Kunne ikke lese bildet'))
      img.src = url
    })
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Skalerer ned til maks `max` px på lengste side og lagrer som JPEG. Bevarer lesbar strekkode ved 2000 px. */
export async function downscale(blob: Blob, max = 2000): Promise<{ blob: Blob; width: number; height: number }> {
  const img = await loadImage(blob)
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.round(img.naturalWidth * scale)
  const h = Math.round(img.naturalHeight * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
  const out = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.88))
  if (!out) throw new Error('Kunne ikke konvertere bildet')
  return { blob: out, width: w, height: h }
}

/* ---------- OCR ---------- */

export async function runOcr(blob: Blob, onProgress?: (p: number) => void): Promise<string> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) onProgress(m.progress)
    },
  })
  try {
    const { data } = await worker.recognize(blob)
    return data.text
  } finally {
    await worker.terminate()
  }
}

export interface OcrGuess {
  date?: string
  from?: string
  to?: string
  carrier?: string
  flight?: string
  seat?: string
  confidence: 'high' | 'medium' | 'low'
}

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, MRS: 3, APR: 4, AVR: 4, MAY: 5, MAI: 5, JUN: 6, JUIN: 6, JUL: 7, JUIL: 7,
  AUG: 8, AOU: 8, AOUT: 8, SEP: 9, SEPT: 9, OCT: 10, OKT: 10, NOV: 11, DEC: 12, DES: 12,
}

function nearestYear(month: number, day: number, ref: Date): string {
  let best = ''
  let bestDiff = Infinity
  for (const y of [ref.getFullYear() - 1, ref.getFullYear(), ref.getFullYear() + 1]) {
    const d = new Date(y, month - 1, day)
    if (d.getMonth() !== month - 1) continue
    const diff = Math.abs(d.getTime() - ref.getTime())
    if (diff < bestDiff) {
      bestDiff = diff
      best = `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }
  return best
}

export function extractDate(text: string, ref: Date): string | undefined {
  const T = text.toUpperCase().replace(/[ÉÈÊ]/g, 'E').replace(/Û/g, 'U')
  // 05AUG26 / 05 AUG 2026 / 05AUG
  let m = T.match(/\b(\d{1,2})\s?([A-Z]{3,4})\.?\s?(\d{4}|\d{2})?\b/g)
  if (m) {
    for (const hit of m) {
      const g = hit.match(/(\d{1,2})\s?([A-Z]{3,4})\.?\s?(\d{4}|\d{2})?/)!
      const mon = MONTHS[g[2]]
      const day = parseInt(g[1], 10)
      if (!mon || day < 1 || day > 31) continue
      if (g[3]) {
        const y = g[3].length === 2 ? 2000 + parseInt(g[3], 10) : parseInt(g[3], 10)
        return `${y}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      }
      return nearestYear(mon, day, ref)
    }
  }
  // AUG 05 2026
  m = T.match(/\b([A-Z]{3,4})\.?\s(\d{1,2}),?\s?(\d{4})?\b/)
  if (m && MONTHS[m[1]]) {
    const mon = MONTHS[m[1]]
    const day = parseInt(m[2], 10)
    if (day >= 1 && day <= 31) {
      if (m[3]) return `${m[3]}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      return nearestYear(mon, day, ref)
    }
  }
  // 2026-08-05
  m = T.match(/\b(20\d{2})-(\d{2})-(\d{2})(?!\d)/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  // 05.08.2026 / 05/08/2026 / 05.08.26
  m = T.match(/\b(\d{1,2})[./](\d{1,2})[./](\d{4}|\d{2})\b/)
  if (m) {
    const y = m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10)
    const mon = parseInt(m[2], 10)
    const day = parseInt(m[1], 10)
    if (mon >= 1 && mon <= 12 && day >= 1 && day <= 31) return `${y}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  return undefined
}

const OCR_STOPWORDS = new Set(['THE', 'AND', 'FOR', 'BUT', 'NOT', 'ARE', 'YOU', 'SEQ', 'ROW', 'ZON', 'GTE', 'DEP', 'ARR', 'ETD', 'ETA', 'PNR', 'REF', 'NEW', 'TIL', 'FRA', 'VIA', 'VOL', 'DER', 'DEN', 'DET', 'MED', 'VED', 'HAN', 'SIN', 'SAS', 'SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'])

export function extractRoute(
  text: string,
  preferCountries: string[],
  custom?: Record<string, Airport>,
): { from?: string; to?: string } {
  const T = text.toUpperCase()
  // Eksplisitte par: OSL-CDG, OSL → CDG, OSL/CDG, OSL  CDG
  const pair = T.match(/\b([A-Z]{3})\s?(?:-|–|→|>|\/|TO|–>)\s?([A-Z]{3})\b/)
  if (pair && lookupAirport(pair[1], custom) && lookupAirport(pair[2], custom)) return { from: pair[1], to: pair[2] }

  const found: { code: string; idx: number; score: number }[] = []
  const re = /\b([A-Z]{3})\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(T))) {
    const code = m[1]
    if (OCR_STOPWORDS.has(code) && !(code === 'FRA' && /\bFRANKFURT\b/.test(T))) continue
    const ap = lookupAirport(code, custom)
    if (!ap) continue
    let score = 1
    if (preferCountries.includes(ap.country)) score += 3
    // Bynavn i nærheten styrker
    const cityWord = ap.city.split(/[ /]/)[0].toUpperCase()
    if (cityWord.length > 3 && T.includes(cityWord)) score += 2
    found.push({ code, idx: m.index, score })
  }
  if (!found.length) return {}
  // Fjern gjentakelser (behold beste)
  const best = new Map<string, { code: string; idx: number; score: number }>()
  for (const f of found) {
    const b = best.get(f.code)
    if (!b || f.score > b.score) best.set(f.code, f)
  }
  const list = [...best.values()].sort((a, b) => b.score - a.score || a.idx - b.idx).slice(0, 2).sort((a, b) => a.idx - b.idx)
  if (list.length === 1) return { from: list[0].code }
  return { from: list[0].code, to: list[1].code }
}

export function extractFlight(text: string): { carrier?: string; flight?: string } {
  const T = text.toUpperCase()
  const re = /\b([A-Z]{2}|[A-Z][0-9]|[0-9][A-Z])\s?([0-9]{1,4})\b/g
  let m: RegExpExecArray | null
  let fallback: { carrier: string; flight: string } | undefined
  while ((m = re.exec(T))) {
    const carrier = m[1]
    const flight = m[2]
    if (CARRIERS[carrier]) return { carrier, flight }
    if (!fallback && /^[A-Z]{2}$/.test(carrier) && flight.length >= 3) fallback = { carrier, flight }
  }
  return fallback ?? {}
}

export function extractSeat(text: string): string | undefined {
  const m = text.toUpperCase().match(/\b(?:SEAT|SIÈGE|SIEGE|SETE|PLASS)\s*:?\s*(\d{1,2}[A-K])\b/) ?? text.toUpperCase().match(/\b(\d{1,2}[A-K])\b/)
  return m?.[1]
}

export function guessFromOcr(text: string, ref: Date, preferCountries: string[], custom?: Record<string, Airport>): OcrGuess {
  const date = extractDate(text, ref)
  const route = extractRoute(text, preferCountries, custom)
  const fl = extractFlight(text)
  const seat = extractSeat(text)
  const points = (date ? 1 : 0) + (route.from ? 1 : 0) + (route.to ? 1 : 0) + (fl.flight ? 1 : 0)
  return { date, ...route, ...fl, seat, confidence: points >= 4 ? 'high' : points >= 2 ? 'medium' : 'low' }
}

/** Gjør BCBP om til utfylte skjemafelt. */
export function bcbpToDrafts(b: Bcbp, ref: Date, custom?: Record<string, Airport>) {
  return b.legs.map((leg) => {
    const from = lookupAirport(leg.from, custom)
    const to = lookupAirport(leg.to, custom)
    return {
      date: resolveJulianDate(leg.dayOfYear, ref) ?? '',
      from: leg.from,
      to: leg.to,
      fromCountry: from?.country ?? '',
      toCountry: to?.country ?? '',
      carrier: leg.carrier,
      flight: leg.flight,
      pnr: leg.pnr,
      seat: leg.seat,
      passenger: b.passenger,
    }
  })
}

export const KNOWN_AIRPORT_CODES = Object.keys(AIRPORTS)
