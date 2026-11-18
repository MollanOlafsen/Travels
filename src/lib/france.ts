// Regionsmålet «Tour de France»: besøke alle 13 regioner i fastlands-Frankrike + Korsika.
import type { Segment, Settings, Visit } from '../types'
import { DEPTS, PROJ, REGIONS, type MapDept, type MapRegion } from '../data/franceMap'

export const HOME_REGION = '11' // Île-de-France
export const HOME_DEPT = '75' // Paris
export const TOTAL_REGIONS = REGIONS.length // 13
export const TOTAL_DEPTS = DEPTS.length // 96

export const DEPT_BY_CODE = new Map<string, MapDept>(DEPTS.map((d) => [d.code, d]))
export const REGION_BY_CODE = new Map<string, MapRegion>(REGIONS.map((r) => [r.code, r]))

export function regionOfDept(dept: string): string | undefined {
  return DEPT_BY_CODE.get(dept)?.region
}

/* ---------- Fakta om regionene ---------- */

export interface RegionInfo {
  emoji: string
  /** Farge når regionen er «låst opp» */
  color: string
  capital: string
  taste: string
  mustSee: string
  /** Raskeste vei fra Paris (omtrentlig) */
  fromParis: string
  /** Minutter med raskeste reisemåte – brukes til å foreslå neste mål */
  minutes: number
}

export const REGION_INFO: Record<string, RegionInfo> = {
  '11': { emoji: '🗼', color: '#3b5bdb', capital: 'Paris', taste: 'Brie de Meaux', mustSee: 'Versailles og Fontainebleau', fromParis: 'Du bor her!', minutes: 0 },
  '24': { emoji: '🏰', color: '#c2410c', capital: 'Orléans', taste: 'Tarte Tatin og geitost fra Sainte-Maure', mustSee: 'Slottene Chambord og Chenonceau', fromParis: 'Tog til Orléans ca. 1 t', minutes: 60 },
  '27': { emoji: '🍷', color: '#9d174d', capital: 'Dijon', taste: 'Bœuf bourguignon, comté og dijonsennep', mustSee: 'Vingårdene i Côte de Beaune', fromParis: 'TGV til Dijon ca. 1 t 40', minutes: 100 },
  '28': { emoji: '🧀', color: '#0f766e', capital: 'Rouen', taste: 'Camembert, cider og calvados', mustSee: 'Mont-Saint-Michel og klippene i Étretat', fromParis: 'Tog til Rouen ca. 1 t 10', minutes: 70 },
  '32': { emoji: '🍟', color: '#b45309', capital: 'Lille', taste: 'Moules-frites og maroilles', mustSee: 'Gamlebyen i Lille og katedralen i Amiens', fromParis: 'TGV til Lille ca. 1 t', minutes: 60 },
  '44': { emoji: '🥂', color: '#a16207', capital: 'Strasbourg', taste: 'Champagne og choucroute', mustSee: 'Champagnekjellerne i Reims og Petite France i Strasbourg', fromParis: 'TGV til Reims ca. 45 min', minutes: 45 },
  '52': { emoji: '🐘', color: '#15803d', capital: 'Nantes', taste: 'Beurre blanc, muscadet og LU-kjeks', mustSee: "Les Machines de l'île i Nantes", fromParis: 'TGV til Le Mans ca. 1 t', minutes: 60 },
  '53': { emoji: '🥞', color: '#1d4ed8', capital: 'Rennes', taste: 'Galetter, crêpes og kouign-amann', mustSee: 'Festningsbyen Saint-Malo', fromParis: 'TGV til Rennes ca. 1 t 30', minutes: 90 },
  '75': { emoji: '🍇', color: '#7e22ce', capital: 'Bordeaux', taste: 'Canelés og bordeauxvin', mustSee: 'Dune du Pilat', fromParis: 'TGV til Poitiers ca. 1 t 20, Bordeaux ca. 2 t 10', minutes: 80 },
  '76': { emoji: '🏯', color: '#dc2626', capital: 'Toulouse', taste: 'Cassoulet', mustSee: 'Middelalderbyen Carcassonne', fromParis: 'TGV til Montpellier ca. 3 t 20', minutes: 200 },
  '84': { emoji: '🏔️', color: '#0369a1', capital: 'Lyon', taste: 'Quenelles i Lyon – og fondue i Alpene', mustSee: 'Mont Blanc fra Chamonix', fromParis: 'TGV til Lyon ca. 2 t', minutes: 120 },
  '93': { emoji: '☀️', color: '#ea580c', capital: 'Marseille', taste: 'Bouillabaisse', mustSee: 'Calanques ved Marseille', fromParis: 'TGV til Avignon ca. 2 t 40', minutes: 160 },
  '94': { emoji: '🏝️', color: '#047857', capital: 'Ajaccio', taste: 'Brocciu og figatellu', mustSee: 'Bonifacio og Calanques de Piana', fromParis: 'Fly til Ajaccio eller Bastia ca. 1 t 35', minutes: 240 },
}

/* ---------- Kjente steder (for stedsforslag, GPS og nåler på kartet) ---------- */

export interface City {
  name: string
  dept: string
  lat: number
  lon: number
}

const C = (name: string, dept: string, lat: number, lon: number): City => ({ name, dept, lat, lon })

export const CITIES: City[] = [
  C('Paris', '75', 48.857, 2.352), C('Versailles', '78', 48.805, 2.12), C('Fontainebleau', '77', 48.405, 2.7),
  C('Disneyland Paris', '77', 48.872, 2.776), C('Saint-Denis', '93', 48.936, 2.357), C('Giverny', '27', 49.075, 1.533),
  C('Chantilly', '60', 49.194, 2.471), C('Chartres', '28', 48.447, 1.489), C('Orléans', '45', 47.902, 1.909),
  C('Tours', '37', 47.394, 0.689), C('Amboise', '37', 47.413, 0.983), C('Blois', '41', 47.586, 1.335),
  C('Chambord', '41', 47.616, 1.517), C('Bourges', '18', 47.081, 2.399), C('Dijon', '21', 47.322, 5.041),
  C('Beaune', '21', 47.025, 4.84), C('Besançon', '25', 47.238, 6.024), C('Auxerre', '89', 47.798, 3.567),
  C('Rouen', '76', 49.443, 1.099), C('Le Havre', '76', 49.494, 0.108), C('Étretat', '76', 49.707, 0.205),
  C('Caen', '14', 49.183, -0.37), C('Deauville', '14', 49.357, 0.07), C('Honfleur', '14', 49.419, 0.233),
  C('Bayeux', '14', 49.276, -0.703), C('Mont-Saint-Michel', '50', 48.636, -1.511), C('Lille', '59', 50.629, 3.057),
  C('Dunkerque', '59', 51.034, 2.377), C('Amiens', '80', 49.894, 2.296), C('Arras', '62', 50.291, 2.778),
  C('Calais', '62', 50.951, 1.858), C('Strasbourg', '67', 48.573, 7.752), C('Colmar', '68', 48.079, 7.358),
  C('Mulhouse', '68', 47.75, 7.336), C('Reims', '51', 49.258, 4.032), C('Épernay', '51', 49.04, 3.959),
  C('Metz', '57', 49.12, 6.176), C('Nancy', '54', 48.692, 6.184), C('Troyes', '10', 48.297, 4.074),
  C('Nantes', '44', 47.218, -1.554), C('Saint-Nazaire', '44', 47.273, -2.214), C('Angers', '49', 47.478, -0.563),
  C('Le Mans', '72', 48.006, 0.199), C('Rennes', '35', 48.117, -1.678), C('Saint-Malo', '35', 48.649, -2.008),
  C('Brest', '29', 48.39, -4.486), C('Quimper', '29', 47.996, -4.102), C('Vannes', '56', 47.658, -2.76),
  C('Carnac', '56', 47.584, -3.078), C('Bordeaux', '33', 44.838, -0.579), C('Arcachon', '33', 44.658, -1.168),
  C('Saint-Émilion', '33', 44.894, -0.155), C('Biarritz', '64', 43.483, -1.559), C('Bayonne', '64', 43.493, -1.475),
  C('Pau', '64', 43.296, -0.37), C('La Rochelle', '17', 46.16, -1.151), C('Poitiers', '86', 46.58, 0.34),
  C('Futuroscope', '86', 46.669, 0.368), C('Limoges', '87', 45.834, 1.262), C('Sarlat-la-Canéda', '24', 44.89, 1.216),
  C('Cognac', '16', 45.696, -0.329), C('Angoulême', '16', 45.648, 0.156), C('Toulouse', '31', 43.605, 1.444),
  C('Carcassonne', '11', 43.212, 2.353), C('Montpellier', '34', 43.611, 3.877), C('Nîmes', '30', 43.837, 4.36),
  C('Perpignan', '66', 42.699, 2.895), C('Collioure', '66', 42.526, 3.084), C('Lourdes', '65', 43.095, -0.046),
  C('Albi', '81', 43.929, 2.148), C('Rocamadour', '46', 44.799, 1.618), C('Millau', '12', 44.098, 3.078),
  C('Lyon', '69', 45.764, 4.836), C('Grenoble', '38', 45.188, 5.725), C('Annecy', '74', 45.9, 6.129),
  C('Chamonix', '74', 45.924, 6.869), C('Évian-les-Bains', '74', 46.401, 6.59), C('Chambéry', '73', 45.564, 5.918),
  C("Val d'Isère", '73', 45.448, 6.98), C('Courchevel', '73', 45.415, 6.634), C('Clermont-Ferrand', '63', 45.778, 3.087),
  C('Saint-Étienne', '42', 45.44, 4.387), C('Valence', '26', 44.933, 4.892), C('Vichy', '03', 46.128, 3.425),
  C('Le Puy-en-Velay', '43', 45.043, 3.885), C('Marseille', '13', 43.297, 5.37), C('Aix-en-Provence', '13', 43.529, 5.447),
  C('Arles', '13', 43.677, 4.631), C('Nice', '06', 43.71, 7.262), C('Cannes', '06', 43.552, 7.017),
  C('Antibes', '06', 43.581, 7.125), C('Toulon', '83', 43.124, 5.928), C('Saint-Tropez', '83', 43.272, 6.64),
  C('Avignon', '84', 43.949, 4.806), C('Gordes', '84', 43.911, 5.2), C('Moustiers-Sainte-Marie', '04', 43.846, 6.222),
  C('Briançon', '05', 44.898, 6.643), C('Ajaccio', '2A', 41.919, 8.739), C('Bonifacio', '2A', 41.387, 9.159),
  C('Porto-Vecchio', '2A', 41.591, 9.279), C('Bastia', '2B', 42.697, 9.451), C('Calvi', '2B', 42.567, 8.757),
  C('Corte', '2B', 42.306, 9.15),
]

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const CITY_BY_NORM = new Map(CITIES.map((c) => [norm(c.name), c]))

export function findCity(text: string | undefined): City | undefined {
  if (!text) return undefined
  const n = norm(text)
  if (!n) return undefined
  return CITY_BY_NORM.get(n) ?? CITIES.find((c) => n.startsWith(norm(c.name) + ' '))
}

/** Flyplasser i Frankrike → departement (for forslag fra reiseloggen). */
export const AIRPORT_DEPT: Record<string, string> = {
  CDG: '95', ORY: '94', BVA: '60', LBG: '93', NCE: '06', LYS: '69', MRS: '13', TLS: '31', BOD: '33', NTE: '44',
  MPL: '34', LIL: '59', SXB: '67', BIQ: '64', BES: '29', RNS: '35', TLN: '83', PGF: '66', AJA: '2A', BIA: '2B',
  CLY: '2B', FSC: '2A', MLH: '68', EGC: '24', LRH: '17', CFE: '63', PIS: '86', LIG: '87', DNR: '35', CMF: '73',
  GNB: '38', LDE: '65', PUF: '64', RDZ: '12', BZR: '34', NIM: '30', AVN: '84', TUF: '37', UIP: '29', LRT: '56',
  CFR: '14', DOL: '14', ETZ: '57', DIJ: '21', ANE: '49', XCR: '51',
}

/* ---------- Geometri ---------- */

export function project(lat: number, lon: number): [number, number] {
  return [(lon * PROJ.k - PROJ.minX) * PROJ.s + PROJ.pad, (-lat - PROJ.minY) * PROJ.s + PROJ.pad]
}

type Ring = [number, number][]
const ringCache = new Map<string, Ring[]>()

export function ringsOf(d: string): Ring[] {
  let r = ringCache.get(d)
  if (!r) {
    r = d
      .split('Z')
      .filter(Boolean)
      .map((chunk) =>
        chunk
          .replace('M', '')
          .split('L')
          .map((pt) => pt.split(' ').map(Number) as [number, number]),
      )
    ringCache.set(d, r)
  }
  return r
}

function insideRings(x: number, y: number, rings: Ring[]): boolean {
  let inside = false
  for (const ring of rings)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]
      const [xj, yj] = ring[j]
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
    }
  return inside
}

/** Hvilket departement ligger punktet i? Tåler at kystlinjen er forenklet (nærmeste innen ~6 km). */
export function deptAt(lat: number, lon: number): MapDept | undefined {
  const [x, y] = project(lat, lon)
  for (const d of DEPTS) {
    const [x0, y0, x1, y1] = d.bbox
    if (x < x0 || x > x1 || y < y0 || y > y1) continue
    if (insideRings(x, y, ringsOf(d.d))) return d
  }
  // Nær kysten/grensen: nærmeste kantpunkt
  let best: MapDept | undefined
  let bestD = 6 // kartenheter ≈ 6–7 km
  for (const d of DEPTS)
    for (const ring of ringsOf(d.d))
      for (const [px, py] of ring) {
        const dist = Math.hypot(px - x, py - y)
        if (dist < bestD) {
          bestD = dist
          best = d
        }
      }
  return best
}

/** Nærmeste kjente by innen `maxKm`. */
export function nearestCity(lat: number, lon: number, maxKm = 12): City | undefined {
  let best: City | undefined
  let bestKm = maxKm
  for (const c of CITIES) {
    const km = haversineKm(lat, lon, c.lat, c.lon)
    if (km < bestKm) {
      bestKm = km
      best = c
    }
  }
  return best
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

const areaCache = new Map<string, number>()
function deptArea(d: MapDept): number {
  let a = areaCache.get(d.code)
  if (a === undefined) {
    a = 0
    for (const ring of ringsOf(d.d)) {
      let s = 0
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) s += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1])
      a += s / 2
    }
    a = Math.abs(a)
    areaCache.set(d.code, a)
  }
  return a
}

/** Posisjon for en nål på kartet: GPS hvis registrert, ellers kjent by. */
export function visitPoint(v: Visit): [number, number] | undefined {
  if (typeof v.lat === 'number' && typeof v.lon === 'number') return project(v.lat, v.lon)
  const c = findCity(v.place)
  if (c && c.dept === v.dept) return project(c.lat, c.lon)
  return undefined
}

/* ---------- Status og statistikk ---------- */

export interface RegionStatus {
  code: string
  visited: boolean
  home: boolean
  firstDate?: string
  visits: Visit[]
  deptsVisited: string[]
}

export interface FranceStats {
  regions: RegionStatus[]
  regionsVisited: number
  deptsVisited: Set<string>
  areaPct: number
  level: Level
  nextLevel?: Level
  next?: string
  /** Regioner i den rekkefølgen de ble låst opp */
  timeline: { code: string; date: string }[]
}

export function computeFrance(visits: Visit[], settings: Pick<Settings, 'franceHomeCounts'>): FranceStats {
  const byRegion = new Map<string, Visit[]>()
  const deptsVisited = new Set<string>()
  for (const v of visits) {
    const reg = regionOfDept(v.dept)
    if (!reg) continue
    deptsVisited.add(v.dept)
    const arr = byRegion.get(reg) ?? []
    arr.push(v)
    byRegion.set(reg, arr)
  }
  // Bor man i Paris, er Paris-departementet «besøkt» sammen med hjemregionen
  if (settings.franceHomeCounts) deptsVisited.add(HOME_DEPT)
  const regions: RegionStatus[] = REGIONS.map((r) => {
    const vs = (byRegion.get(r.code) ?? []).slice().sort((a, b) => a.date.localeCompare(b.date))
    const home = r.code === HOME_REGION && settings.franceHomeCounts
    return {
      code: r.code,
      visited: vs.length > 0 || home,
      home,
      firstDate: vs[0]?.date,
      visits: vs,
      deptsVisited: r.depts.filter((d) => deptsVisited.has(d)),
    }
  })
  const regionsVisited = regions.filter((r) => r.visited).length
  const totalArea = DEPTS.reduce((s, d) => s + deptArea(d), 0)
  const visitedArea = DEPTS.filter((d) => deptsVisited.has(d.code)).reduce((s, d) => s + deptArea(d), 0)
  const unvisited = regions.filter((r) => !r.visited).sort((a, b) => REGION_INFO[a.code].minutes - REGION_INFO[b.code].minutes)
  const timeline = regions
    .filter((r) => r.firstDate)
    .map((r) => ({ code: r.code, date: r.firstDate! }))
    .sort((a, b) => a.date.localeCompare(b.date))
  let li = 0
  while (li + 1 < LEVELS.length && regionsVisited >= LEVELS[li + 1].min) li++
  return {
    regions,
    regionsVisited,
    deptsVisited,
    areaPct: totalArea ? (visitedArea / totalArea) * 100 : 0,
    level: LEVELS[li],
    nextLevel: LEVELS[li + 1],
    next: unvisited[0]?.code,
    timeline,
  }
}

/* ---------- Nivåer og merker ---------- */

export interface Level {
  min: number
  title: string
  emoji: string
}

export const LEVELS: Level[] = [
  { min: 0, title: 'Nyankommet', emoji: '🧳' },
  { min: 1, title: 'Parisisk', emoji: '🥐' },
  { min: 2, title: 'Helgeturist', emoji: '🚆' },
  { min: 4, title: 'Flâneur', emoji: '🎒' },
  { min: 7, title: "Halvveis rundt l'Hexagone", emoji: '🧭' },
  { min: 10, title: 'Nesten innfødt', emoji: '🇫🇷' },
  { min: 13, title: 'Tour de France fullført!', emoji: '🏆' },
]

export interface Badge {
  id: string
  emoji: string
  title: string
  hint: string
  earned: boolean
}

export function badges(stats: FranceStats, visits: Visit[]): Badge[] {
  const has = (code: string) => stats.regions.find((r) => r.code === code)?.visits.length
  const coastal = ['13', '06', '83', '34', '66', '11', '30', '33', '40', '64', '17', '85', '44', '56', '29', '22', '35', '50', '14', '76', '80', '62', '59', '2A', '2B']
  const alps = ['73', '74', '38', '05', '04', '06']
  const d = stats.deptsVisited
  const firstFull = stats.regions.find((r) => r.deptsVisited.length === REGION_BY_CODE.get(r.code)!.depts.length)
  return [
    { id: 'first', emoji: '🎟️', title: 'Første tur', hint: 'Registrer ditt første besøk', earned: visits.length > 0 },
    { id: 'corse', emoji: '🏝️', title: 'Île de Beauté', hint: 'Besøk Korsika', earned: Boolean(has('94')) },
    { id: 'sea', emoji: '🌊', title: 'Havbris', hint: 'Besøk et kystdepartement', earned: coastal.some((c) => d.has(c)) },
    { id: 'alps', emoji: '⛷️', title: 'Til fjells', hint: 'Besøk et alpedepartement', earned: alps.some((c) => d.has(c)) },
    { id: 'd10', emoji: '🔟', title: '10 departementer', hint: 'Besøk 10 departementer', earned: d.size >= 10 },
    { id: 'full', emoji: '🧩', title: 'Komplett region', hint: 'Besøk alle departementene i én region', earned: Boolean(firstFull) },
    { id: 'half', emoji: '🌓', title: 'Halvveis', hint: 'Lås opp 7 av 13 regioner', earned: stats.regionsVisited >= 7 },
    { id: 'd48', emoji: '🗺️', title: 'Halve kartet', hint: 'Besøk 48 departementer', earned: d.size >= 48 },
    { id: 'all', emoji: '🏆', title: 'Tour de France', hint: 'Alle 13 regioner', earned: stats.regionsVisited === TOTAL_REGIONS },
    { id: 'd96', emoji: '👑', title: 'Chapeau !', hint: 'Alle 96 departementer', earned: d.size === TOTAL_DEPTS },
  ]
}

/* ---------- Forslag fra reiseloggen ---------- */

export interface TripSuggestion {
  segment: Segment
  dept: string
  place: string
}

/** Reiser til franske flyplasser utenfor Île-de-France som ikke allerede er registrert som besøk. */
export function suggestionsFromTrips(segments: Segment[], visits: Visit[], dismissed: string[]): TripSuggestion[] {
  const used = new Set(visits.map((v) => v.segmentId).filter(Boolean))
  const seen = new Set(visits.map((v) => `${v.dept}:${v.date}`))
  const skip = new Set(dismissed)
  const out: TripSuggestion[] = []
  for (const s of segments) {
    const code = s.to.trim().toUpperCase()
    const dept = AIRPORT_DEPT[code] ?? findCity(s.to)?.dept
    if (!dept || regionOfDept(dept) === HOME_REGION) continue
    const date = s.arrivalDate ?? s.date
    if (used.has(s.id) || skip.has(s.id) || seen.has(`${dept}:${date}`)) continue
    seen.add(`${dept}:${date}`)
    out.push({ segment: s, dept, place: findCity(s.to)?.name ?? CITY_FOR_AIRPORT[code] ?? s.to })
  }
  return out.sort((a, b) => b.segment.date.localeCompare(a.segment.date))
}

const CITY_FOR_AIRPORT: Record<string, string> = {
  NCE: 'Nice', LYS: 'Lyon', MRS: 'Marseille', TLS: 'Toulouse', BOD: 'Bordeaux', NTE: 'Nantes', MPL: 'Montpellier',
  LIL: 'Lille', SXB: 'Strasbourg', BIQ: 'Biarritz', BES: 'Brest', RNS: 'Rennes', TLN: 'Toulon', PGF: 'Perpignan',
  AJA: 'Ajaccio', BIA: 'Bastia', CLY: 'Calvi', FSC: 'Figari', MLH: 'Mulhouse', LRH: 'La Rochelle', CFE: 'Clermont-Ferrand',
  PIS: 'Poitiers', LIG: 'Limoges', CMF: 'Chambéry', GNB: 'Grenoble', LDE: 'Lourdes', PUF: 'Pau', NIM: 'Nîmes',
  AVN: 'Avignon', TUF: 'Tours', UIP: 'Quimper', CFR: 'Caen', DOL: 'Deauville', DIJ: 'Dijon', ANE: 'Angers',
}

/** Departementer sortert alfabetisk for nedtrekkslister. */
export const DEPTS_SORTED = DEPTS.slice().sort((a, b) => a.name.localeCompare(b.name, 'fr'))
