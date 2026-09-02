// Tolker IATA Bar Coded Boarding Pass (BCBP, Resolution 792) – teksten i PDF417/Aztec/QR-koden på boardingkort.
// Format «M»: faste feltposisjoner for første strekning, deretter ett variabelt felt og evt. flere strekninger.

export interface BcbpLeg {
  pnr: string
  from: string
  to: string
  carrier: string
  flight: string
  /** Dag i året (1–366) – året står ikke i koden */
  dayOfYear: number
  compartment: string
  seat: string
  sequence: string
}

export interface Bcbp {
  passenger: string
  legs: BcbpLeg[]
  raw: string
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim()

/** Gjør om «LASTNAME/FIRST MR» til «First Lastname». */
export function formatPassengerName(raw: string): string {
  const [last, first = ''] = raw.trim().split('/')
  const cap = (w: string) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : '')
  const firstName = first.replace(/\b(MR|MRS|MS|DR)\b/g, '').trim().split(/\s+/).map(cap).join(' ')
  return clean(`${firstName} ${cap(last)}`)
}

function readLeg(s: string, at: number, withName: boolean): { leg: BcbpLeg; next: number; name?: string } | null {
  let p = at
  let name: string | undefined
  if (withName) {
    name = s.slice(p, p + 20)
    p += 20
    p += 1 // e-ticket-indikator
  }
  if (s.length < p + 35) return null
  const pnr = clean(s.slice(p, p + 7))
  const from = clean(s.slice(p + 7, p + 10)).toUpperCase()
  const to = clean(s.slice(p + 10, p + 13)).toUpperCase()
  const carrier = clean(s.slice(p + 13, p + 16)).toUpperCase()
  const flight = clean(s.slice(p + 16, p + 21)).replace(/^0+(?=\d)/, '')
  const dayOfYear = parseInt(s.slice(p + 21, p + 24), 10)
  const compartment = clean(s.slice(p + 24, p + 25))
  const seat = clean(s.slice(p + 25, p + 29)).replace(/^0+(?=\d)/, '')
  const sequence = clean(s.slice(p + 29, p + 34))
  // p+34: passasjerstatus, p+35..36: størrelse på variabelt felt (hex)
  const varSize = parseInt(s.slice(p + 35, p + 37), 16)
  const next = p + 37 + (Number.isFinite(varSize) ? varSize : 0)
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to) || !Number.isFinite(dayOfYear)) return null
  return { leg: { pnr, from, to, carrier, flight, dayOfYear, compartment, seat, sequence }, next, name }
}

export function parseBcbp(raw: string): Bcbp | null {
  const s = raw.replace(/[\r\n]+/g, '')
  if (!/^M[1-9]/.test(s)) return null
  const legCount = parseInt(s[1], 10)
  const first = readLeg(s, 2, true)
  if (!first) return null
  const legs = [first.leg]
  let pos = first.next
  for (let i = 1; i < legCount; i++) {
    const r = readLeg(s, pos, false)
    if (!r) break
    legs.push(r.leg)
    pos = r.next
  }
  return { passenger: formatPassengerName(first.name ?? ''), legs, raw }
}

function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Finner året som gir datoen nærmest referansedatoen (bildets dato eller i dag). */
export function resolveJulianDate(dayOfYear: number, reference: Date = new Date()): string | null {
  if (!Number.isFinite(dayOfYear) || dayOfYear < 1 || dayOfYear > 366) return null
  const refYear = reference.getFullYear()
  let best: Date | null = null
  let bestDiff = Infinity
  for (const y of [refYear - 1, refYear, refYear + 1]) {
    const d = new Date(y, 0, dayOfYear)
    if (d.getFullYear() !== y) continue // dag 366 i ikke-skuddår
    const diff = Math.abs(d.getTime() - reference.getTime())
    if (diff < bestDiff) {
      bestDiff = diff
      best = d
    }
  }
  return best ? toISO(best) : null
}
