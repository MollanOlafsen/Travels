// Regelmotor: beregner hvor Roger befinner seg hver dag ut fra reisestrekningene,
// og vurderer status mot reglene fra UD-særavtalen og Skatteetaten.
import { addDays, addMonths, differenceInCalendarDays, format, parseISO, subMonths } from 'date-fns'
import type { RuleParams, RuleStatus, Segment, Settings } from '../types'

export const TRANSIT = 'XX'

export interface DayInfo {
  date: string
  /** Land man har oppholdt seg i (hele eller deler av døgnet) */
  countries: string[]
  /** Landet man befinner seg i ved døgnets slutt (= hvor man sover) */
  endOfDay: string
}

export interface Presence {
  days: DayInfo[]
  byDate: Map<string, DayInfo>
  from: string
  to: string
}

export const iso = (d: Date) => format(d, 'yyyy-MM-dd')
export const todayISO = () => iso(new Date())

export function sortSegments(segs: Segment[]): Segment[] {
  return [...segs].sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order || a.createdAt - b.createdAt)
}

/** Bygger dag-for-dag-oversikt fra utsendelsens start til `until` (eller siste reise). */
export function computePresence(segments: Segment[], settings: Settings, until: string = todayISO()): Presence {
  const sorted = sortSegments(segments)
  const start = settings.postingStart
  const last = sorted.length ? sorted[sorted.length - 1].date : start
  const end = [until, last, ...sorted.map((s) => s.arrivalDate ?? s.date)].sort().pop()!
  const byDate = new Map<string, DayInfo>()
  const days: DayInfo[] = []
  if (!start || end < start) return { days, byDate, from: start, to: end }

  const segsByDate = new Map<string, Segment[]>()
  for (const s of sorted) {
    if (s.date < start) continue
    const arr = segsByDate.get(s.date) ?? []
    arr.push(s)
    segsByDate.set(s.date, arr)
  }
  const pendingArrivals = new Map<string, string>()

  let current = settings.initialCountry || settings.postCountry
  let d = parseISO(start)
  const endDate = parseISO(end)
  while (d <= endDate) {
    const date = iso(d)
    const set = new Set<string>()
    const arrival = pendingArrivals.get(date)
    if (arrival) current = arrival
    if (current !== TRANSIT) set.add(current)
    for (const s of segsByDate.get(date) ?? []) {
      set.add(s.fromCountry)
      if (s.arrivalDate && s.arrivalDate > date) {
        pendingArrivals.set(s.arrivalDate, s.toCountry)
        current = TRANSIT
      } else {
        set.add(s.toCountry)
        current = s.toCountry
      }
    }
    const countries = settings.travelDayCountsBoth ? [...set] : current === TRANSIT ? [] : [current]
    const info: DayInfo = { date, countries, endOfDay: current }
    days.push(info)
    byDate.set(date, info)
    d = addDays(d, 1)
  }
  return { days, byDate, from: start, to: end }
}

/* ---------- Tellere ---------- */

export function daysIn(p: Presence, country: string, from: string, to: string): number {
  let n = 0
  for (const d of p.days) if (d.date >= from && d.date <= to && d.countries.includes(country)) n++
  return n
}

export function daysOther(p: Presence, home: string, post: string, from: string, to: string): number {
  let n = 0
  for (const d of p.days)
    if (d.date >= from && d.date <= to && !d.countries.includes(home) && !d.countries.includes(post)) n++
  return n
}

export function nightsIn(p: Presence, country: string, from: string, to: string): number {
  let n = 0
  for (const d of p.days) if (d.date >= from && d.date <= to && d.endOfDay === country) n++
  return n
}

/** Antall dager i `country` i 12-månedersvinduet som slutter på `date` (Skatteetatens «enhver tolvmånedersperiode»). */
export function rollingDays(p: Presence, country: string, date: string, months: number): number {
  const from = iso(addDays(subMonths(parseISO(date), months), 1))
  return daysIn(p, country, from, date)
}

export function maxRollingDays(p: Presence, country: string, months: number): { value: number; date: string } {
  let best = { value: 0, date: p.to }
  for (const d of p.days) {
    const v = rollingDays(p, country, d.date, months)
    if (v >= best.value) best = { value: v, date: d.date }
  }
  return best
}

export interface Absence {
  from: string
  to: string
  days: number
  ongoing: boolean
}

/** Sammenhengende perioder uten opphold på tjenestestedet. */
export function absencesFrom(p: Presence, post: string): Absence[] {
  const out: Absence[] = []
  let cur: Absence | null = null
  for (const d of p.days) {
    const away = !d.countries.includes(post)
    if (away) {
      if (!cur) cur = { from: d.date, to: d.date, days: 1, ongoing: false }
      else {
        cur.to = d.date
        cur.days++
      }
    } else if (cur) {
      out.push(cur)
      cur = null
    }
  }
  if (cur) {
    cur.ongoing = true
    out.push(cur)
  }
  return out
}

/** Besøksreiser til hjemmet (tjenestestedet) med overnatting, per kalenderår. */
export function homeVisits(segments: Segment[], p: Presence, post: string, year: number): string[] {
  const dates = new Set<string>()
  for (const s of segments) {
    if (!s.date.startsWith(String(year))) continue
    if (s.toCountry !== post || s.fromCountry === post) continue
    const arrive = s.arrivalDate ?? s.date
    const info = p.byDate.get(arrive)
    if (info && info.endOfDay === post) dates.add(arrive)
  }
  return [...dates].sort()
}

/* ---------- Regeldefinisjoner ---------- */

export interface RuleSource {
  label: string
  url: string
}

export interface RuleDef {
  id: string
  authority: 'UD' | 'Skatteetaten' | 'Egen'
  title: string
  defaultEnabled: boolean
  defaultParams: RuleParams
  paramLabels: Record<string, string>
  /** Forklaring i klartekst */
  description: string
  /** Sitat fra kilden */
  quote?: string
  sources: RuleSource[]
}

export const RULE_DEFS: RuleDef[] = [
  {
    id: 'ud_fast_bosatt',
    authority: 'UD',
    title: 'Fast bosatt på tjenestestedet (≥ 50 % av året)',
    defaultEnabled: true,
    defaultParams: { minShare: 50, warnMarginDays: 14 },
    paramLabels: { minShare: 'Minste andel av året på tjenestestedet (%)', warnMarginDays: 'Varsle når færre enn (dager) igjen å være borte' },
    description:
      'Forhøyet utenlandstillegg (det «medfølgende bidraget») forutsetter at medfølgende ektefelle/samboer er «fast bosatt» på tjenestestedet. Særavtalen definerer fast bosatt som faktisk opphold på tjenestestedet i minst halvparten av den utsendtes tjenestetid i hvert kalenderår. Skjer utflyttingen i andre halvår, måles det første året bare over det halvåret. Appen teller dager med opphold i Frankrike (reisedager teller med) mot antall tjenestedager i året.',
    quote:
      '«Med fast bosatt menes et faktisk opphold på tjenestestedet i minst halvparten av den utsendtes tjenestetid i hvert kalenderår, jf. § 2.1. Når utflyttingen etter første ledd skjer i kalenderårets andre halvår menes med fast bosatt et faktisk opphold på tjenestestedet i minst halvparten av den utsendtes tjenestetid i dette halvåret.» – Særavtalen 2026–2028, Definisjoner',
    sources: [
      { label: 'Særavtale om tillegg, ytelser og godtgjørelser i utenrikstjenesten (2026–2028), regjeringen.no', url: 'https://www.regjeringen.no/no/dokumenter/saravtale/id545430/' },
      { label: 'Familieportalen (UD) – Under utenlandsoppholdet', url: 'https://familieportalen.mfa.no/utenlandsoppholdet/' },
    ],
  },
  {
    id: 'ud_absence_3m',
    authority: 'UD',
    title: 'Sammenhengende fravær fra tjenestestedet (maks 3 måneder)',
    defaultEnabled: true,
    defaultParams: { months: 3, warnDays: 30 },
    paramLabels: { months: 'Maks sammenhengende fravær (måneder)', warnDays: 'Varsle når færre enn (dager) igjen' },
    description:
      'Har den medfølgende et midlertidig fravær fra tjenestestedet som sammenhengende varer utover tre måneder, opphører tillegg og godtgjørelser for ektefellen tre måneder etter avreisedatoen. Fristen beregnes fra første dag uten opphold i Frankrike; ett opphold i Frankrike (også en reisedag) nullstiller telleren. Fravær over tre måneder påvirker også pensjonsopptjening for medfølgende (Familieportalen).',
    quote:
      '«Dersom medfølgende ektefelle, som er fast bosatt på tjenestestedet, har et midlertidig fravær, som sammenhengende strekker seg utover tre måneder, opphører tillegg og godtgjørelser i henhold til avtalen tre måneder etter avreisetidspunktet, jf. § 5.» – Særavtalen § 2.1 (samboer likestilles med ektefelle, § 2.5)',
    sources: [
      { label: 'Særavtalen 2026–2028 § 2.1 og § 2.5', url: 'https://www.regjeringen.no/no/dokumenter/saravtale/id545430/' },
      { label: 'Familieportalen – Under utenlandsoppholdet (fravær over tre måneder)', url: 'https://familieportalen.mfa.no/utenlandsoppholdet/' },
    ],
  },
  {
    id: 'skatt_home_visits',
    authority: 'Skatteetaten',
    title: 'Besøksreiser til hjemmet i Paris (pendlerfradrag)',
    defaultEnabled: true,
    defaultParams: { minVisits: 3 },
    paramLabels: { minVisits: 'Minste antall besøksreiser med overnatting per år' },
    description:
      'Som gift familiependler er det skattemessige hjemmet der ektefellen bor (Paris), og arbeidsoppholdet i Oslo gir fradrag for merkostnader (besøksreiser, kost og losji). Skatteetaten krever minst tre hjemreiser med overnatting i løpet av året for familiependlere; i praksis anbefales tre–fire. Appen teller ankomster til Frankrike der du overnatter der. Merk at fradrag for kost og losji normalt bare gis i to år fra første krav, og at utgifter over 10 000 kr må være betalt via bank.',
    quote:
      '«Hvis du har ektefelle eller barn under 22 år i Norge, er skattemessig hjem der familien bor. Det kreves minst tre hjemreiser med overnatting i løpet av året.» (tilsvarende for hjem i annet EØS-land) – Skatteetaten, pendlerfradrag',
    sources: [
      { label: 'Skatteetaten – Pendlerfradrag (vilkår, hjemreiser, satser)', url: 'https://www.skatteetaten.no/en/person/taxes/get-the-taxes-right/employment-benefits-and-pensions/travel-home-work/commuter/commuter/commuter-deduction/' },
      { label: 'FSFIN § 3-1 Skattemessig bosted for pendlere (Lovdata)', url: 'https://lovdata.no/dokument/SF/forskrift/1999-11-19-1158/KAPITTEL_3' },
      { label: 'Skatteetaten – Merkostnadsvilkåret og retten til pendlerfradrag', url: 'https://www.skatteetaten.no/en/rettskilder/type/uttalelser/uttalelser/merkostnadsvilkaret-og-retten-til-pendlerfradrag/' },
    ],
  },
  {
    id: 'skatt_nights',
    authority: 'Skatteetaten',
    title: 'Overveiende døgnhvile (netter i Paris vs. Norge)',
    defaultEnabled: true,
    defaultParams: {},
    paramLabels: {},
    description:
      'Hovedregelen i FSFIN § 3-1-1 er at hjemmet er der man har sin overveiende døgnhvile. For gifte familiependlere går familieregelen foran, men det er ryddig å kunne dokumentere at du faktisk sover flest netter i Paris. Regelen er informativ: den varsler hvis du i inneværende år har sovet flere netter i Norge enn i Frankrike.',
    quote: '«… anses den boligen hvor en person tar sin overveiende døgnhvile å være denne personens hjem.» – FSFIN § 3-1-1',
    sources: [{ label: 'FSFIN kapittel 3 (Lovdata)', url: 'https://lovdata.no/dokument/SF/forskrift/1999-11-19-1158/KAPITTEL_3' }],
  },
  {
    id: 'skatt_183',
    authority: 'Skatteetaten',
    title: 'Dager i Norge – 183 dager i enhver 12-månedersperiode',
    defaultEnabled: true,
    defaultParams: { limit: 183, warnAt: 150 },
    paramLabels: { limit: 'Grense (dager i 12 mnd)', warnAt: 'Varsle fra (dager)' },
    description:
      'Skatteloven § 2-1 annet ledd: opphold i Norge i mer enn 183 dager i løpet av enhver tolvmånedersperiode (eller 270 dager i 36 måneder) gir skattemessig bosted i Norge. Hele og deler av døgn teller. Du er allerede skattemessig bosatt i Norge, så regelen er først og fremst dokumentasjon – men tallet er også relevant for fransk skatteplikt og for helhetsbildet overfor Skatteetaten.',
    quote: '«Person som i en eller flere perioder oppholder seg mer enn 183 dager i riket i løpet av enhver tolvmånedersperiode … anses som bosatt i riket.» – skatteloven § 2-1 (2)',
    sources: [
      { label: 'Skatteloven § 2-1 (Lovdata)', url: 'https://lovdata.no/lov/1999-03-26-14/§2-1' },
      { label: 'Skatteetaten – Skattemessig bosted ved flytting til/fra Norge', url: 'https://www.skatteetaten.no/en/person/taxes/get-the-taxes-right/abroad/tax-residence-in-norway-when-moving-to-or-from-norway/' },
    ],
  },
  {
    id: 'custom_max_no',
    authority: 'Egen',
    title: 'Egen grense: maks dager i Norge per kalenderår',
    defaultEnabled: false,
    defaultParams: { limit: 90, warnAt: 75 },
    paramLabels: { limit: 'Maks dager i Norge per år', warnAt: 'Varsle fra (dager)' },
    description:
      'Slå på denne hvis ambassaden, UD eller Skatteetaten har gitt deg et konkret tak på antall dager i Norge. Merk: 90-dagersgrensen som tidligere fulgte av skattepraksis for utsendte (Skattedirektoratet 2022) gjaldt den utsendte selv, ikke medfølgende, og ble ikke videreført da utsendte fra inntektsåret 2025 igjen regnes som skattemessig bosatt i Norge (Prop. 1 LS 2024–2025). Sett tallet du faktisk har fått beskjed om.',
    sources: [
      { label: 'Høringsnotat 24/2434 – skattemessig bosted for utsendt utenrikstjenesteansatt (om 90-dagerspraksisen)', url: 'https://www.regjeringen.no/no/dokumenter/horingsbrev-endring-av-reglene-om-skattemessig-bosted-for-utsendte-utenrikstjenesteansatte-mv/id3047407/' },
      { label: 'Skatteetaten – Forskuddsmeldingen 2025 (endringen fra 2025)', url: 'https://www.skatteetaten.no/en/rettskilder/type/skattedirektoratets-meldinger/forskuddsmeldingen-2025/' },
    ],
  },
]

export const RULE_MAP = new Map(RULE_DEFS.map((r) => [r.id, r]))

/* ---------- Evaluering ---------- */

export interface RuleResult {
  id: string
  status: RuleStatus
  /** Kort verdi, f.eks. «112 / 149 dager» */
  value: string
  /** Én setning om situasjonen */
  headline: string
  /** Utfyllende forklaring/prognose */
  detail: string
  progress?: { value: number; max: number }
}

export interface YearSummary {
  year: number
  from: string
  to: string
  post: number
  home: number
  other: number
  nightsPost: number
  nightsHome: number
  visits: string[]
}

function num(p: RuleParams, k: string, fallback: number): number {
  const v = p[k]
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

export function fmtDate(d: string): string {
  const [y, m, day] = d.split('-')
  return `${parseInt(day, 10)}.${parseInt(m, 10)}.${y}`
}

export function yearSummary(segments: Segment[], p: Presence, s: Settings, year: number, today: string): YearSummary {
  const from = [`${year}-01-01`, s.postingStart].sort().pop()!
  const to = [`${year}-12-31`, today, s.postingEnd ?? '9999'].sort()[0]
  return {
    year,
    from,
    to,
    post: daysIn(p, s.postCountry, from, to),
    home: daysIn(p, s.homeCountry, from, to),
    other: daysOther(p, s.homeCountry, s.postCountry, from, to),
    nightsPost: nightsIn(p, s.postCountry, from, to),
    nightsHome: nightsIn(p, s.homeCountry, from, to),
    visits: homeVisits(segments, p, s.postCountry, year),
  }
}

export function evaluateRules(segments: Segment[], settings: Settings, today: string = todayISO()): RuleResult[] {
  const p = computePresence(segments, settings, today)
  const year = parseInt(today.slice(0, 4), 10)
  const ys = yearSummary(segments, p, settings, year, today)
  const results: RuleResult[] = []
  const post = settings.postCountry
  const postName = settings.postCity || post

  for (const cfg of settings.rules) {
    const def = RULE_MAP.get(cfg.id)
    if (!def) continue
    if (!cfg.enabled) {
      results.push({ id: cfg.id, status: 'off', value: '–', headline: 'Regelen er slått av', detail: '' })
      continue
    }
    const P = cfg.params
    switch (cfg.id) {
      case 'ud_fast_bosatt': {
        const minShare = num(P, 'minShare', 50)
        const margin = num(P, 'warnMarginDays', 14)
        // Måleperiode: tjenestetiden i kalenderåret (første år: fra utsendelsesdato)
        const periodStart = ys.from
        const periodEnd = [`${year}-12-31`, settings.postingEnd ?? '9999'].sort()[0]
        const totalDays = differenceInCalendarDays(parseISO(periodEnd), parseISO(periodStart)) + 1
        const elapsed = differenceInCalendarDays(parseISO(today), parseISO(periodStart)) + 1
        const remaining = Math.max(0, totalDays - elapsed)
        const required = Math.ceil((totalDays * minShare) / 100)
        const atPost = ys.post
        const canStillBeAway = remaining - Math.max(0, required - atPost)
        const shareSoFar = elapsed > 0 ? Math.round((atPost / elapsed) * 100) : 100
        let status: RuleStatus = 'ok'
        if (atPost + remaining < required) status = 'critical'
        else if (canStillBeAway < margin) status = 'warn'
        results.push({
          id: cfg.id,
          status,
          value: `${atPost} av ${totalDays} dager`,
          headline:
            status === 'critical'
              ? `Kan ikke lenger nå ${minShare} % i ${year} – kontakt ambassaden.`
              : `${shareSoFar} % av tiden hittil i ${year} på tjenestestedet.`,
          detail: `Krav: minst ${required} dager i ${postName} i perioden ${fmtDate(periodStart)}–${fmtDate(periodEnd)} (${totalDays} tjenestedager). Hittil ${atPost} dager. ${
            remaining > 0
              ? `Det gjenstår ${remaining} dager av året; du kan maksimalt være borte ${Math.max(0, canStillBeAway)} av dem.`
              : 'Året er omme.'
          }`,
          progress: { value: atPost, max: required },
        })
        break
      }
      case 'ud_absence_3m': {
        const months = num(P, 'months', 3)
        const warnDays = num(P, 'warnDays', 30)
        const abs = absencesFrom(p, post)
        const cur = abs.find((a) => a.ongoing)
        const longest = abs.reduce((m, a) => Math.max(m, a.days), 0)
        if (!cur) {
          results.push({
            id: cfg.id,
            status: 'ok',
            value: 'På tjenestestedet',
            headline: `Du er i ${postName}. Telleren er nullstilt.`,
            detail: longest ? `Lengste sammenhengende fravær hittil: ${longest} dager.` : 'Ingen fravær registrert.',
          })
        } else {
          const deadline = addMonths(parseISO(cur.from), months)
          const daysLeft = differenceInCalendarDays(deadline, parseISO(today))
          let status: RuleStatus = 'ok'
          if (daysLeft <= 0) status = 'critical'
          else if (daysLeft <= warnDays) status = 'warn'
          results.push({
            id: cfg.id,
            status,
            value: `${cur.days} dager borte`,
            headline:
              daysLeft <= 0
                ? `Fraværet har vart over ${months} måneder – tillegget kan ha opphørt.`
                : `${daysLeft} dager igjen før ${months}-månedersfristen.`,
            detail: `Borte fra ${postName} siden ${fmtDate(cur.from)}. Fristen utløper ${fmtDate(iso(deadline))}. Én dag i ${postName} nullstiller telleren.`,
            progress: { value: cur.days, max: differenceInCalendarDays(deadline, parseISO(cur.from)) },
          })
        }
        break
      }
      case 'skatt_home_visits': {
        const min = num(P, 'minVisits', 3)
        const n = ys.visits.length
        const monthsLeft = 12 - parseInt(today.slice(5, 7), 10)
        let status: RuleStatus = 'ok'
        if (n < min) status = monthsLeft <= 2 ? 'critical' : monthsLeft <= 5 ? 'warn' : 'info'
        results.push({
          id: cfg.id,
          status,
          value: `${n} av ${min} reiser`,
          headline: n >= min ? `Kravet om ${min} besøksreiser i ${year} er oppfylt.` : `${min - n} besøksreise${min - n === 1 ? '' : 'r'} gjenstår i ${year}.`,
          detail: n ? `Ankomster til ${postName} med overnatting: ${ys.visits.map(fmtDate).join(', ')}.` : 'Ingen besøksreiser med overnatting registrert i år.',
          progress: { value: n, max: min },
        })
        break
      }
      case 'skatt_nights': {
        const status: RuleStatus = ys.nightsPost >= ys.nightsHome ? 'ok' : 'warn'
        results.push({
          id: cfg.id,
          status,
          value: `${ys.nightsPost} / ${ys.nightsHome} netter`,
          headline: status === 'ok' ? `Flest netter i ${postName} i ${year}.` : `Flere netter i Norge enn i ${postName} i ${year}.`,
          detail: `Netter i ${postName}: ${ys.nightsPost}. Netter i Norge: ${ys.nightsHome}. Netter i andre land: ${
            p.days.filter((d) => d.date >= ys.from && d.date <= ys.to && d.endOfDay !== post && d.endOfDay !== settings.homeCountry).length
          }.`,
        })
        break
      }
      case 'skatt_183': {
        const limit = num(P, 'limit', 183)
        const warnAt = num(P, 'warnAt', 150)
        const now = rollingDays(p, settings.homeCountry, today, 12)
        const peak = maxRollingDays(p, settings.homeCountry, 12)
        const r36 = rollingDays(p, settings.homeCountry, today, 36)
        let status: RuleStatus = 'ok'
        if (now > limit) status = 'critical'
        else if (now >= warnAt) status = 'warn'
        results.push({
          id: cfg.id,
          status,
          value: `${now} dager / 12 mnd`,
          headline: now > limit ? `Over ${limit} dager i Norge siste 12 måneder.` : `${limit - now} dager igjen til ${limit}-dagersgrensen.`,
          detail: `Siste 12 måneder: ${now} dager i Norge. Høyeste 12-månedersverdi hittil: ${peak.value} (per ${fmtDate(peak.date)}). Siste 36 måneder: ${r36} dager (grense 270).`,
          progress: { value: now, max: limit },
        })
        break
      }
      case 'custom_max_no': {
        const limit = num(P, 'limit', 90)
        const warnAt = num(P, 'warnAt', 75)
        const n = ys.home
        let status: RuleStatus = 'ok'
        if (n > limit) status = 'critical'
        else if (n >= warnAt) status = 'warn'
        results.push({
          id: cfg.id,
          status,
          value: `${n} av ${limit} dager`,
          headline: n > limit ? `Over grensen på ${limit} dager i Norge i ${year}.` : `${limit - n} dager igjen i ${year}.`,
          detail: `Dager i Norge i ${year} (hele/deler av døgn): ${n}.`,
          progress: { value: n, max: limit },
        })
        break
      }
    }
  }
  return results
}

/** Hvor er man nå, og hvor lenge? */
export function currentLocation(p: Presence, today: string): { country: string; since: string; days: number } | null {
  const t = p.byDate.get(today) ?? p.days[p.days.length - 1]
  if (!t) return null
  const country = t.endOfDay
  let since = t.date
  for (let i = p.days.length - 1; i >= 0; i--) {
    if (p.days[i].date > today) continue
    if (p.days[i].endOfDay !== country) break
    since = p.days[i].date
  }
  return { country, since, days: differenceInCalendarDays(parseISO(today), parseISO(since)) + 1 }
}
